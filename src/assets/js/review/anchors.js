const short = (value, limit) => String(value || '').trim().replace(/\s+/gu, ' ').slice(0, limit);
const textBlock = 'p,li,h1,h2,h3,h4,blockquote,td,figcaption';
const media = 'a.button,figure,img,video,summary.video-summary,.ig-shell,.editor-placeholder';
let highlighted;
let rangeFrame;
let rangeObserver;

function heading(main, element) {
  let label = '';
  for (const item of main.querySelectorAll('h1,h2,h3,h4')) {
    if (item !== element && !(item.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
    label = short(item.textContent, 220);
  }
  return label;
}

function anchorPath(main, element) {
  const candidate = element.closest('[id]');
  const anchor = candidate && main.contains(candidate) ? candidate : main;
  const path = [];
  for (let node = element; node && node !== anchor; node = node.parentElement) {
    path.unshift(Array.prototype.indexOf.call(node.parentElement.children, node));
  }
  return { anchor: anchor.id, path, tag: element.localName };
}

function identify(main, element, kind, quote, label) {
  return {
    section: kind === 'page' ? '' : heading(main, element),
    locator: { kind, ...anchorPath(main, element), quote, label },
  };
}

export function pageTarget(main) {
  return identify(main, main, 'page', '', 'Az egész oldal');
}

function selectionBlocks(main, range) {
  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let first;
  let last;
  for (let node = root.nodeType === Node.TEXT_NODE ? root : walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node)) continue;
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.length;
    if (!node.data.slice(start, end).trim()) continue;
    const block = node.parentElement.closest(textBlock) || main;
    first ??= block;
    last = block;
  }
  return [first || main, last || main];
}

export function selectedTarget(main) {
  const selection = getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!main.contains(range.startContainer) || !main.contains(range.endContainer)) return null;
  const quote = short(selection.toString(), 650);
  if (quote.length < 2) return null;
  const [first, last] = selectionBlocks(main, range);
  const target = identify(main, first, 'text', quote, 'Kijelölt szöveg');
  if (last !== first) target.locator.end = { ...anchorPath(main, last), quote: short(last.textContent, 120) };
  return { element: first, rect: range.getBoundingClientRect(), ...target };
}

export function elementTarget(main, node) {
  const selected = node instanceof Element ? node.closest('figure.media-player') || node.closest(media) : null;
  if (!selected || !main.contains(selected)) return null;
  return { element: selected, rect: selected.getBoundingClientRect(), ...identify(main, selected, 'element', '', elementLabel(selected)) };
}

function elementLabel(selected) {
  return short(selected.dataset.title || selected.querySelector('[data-title]')?.dataset.title ||
    selected.querySelector('figcaption strong')?.textContent || selected.querySelector('summary')?.getAttribute('aria-label') ||
    selected.querySelector('img')?.alt || selected.textContent || 'Kép vagy videó', 220);
}

function locate(main, locator) {
  const known = typeof locator.anchor === 'string' ? document.getElementById(locator.anchor) : null;
  if (!known || !main.contains(known)) return null;
  let target = known;
  for (const index of Array.isArray(locator.path) ? locator.path.slice(0, 30) : []) {
    if (!Number.isInteger(index) || !target.children[index]) return null;
    target = target.children[index];
  }
  return !locator.tag || target.localName === locator.tag ? target : null;
}

function quoteRange(main, quote, preferred, excluded) {
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  const spans = [];
  let text = '';
  let previous;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    const block = parent.closest(textBlock);
    if (!block || !main.contains(block) || parent.closest(excluded)) continue;
    let value = node.data.replace(/\s+/gu, ' ');
    if (!value.trim() && block !== previous) continue;
    if (text && block !== previous && !text.endsWith(' ')) text += ' ';
    if (!text || text.endsWith(' ')) value = value.trimStart();
    if (!value) continue;
    const start = text.length;
    text += value;
    spans.push({ block, start, end: text.length });
    previous = block;
  }

  const matches = [];
  for (let at = text.indexOf(quote); at !== -1; at = text.indexOf(quote, at + 1)) {
    const first = spans.find(span => span.end > at)?.block;
    const last = spans.find(span => span.end >= at + quote.length)?.block;
    if (first && last) matches.push({ first, last });
  }
  const anchored = matches.filter(({ first }) => first === preferred);
  if (anchored.length === 1) return anchored[0];
  if (matches.length === 1) return matches[0];
  return null;
}

export function clearNote() {
  highlighted?.classList.remove('review-marked');
  rangeFrame?.remove();
  rangeObserver?.disconnect();
  highlighted = rangeFrame = rangeObserver = undefined;
}

function frameRange(main, first, last) {
  rangeFrame = document.createElement('div');
  rangeFrame.className = 'review-marked-range';
  rangeFrame.setAttribute('aria-hidden', 'true');
  document.body.append(rangeFrame);
  const frame = rangeFrame;
  function position() {
    if (!frame.isConnected || !first.isConnected || !last.isConnected) return;
    const range = new Range();
    range.setStartBefore(first);
    range.setEndAfter(last);
    const rect = range.getBoundingClientRect();
    frame.style.left = (rect.left + scrollX - 4) + 'px';
    frame.style.top = (rect.top + scrollY - 4) + 'px';
    frame.style.width = (rect.width + 8) + 'px';
    frame.style.height = (rect.height + 8) + 'px';
  }
  position();
  rangeObserver = new ResizeObserver(position);
  rangeObserver.observe(main);
}

export function revealNote(main, note, { smooth = true } = {}) {
  clearNote();
  const loc = note.locator || {};
  const located = locate(main, loc);
  const known = document.getElementById(loc.anchor || '');
  let first = located || (known && main.contains(known) ? known : main);
  let last = first;

  if (loc.kind === 'element' && loc.label && elementLabel(first) !== loc.label) {
    first = last = [...main.querySelectorAll(media)].find(el => elementLabel(el) === loc.label) || first;
  }
  const quote = short(loc.quote, 650);
  if (loc.kind === 'text' && quote) {
    const match = quoteRange(main, quote, first, 'ins') || quoteRange(main, quote, first, 'del');
    if (match) ({ first, last } = match);
    if (loc.end) {
      const end = locate(main, loc.end);
      const endQuote = short(loc.end.quote, 120);
      const follows = end && (end === first || first.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (follows && (!endQuote || short(end.textContent, 16000).includes(endQuote))) last = end;
    }
  }

  first = first === main ? main.querySelector('h1') || main : first;
  last = last === main ? first : last;
  for (const target of [first, last]) {
    for (let detail = target.closest('details'); detail; detail = detail.parentElement.closest('details')) detail.open = true;
  }
  if (first !== last && !first.contains(last) && !last.contains(first) &&
      first.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING) {
    frameRange(main, first, last);
  } else {
    highlighted = first;
    highlighted.classList.add('review-marked');
  }
  const margin = (document.querySelector('.site-header')?.offsetHeight || 0) + 18;
  const top = scrollY + first.getBoundingClientRect().top - margin;
  window.scrollTo({ top, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' });
}
