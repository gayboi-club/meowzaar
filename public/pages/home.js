(() => {
  'use strict';
  const Meow = window.Meow;
  const $ = Meow.$;
  const { esc, ic, fmt } = Meow;

  let home = null;
  let homeRaw = null;

  async function fetchNews() {
    const res = await fetch('/api/news?limit=3').catch(() => null);
    if (!res || !res.ok) return;
    const d = await res.json();
    if (!d.ok || !d.news.length) return;
    $('home-news').innerHTML = d.news.map((n) =>
      `<a class="news-strip-item" href="${esc(n.url)}">
        <span class="news-strip-date">${esc(n.date)}</span>
        <span class="news-strip-title">${esc(n.title)}</span>
      </a>`).join('');
    $('home-news').classList.remove('hidden');
  }

  function renderHomeStats() {
    const cardsEl = $('home-cards');
    const gainEl = $('home-gainers');
    const loseEl = $('home-losers');
    const flipEl = $('home-flips');
    const liqEl = $('home-liquid');
    if (!home) {
      cardsEl.innerHTML = '';
      [gainEl, loseEl, flipEl, liqEl].forEach((el) => {
        el.innerHTML = '<span class="empty small">waiting…</span>';
      });
      return;
    }
    const bestMove = home.totals.biggestMove;
    cardsEl.innerHTML = [
      { k: 'items tracked', v: fmt.int(home.totals.items), sub: 'everything on the bazaar :3' },
      { k: 'instant flips now', v: fmt.int(home.totals.flips), sub: 'buy price < sell price', cls: home.totals.flips > 0 ? 'up' : '' },
      { k: 'best margin right now', v: home.totals.bestPct !== null ? fmt.pct(home.totals.bestPct) : '-', sub: home.totals.bestPctName ? esc(home.totals.bestPctName) : 'no flips right now', cls: home.totals.bestPct !== null ? 'up' : '' },
      { k: 'biggest 24h move', v: bestMove ? (bestMove.pct >= 0 ? '+' : '') + fmt.pct(bestMove.pct) : '-', sub: bestMove ? esc(bestMove.name) : 'history warming up :3' }
    ].map((c) =>
      `<div class="card">
         <span class="card-k">${c.k}</span>
         <span class="card-v ${c.cls || ''}">${c.v}</span>
         <span class="card-sub">${c.sub}</span>
       </div>`).join('');

    fillDash(gainEl, home.gainers, (m) => ({
      sub: `${fmt.compact(m.from)} &rarr; ${fmt.compact(m.to)}`,
      val: ('+' + fmt.pct(m.pct)),
      cls: 'up'
    }));
    fillDash(loseEl, home.losers, (m) => ({
      sub: `${fmt.compact(m.from)} &rarr; ${fmt.compact(m.to)}`,
      val: '−' + fmt.pct(Math.abs(m.pct)),
      cls: 'down'
    }));
    fillDash(flipEl, home.flips, (m) => ({
      sub: `${fmt.price(m.spread)} profit · ${fmt.compact(m.sellVolume)} sell / ${fmt.compact(m.buyVolume)} buy`,
      val: '+' + fmt.pct(m.spreadPct),
      cls: 'up'
    }));
    fillDash(liqEl, home.liquid, (m) => ({
      sub: `sell price ${fmt.price(m.sellPrice)}`,
      val: fmt.compact(m.sellMovingWeek),
      cls: ''
    }));
  }

  function fillDash(el, list, rowOf) {
    el.innerHTML = list.length
      ? list.map((m) => {
          const r = rowOf(m);
          return `<button class="mrow" data-id="${esc(m.id)}">
            ${ic(m.id, 'sm')}
            <span class="mrow-main">
              <span class="mrow-name">${esc(m.name)}</span>
              <span class="mrow-sub">${r.sub}</span>
            </span>
            <span class="mrow-val ${r.cls}">${r.val}</span>
          </button>`;
        }).join('')
      : '<span class="empty small">no data yet</span>';
  }

  function renderHome() {
    if (!Meow.state.products.size) {
      $('home-items').innerHTML = '<span class="empty">waiting for the first snapshot…</span>';
      return;
    }
    const q = Meow.state.query.trim().toLowerCase();
    const items = [...Meow.state.products.values()]
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    $('home-count').textContent = q
      ? `${items.length} of ${Meow.state.products.size} items`
      : `${Meow.state.products.size} items`;
    $('home-items').innerHTML = items.length
      ? items.map((p) =>
        `<button class="home-item" data-id="${esc(p.id)}">
           ${ic(p.id, 'sm')}
           <span class="hi-name">${esc(p.name)}</span>
           <span class="hi-id">${esc(p.id)}</span>
         </button>`).join('')
      : '<span class="empty">nothing here</span>';
    renderHomeStats();
  }

  async function fetchHome() {
    const res = await fetch('/api/home').catch(() => null);
    if (!res || !res.ok) return;
    const d = await res.json();
    if (!d.ok) return;
    const raw = JSON.stringify(d);
    if (homeRaw === raw) return;
    homeRaw = raw;
    home = d;
    Meow.rerender();
  }

  Meow.baseFilter = (items) => items;
  Meow.renderer = renderHome;

  $('home').addEventListener('click', (e) => {
    const it = e.target.closest('[data-id]');
    if (it) Meow.openModal(it.dataset.id);
  });

  Meow.onReady(() => {
    fetchHome();
    fetchNews();
    setInterval(fetchHome, 60000);
    setInterval(fetchNews, 60000);
  });
})();