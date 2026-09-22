import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'history.db');
const LEGACY_DIR = path.join(DATA_DIR, 'history');
const ARCHIVE_DIR = path.join(DATA_DIR, 'history_archive');

const PRUNE_MS = 5 * 60 * 1000;
const VACUUM_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_LIMIT = 200000;
const MAX_GAP_MS = 60 * 60 * 1000;

export class HistoryStore {
  constructor({ retentionDays = 7, flushDebounceMs = 10000, maxGapMs = MAX_GAP_MS } = {}) {
    this.retentionMs = retentionDays * 24 * 60 * 60 * 1000;
    this.maxGapMs = maxGapMs;
    this.last = new Map();
    this._lastPrune = 0;
    this.db = null;
  }

  async load() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const db = new DatabaseSync(DB_FILE);
    this.db = db;

    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('CREATE TABLE IF NOT EXISTS points (id TEXT NOT NULL, t INTEGER NOT NULL, buy INTEGER NOT NULL, sell INTEGER NOT NULL)');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_points_id_t ON points (id, t)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_points_t ON points (t)');
    db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

    this._insert = db.prepare('INSERT OR IGNORE INTO points (id, t, buy, sell) VALUES (?, ?, ?, ?)');
    this._prune = db.prepare('DELETE FROM points WHERE t < ?');
    this._lastRow = db.prepare('SELECT t, buy, sell FROM points WHERE id = ? ORDER BY t DESC LIMIT 1');
    this._firstFrom = db.prepare('SELECT t, buy, sell FROM points WHERE id = ? AND t >= ? ORDER BY t ASC LIMIT 1');
    this._series = db.prepare('SELECT t, buy, sell FROM points WHERE id = ? AND t >= ? ORDER BY t ASC LIMIT ?');
    this._count = db.prepare('SELECT COUNT(*) AS c FROM points');

    this._hydrateLast();
    await this._migrateLegacy();
    this._maybePrune(Date.now(), true);
    this._hydrateLast();
    return this._count.get().c;
  }

  _hydrateLast() {
    this.last.clear();
    for (const row of this.db
      .prepare('SELECT p.id, p.t, p.buy, p.sell FROM points p JOIN (SELECT id, MAX(t) AS mt FROM points GROUP BY id) m ON p.id = m.id AND p.t = m.mt')
      .all()) {
      this.last.set(row.id, { t: row.t, buy: row.buy, sell: row.sell });
    }
  }

  async _migrateLegacy() {
    let files;
    try {
      files = await fs.readdir(LEGACY_DIR);
    } catch {
      return;
    }
    const jsonl = files.filter((f) => f.endsWith('.jsonl'));
    if (!jsonl.length) return;

    const count = this._count.get().c;
    if (count === 0) {
      this.db.exec('BEGIN');
      try {
        let n = 0;
        for (const f of jsonl) {
          const raw = await fs.readFile(path.join(LEGACY_DIR, f), 'utf8').catch(() => null);
          if (!raw) continue;
          const id = f.slice(0, -6);
          for (const line of raw.split('\n')) {
            if (!line) continue;
            const [t, buy, sell] = line.split(',').map(Number);
            if (!Number.isFinite(t) || !Number.isFinite(buy) || !Number.isFinite(sell)) continue;
            this._insert.run(id, t, buy, sell);
            n += 1;
          }
        }
        this.db.exec('COMMIT');
        console.log(`[history] migrated ${n} points from legacy jsonl`);
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    }

    try {
      await fs.rename(LEGACY_DIR, ARCHIVE_DIR);
    } catch {
      await fs.rm(LEGACY_DIR, { recursive: true, force: true }).catch(() => {});
    }
  }

  push(t, products) {
    const changed = [];
    for (const p of products) {
      const prev = this.last.get(p.id);
      if (prev && prev.buy === p.buyPrice && prev.sell === p.sellPrice && t - prev.t < this.maxGapMs) continue;
      changed.push(p.id, t, p.buyPrice, p.sellPrice);
      this.last.set(p.id, { t, buy: p.buyPrice, sell: p.sellPrice });
    }
    if (!changed.length) return;
    this.db.exec('BEGIN');
    try {
      for (let i = 0; i < changed.length; i += 4) {
        this._insert.run(changed[i], changed[i + 1], changed[i + 2], changed[i + 3]);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    this._maybePrune(t);
  }

  getSeries(id, { since = 0, maxPoints = 1000 } = {}) {
    const rows = this._series.all(id, since, FETCH_LIMIT);
    if (!rows.length) return { id, points: [] };
    const points = rows.map((r) => ({ t: r.t, buy: r.buy, sell: r.sell }));
    return { id, points: downsample(points, maxPoints) };
  }

  pctChange(id, windowMs, key = 'sell') {
    const last = this._lastRow.get(id);
    if (!last) return null;
    const t0 = last.t - windowMs;
    const first = this._firstFrom.get(id, t0);
    if (!first) return null;
    if (last.t - first.t < windowMs * 0.25) return null;
    const a = first[key];
    const b = last[key];
    if (a <= 0 || b <= 0) return null;
    return { pct: ((b - a) / a) * 100, coin: b - a, from: a, to: b };
  }

  _maybePrune(now, force = false) {
    if (!force && now - this._lastPrune < PRUNE_MS) return;
    this._lastPrune = now;

    this._prune.run(now - this.retentionMs);

    const meta = this.db.prepare('SELECT value FROM meta WHERE key = ?').get('lastVacuum');
    const lastVac = meta ? Number(meta.value) : 0;
    if (now - lastVac >= VACUUM_MS) {
      this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('lastVacuum', String(now));
      this.db.exec('VACUUM');
    }
  }
}

function downsample(points, maxPoints) {
  if (points.length <= maxPoints || maxPoints <= 1) return points;
  const span = points[points.length - 1].t - points[0].t;
  const bucket = Math.max(1, span / maxPoints);
  const out = [];
  let cur = null;
  const flush = (c) => {
    out.push({
      t: c.t,
      buy: c.buy / c.n,
      sell: c.sell / c.n
    });
  };
  for (const p of points) {
    if (!cur || p.t - cur.t >= bucket) {
      if (cur) flush(cur);
      cur = { t: p.t, buy: p.buy, sell: p.sell, n: 1 };
    } else {
      cur.buy += p.buy;
      cur.sell += p.sell;
      cur.n += 1;
      cur.t = p.t;
    }
  }
  if (cur) flush(cur);
  return out;
}