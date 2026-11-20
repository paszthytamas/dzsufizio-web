import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const prefix = '/pelda-github-repo/';
const location = new URL('https://example.invalid' + prefix);
const pages = new Map();
const links = [];

async function walk(directory) {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, file.name);
    if (file.isDirectory()) await walk(path);
    else if (file.name === 'index.html') await inspect(path);
  }
}

function inspectMarkup(content, url, label) {
  const ids = Array.from(content.matchAll(/\sid="([^"]+)"/g), m => m[1]);
  assert.equal(ids.length, new Set(ids).size, 'Ismétlődő HTML-azonosító: ' + label);
  assert.equal(Array.from(content.matchAll(/<h1[\s>]/gi)).length, 1, 'H1: ' + label);
  assert.doesNotMatch(content, /Szerkesztői megjegyzés|data:image\/|<style[\s>]|<script(?![^>]*\bsrc=)|\{\{root\}\}/i);
  const pageIds = new Set(ids);
  for (const [, attribute, value] of content.matchAll(/\s(href|src)="([^"]+)"/g)) {
    const target = new URL(value.replaceAll('&amp;', '&'), url);
    if (target.origin === location.origin) links.push({ target, url, label, attribute, pageIds });
    else assert.ok(['http:', 'https:', 'tel:', 'mailto:'].includes(target.protocol), value);
  }
  return pageIds;
}

async function inspect(path) {
  const content = await readFile(path, 'utf8');
  const urlPath = relative(dist, path).split(sep).join('/').replace(/index\.html$/, '');
  const url = new URL(urlPath, location);
  pages.set(url.pathname, inspectMarkup(content, url, urlPath));

  const revisions = content.match(/\sdata-revisions="([^"]+)"/)?.[1];
  if (!revisions) return;
  const revisionUrl = new URL(revisions, url);
  assert.ok(revisionUrl.pathname.startsWith(prefix + 'assets/revisions/'), revisions);
  const payload = await readFile(join(dist, revisionUrl.pathname.slice(prefix.length)), 'utf8');
  const { modified, comparison } = JSON.parse(payload);
  inspectMarkup(modified, url, urlPath + ' (módosított)');
  inspectMarkup(comparison, url, urlPath + ' (összehasonlítás)');
}

await walk(dist);
assert.equal(pages.size, 34, 'A 34 jóváhagyott útvonalnak meg kell lennie.');
for (const { target, url, label, attribute, pageIds } of links) {
  assert.ok(target.pathname.startsWith(prefix), 'Alkönyvtáron kívülre mutató link: ' + label + ' → ' + target.href);
  if (target.pathname.endsWith('/')) {
    assert.ok(pages.has(target.pathname), 'Hiányzó oldal: ' + target.href);
    if (target.hash) {
      const ids = target.pathname === url.pathname ? pageIds : pages.get(target.pathname);
      assert.ok(ids.has(decodeURIComponent(target.hash.slice(1))), 'Hiányzó horgonypont: ' + label + ' → ' + target.href);
    }
  } else {
    assert.ok((await stat(join(dist, decodeURIComponent(target.pathname.slice(prefix.length))))).isFile(), 'Hiányzó erőforrás (' + attribute + '): ' + target.href);
  }
}
console.log(pages.size + ' útvonal és ' + links.length + ' belső link ellenőrizve GitHub Pages alkönyvtár alatt.');
