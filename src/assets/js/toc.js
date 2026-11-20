import { preference } from './preferences.js';

export function initContents(main) {
  const toggle = document.getElementById('toc-toggle');
  const indexes = [...main.querySelectorAll('.reader > .side')].filter(aside => aside.querySelector('.quick-sidebar'));
  if (!indexes.length) return;

  const settings = preference(document.querySelector('.brand').pathname, 'toc');
  let visible;
  for (const [index, aside] of indexes.entries()) aside.id ||= 'tartalomjegyzek-' + (index + 1);
  toggle.setAttribute('aria-controls', indexes.map(aside => aside.id).join(' '));
  toggle.hidden = false;

  function show(next) {
    visible = next;
    toggle.setAttribute('aria-pressed', String(visible));
    toggle.title = visible ? 'Tartalomjegyzék elrejtése' : 'Tartalomjegyzék megjelenítése';
    for (const aside of indexes) {
      aside.hidden = !visible;
      aside.parentElement.classList.toggle('reader--without-toc', !visible);
      if (visible) aside.querySelector('.quick-sidebar').open = true;
    }
  }

  toggle.addEventListener('click', () => {
    show(!visible);
    settings.write(visible ? 'on' : 'off');
  });
  show(settings.read() === 'on');
}
