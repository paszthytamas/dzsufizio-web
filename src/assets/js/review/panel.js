import { preference } from '../preferences.js';
import { reviewId } from './session.js';

function currentModule(relative) {
  const url = new URL(relative, import.meta.url);
  url.search = new URL(import.meta.url).search;
  return import(url.href);
}

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

export async function initReview(main, session, { openPage, reviewRoute }) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  const css = new URL('../../css/review.css', import.meta.url);
  css.search = new URL(import.meta.url).search;
  stylesheet.href = css;
  document.head.append(stylesheet);
  const [{ initReviewResize }, { clearNote, elementTarget, pageTarget, revealNote, selectedTarget },
    { compareNotes, loadReviewOrder }] = await Promise.all([
    currentModule('./resize.js'), currentModule('./anchors.js'), currentModule('./order.js'),
  ]);
  const sortPreference = preference(session.root.pathname, 'review-sort');
  const orderReady = loadReviewOrder(session.root, css.search).catch(() => new Map());

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
    '<div class="review-navigation"><div class="review-order"><label>Rendezés ' +
    '<select class="review-sort"><option value="page">Oldalsorrend</option><option value="time">Időrend</option></select></label>' +
    '<span class="review-position" aria-live="polite"></span></div>' +
    '<div class="review-filters"><button type="button" data-status="open" aria-pressed="true">Teendők</button>' +
    '<button type="button" data-status="done" aria-pressed="false">Kész</button>' +
    '<button type="button" class="review-refresh" aria-label="Frissítés" title="Frissítés">↻</button>' +
    '<button type="button" class="review-prev" disabled>Előző</button>' +
    '<button type="button" class="review-primary review-next" disabled>Következő</button></div></div>' +
    '<div class="review-notes"></div></section></div>' +
    '<div class="review-undo" hidden><span role="status"></span><button type="button" class="review-restore">Visszavonás</button>' +
    '<button type="button" class="review-dismiss" aria-label="Törlésüzenet bezárása">×</button></div>' +
    '<footer class="review-panel__footer"><button type="button" class="review-exit">Kilépés az átnézésből</button></footer>';

  const form = panel.querySelector('form');
  const input = panel.querySelector('textarea');
  const save = form.querySelector('[type="submit"]');
  const message = panel.querySelector('.review-message');
  const noteList = panel.querySelector('.review-notes');
  const navigation = panel.querySelector('.review-navigation');
  const sorter = panel.querySelector('.review-sort');
  const previousButton = panel.querySelector('.review-prev');
  const nextButton = panel.querySelector('.review-next');
  const contentView = document.getElementById('content-view');
  const initialView = contentView.value;
  const availableViews = new Set([...contentView.options].map(option => option.value));
  const filters = [...panel.querySelectorAll('[data-status]')];
  const position = panel.querySelector('.review-position');
  const rangeQuote = panel.querySelector('.review-quote');
  const undo = panel.querySelector('.review-undo');
  const restore = undo.querySelector('.review-restore');
  const pageTitle = () => (main.querySelector('h1')?.textContent || document.title).trim().slice(0, 220);
  let title = pageTitle();
  let renderedView = initialView;
  let committedAddress = new URL(location.href);
  let pending = null;
  let order = sortPreference.read() === 'time' ? 'time' : 'page';
  let compare = compareNotes(new Map(), order);
  sorter.value = order;
  let notes = [];
  let owner = false;
  let status = 'open';
  const cursors = { open: null, done: null };
  let visibleNotes = [];
  let previousNote;
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
    if (pending) return;
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
    address.searchParams.set('nezet', renderedView);
    address.searchParams.set('review-note', note.id);
    return address;
  }

  function updateStep() {
    const cursor = cursors[status];
    const index = visibleNotes.findIndex(note => note.id === cursor?.id);
    // A completed or deleted note still tells us where to continue in this filter.
    previousNote = index >= 0 ? visibleNotes[index - 1] :
      cursor && visibleNotes.findLast(note => compare(note, cursor) < 0);
    nextNote = index >= 0 ? visibleNotes[index + 1] :
      cursor ? visibleNotes.find(note => compare(note, cursor) > 0) : visibleNotes[0];
    previousButton.disabled = Boolean(pending) || !previousNote;
    nextButton.disabled = Boolean(pending) || !nextNote;
    previousButton.title = previousNote ? '' : 'Nincs előző megjegyzés.';
    nextButton.title = nextNote ? '' : 'Nincs következő megjegyzés.';
    position.textContent = index < 0 ? '' : (index + 1) + ' / ' + visibleNotes.length;
    for (const [id, item] of noteRows) {
      const link = item.querySelector('.review-jump');
      const selected = id === cursor?.id;
      item.classList.toggle('is-current', selected);
      item.querySelector('.review-current').hidden = !selected;
      if (selected) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  }

  function alignCard(id) {
    const item = noteRows.get(id);
    if (!item || panel.hidden) return;
    noteList.style.paddingBottom = '';
    const inset = parseFloat(getComputedStyle(panel).paddingTop);
    const top = panel.getBoundingClientRect().top + panel.clientTop + inset;
    const target = panel.scrollTop + item.getBoundingClientRect().top - top - navigation.getBoundingClientRect().height;
    // Leave enough space below the final card for it to reach the toolbar.
    const extra = target - (panel.scrollHeight - panel.clientHeight);
    if (extra > 0) noteList.style.paddingBottom = Math.ceil(extra) + 'px';
    panel.scrollTop = Math.max(0, target);
  }

  function setStatus(next) {
    status = next;
    for (const button of filters) button.setAttribute('aria-pressed', String(button.dataset.status === status));
    renderNotes();
  }

  function showNote(note, smooth = true) {
    cursors[note.status] = note;
    if (status !== note.status) setStatus(note.status);
    else updateStep();
    revealNote(main, note, { smooth });
    alignCard(note.id);
  }

  function finishPending() {
    pending = null;
    input.readOnly = false;
    updateStep();
  }

  async function navigate(address, note, { fromHistory = false } = {}) {
    const route = reviewRoute(address, session.root);
    if (route === null) return;
    const requested = address.searchParams.get('nezet');
    const view = availableViews.has(requested) ? requested : initialView;
    const replaceArticle = route !== session.route || view !== renderedView;
    if (pending) {
      pending.abort();
      finishPending();
    }
    if (replaceArticle && (busy || input.value.trim())) {
      if (fromHistory) history.replaceState(history.state, '', committedAddress);
      notice('Az oldalváltás előtt mentsd el a megjegyzésedet.', true);
      openPanel(true, true);
      return;
    }

    if (replaceArticle) {
      const controller = new AbortController();
      pending = controller;
      input.readOnly = true;
      updateStep();
      try {
        await openPage(address, view, { signal: controller.signal, fromHistory });
        session.route = route;
        renderedView = view;
        title = pageTitle();
        showTarget(pageTarget(main));
        positionPin(null);
      } catch {
        if (controller.signal.aborted) return;
        if (fromHistory) history.replaceState(history.state, '', committedAddress);
        notice('A megjegyzés oldala nem tölthető be. Próbáld újra.', true);
        message.scrollIntoView({ block: 'nearest' });
        return;
      } finally {
        if (pending === controller) finishPending();
      }
    } else if (!fromHistory) {
      history.replaceState(history.state, '', address);
    }

    committedAddress = address;
    notice('');
    if (note) {
      showNote(notes.find(item => item.id === note.id) || note, !replaceArticle && !fromHistory);
    } else {
      clearNote();
      cursors[status] = null;
      updateStep();
      if (replaceArticle) {
        let fragment;
        try { fragment = document.getElementById(decodeURIComponent(address.hash.slice(1))); }
        catch { /* A malformed fragment has no target. */ }
        if (fragment) fragment.scrollIntoView({ behavior: 'instant' });
        else window.scrollTo({ top: 0, behavior: 'instant' });
      }
    }
  }

  async function jumpTo(note) {
    if (note) await navigate(noteUrl(note), note);
  }

  async function step(button, note, otherButton) {
    const focused = document.activeElement === button;
    await jumpTo(note);
    if (!focused || pending || document.activeElement !== document.body) return;
    const destination = [button, otherButton, sorter].find(control => !control.disabled);
    destination.focus({ preventScroll: true });
  }

  previousButton.addEventListener('click', () => step(previousButton, previousNote, nextButton));
  nextButton.addEventListener('click', () => step(nextButton, nextNote, previousButton));
  window.addEventListener('popstate', () => {
    const address = new URL(location.href);
    const route = reviewRoute(address, session.root);
    const id = address.searchParams.get('review-note');
    const note = notes.find(item => item.id === id && item.route === route);
    void navigate(address, note, { fromHistory: true });
  });

  function renderNotes() {
    noteList.replaceChildren();
    noteList.style.paddingBottom = '';
    noteRows.clear();
    filters[0].textContent = 'Teendők (' + notes.filter(n => n.status === 'open').length + ')';
    filters[1].textContent = 'Kész (' + notes.filter(n => n.status === 'done').length + ')';
    visibleNotes = notes.filter(n => n.status === status && reviewId.test(n.id) && routePattern.test(n.route)).sort(compare);
    if (!visibleNotes.length) {
      add(noteList, 'p', 'review-empty', status === 'open' ? 'Még nincs nyitott megjegyzés.' : 'Még nincs késznek jelölt megjegyzés.');
      updateStep();
      return;
    }
    let group;
    let lastRoute;
    for (const note of visibleNotes) {
      if (note.route !== lastRoute) {
        group = add(noteList, 'section', 'review-group');
        add(group, 'h4', '', note.page_title);
        lastRoute = note.route;
      }
      const item = add(group, 'article', 'review-note');
      item.dataset.noteId = note.id;
      noteRows.set(note.id, item);
      add(item, 'span', 'review-current', 'Aktuális').hidden = true;
      if (note.section && note.section !== note.page_title) add(item, 'p', 'review-section', note.section);
      const target = note.locator?.quote || note.locator?.label;
      if (target && note.locator?.kind !== 'page') add(item, 'blockquote', 'review-quote', target);
      showBody(add(item, 'p', 'review-note__body'), note.body);
      const time = new Date(note.created_at);
      add(item, 'p', 'review-author', note.author + (Number.isNaN(+time) ? '' : ' · ' + dateFmt.format(time)));
      const row = add(item, 'div', 'review-actions');
      const jump = add(row, 'a', 'review-jump', 'Ugrás a helyére');
      jump.href = noteUrl(note);
      jump.addEventListener('click', event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        jumpTo(note);
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
    updateStep();
    alignCard(cursors[status]?.id);
  }

  async function refresh() {
    const [result, index] = await Promise.all([session.rpc('dzs_review_list'), orderReady]);
    compare = compareNotes(index, order);
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
      notes = [note, ...notes.filter(n => n.id !== id)];
      if (undoId === id) dismissUndo();
      const filter = filters.find(button => button.dataset.status === note.status);
      setStatus(note.status);
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
  for (const button of filters) button.addEventListener('click', () => {
    setStatus(button.dataset.status);
    const note = cursors[status];
    if (noteRows.has(note?.id) && note.route === session.route) {
      const address = noteUrl(note);
      history.replaceState(history.state, '', address);
      committedAddress = address;
      showNote(note);
    } else {
      clearNote();
      const address = new URL(location.href);
      address.searchParams.delete('review-note');
      history.replaceState(history.state, '', address);
      committedAddress = address;
    }
  });
  sorter.addEventListener('change', async () => {
    order = sorter.value;
    sortPreference.write(order);
    compare = compareNotes(await orderReady, order);
    renderNotes();
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (pending || busy || !active || !input.value.trim()) return;
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
      setStatus('open');
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
        requestAnimationFrame(() => {
          showNote(jump, false);
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
