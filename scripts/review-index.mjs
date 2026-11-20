const groups = ['blog', 'csapat', 'aloldalak', 'akik-mar-nalunk-jartak', ''];
const names = new Intl.Collator('hu', { sensitivity: 'base' });
const tags = /<!--[\s\S]*?-->|<(\/?)([a-z][a-z0-9-]*)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>/gi;
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

export function reviewAnchorPaths(html) {
  const anchors = { tartalom: [] };
  const stack = [{ tag: 'main', path: [], children: 0 }];
  // The review locator records child-element indices in the original HTML.
  for (const [, closing, rawTag, attributes] of html.matchAll(tags)) {
    if (!rawTag) continue;
    const tag = rawTag.toLowerCase();
    if (closing) {
      const index = stack.findLastIndex(item => item.tag === tag);
      if (index > 0) stack.length = index;
      continue;
    }
    const parent = stack.at(-1);
    const path = [...parent.path, parent.children++];
    const id = attributes.match(/\sid="([^"]+)"/i)?.[1];
    if (id) anchors[id] = path;
    if (!voidTags.has(tag) && !attributes.endsWith('/')) stack.push({ tag, path, children: 0 });
  }
  return anchors;
}

export function reviewIndex(manifest, paths) {
  return groups.flatMap(group => {
    const pages = manifest.filter(page => page.nav === group);
    if (group === 'csapat') {
      pages.sort((a, b) => Number(b.path === group) - Number(a.path === group) || names.compare(a.title, b.title));
    }
    return pages.map(page => [page.path ? page.path + '/' : '', paths.get(page.path)]);
  });
}
