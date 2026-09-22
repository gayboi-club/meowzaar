(() => {
  'use strict';
  const Meow = window.Meow;
  const $ = Meow.$;

  const LS_KEY = 'flipFilters';
  const numOr = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  const opt = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : d; };

  const PRESETS = {
    active:     { minProfit: 25000,  minPct: 1,  maxPct: 1000, minVol: 25,   maxCost: 0 },
    liquid:     { minProfit: 1000,   minPct: 1,  maxPct: 1000, minVol: 1000, maxCost: 0 },
    big:        { minProfit: 500000, minPct: 10, maxPct: 1000, minVol: 25,   maxCost: 0 },
    scalp:      { minProfit: 1000,   minPct: 50, maxPct: 1000, minVol: 100,  maxCost: 0 },
    budget:     { minProfit: 1000,   minPct: 1,  maxPct: 1000, minVol: 25,   maxCost: 1000000 },
    everything: { minProfit: 0,      minPct: 0,  maxPct: 0,    minVol: 0,    maxCost: 0 }
  };

  function setActiveChip(name) {
    document.querySelectorAll('#flip-presets .chip').forEach((b) => {
      b.classList.toggle('active', b.dataset.preset === name);
    });
  }

  function readFilters() {
    return {
      minProfit: numOr($('f-minProfit').value, 0),
      minPct: numOr($('f-minPct').value, 0),
      maxPct: opt($('f-maxPct').value, Infinity),
      minVol: numOr($('f-minVol').value, 0),
      maxCost: opt($('f-maxCost').value, Infinity)
    };
  }

  function saveFilters(preset) {
    try {
      localStorage.setItem('meowzaar:' + LS_KEY, JSON.stringify({ preset, ...readFilters() }));
    } catch {}
  }

  function applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    $('f-minProfit').value = p.minProfit;
    $('f-minPct').value = p.minPct;
    $('f-maxPct').value = p.maxPct || '';
    $('f-minVol').value = p.minVol;
    $('f-maxCost').value = p.maxCost || '';
    setActiveChip(name);
    saveFilters(name);
    Meow.rerender();
  }

  function loadFilters() {
    let f = null;
    try { f = JSON.parse(localStorage.getItem('meowzaar:' + LS_KEY)); } catch { f = null; }
    if (!f || typeof f !== 'object') { applyPreset('active'); return; }
    const p = PRESETS.active;
    $('f-minProfit').value = numOr(f.minProfit, p.minProfit);
    $('f-minPct').value = numOr(f.minPct, p.minPct);
    $('f-maxPct').value = f.maxPct && f.maxPct !== Infinity ? f.maxPct : '';
    $('f-minVol').value = numOr(f.minVol, p.minVol);
    $('f-maxCost').value = f.maxCost && f.maxCost !== Infinity ? f.maxCost : '';
    setActiveChip(f.preset && PRESETS[f.preset] ? f.preset : 'custom');
  }

  Meow.baseFilter = (items) => {
    const f = readFilters();
    return items.filter((p) =>
      p.buyPrice > 0 &&
      p.sellPrice > 0 &&
      p.spread > 0 &&
      p.spread >= f.minProfit &&
      p.spreadPct >= f.minPct &&
      p.spreadPct <= f.maxPct &&
      Math.min(p.sellVolume, p.buyVolume) >= f.minVol &&
      p.sellPrice <= f.maxCost
    );
  };
  Meow.state.sort = { key: 'spread', dir: 'desc' };

  Meow.renderer = () => {
    const count = Meow.visibleItems().length;
    const pc = $('pageCount');
    if (pc) pc.textContent = `${count} flips`;
    Meow.renderBoard();
  };

  document.querySelectorAll('#flip-presets .chip').forEach((b) => {
    b.addEventListener('click', () => applyPreset(b.dataset.preset));
  });

  $('f-reset').addEventListener('click', () => applyPreset('active'));

  ['f-minProfit', 'f-minPct', 'f-maxPct', 'f-minVol', 'f-maxCost'].forEach((id) => {
    $(id).addEventListener('input', () => {
      setActiveChip('custom');
      saveFilters('custom');
      Meow.rerender();
    });
  });

  loadFilters();
})();