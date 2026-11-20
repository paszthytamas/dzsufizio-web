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
  const css = new URL('../../css/review.css', import.meta.url);
  css.search = new URL(import.meta.url).search;
  stylesheet.href = css;
  document.head.append(stylesheet);
  const resize = new URL('./resize.js', import.meta.url);
  resize.search = css.search;
  const { initReviewResize } = await import(resize.href);

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
    '<div class="review-navigation"><div class="review-filters"><button type="button" data-status="open" aria-pressed="true">Teendők</button>' +
    '<button type="button" data-status="done" aria-pressed="false">Kész</button>' +
    '<button type="button" class="review-refresh">Frissítés</button></div>' +
    '<div class="review-actions"><button type="button" class="review-primary review-next" disabled>Következő</button><span class="review-position" aria-live="polite"></span></div></div>' +
    '<div class="review-notes"></div></section></div>' +
    '<div class="review-undo" hidden><span role="status"></span><button type="button" class="review-restore">Visszavonás</button>' +
    '<button type="button" class="review-dismiss" aria-label="Törlésüzenet bezárása">×</button></div>' +
    '<footer class="review-panel__footer"><button type="button" class="review-exit">Kilépés az átnézésből</button></footer>';

  const form = panel.querySelector('form');
  const input = panel.querySelector('textarea');
  const save = form.querySelector('[type="submit"]');
  const message = panel.querySelector('.review-message');
  const noteList = panel.querySelector('.review-notes');
  const nextButton = panel.querySelector('.review-next');
  const position = panel.querySelector('.review-position');
  const rangeQuote = panel.querySelector('.review-quote');
  const undo = panel.querySelector('.review-undo');
  const restore = undo.querySelector('.review-restore');
  const title = (main.querySelector('h1')?.textContent || document.title).trim().slice(0, 220);
  let notes = [];
  let owner = false;
  let status = 'open';
  const cursors = { open: { id: null, following: [] }, done: { id: null, following: [] } };
  let visibleNotes = [];
  let nextNote;
  const noteRows = new Map();
  let focusTarget = pageTarget(main);
  let submission = null;
  let pointerTarget = null;
  let busy = false;
  let active = false;
  let undoId = null;

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

  function noteUrl(note) {
    const address = new URL(note.route, session.root);
    const view = new URL(location.href).searchParams.get('nezet');
    if (view) address.searchParams.set('nezet', view);
    address.searchParams.set('review-note', note.id);
    return address;
  }

  function updateStep() {
    const cursor = cursors[status];
    const index = visibleNotes.findIndex(note => note.id === cursor.id);
    if (index !== -1) cursor.following = visibleNotes.slice(index + 1).map(note => note.id);
    // Remember the continuation when the selected note leaves this filter.
    const nextId = cursor.following.find(id => noteRows.has(id));
    nextNote = cursor.id ? visibleNotes.find(note => note.id === nextId) : visibleNotes[0];
    nextButton.disabled = !nextNote;
    nextButton.setAttribute('aria-label', status === 'done' ? 'Következő kész megjegyzés' : 'Következő teendő');
    nextButton.title = nextNote ? '' : 'Nincs következő megjegyzés.';
    position.textContent = index < 0 ? '' : (index + 1) + ' / ' + visibleNotes.length;
    for (const [id, item] of noteRows) {
      const link = item.querySelector('.review-jump');
      const selected = id === cursor.id;
      item.classList.toggle('is-current', selected);
      if (selected) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  }

  function showNote(note) {
    const address = new URL(location.href);
    address.searchParams.set('review-note', note.id);
    history.replaceState(history.state, '', address);
    cursors[status].id = note.id;
    updateStep();
    revealNote(main, note);
    noteRows.get(note.id)?.scrollIntoView({ block: 'nearest' });
  }

  nextButton.addEventListener('click', () => {
    if (!nextNote) return;
    if (nextNote.route === session.route) {
      showNote(nextNote);
      return;
    }
    if (busy || input.value.trim()) {
      notice('Az oldalváltás előtt mentsd el a megjegyzésedet.', true);
      input.focus();
      return;
    }
    location.assign(noteUrl(nextNote));
  });

  function renderNotes() {
    noteList.replaceChildren();
    noteRows.clear();
    visibleNotes = [];
    panel.querySelector('[data-status="open"]').textContent = 'Teendők (' + notes.filter(n => n.status === 'open').length + ')';
    panel.querySelector('[data-status="done"]').textContent = 'Kész (' + notes.filter(n => n.status === 'done').length + ')';
    const shown = notes.filter(n => n.status === status && reviewId.test(n.id) && routePattern.test(n.route));
    if (!shown.length) {
      add(noteList, 'p', 'review-empty', status === 'open' ? 'Még nincs nyitott megjegyzés.' : 'Még nincs késznek jelölt megjegyzés.');
      updateStep();
      return;
    }
    const groups = new Map();
    const byId = new Map(shown.map(note => [note.id, note]));
    for (const note of shown) {
      if (!groups.has(note.route)) {
        const group = add(noteList, 'section', 'review-group');
        add(group, 'h4', '', note.page_title);
        groups.set(note.route, group);
      }
      const item = add(groups.get(note.route), 'article', 'review-note');
      item.dataset.noteId = note.id;
      noteRows.set(note.id, item);
      if (note.section && note.section !== note.page_title) add(item, 'p', 'review-section', note.section);
      const target = note.locator?.quote || note.locator?.label;
      if (target && note.locator?.kind !== 'page') add(item, 'blockquote', 'review-quote', target);
      showBody(add(item, 'p', 'review-note__body'), note.body);
      const time = new Date(note.created_at);
      add(item, 'p', 'review-author', note.author + (Number.isNaN(+time) ? '' : ' · ' + dateFmt.format(time)));
      const row = add(item, 'div', 'review-actions');
      const jump = add(row, 'a', 'review-jump', 'Ugrás a helyére');
      jump.href = noteUrl(note);
      if (note.route === session.route) jump.addEventListener('click', event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        showNote(note);
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
      if (note.can_delete === true) {
        const remove = add(row, 'button', 'review-delete', 'Törlés');
        remove.type = 'button';
        remove.addEventListener('click', async () => {
          const buttons = [...row.querySelectorAll('button')];
          buttons.forEach(button => { button.disabled = true; });
          try {
            await session.rpc('dzs_review_set_deleted', { p_id: note.id, p_deleted: true });
            notes = notes.filter(n => n.id !== note.id);
            renderNotes();
            notice('');
            undoId = note.id;
            undo.hidden = false;
            undo.querySelector('[role="status"]').textContent = 'Megjegyzés törölve.';
            restore.focus({ preventScroll: true });
          } catch (error) { notice(messages[error.message] || messages.network, true); }
          finally { buttons.forEach(button => { button.disabled = false; }); }
        });
      }
    }
    visibleNotes = [...noteList.querySelectorAll('[data-note-id]')].map(item => byId.get(item.dataset.noteId));
    updateStep();
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
  function dismissUndo() {
    undoId = null;
    undo.hidden = true;
    undo.querySelector('[role="status"]').textContent = '';
  }
  undo.querySelector('.review-dismiss').addEventListener('click', dismissUndo);
  restore.addEventListener('click', async () => {
    const id = undoId;
    if (!id) return;
    restore.disabled = true;
    try {
      const { note } = await session.rpc('dzs_review_set_deleted', { p_id: id, p_deleted: false });
      notes = [note, ...notes.filter(n => n.id !== id)].sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (undoId === id) dismissUndo();
      const filter = panel.querySelector(note.status === 'done' ? '[data-status="done"]' : '[data-status="open"]');
      filter.click();
      filter.focus({ preventScroll: true });
      notice('Megjegyzés visszaállítva.');
    } catch (error) {
      undo.querySelector('[role="status"]').textContent = 'Nem sikerült visszaállítani. Próbáld újra.';
    } finally { restore.disabled = false; }
  });
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
  initReviewResize(panel, session.root, movePin);
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
        requestAnimationFrame(() => {
          showNote(jump);
          if (!nextButton.disabled) nextButton.focus({ preventScroll: true });
        });
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
