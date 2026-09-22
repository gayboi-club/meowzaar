import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const NAMES_FILE = path.join(DATA_DIR, 'names.json');

const BAZAAR_URL = 'https://api.hypixel.net/v2/skyblock/bazaar';
const ITEMS_URL = 'https://api.hypixel.net/v2/resources/skyblock/items';

const cleanName = (s) => String(s)
  .replace(/\u00a7./g, '')
  .replace(/%{1,2}[a-zA-Z_-]+%{1,2}/g, '')
  .replace(/%+/g, '')
  .replace(/^"(.*)"$/s, '$1')
  .trim();
const cap = (w) => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w;

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
function toRoman(n) {
  if (n >= 1 && n <= 12) return ROMAN[n - 1];
  return String(n);
}

function humanizeFallback(id) {
  let s = String(id);
  const m = s.match(/^(.+):(\d+)$/);
  if (m) {
    const base = humanizeFallback(m[1]);
    return `${base}`;
  }
  if (s.startsWith('ENCHANTMENT_')) {
    const parts = s.split('_');
    const last = parts[parts.length - 1];
    const hasLevel = /^\d+$/.test(last);
    const words = parts.slice(1, hasLevel ? -1 : undefined).map(cap).join(' ');
    return hasLevel ? `${words} ${toRoman(parseInt(last, 10))}` : words;
  }
  if (s.startsWith('PET_')) {
    const parts = s.split('_');
    return parts.slice(1).map(cap).join(' ');
  }
  return s.split('_').map(cap).join(' ');
}

const CURATED_NAMES = {
  'INK_SACK:3': 'Cocoa Beans',
  'INK_SACK:4': 'Lapis Lazuli',
  'INK_SACK:2': 'Cactus Green',
  'INK_SACK': 'Ink Sack',
  'RAW_FISH:1': 'Raw Salmon',
  'RAW_FISH:2': 'Clownfish',
  'RAW_FISH:3': 'Pufferfish',
  'RAW_FISH': 'Raw Fish',
  'LOG': 'Oak Log',
  'LOG:1': 'Spruce Log',
  'LOG:2': 'Birch Log',
  'LOG:3': 'Jungle Log',
  'LOG_2': 'Acacia Log',
  'LOG_2:1': 'Dark Oak Log',
  'HUGE_MUSHROOM_1': 'Brown Mushroom Block',
  'HUGE_MUSHROOM_2': 'Red Mushroom Block',
  'SULPHUR': 'Gunpowder',
  'NETHER_STALK': 'Nether Wart',
  'ENCHANTED_NETHER_STALK': 'Enchanted Nether Wart',
  'ENCHANTED_RAW_FISH': 'Enchanted Raw Fish',
  'ENCHANTED_RAW_FISH:1': 'Enchanted Raw Salmon',
  'ENCHANTED_RAW_FISH:2': 'Enchanted Clownfish',
  'ENCHANTED_RAW_FISH:3': 'Enchanted Pufferfish',
  'ENCHANTED_COOKED_FISH': 'Enchanted Cooked Fish',
  'ENCHANTED_STRING': 'Enchanted String',
  'ENCHANTED_BONE': 'Enchanted Bone',
  'ENCHANTED_ENDER_PEARL': 'Enchanted Ender Pearl',
  'ENCHANTED_CACTUS_GREEN': 'Enchanted Cactus Green',
  'ENCHANTED_LAPIS_LAZULI': 'Enchanted Lapis Lazuli',
  'ENCHANTED_INK_SACK': 'Enchanted Ink Sack',
  'ENCHANTED_CARROT_STICK': 'Enchanted Carrot on a Stick',
  'ENCHANTED_CARROT_ON_A_STICK': 'Enchanted Carrot on a Stick',
  'PORK': 'Raw Porkchop',
  'ENCHANTED_PORK': 'Enchanted Porkchop',
  'RAW_BEEF': 'Raw Beef',
  'RAW_CHICKEN': 'Raw Chicken',
  'MUTTON': 'Raw Mutton',
  'WATER_LILY': 'Lily Pad',
  'ENCHANTED_WATER_LILY': 'Enchanted Lily Pad',
  'QUARTZ': 'Nether Quartz',
  'ENCHANTED_QUARTZ': 'Enchanted Quartz',
  'SLIME_BALL': 'Slimeball',
  'ENCHANTED_SLIME_BALL': 'Enchanted Slimeball',
  'ICE': 'Ice',
  'GLOWSTONE_DUST': 'Glowstone Dust',
  'ENCHANTED_GLOWSTONE_DUST': 'Enchanted Glowstone Dust',
  'ENCHANTED_GLOWSTONE': 'Enchanted Glowstone',
  'ENCHANTED_REDSTONE': 'Enchanted Redstone',
  'ENCHANTED_DIAMOND': 'Enchanted Diamond',
  'ENCHANTED_EMERALD': 'Enchanted Emerald',
  'ENCHANTED_GOLD': 'Enchanted Gold',
  'ENCHANTED_IRON': 'Enchanted Iron',
  'BLAZE_POWDER': 'Blaze Powder',
  'ENCHANTED_BLAZE_POWDER': 'Enchanted Blaze Powder',
  'SPONGE': 'Sponge',
  'ENCHANTED_SPONGE': 'Enchanted Sponge',
  'ENCHANTED_WET_SPONGE': 'Enchanted Wet Sponge',
  'SUGAR_CANE': 'Sugar Cane',
  'ENCHANTED_SUGAR_CANE': 'Enchanted Sugar Cane',
  'MAGMA_CREAM': 'Magma Cream',
  'ENCHANTED_MAGMA_CREAM': 'Enchanted Magma Cream',
  'RABBIT_FOOT': "Rabbit's Foot",
  'ENCHANTED_RABBIT_FOOT': "Enchanted Rabbit's Foot",
  'ENDER_STONE': 'End Stone',
  'ENCHANTED_ENDSTONE': 'Enchanted End Stone',
  'TARANTULA_WEB': 'Tarantula Web',
  'REVENANT_VISCERA': 'Revenant Viscera',
  'TARANTULA_SILK': 'Tarantula Silk',
  'GREEN_CANDY': 'Green Candy',
  'RED_CANDY': 'Red Candy',
  'PURPLE_CANDY': 'Purple Candy',
  'REVENANT_FLESH': 'Revenant Flesh',
  'FOUL_FLESH': 'Foul Flesh',
  'TITANIC_EXP_BOTTLE': 'Titanic Experience Bottle',
  'GRINCH_PLUSH': 'Griffin Feather',
  'RECOMBOBULATOR_3000': 'Recombobulator 3000',
  'SUPER_COMPACTOR_3000': 'Super Compactor 3000',
  'JACOB_STICK': "Jacob's Ticket",
  'STOCK_OF_STONKS': 'Stock of Stonks'
};

export class BazaarPoller {
  constructor({ config, history, onCommit }) {
    this.config = config;
    this.history = history;
    this.onCommitCbs = [];
    if (onCommit) this.onCommitCbs.push(onCommit);

    this.names = new Map();
    this.latest = null;
    this.lastUpdated = 0;
    this.sMaxage = null;
    this.nextDueAt = 0;
    this.keyIndex = 0;
    this.backoffMs = 0;

    this.stats = {
      probes: 0,
      commits: 0,
      throttles: 0,
      lastError: null,
      lastFetchedAt: 0,
      lastCommittedAt: 0
    };
  }

  onCommit(cb) {
    this.onCommitCbs.push(cb);
  }

  getStatus() {
    return {
      lastUpdated: this.lastUpdated,
      lastCommittedAt: this.stats.lastCommittedAt,
      lastFetchedAt: this.stats.lastFetchedAt,
      probes: this.stats.probes,
      commits: this.stats.commits,
      throttles: this.stats.throttles,
      sMaxage: this.sMaxage,
      nextDueAt: this.nextDueAt,
      nextProbeAt: this._nextProbeAt,
      lastError: this.stats.lastError,
      subscribers: this.subscribers || 0
    };
  }

  name(id) {
    const n = cleanName(this.names.get(id));
    if (n && n !== 'undefined' && n !== 'null') return n;
    return humanizeFallback(id);
  }

  async ensureNames() {
    try {
      const raw = await fs.readFile(NAMES_FILE, 'utf8');
      const entries = Object.entries(JSON.parse(raw));
      let dirty = false;
      const map = {};
      for (const [id, nm] of entries) {
        const c = cleanName(nm);
        if (c && c !== nm) dirty = true;
        if (!c || c === 'undefined' || c === 'null') { dirty = true; continue; }
        map[id] = c;
      }
      this.names = new Map(Object.entries(map));
      if (dirty) await fs.writeFile(NAMES_FILE, JSON.stringify(map), 'utf8');
      return;
    } catch {}

    await fs.mkdir(DATA_DIR, { recursive: true });
    const map = { ...CURATED_NAMES };
    try {
      const res = await fetch(ITEMS_URL, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const body = await res.json();
        if (body?.items?.length) {
          for (const it of body.items) {
            if (it?.id) map[it.id] = cleanName(it.name || humanizeFallback(it.id));
          }
        }
      }
    } catch {}
    this.names = new Map(Object.entries(map));
    await fs.writeFile(NAMES_FILE, JSON.stringify(map), 'utf8');
  }

  start() {
    this._nextProbeAt = 0;
    this._loop();
  }

  async _loop() {
    const pollCfg = this.config.poll || {};
    const probe = pollCfg.probeIntervalMs ?? 5000;
    const schedule = (delay) => {
      this._nextProbeAt = Date.now() + delay;
      setTimeout(() => { this._loop(); }, delay);
    };

    if (!this.names.has('__loaded')) {
      await this.ensureNames();
      this.names.set('__loaded', true);
    }

    this.stats.probes += 1;
    const pollDelay = this.backoffMs || probe;

    try {
      const snap = await this._fetchBazaar({
        cacheBust: Date.now() >= this.nextDueAt
      });
      this.stats.lastFetchedAt = Date.now();
      this.stats.lastError = null;
      this.backoffMs = 0;

      if (snap.sMaxage) this.sMaxage = snap.sMaxage;
      const refreshMs = (this.sMaxage && this.sMaxage > 0)
        ? Math.min(Math.max(this.sMaxage * 1000, pollCfg.minWaitMs ?? 2000), pollCfg.maxWaitMs ?? 60000)
        : (pollCfg.fallbackIntervalMs ?? 60000);
      this.nextDueAt = Date.now() + refreshMs;

      if (snap.lastUpdated && snap.lastUpdated !== this.lastUpdated) {
        await this._commit(snap);
      }
      schedule(probe);
    } catch (err) {
      this.stats.lastError = `${err.status || err.name || 'error'}: ${err.message}`;
      if (err.status === 429 || err.status === 503 || err.status === 520 || err.status === 521 || err.status === 522) {
        this.stats.throttles += 1;
        this.backoffMs = this.backoffMs ? Math.min(this.backoffMs * 2, 60000) : 5000;
      } else {
        this.backoffMs = 0;
      }
      schedule(pollDelay);
    }
  }

  async _fetchBazaar({ cacheBust = false }) {
    const url = cacheBust
      ? `${BAZAAR_URL}?_=${Date.now()}`
      : BAZAAR_URL;
    const headers = {};
    const keys = this.config.hypixelApiKeys || [];
    if (keys.length) {
      headers['API-Key'] = keys[this.keyIndex % keys.length];
      this.keyIndex += 1;
    }

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const body = await res.json();
    if (!body?.success) {
      const err = new Error(body?.cause || 'API returned success:false');
      err.status = 503;
      throw err;
    }

    const cc = res.headers.get('cache-control') || '';
    const sm = cc.match(/s-maxage=(\d+)/i);
    const sMaxage = sm ? parseInt(sm[1], 10) : null;
    const ageRaw = Number(res.headers.get('age'));
    const age = Number.isFinite(ageRaw) ? ageRaw : null;

    return {
      lastUpdated: body.lastUpdated,
      products: body.products || {},
      sMaxage,
      age,
      edgeStatus: res.headers.get('cf-cache-status')
    };
  }

  async _commit(snap) {
    const products = [];
    for (const [id, p] of Object.entries(snap.products)) {
      const q = p.quick_status || {};
      const sell = q.sellPrice;
      const buy = q.buyPrice;
      const profit = buy - sell;
      const item = {
        id,
        name: this.name(id),
        buyPrice: buy,
        sellPrice: sell,
        buyVolume: q.buyVolume ?? 0,
        sellVolume: q.sellVolume ?? 0,
        buyMovingWeek: q.buyMovingWeek ?? 0,
        sellMovingWeek: q.sellMovingWeek ?? 0,
        buyOrders: q.buyOrders ?? 0,
        sellOrders: q.sellOrders ?? 0,
        spread: profit,
        spreadPct: sell > 0 ? (profit / sell) * 100 : 0,
        buySummary: p.buy_summary || [],
        sellSummary: p.sell_summary || []
      };
      products.push(item);
    }

    this.latest = {
      lastUpdated: snap.lastUpdated,
      fetchedAt: Date.now(),
      products
    };
    this.lastUpdated = snap.lastUpdated;
    this.stats.lastCommittedAt = Date.now();
    this.stats.commits += 1;

    this.history.push(snap.lastUpdated, products);

    for (const cb of this.onCommitCbs) {
      try { cb(this.latest); } catch {}
    }
  }

  getLatest() {
    return this.latest;
  }
}