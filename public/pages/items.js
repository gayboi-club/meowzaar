(() => {
  'use strict';
  const Meow = window.Meow;
  const $ = Meow.$;
  const { esc, ic, fmt } = Meow;

  Meow.baseFilter = (items) => items;
  Meow.state.sort = { key: 'sellMovingWeek', dir: 'desc' };

  let lastStats = '';
  function renderStats() {
    if (!Meow.state.products.size) return;
    const all = [...Meow.state.products.values()];
    const flips = all.filter((p) => p.buyPrice > 0 && p.sellPrice > 0 && p.spread > 0 && p.sellVolume > 0);
    const traded = all.filter((p) => (p.sellVolume + p.buyVolume) > 0);
    const hottest = [...all].sort((a, b) => b.sellMovingWeek - a.sellMovingWeek)[0];
    const best = flips.slice().sort((a, b) => b.spreadPct - a.spreadPct)[0];

    const cards = [
      { k: 'items tracked', v: fmt.int(all.length), sub: 'everything on the bazaar' },
      { k: 'instant flips', v: fmt.int(flips.length), sub: best ? `${esc(best.name)} leads at ${fmt.pct(best.spreadPct)}` : 'no active flips', cls: flips.length ? 'up' : '' },
      { k: 'traded today', v: fmt.int(traded.length), sub: `${all.length - traded.length} with no volume` },
      { k: 'hottest 7d', v: hottest ? fmt.compact(hottest.sellMovingWeek) : '-', sub: hottest ? esc(hottest.name) : '' }
    ];

    const s = cards.map((c) =>
      `<div class="card">
         <span class="card-k">${c.k}</span>
         <span class="card-v ${c.cls || ''}">${c.v}</span>
         <span class="card-sub">${c.sub}</span>
       </div>`).join('');
    if (s !== lastStats) {
      lastStats = s;
      $('items-stats').innerHTML = s;
    }
  }

  let dashCache = '';
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
            <span class="mrow-val ${r.cls || ''}">${r.val}</span>
          </button>`;
        }).join('')
      : '<span class="empty small">no data yet</span>';
  }

  function renderPanels() {
    if (!Meow.state.products.size) return;
    const all = [...Meow.state.products.values()];
    const sell = all.filter((p) => p.sellVolume > 0).sort((a, b) => b.sellVolume - a.sellVolume).slice(0, 8);
    const buy = all.filter((p) => p.buyVolume > 0).sort((a, b) => b.buyVolume - a.buyVolume).slice(0, 8);
    const pricy = all.filter((p) => p.sellPrice > 0).sort((a, b) => b.sellPrice - a.sellPrice).slice(0, 8);

    const sig = JSON.stringify([sell, buy, pricy].map((list) => list.map((p) =>
      [p.id, p.sellVolume, p.buyVolume, p.sellPrice, p.buyPrice, p.sellMovingWeek, p.buyMovingWeek, p.buyOrders]
    )));
    if (sig === dashCache) return;
    dashCache = sig;

    fillDash($('items-sell'), sell, (p) => ({
      sub: `${fmt.compact(p.sellVolume)} sold now · ${fmt.compact(p.sellMovingWeek)} / 7d`,
      val: fmt.compact(p.sellVolume)
    }));
    fillDash($('items-buy'), buy, (p) => ({
      sub: `${fmt.int(p.buyOrders)} buy orders · ${fmt.compact(p.buyMovingWeek)} / 7d`,
      val: fmt.compact(p.buyVolume)
    }));
    fillDash($('items-pricy'), pricy, (p) => ({
      sub: `buy ${fmt.price(p.buyPrice)} · ${fmt.compact(p.sellVolume)} vol`,
      val: fmt.price(p.sellPrice),
      cls: 'up'
    }));
  }

  Meow.renderer = () => {
    renderStats();
    renderPanels();
    const count = Meow.visibleItems().length;
    const pc = $('pageCount');
    if (pc) pc.textContent = `${count} of ${Meow.state.products.size} items`;
    Meow.renderBoard();
  };

  $('items-dash').addEventListener('click', (e) => {
    const it = e.target.closest('[data-id]');
    if (it) Meow.openModal(it.dataset.id);
  });
})();