export function initNavigation() {
  const header = document.querySelector('.site-header');
  const nav = document.querySelector('#site-nav');
  const menu = document.querySelector('#menu-toggle');
  const desktop = matchMedia('(min-width: 761px)');

  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    menu.setAttribute('aria-expanded', String(open));
  }

  menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', event => {
    if (event.target.closest('a')) setMenu(false);
  });
  header.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || menu.getAttribute('aria-expanded') !== 'true') return;
    setMenu(false);
    menu.focus();
  });
  desktop.addEventListener('change', () => setMenu(false));
  if (!desktop.matches) {
    for (const index of document.querySelectorAll('.quick-sidebar')) index.open = false;
  }
  header.classList.add('app-ready');
}

export function initAnchors() {
  function revealFragment() {
    if (location.hash.length < 2) return;
    let target;
    try { target = document.getElementById(decodeURIComponent(location.hash.slice(1))); }
    catch { return; }
    let opened = false;
    for (let section = target?.closest('details'); section; section = section.parentElement.closest('details')) {
      if (!section.open) {
        section.open = true;
        opened = true;
      }
    }
    if (opened) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  }
  addEventListener('hashchange', revealFragment);
  revealFragment();
}
