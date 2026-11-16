import { preference } from '../preferences.js';

const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 280;

export function initReviewResize(panel, root, onResize) {
  const handle = document.createElement('div');
  handle.className = 'review-resize';
  handle.tabIndex = 0;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-label', 'Átnéző sáv szélessége');
  handle.setAttribute('aria-controls', panel.id);
  handle.setAttribute('aria-orientation', 'vertical');
  handle.title = 'Húzd a szélét, vagy használd a nyílbillentyűket';
  document.body.append(handle);

  const settings = preference(root.pathname, 'review-width');
  const stored = Number(settings.read());
  let preferred = stored >= MIN_WIDTH ? Math.min(700, stored) : DEFAULT_WIDTH;
  let width = DEFAULT_WIDTH;
  let drag;
  const upper = () => Math.max(MIN_WIDTH, Math.min(700, document.documentElement.clientWidth - 700));

  function apply() {
    width = Math.round(Math.min(upper(), Math.max(MIN_WIDTH, preferred)));
    document.body.style.setProperty('--review-rail', width + 'px');
    handle.setAttribute('aria-valuemin', String(MIN_WIDTH));
    handle.setAttribute('aria-valuemax', String(upper()));
    handle.setAttribute('aria-valuenow', String(width));
    handle.setAttribute('aria-valuetext', width + ' képpont');
    onResize();
  }

  function set(next, remember = false) {
    preferred = Math.min(upper(), Math.max(MIN_WIDTH, next));
    if (remember) settings.write(Math.round(preferred));
    apply();
  }

  handle.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    drag = { id: event.pointerId, startX: event.clientX, startWidth: width };
    handle.setPointerCapture(event.pointerId);
    document.documentElement.classList.add('review-resizing');
  });
  handle.addEventListener('pointermove', event => {
    if (drag?.id === event.pointerId) set(drag.startWidth + drag.startX - event.clientX);
  });
  function finish(event) {
    if (drag?.id !== event.pointerId) return;
    drag = null;
    settings.write(width);
    document.documentElement.classList.remove('review-resizing');
  }
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
  handle.addEventListener('lostpointercapture', finish);
  handle.addEventListener('dblclick', () => set(DEFAULT_WIDTH, true));
  handle.addEventListener('keydown', event => {
    const step = event.shiftKey ? 48 : 16;
    let next;
    if (event.key === 'ArrowLeft') next = width + step;
    else if (event.key === 'ArrowRight') next = width - step;
    else if (event.key === 'Home') next = MIN_WIDTH;
    else if (event.key === 'End') next = upper();
    else return;
    event.preventDefault();
    set(next, true);
  });
  addEventListener('resize', apply, { passive: true });
  apply();
}
