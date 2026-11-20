import { preference } from './preferences.js';

const views = new Set(['jelenlegi', 'modositott', 'osszehasonlitas']);

export async function initContentView(main) {
  const select = document.getElementById('content-view');
  const legend = document.getElementById('revision-legend');
  const settings = preference(document.querySelector('.brand').pathname, 'content-view');
  const url = new URL(location.href);
  const requested = url.searchParams.get('nezet') ?? settings.read();
  let view = views.has(requested) ? requested : 'jelenlegi';
  const comparing = view === 'osszehasonlitas';
  try {
    if (view !== 'jelenlegi' && main.dataset.revisions) {
      main.setAttribute('aria-busy', 'true');
      const response = await fetch(main.dataset.revisions);
      if (!response.ok) throw new Error('content revisions');
      const versions = await response.json();
      const html = comparing ? versions.comparison : versions.modified;
      if (typeof html !== 'string') throw new Error('content revisions');
      main.innerHTML = html;
    }
    if (comparing) {
      if (!main.dataset.revisions) legend.textContent = 'Ezen az oldalon nincs módosítás.';
      legend.hidden = false;
    }
    settings.write(view);
  } catch {
    legend.textContent = 'A választott nézet nem tölthető be. A jelenlegi szöveg látható.';
    legend.hidden = false;
    view = 'jelenlegi';
  } finally {
    main.removeAttribute('aria-busy');
  }

  select.value = view;
  select.hidden = false;
  select.addEventListener('change', () => {
    const next = new URL(location.href);
    next.searchParams.set('nezet', select.value);
    location.assign(next);
  });
}
