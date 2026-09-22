(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const ICON_SOUND_ON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
  const ICON_SOUND_OFF = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 6 6"/><path d="m22 9-6 6"/></svg>';

  const state = {
    products: new Map(),
    prev: new Map(),
    deltas: new Map(),
    favs: new Set(),
    sort: { key: 'sellMovingWeek', dir: 'desc' },
    query: '',
    range: '24h',
    alertPct: 2,
    soundOn: true,
    watched: {},
    lastChime: 0,
    lastError: null,
    lastFetched: null,
    nextTickAt: 0
  };

  const COLS = [
    { key: 'name', label: 'item', align: 'l' },
    { key: 'buyPrice', label: 'buy order', type: 'price' },
    { key: 'sellPrice', label: 'sell order', type: 'price' },
    { key: 'spread', label: 'spread', type: 'coins' },
    { key: 'spreadPct', label: '%', type: 'pct' },
    { key: 'sellVolume', label: 'sell vol', type: 'compact' },
    { key: 'buyVolume', label: 'buy vol', type: 'compact' },
    { key: 'sellMovingWeek', label: 'sell 7d', type: 'compact', bar: true },
    { key: 'buyMovingWeek', label: 'buy 7d', type: 'compact' },
    { key: 'orders', label: 'orders', type: 'int' }
  ];

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const iconState = new Map();
  function iconSrc(id) {
    if (id && id.startsWith('ENCHANTED_BOOK') && id !== 'ENCHANTED_BOOK') id = 'ENCHANTED_BOOK';
    return 'https://sky.coflnet.com/static/icon/' + encodeURIComponent(id);
  }
  window.MeowIconError = (el) => {
    const raw = el.dataset.raw;
    const tries = Number(el.dataset.r || 0) + 1;
    if (tries < 3) {
      el.dataset.r = String(tries);
      setTimeout(() => { el.removeAttribute('src'); el.src = iconSrc(raw); }, 900 * tries);
    } else {
      iconState.set(raw, 'fail');
      el.remove();
    }
  };
  window.MeowIconLoaded = (el) => {
    iconState.set(el.dataset.raw, 'ok');
  };
  function imgTag(id) {
    if (iconState.get(id) === 'fail') return '';
    return `<img src="${iconSrc(id)}" alt="" data-raw="${esc(id)}" loading="lazy" decoding="async"
      onload="window.MeowIconLoaded(this)" onerror="window.MeowIconError(this)">`;
  }
  function ic(id, cls) {
    return `<span class="ic ${cls || ''}">${imgTag(id)}</span>`;
  }

  const fmtPrice = (n) => {
    if (!Number.isFinite(n)) return '-';
    if (Math.abs(n) < 100) return n.toFixed(Math.abs(n) < 10 ? 2 : 1).replace(/0+$/, '').replace(/\.$/, '');
    return Math.round(n).toLocaleString('en-US');
  };

  const fmtCompact = (n) => {
    if (!Number.isFinite(n)) return '-';
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (a >= 1e4) return (n / 1e3).toFixed(1) + 'K';
    return Math.round(n).toLocaleString('en-US');
  };

  const fmtInt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '-');
  const fmtPct = (n) => (Number.isFinite(n) ? n.toFixed(2) + '%' : '-');
  const fmtSignedCompact = (n) => (n >= 0 ? '+' : '−') + fmtCompact(Math.abs(n));
  const signedClass = (n) => (n > 1e-9 ? 'up' : n < -1e-9 ? 'down' : 'flat');

  const loadLS = (k, d) => {
    try {
      const v = JSON.parse(localStorage.getItem('meowzaar:' + k));
      return v === null || v === undefined ? d : v;
    } catch { return d; }
  };
  const saveLS = (k, v) => { try { localStorage.setItem('meowzaar:' + k, JSON.stringify(v)); } catch {} };

  state.alertPct = loadLS('alertPct', 2);
  state.soundOn = loadLS('soundOn', true);
  state.watched = loadLS('watched', {});

  function applyProducts(products, lastUpdated, nextTickAt) {
    const batch = [];
    for (const p of products) {
      const id = p.id;
      const prev = state.prev.get(id);
      state.deltas.set(id, {
        buy: prev ? p.buyPrice - prev.buy : 0,
        sell: prev ? p.sellPrice - prev.sell : 0
      });
      state.prev.set(id, { buy: p.buyPrice, sell: p.sellPrice });
      state.products.set(id, p);
      batch.push(p);
    }
    if (Number.isFinite(lastUpdated)) state.lastUpdated = lastUpdated;
    if (Number.isFinite(nextTickAt)) state.nextTickAt = nextTickAt;
    state.lastFetched = Date.now();
    maybeAlert(batch);
    rerender();
  }

  function maybeAlert(products) {
    if (!state.soundOn) return;
    const now = performance.now();
    if (now - state.lastChime < 1200) return;
    for (const p of products) {
      const d = state.deltas.get(p.id);
      if (!d) continue;
      const threshold = state.watched[p.id] !== undefined
        ? state.watched[p.id]
        : (state.favs.has(p.id) ? 0 : state.alertPct);
      const move = p.buyPrice > 0 ? Math.abs(d.buy) / p.buyPrice * 100 : 0;
      if (move >= threshold) {
        state.lastChime = now;
        chime();
        return;
      }
    }
  }

  let audioCtx = null;
  function chime() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t0 = audioCtx.currentTime;
      [660, 990].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        const t = t0 + i * 0.09;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(t);
        o.stop(t + 0.28);
      });
    } catch {}
  }

  function visibleItems() {
    let items = [...state.products.values()];
    if (window.Meow && Meow.baseFilter) items = Meow.baseFilter(items);
    const q = state.query.trim().toLowerCase();
    if (q) {
      items = items.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
    }
    const { key, dir } = state.sort;
    const mult = dir === 'asc' ? 1 : -1;
    items.sort((a, b) => {
      const va = a[key], vb = b[key];
      if (va === vb) return a.name.localeCompare(b.name);
      return (va < vb ? -1 : 1) * mult;
    });
    return items;
  }

  function arrow(key) {
    if (state.sort.key !== key) return '';
    return state.sort.dir === 'desc' ? '&#9662;' : '&#9652;';
  }

  function renderHead() {
    $('board-head').innerHTML = '<tr>' + COLS.map((c) =>
      `<th class="${c.align === 'l' ? 'l' : ''}" data-key="${c.key}">${c.label}<span class="arrow">${arrow(c.key)}</span></th>`
    ).join('') + '</tr>';
  }

  let _maxWeekCache = { v: 0, t: 0 };
  function maxWeek() {
    if (Date.now() - _maxWeekCache.t < 5000) return _maxWeekCache.v;
    let m = 0;
    for (const p of state.products.values()) m = Math.max(m, p.sellMovingWeek);
    _maxWeekCache = { v: m, t: Date.now() };
    return m;
  }

  function renderBody() {
    const items = visibleItems();
    const tbody = $('board-body');
    tbody.innerHTML = items.map((p) => {
      const d = state.deltas.get(p.id);
      const buyFlash = d && d.buy > 1e-9 ? 'px-up' : d && d.buy < -1e-9 ? 'px-down' : '';
      const sellFlash = d && d.sell > 1e-9 ? 'px-up' : d && d.sell < -1e-9 ? 'px-down' : '';
      const buyBadge = d && d.buy ? `<span class="delta ${signedClass(d.buy)}">${fmtSignedCompact(d.buy)}</span>` : '';
      const sellBadge = d && d.sell ? `<span class="delta ${signedClass(d.sell)}">${fmtSignedCompact(d.sell)}</span>` : '';
      const star = state.favs.has(p.id) ? 'on' : '';
      const spreadCls = p.spread > 0 ? 'up' : p.spread < 0 ? 'down' : 'flat';
      const bar = `<div class="volbar"><i style="width:${Math.min(100, Math.log10(1 + p.sellMovingWeek) / Math.log10(1 + maxWeek()) * 100).toFixed(1)}%"></i></div>`;
      return `<tr data-id="${esc(p.id)}">
        <td class="l"><div class="name-cell">
          <button class="star ${star}" data-fav="${esc(p.id)}">${star ? '\u2605' : '\u2606'}</button>
          ${ic(p.id)}
          <div><div class="m-name">${esc(p.name)}</div><div class="m-sub">${esc(p.id)}</div></div>
        </div></td>
        <td class="${buyFlash}">${fmtPrice(p.buyPrice)}${buyBadge}</td>
        <td class="${sellFlash}">${fmtPrice(p.sellPrice)}${sellBadge}</td>
        <td class="${spreadCls}">${fmtPrice(p.spread)}</td>
        <td class="${signedClass(p.spread)}">${fmtPct(p.spreadPct)}</td>
        <td>${fmtCompact(p.sellVolume)}</td>
        <td>${fmtCompact(p.buyVolume)}</td>
        <td>${fmtCompact(p.sellMovingWeek)}${p.sellMovingWeek > 0 ? bar : ''}</td>
        <td>${fmtCompact(p.buyMovingWeek)}</td>
        <td>${fmtInt(p.buyOrders + p.sellOrders)}</td>
      </tr>`;
    }).join('');
    $('table-scroll').classList.toggle('hidden', items.length === 0);
    $('empty').classList.toggle('hidden', items.length !== 0);
  }

  function renderBoard() {
    $('board-panel').classList.remove('hidden');
    renderHead();
    renderBody();
  }

  function renderStatus() {
    const s = state.lastFetched ? Math.max(0, Math.round((Date.now() - state.lastFetched) / 1000)) : null;
    $('footStatus').textContent = s === null
      ? 'waiting for data…'
      : 'updated ' + (s < 60 ? (s < 2 ? 'just now' : s + 's ago') : Math.round(s / 60) + 'm ago');
  }

  function applyStatus(s) {
    state.lastError = s.lastError || null;
    if (Number.isFinite(s.nextTickAt)) state.nextTickAt = s.nextTickAt;
    $('statusText').textContent = state.lastError ? 'reconnecting…' : 'live';
  }

  async function loadFavs() {
    const res = await fetch('/api/favorites');
    if (res.ok) {
      const d = await res.json();
      state.favs = new Set(d.ids);
    }
  }

  async function toggleFav(id, btn) {
    const on = state.favs.has(id);
    const res = await fetch('/api/favorites/' + encodeURIComponent(id), {
      method: on ? 'DELETE' : 'POST'
    }).catch(() => null);
    if (!res || !res.ok) return;
    if (on) state.favs.delete(id); else state.favs.add(id);
    document.querySelectorAll(`[data-fav="${id}"]`).forEach((b) => {
      b.classList.toggle('on', state.favs.has(id));
      b.textContent = state.favs.has(id) ? '\u2605' : '\u2606';
    });
    rerender();
  }

  function openModal(id) {
    const p = state.products.get(id);
    if (!p) return;
    $('m-name').textContent = p.name;
    $('m-id').textContent = p.id;
    $('m-ic').innerHTML = imgTag(id);
    $('m-fav').classList.toggle('on', state.favs.has(id));
    $('m-fav').textContent = state.favs.has(id) ? '\u2605' : '\u2606';
    $('m-fav').dataset.fav = id;
    setVal($('m-buy'), p.buyPrice, 'up');
    setVal($('m-sell'), p.sellPrice, 'down');
    $('m-spread').textContent = fmtPrice(p.spread) + ' coins';
    $('m-spread').className = 'stat-v ' + signedClass(p.spread);
    $('m-spreadpct').textContent = fmtPct(p.spreadPct);
    $('m-svol').textContent = fmtCompact(p.sellVolume);
    $('m-bvol').textContent = fmtCompact(p.buyVolume);
    $('m-sweek').textContent = fmtCompact(p.sellMovingWeek);
    $('m-bweek').textContent = fmtCompact(p.buyMovingWeek);
    $('m-orders').textContent = fmtInt(p.buyOrders + p.sellOrders);
    const watch = state.watched[id];
    $('m-alert').value = watch !== undefined ? watch : '';
    renderOrderBook(p);
    document.querySelectorAll('.ctab').forEach((b) => b.classList.toggle('active', b.dataset.range === state.range));
    $('modal-root').classList.remove('hidden');
    loadRange(id);
  }

  function setVal(el, n, cls) {
    el.textContent = fmtPrice(n);
    el.className = 'stat-v ' + (n !== undefined && Number.isFinite(n) ? cls : '');
  }

  function renderOrderBook(p) {
    const buy = [...p.buySummary].sort((a, b) => b.pricePerUnit - a.pricePerUnit).slice(0, 8);
    const sell = [...p.sellSummary].sort((a, b) => a.pricePerUnit - b.pricePerUnit).slice(0, 8);
    $('m-ob-buy').innerHTML = buy.map((o) =>
      `<div class="ob-row"><span class="ob-price up">${fmtPrice(o.pricePerUnit)}</span><span class="ob-amt">${fmtCompact(o.amount)} x${o.orders}</span></div>`
    ).join('') || '<div class="ob-row"><span class="ob-amt">-</span></div>';
    $('m-ob-sell').innerHTML = sell.map((o) =>
      `<div class="ob-row"><span class="ob-price down">${fmtPrice(o.pricePerUnit)}</span><span class="ob-amt">${fmtCompact(o.amount)} x${o.orders}</span></div>`
    ).join('') || '<div class="ob-row"><span class="ob-amt">-</span></div>';
  }

  async function loadRange(id) {
    const res = await fetch(`/api/history/${encodeURIComponent(id)}?range=${state.range}&maxPoints=1500`).catch(() => null);
    if (!res || !res.ok) return;
    const data = await res.json();
    if (!data.ok) return;
    window.MeowCharts.render($('m-chart'), data);
  }

  function closeModal() {
    $('modal-root').classList.add('hidden');
    window.MeowCharts.destroy();
  }

  let ready = false;
  const readyCbs = [];
  function onReady(cb) {
    if (ready) cb(); else readyCbs.push(cb);
  }

  function rerender() {
    try {
      if (window.Meow && Meow.renderer) Meow.renderer();
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchHome() {
    const res = await fetch('/api/status').catch(() => null);
    if (res && res.ok) applyStatus(await res.json());
  }

  async function boot() {
    const [baza, favs] = await Promise.all([fetch('/api/bazaar'), loadFavs()]).catch(() => [null]);
    if (baza && baza.ok) {
      const d = await baza.json();
      if (d.ok) {
        applyProducts(d.products, d.lastUpdated, d.nextTickAt);
        $('warming').classList.add('hidden');
      } else {
        $('warming').classList.remove('hidden');
      }
    } else {
      $('warming').classList.remove('hidden');
    }
    ready = true;
    readyCbs.forEach((cb) => cb());
    readyCbs.length = 0;
    rerender();

    const es = new EventSource('/api/stream');
    es.addEventListener('bazaar', (ev) => {
      const d = JSON.parse(ev.data);
      applyProducts(d.products, d.lastUpdated, d.fetchedAt);
      $('warming').classList.add('hidden');
    });
    es.addEventListener('status', (ev) => {
      applyStatus(JSON.parse(ev.data));
    });
    es.onopen = () => { $('statusText').textContent = 'live'; };
    es.onerror = () => { $('statusText').textContent = 'reconnecting…'; };

    setInterval(async () => { fetchHome(); }, 10000);
    setInterval(renderStatus, 1000);
  }

  $('board-body').addEventListener('click', (e) => {
    const favBtn = e.target.closest('[data-fav]');
    if (favBtn) {
      e.stopPropagation();
      toggleFav(favBtn.dataset.fav, favBtn);
      return;
    }
    const row = e.target.closest('tr[data-id]');
    if (row) openModal(row.dataset.id);
  });

  $('board-head').addEventListener('click', (e) => {
    const th = e.target.closest('th[data-key]');
    if (!th) return;
    const key = th.dataset.key;
    if (state.sort.key === key) state.sort.dir = state.sort.dir === 'desc' ? 'asc' : 'desc';
    else state.sort = { key, dir: key === 'name' ? 'asc' : 'desc' };
    rerender();
  });

  $('search').addEventListener('input', (e) => { state.query = e.target.value; rerender(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== $('search')) {
      e.preventDefault();
      $('search').focus();
    } else if (e.key === 'Escape') {
      if (!$('modal-root').classList.contains('hidden')) closeModal();
      else if (!$('alert-pop').classList.contains('hide')) $('alert-pop').classList.add('hide');
      else $('search').blur();
    }
  });

  $('sound-btn').innerHTML = state.soundOn ? ICON_SOUND_ON : ICON_SOUND_OFF;
  $('sound-btn').addEventListener('click', () => {
    state.soundOn = !state.soundOn;
    saveLS('soundOn', state.soundOn);
    $('sound-btn').classList.toggle('off', !state.soundOn);
    $('sound-btn').innerHTML = state.soundOn ? ICON_SOUND_ON : ICON_SOUND_OFF;
  });
  $('sound-btn').addEventListener('dblclick', () => {
    $('alert-pop').classList.toggle('hide');
  });

  $('alert-pct').value = state.alertPct;
  $('alert-pct').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v)) { state.alertPct = v; saveLS('alertPct', v); }
  });
  $('alert-on').checked = state.soundOn;
  $('alert-on').addEventListener('change', (e) => {
    state.soundOn = e.target.checked;
    saveLS('soundOn', state.soundOn);
    $('sound-btn').innerHTML = state.soundOn ? ICON_SOUND_ON : ICON_SOUND_OFF;
  });

  document.querySelectorAll('.ctab').forEach((b) => {
    b.addEventListener('click', () => {
      state.range = b.dataset.range;
      const id = $('m-id').textContent;
      if (id) loadRange(id);
      document.querySelectorAll('.ctab').forEach((x) => x.classList.toggle('active', x === b));
    });
  });

  $('m-close').addEventListener('click', closeModal);
  $('modal-root').addEventListener('click', (e) => { if (e.target === $('modal-root')) closeModal(); });

  $('m-fav').addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.fav;
    if (id) toggleFav(id, e.currentTarget);
  });

  $('m-alert').addEventListener('input', (e) => {
    const id = $('m-id').textContent;
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v) && v >= 0) state.watched[id] = v;
    else delete state.watched[id];
    saveLS('watched', state.watched);
  });

  document.querySelectorAll('.tab[data-nav]').forEach((b) => {
    b.classList.toggle('active', b.dataset.nav === (document.body.dataset.page || 'home'));
  });

  window.Meow = {
    $,
    state,
    onReady,
    rerender,
    visibleItems,
    renderBoard,
    openModal,
    closeModal,
    toggleFav,
    esc,
    ic,
    imgTag,
    fmt: { price: fmtPrice, compact: fmtCompact, int: fmtInt, pct: fmtPct, signed: fmtSignedCompact }
  };

  boot();
})();