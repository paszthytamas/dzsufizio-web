import { preference } from './preferences.js';

const views = new Set(['jelenlegi', 'modositott', 'osszehasonlitas']);

export async function loadContentView(main, view, address, signal) {
  if (view === 'jelenlegi' || !main.dataset.revisions) return;
  const url = new URL(main.dataset.revisions, address);
  if (url.origin !== new URL(address).origin) throw new Error('content revisions');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('content revisions');
  const versions = await response.json();
  const html = view === 'osszehasonlitas' ? versions.comparison : versions.modified;
  if (typeof html !== 'string') throw new Error('content revisions');
  main.innerHTML = html;
}

export function showContentView(main, view, error = false) {
  const select = document.getElementById('content-view');
  const legend = document.getElementById('revision-legend');
  if (error) {
    legend.textContent = 'A választott nézet nem tölthető be. A jelenlegi szöveg látható.';
  } else if (view === 'osszehasonlitas' && !main.dataset.revisions) {
    legend.textContent = 'Ezen az oldalon nincs módosítás.';
  }
  legend.hidden = !error && view !== 'osszehasonlitas';
  select.value = view;
  select.hidden = false;
}

export async function initContentView(main) {
  const select = document.getElementById('content-view');
  const settings = preference(document.querySelector('.brand').pathname, 'content-view');
  const url = new URL(location.href);
  const requested = url.searchParams.get('nezet') ?? settings.read();
  const view = views.has(requested) ? requested : 'jelenlegi';
  try {
    main.setAttribute('aria-busy', 'true');
    await loadContentView(main, view, url);
    showContentView(main, view);
    settings.write(view);
  } catch {
    showContentView(main, 'jelenlegi', true);
  } finally {
    main.removeAttribute('aria-busy');
  }
  select.addEventListener('change', () => {
    const next = new URL(location.href);
    next.searchParams.set('nezet', select.value);
    location.assign(next);
  });
}
