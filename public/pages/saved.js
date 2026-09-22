(() => {
  'use strict';
  const Meow = window.Meow;
  const $ = Meow.$;

  Meow.baseFilter = (items) => items.filter((p) => Meow.state.favs.has(p.id));
  Meow.state.sort = { key: 'name', dir: 'asc' };

  Meow.renderer = () => {
    $('empty').textContent = 'nothing saved yet';
    const saved = Meow.visibleItems().length;
    const pc = $('pageCount');
    if (pc) pc.textContent = `${saved} saved`;
    Meow.renderBoard();
  };
})();