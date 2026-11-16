import { elementTarget, pageTarget, revealNote, selectedTarget } from './anchors.js';
import { reviewId } from './session.js';

const messages = {
  access: 'Az átnéző link lejárt vagy nem érvényes.',
  invalid: 'Nem sikerült rögzíteni ezt a megjegyzést. Ellenőrizd a szöveget, és próbáld újra.',
  limit: 'Az átnéző lista betelt.',
  missing: 'Ez a megjegyzés már nem található.',
  network: 'Nem sikerült elérni a megjegyzéseket. Próbáld újra.',
};
const dateFmt = new Intl.DateTimeFormat('hu-HU', { dateStyle: 'medium', timeStyle: 'short' });
const routePattern = /^([a-z0-9-]+\/)*$/;

function add(parent, tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  parent.append(node);
  return node;
}

function showBody(parent, body) {
  const text = String(body || '');
  let end = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const address = match[0].replace(/[.,!?;:)\]]+$/, '');
    let url;
    try { url = new URL(address); } catch { continue; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
    parent.append(text.slice(end, match.index));
    const link = add(parent, 'a', '', address);
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    end = match.index + address.length;
  }
  parent.append(text.slice(end));
}

export async function initReview(main, session) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('../../css/review.css', import.meta.url);
  document.head.append(stylesheet);

  const toggle = add(document.body, 'button', 'review-toggle', 'Átnézés');
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', 'review-sidebar');
  toggle.setAttribute('aria-expanded', 'false');
  const pin = add(document.body, 'button', 'review-pin', 'Megjegyzés ehhez');
  pin.type = 'button';
  pin.hidden = true;
  const panel = add(document.body, 'aside', 'review-panel');
  panel.id = 'review-sidebar';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Átnézés és megjegyzések');
  panel.innerHTML =
    '<header class="review-panel__header"><div><span class="review-kicker">Dzsufizio</span><h2>Átnézés</h2></div>' +
    '<button type="button" class="review-close" aria-label="Megjegyzéssáv becsukása">×</button></header>' +
    '<p class="review-identity"></p><p class="review-message" role="status" aria-live="polite"></p>' +
    '<button type="button" class="review-retry" hidden>Újrapróbálom</button>' +
    '<div class="review-controls" hidden>' +
    '<p class="review-help">Jelölj ki egy szövegrészt, vagy vidd az egeret egy kép, videó vagy gomb fölé.</p>' +
    '<form class="review-form"><p class="review-target"></p><blockquote class="review-quote" hidden></blockquote>' +
    '<label for="review-body">Mit módosítsunk?</label>' +
    '<textarea id="review-body" rows="4" maxlength="3000" required placeholder="Írd ide a megjegyzésed vagy a csereszöveget. Videóhoz beillesztheted a linket."></textarea>' +
    '<div class="review-actions"><button class="review-primary" type="submit">Mentés</button>' +
    '<button class="review-reset" type="button">Az egész oldalhoz</button></div></form>' +
    '<section class="review-log" aria-label="Közös megjegyzések"><h3>Közös megjegyzések</h3>' +
    '<div class="review-filters"><button type="button" data-status="open" aria-pressed="true">Teendők</button>' +
    '<button type="button" data-status="done" aria-pressed="false">Kész</button>' +
    '<button type="button" class="review-refresh">Frissítés</button></div><div class="review-notes"></div></section></div>' +
    '<footer class="review-panel__footer"><button type="button" class="review-exit">Kilépés az átnézésből</button></footer>';

  const form = panel.querySelector('form');
  const input = panel.querySelector('textarea');
  const save = form.querySelector('[type="submit"]');
  const message = panel.querySelector('.review-message');
  const noteList = panel.querySelector('.review-notes');
  const rangeQuote = panel.querySelector('.review-quote');
  const title = (main.querySelector('h1')?.textContent || document.title).trim().slice(0, 220);
  let notes = [];
  let owner = false;
  let status = 'open';
  let focusTarget = pageTarget(main);
  let submission = null;
  let pointerTarget = null;
  let busy = false;
  let active = false;

  function notice(text, error = false) {
    message.textContent = text;
    message.classList.toggle('is-error', error);
    message.hidden = !text;
  }

  function openPanel(open, focus = false) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('review-open', open);
    if (open && focus) input.focus();
    if (!open) toggle.focus();
  }

  function showTarget(target) {
    const { locator, section } = target;
    focusTarget = target;
    panel.querySelector('.review-target').textContent = [title, section && section !== title ? section : '', locator.label].filter(Boolean).join(' › ');
    rangeQuote.textContent = locator.quote ? '„' + locator.quote + '”' : '';
    rangeQuote.hidden = !locator.quote;
  }

  function choose(target) {
    openPanel(true);
    if (busy || input.value.trim()) {
      notice('A szövegmezőben van egy el nem mentett megjegyzés.', true);
      input.focus();
      return;
    }
    submission = null;
    showTarget(target);
    notice('');
    positionPin(null);
    input.focus();
  }

  function positionPin(target) {
    const r = target?.rect;
    pointerTarget = target;
    if (!r || r.width < 1 || r.bottom < 0 || r.top > innerHeight) { pin.hidden = true; return; }
    pin.hidden = false;
    const sidebar = panel.hidden || innerWidth < 1070 ? 0 : panel.offsetWidth;
    const pinWidth = pin.offsetWidth;
    const desiredX = target.locator.kind === 'text' ? r.left : r.right - pinWidth - 9;
    const desiredY = target.locator.kind === 'text' ? r.bottom + 6 : r.top - pin.offsetHeight - 5;
    pin.style.left = Math.max(8, Math.min(innerWidth - sidebar - pinWidth - 10, desiredX)) + 'px';
    pin.style.top = Math.max(8, Math.min(innerHeight - pin.offsetHeight - 8, desiredY)) + 'px';
  }

  function renderNotes() {
    noteList.replaceChildren();
    panel.querySelector('[data-status="open"]').textContent = 'Teendők (' + notes.filter(n => n.status === 'open').length + ')';
    panel.querySelector('[data-status="done"]').textContent = 'Kész (' + notes.filter(n => n.status === 'done').length + ')';
    const shown = notes.filter(n => n.status === status);
    if (!shown.length) {
      add(noteList, 'p', 'review-empty', status === 'open' ? 'Még nincs nyitott megjegyzés.' : 'Még nincs késznek jelölt megjegyzés.');
      return;
    }
    const groups = new Map();
    for (const note of shown) {
      if (!reviewId.test(note.id) || !routePattern.test(note.route)) continue;
      if (!groups.has(note.route)) {
        const group = add(noteList, 'section', 'review-group');
        add(group, 'h4', '', note.page_title);
        groups.set(note.route, group);
      }
      const item = add(groups.get(note.route), 'article', 'review-note');
      if (note.section && note.section !== note.page_title) add(item, 'p', 'review-section', note.section);
      const target = note.locator?.quote || note.locator?.label;
      if (target && note.locator?.kind !== 'page') add(item, 'blockquote', 'review-quote', target);
      showBody(add(item, 'p', 'review-note__body'), note.body);
      const time = new Date(note.created_at);
      add(item, 'p', 'review-author', note.author + (Number.isNaN(+time) ? '' : ' · ' + dateFmt.format(time)));
      const row = add(item, 'div', 'review-actions');
      const jump = add(row, 'a', 'review-jump', 'Ugrás a helyére');
      const url = new URL(note.route, session.root);
      url.searchParams.set('review-note', note.id);
      jump.href = url;
      if (note.route === session.route) jump.addEventListener('click', e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        revealNote(main, note);
      });
      if (owner) {
        const mark = add(row, 'button', 'review-mark', note.status === 'open' ? 'Kész' : 'Újranyitás');
        mark.type = 'button';
        mark.addEventListener('click', async () => {
          mark.disabled = true;
          try {
            const response = await session.rpc('dzs_review_set_status', { p_id: note.id, p_status: note.status === 'open' ? 'done' : 'open' });
            notes = notes.map(n => n.id === note.id ? response.note : n);
            renderNotes();
            notice(note.status === 'open' ? 'Késznek jelölve.' : 'Újranyitva.');
          } catch (error) { notice(messages[error.message] || messages.network, true); }
          finally { mark.disabled = false; }
        });
      }
    }
  }

  async function refresh() {
    const result = await session.rpc('dzs_review_list');
    owner = result.role === 'owner';
    notes = Array.isArray(result.notes) ? result.notes : [];
    panel.querySelector('.review-identity').textContent = result.name;
    renderNotes();
  }

  toggle.addEventListener('click', () => openPanel(panel.hidden));
  panel.querySelector('.review-close').addEventListener('click', () => openPanel(false));
  panel.querySelector('.review-exit').addEventListener('click', () => {
    if (!input.value.trim() || window.confirm('Kilépsz mentés nélkül?')) session.clear();
  });
  panel.querySelector('.review-reset').addEventListener('click', () => choose(pageTarget(main)));
  panel.querySelector('.review-refresh').addEventListener('click', async e => {
    const button = e.currentTarget;
    button.disabled = true;
    try { await refresh(); notice('A lista frissült.'); }
    catch (error) { notice(messages[error.message] || messages.network, true); }
    finally { button.disabled = false; }
  });
  for (const button of panel.querySelectorAll('[data-status]')) button.addEventListener('click', () => {
    status = button.dataset.status;
    panel.querySelectorAll('[data-status]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    renderNotes();
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy || !active || !input.value.trim()) return;
    const body = input.value.trim();
    if (!submission || submission.body !== body) submission = { id: crypto.randomUUID(), body };
    busy = save.disabled = true;
    try {
      const result = await session.rpc('dzs_review_create', {
        p_id: submission.id,
        p_data: { route: session.route, page_title: title, section: focusTarget.section, locator: focusTarget.locator, body },
      });
      notes = [result.note, ...notes.filter(n => n.id !== result.note.id)];
      submission = null;
      input.value = '';
      panel.querySelector('[data-status="open"]').click();
      notice('Megjegyzés elmentve.');
    } catch (error) { notice((messages[error.message] || messages.network) + ' A beírt szöveg megmaradt.', true); }
    finally { busy = save.disabled = false; }
  });
  input.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); form.requestSubmit(); }
  });
  pin.addEventListener('pointerdown', e => e.preventDefault());
  pin.addEventListener('click', () => { if (active && pointerTarget) choose(pointerTarget); });
  function suggestElement(event) {
    if (!active || selectedTarget(main)) return;
    const target = elementTarget(main, event.target);
    if (target) positionPin(target);
  }
  main.addEventListener('pointerover', suggestElement);
  main.addEventListener('focusin', suggestElement);
  document.addEventListener('selectionchange', () => {
    if (!active) return;
    const selected = selectedTarget(main);
    if (selected || pointerTarget?.locator.kind === 'text') positionPin(selected);
  });
  function movePin() {
    if (!pointerTarget) return;
    positionPin(pointerTarget?.locator.kind === 'text' ? selectedTarget(main) : elementTarget(main, pointerTarget?.element));
  }
  window.addEventListener('scroll', movePin, { passive: true });
  window.addEventListener('resize', movePin);
  document.addEventListener('pointerdown', event => {
    if (!pin.contains(event.target) && (pointerTarget?.locator.kind !== 'text' || !selectedTarget(main))) {
      positionPin(null);
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!panel.hidden) openPanel(false);
    positionPin(null);
  });

  const retry = panel.querySelector('.review-retry');
  async function connect() {
    retry.hidden = true;
    notice('Megjegyzések betöltése…');
    try {
      await refresh();
      notice('');
      active = true;
      showTarget(focusTarget);
      panel.querySelector('.review-controls').hidden = false;
      const jump = notes.find(n => n.id === session.jumpTo && n.route === session.route);
      if (jump) {
        openPanel(true);
        if (jump.status === 'done') panel.querySelector('[data-status="done"]').click();
        requestAnimationFrame(() => revealNote(main, jump));
      }
    } catch (error) {
      openPanel(true);
      notice(messages[error.message] || messages.network, true);
      retry.hidden = error.message === 'access';
    }
  }
  retry.addEventListener('click', connect);
  if (session.invited && innerWidth >= 1070) openPanel(true);
  await connect();
}
