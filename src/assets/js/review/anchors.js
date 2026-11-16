const short = (value, limit) => String(value || '').trim().replace(/\s+/gu, ' ').slice(0, limit);
const textBlock = 'p,li,h1,h2,h3,h4,blockquote,td,figcaption';
const media = 'a.button,figure,img,video,summary.video-summary,.ig-shell,.editor-placeholder';
let highlighted;

function heading(main, element) {
  let label = '';
  for (const item of main.querySelectorAll('h1,h2,h3,h4')) {
    if (item !== element && !(item.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
    label = short(item.textContent, 220);
  }
  return label;
}

function identify(main, element, kind, quote, label) {
  const candidate = element.closest('[id]');
  const anchor = candidate && main.contains(candidate) ? candidate : main;
  const path = [];
  for (let node = element; node && node !== anchor; node = node.parentElement) {
    path.unshift(Array.prototype.indexOf.call(node.parentElement.children, node));
  }
  return {
    section: kind === 'page' ? '' : heading(main, element),
    locator: { kind, anchor: anchor.id, path, quote, label, tag: element.localName },
  };
}

export function pageTarget(main) {
  return identify(main, main, 'page', '', 'Az egész oldal');
}

export function selectedTarget(main) {
  const selection = getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!main.contains(range.startContainer) || !main.contains(range.endContainer)) return null;
  const quote = short(selection.toString(), 650);
  if (quote.length < 2) return null;
  const start = range.startContainer;
  const element = (start.nodeType === Node.ELEMENT_NODE ? start : start.parentElement).closest(textBlock) || main;
  return { element, rect: range.getBoundingClientRect(), ...identify(main, element, 'text', quote, 'Kijelölt szöveg') };
}

export function elementTarget(main, node) {
  const selected = node instanceof Element ? node.closest('figure.media-player') || node.closest(media) : null;
  if (!selected || !main.contains(selected)) return null;
  return { element: selected, rect: selected.getBoundingClientRect(), ...identify(main, selected, 'element', '', elementLabel(selected)) };
}

function elementLabel(selected) {
  return short(selected.getAttribute('alt') || selected.getAttribute('aria-label') ||
    selected.dataset.igTitle || selected.querySelector('[data-ig-title]')?.dataset.igTitle ||
    selected.querySelector('figcaption strong')?.textContent || selected.querySelector('summary')?.getAttribute('aria-label') ||
    selected.querySelector('img')?.alt || selected.textContent || 'Kép vagy videó', 220);
}

function showTextQuote(element, quote) {
  if (!quote || !globalThis.CSS?.highlights || typeof Highlight !== 'function') return;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let text = '';
  const positions = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (let i = 0; i < node.length; i++) {
      const c = node.data[i];
      const part = /\s/u.test(c) ? ' ' : c;
      if (part === ' ' && (!text || text.endsWith(' '))) continue;
      text += part;
      positions.push([node, i]);
    }
  }
  const start = text.indexOf(quote);
  if (start === -1) return;
  const [first, from] = positions[start];
  const [last, to] = positions[start + quote.length - 1];
  const range = new Range();
  range.setStart(first, from);
  range.setEnd(last, to + 1);
  CSS.highlights.set('dzs-review-quote', new Highlight(range));
}

export function revealNote(main, note) {
  const loc = note.locator || {};
  const known = typeof loc.anchor === 'string' ? document.getElementById(loc.anchor) : null;
  const base = known && main.contains(known) ? known : main;
  let target = base;
  for (const index of Array.isArray(loc.path) ? loc.path.slice(0, 30) : []) {
    if (!Number.isInteger(index) || !target.children[index]) { target = base; break; }
    target = target.children[index];
  }
  if (typeof loc.tag === 'string' && target.localName !== loc.tag) target = base;
  if (loc.kind === 'element' && loc.label && elementLabel(target) !== loc.label) {
    const matches = scope => Array.from(scope.querySelectorAll(media)).find(el => elementLabel(el) === loc.label);
    target = matches(base) || matches(main) || base;
  }
  const quote = short(loc.quote, 650);
  if (quote && !short(target.textContent, 16000).includes(quote)) {
    target = Array.from(main.querySelectorAll(textBlock)).find(p => short(p.textContent, 16000).includes(quote)) || base;
  }
  for (let detail = target.closest('details'); detail; detail = detail.parentElement.closest('details')) detail.open = true;
  highlighted?.classList.remove('review-marked');
  globalThis.CSS?.highlights?.delete('dzs-review-quote');
  highlighted = target === main ? main.querySelector('h1') || main : target;
  highlighted.classList.add('review-marked');
  showTextQuote(highlighted, quote);
  highlighted.scrollIntoView({ block: 'center' });
}
