import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { marked } from 'marked';

import { BazaarPoller } from './lib/hypixel.js';
import { HistoryStore } from './lib/history.js';
import { FavoritesStore } from './lib/favorites.js';
import { StreamHub } from './lib/stream.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, 'config.json');
const CONTENT_DIR = path.join(__dirname, 'content');
const NEWS_DIR = path.join(CONTENT_DIR, 'news');
const CONTENT_FILES = {
  privacy: 'privacy.md',
  terms: 'terms.md'
};

async function loadConfig() {
  const defaults = {
    port: 3000,
    poll: {
      mode: 'adaptive',
      probeIntervalMs: 5000,
      minWaitMs: 2000,
      maxWaitMs: 60000,
      fallbackIntervalMs: 60000
    },
    history: { retentionDays: 7, flushDebounceMs: 10000, maxGapMs: 60 * 60 * 1000 },
    hypixelApiKeys: []
  };
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf8');
    return deepMerge(defaults, JSON.parse(raw));
  } catch {
    return defaults;
  }
}

function deepMerge(base, extra) {
  if (Array.isArray(base)) return extra ?? base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    for (const [k, v] of Object.entries(extra || {})) {
      out[k] = (v && typeof v === 'object' && !Array.isArray(v) && base[k])
        ? deepMerge(base[k], v)
        : v;
    }
    return out;
  }
  return extra ?? base;
}

const RANGES = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
};

const config = await loadConfig();
const port = Number(process.env.PORT) || config.port || 3000;
const retentionDays = config.history?.retentionDays ?? 7;

const history = new HistoryStore({ retentionDays, flushDebounceMs: config.history?.flushDebounceMs, maxGapMs: config.history?.maxGapMs });
await history.load();

const favorites = new FavoritesStore();
await favorites.load();

const hub = new StreamHub();
hub.start();

const poller = new BazaarPoller({
  config,
  history,
  onCommit: (snap) => hub.push('bazaar', snap)
});
poller.start();

const app = express();
app.use(express.json());

const PAGES = {
  home: 'meowzaar - skyblock bazaar',
  items: 'items - meowzaar',
  flips: 'flips - meowzaar',
  saved: 'saved - meowzaar',
  news: 'news - meowzaar',
  privacy: 'privacy - meowzaar',
  terms: 'terms - meowzaar'
};
const STATIC_PAGES = new Set(['news', 'privacy', 'terms']);
const layoutHtml = await fs.readFile(path.join(__dirname, 'public', 'layout.html'), 'utf8');

function markedHtml(raw) {
  return marked.parse(raw.replace(/^\uFEFF/, ''));
}

async function readContent(file) {
  const raw = await fs.readFile(path.join(CONTENT_DIR, file), 'utf8').catch(() => '');
  return markedHtml(raw);
}

async function parsePost(file) {
  const raw = await fs.readFile(path.join(NEWS_DIR, file), 'utf8');
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/);
  const title = (lines[0] || '').replace(/^#\s*/, '').trim() || 'untitled';
  const body = lines.slice(1).join('\n').trim();
  const slug = file.slice(11, -3);
  return {
    date: file.slice(0, 10),
    title,
    slug,
    url: '/news',
    bodyHtml: markedHtml(body)
  };
}

async function getNews(limit) {
  let files;
  try {
    files = await fs.readdir(NEWS_DIR);
  } catch {
    return [];
  }
  const posts = [];
  for (const f of files) {
    if (!/^\d{4}-\d{2}-\d{2}-.+\.md$/.test(f)) continue;
    posts.push(await parsePost(f).catch(() => null));
  }
  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return Number.isFinite(limit) && limit > 0 ? posts.slice(0, limit) : posts;
}

async function renderPage(name) {
  const frag = await fs.readFile(path.join(__dirname, 'public', 'pages', `${name}.html`), 'utf8').catch(() => '');
  const script = STATIC_PAGES.has(name) ? 'pages/chrome.js' : `pages/${name}.js`;
  let html = layoutHtml
    .replaceAll('{{title}}', PAGES[name])
    .replaceAll('{{page}}', name)
    .replaceAll('{{main}}', frag)
    .replaceAll('{{script}}', script);
  if (name === 'news') {
    const posts = await getNews();
    const list = posts.map((n) =>
      `<article class="news-card">
        <div class="news-date">${n.date}</div>
        <div class="content">${n.bodyHtml}</div>
      </article>`).join('');
    html = html.replaceAll('{{content}}', list || '<p class="empty">no news yet</p>');
  } else if (CONTENT_FILES[name]) {
    html = html.replaceAll('{{content}}', await readContent(CONTENT_FILES[name]));
  }
  return html;
}

for (const name of Object.keys(PAGES)) {
  app.get(name === 'home' ? '/' : `/${name}`, async (req, res, next) => {
    try {
      res.send(await renderPage(name));
    } catch (err) {
      next(err);
    }
  });
}

app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', setHeaders: (res, filePath) => { if (filePath.endsWith('meowzaar-icon.png')) res.setHeader('Cache-Control', 'no-cache'); } }));

app.get('/api/status', (req, res) => {
  res.json({ ok: true, ...poller.getStatus(), subscribers: hub.size, retentionDays, namesKnown: poller.names.size });
});

app.get('/api/bazaar', (req, res) => {
  const latest = poller.getLatest();
  if (!latest) {
    return res.status(503).json({ ok: false, reason: 'warming' });
  }
  res.json({ ok: true, ...latest, nextTickAt: poller.nextDueAt });
});

app.get('/api/history/:id', (req, res) => {
  const range = RANGES[req.query.range] ?? RANGES['24h'];
  const since = Date.now() - range;
  const maxPoints = clampInt(req.query.maxPoints, 200, 6000, 1500);
  const { id, points } = history.getSeries(req.params.id, { since, maxPoints });
  if (!poller.getLatest()) {
    return res.status(503).json({ ok: false, reason: 'warming' });
  }
  const latestItem = poller.getLatest().products.find((p) => p.id === req.params.id) || null;
  res.json({
    ok: true,
    productId: req.params.id,
    name: latestItem?.name ?? poller.name(req.params.id),
    range: req.query.range ?? '24h',
    points,
    latest: latestItem
  });
});

app.get('/api/trades', (req, res) => {
  const latest = poller.getLatest();
  if (!latest) return res.status(503).json({ ok: false, reason: 'warming' });

  const minCoin = numOr(req.query.minCoin, 0);
  const minVol = numOr(req.query.minVol, 0);
  const maxVol = numOr(req.query.maxVol, Infinity);
  const pct = numOr(req.query.minPct, -Infinity);

  const trades = latest.products
    .filter((p) => p.buyPrice > 0 && p.sellPrice > 0)
    .filter((p) => p.spread > 0)
    .filter((p) => p.spread >= minCoin)
    .filter((p) => (p.sellVolume + p.buyVolume) >= minVol)
    .filter((p) => (p.sellVolume + p.buyVolume) <= maxVol)
    .filter((p) => (Number.isFinite(pct) ? p.spreadPct >= pct : true))
    .sort((a, b) => b.spreadPct - a.spreadPct);

  res.json({ ok: true, count: trades.length, trades, nextTickAt: poller.nextDueAt });
});

const homeCache = { at: 0, data: null };
const HOME_CACHE_MS = 10000;
const HOME_WINDOW_MS = 24 * 60 * 60 * 1000;
const MIN_MOVER_VOL = 1000;
const MAX_MOVER_PCT = 1000;
const MIN_FLIP_VOL = 25;
const MIN_FLIP_PROFIT = 25000;
const MIN_FLIP_PCT = 1;
const MAX_FLIP_PCT = 1000;

function slim(p) {
  return {
    id: p.id,
    name: p.name,
    buyPrice: p.buyPrice,
    sellPrice: p.sellPrice,
    spread: p.spread,
    spreadPct: p.spreadPct,
    sellVolume: p.sellVolume,
    buyVolume: p.buyVolume,
    sellMovingWeek: p.sellMovingWeek
  };
}

app.get('/api/home', (req, res) => {
  const latest = poller.getLatest();
  if (!latest) return res.status(503).json({ ok: false, reason: 'warming' });
  if (homeCache.data && Date.now() - homeCache.at < HOME_CACHE_MS) {
    return res.json(homeCache.data);
  }

  const products = latest.products;
  const flips = products
    .filter((p) => p.buyPrice > 0 && p.sellPrice > 0
      && p.spread > 0 && p.spread >= MIN_FLIP_PROFIT
      && Math.min(p.buyVolume, p.sellVolume) >= MIN_FLIP_VOL
      && p.spreadPct >= MIN_FLIP_PCT && p.spreadPct <= MAX_FLIP_PCT)
    .sort((a, b) => b.spread - a.spread);
  const liquid = [...products]
    .filter((p) => p.sellMovingWeek > 0)
    .sort((a, b) => b.sellMovingWeek - a.sellMovingWeek);

  const movers = [];
  for (const p of products) {
    if ((p.sellMovingWeek + p.buyMovingWeek) < MIN_MOVER_VOL) continue;
    const key = p.sellPrice > 0 ? 'sell' : 'buy';
    const c = history.pctChange(p.id, HOME_WINDOW_MS, key);
    if (!c || c.from < 1 || c.to < 1 || Math.abs(c.pct) > MAX_MOVER_PCT) continue;
    movers.push({ id: p.id, name: p.name, ...c });
  }
  movers.sort((a, b) => b.pct - a.pct);

  const data = {
    ok: true,
    generatedAt: latest.fetchedAt,
    totals: {
      items: products.length,
      flips: flips.length,
      bestPct: flips[0] ? flips[0].spreadPct : null,
      bestPctName: flips[0] ? flips[0].name : null,
      biggestMove: movers[0] ? { name: movers[0].name, pct: movers[0].pct } : null
    },
    gainers: movers.filter((m) => m.pct >= 0).slice(0, 8),
    losers: movers.filter((m) => m.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, 8),
    flips: flips.slice(0, 8).map(slim),
    liquid: liquid.slice(0, 8).map(slim)
  };

  homeCache.at = Date.now();
  homeCache.data = data;
  res.json(data);
});

app.get('/api/favorites', async (req, res) => {
  res.json({ ok: true, ids: await favorites.list() });
});

app.post('/api/favorites/:id', async (req, res) => {
  res.json(await favorites.add(req.params.id));
});

app.delete('/api/favorites/:id', async (req, res) => {
  res.json(await favorites.remove(req.params.id));
});

app.get('/api/news', async (req, res) => {
  const limit = clampInt(req.query.limit, 1, 50, 30);
  const posts = await getNews(limit);
  res.json({ ok: true, news: posts.map((n) => ({ date: n.date, title: n.title, url: n.url })) });
});

app.get('/api/stream', (req, res) => {
  hub.add(res);
  const latest = poller.getLatest();
  if (latest) {
    res.write(`event: bazaar\ndata: ${JSON.stringify(latest)}\n\n`);
  }
  const status = poller.getStatus();
  res.write(`event: status\ndata: ${JSON.stringify({ ok: true, ...status, subscribers: hub.size })}\n\n`);
});

app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'not found' }));

function numOr(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function clampInt(v, min, max, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

app.listen(port, () => {
  console.log(`meowzaar running at http://localhost:${port}`);
  console.log(`history retention: ${retentionDays}d · probe every ${config.poll.probeIntervalMs}ms`);
});