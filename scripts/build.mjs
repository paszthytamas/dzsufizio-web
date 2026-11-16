import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('..', import.meta.url));
const src = join(project, 'src');
const dist = join(project, 'dist');
const readSource = name => readFile(join(src, name), 'utf8');
const [manifest, layout, notFound] = await Promise.all([
  readSource('pages.json').then(JSON.parse),
  readSource('layouts/base.html'),
  readSource('layouts/not-found.html'),
]);

const menu = [
  ['', 'Áttekintés'],
  ['blog', 'Blogok'],
  ['csapat', 'Bemutatkozások'],
  ['aloldalak', 'Aloldalak'],
  ['akik-mar-nalunk-jartak', 'Vendégvideók'],
];
const basePath = (process.env.PAGES_BASE_PATH ?? '').replace(/\/+$/, '');
if (!/^(?:\/[a-zA-Z0-9._-]+)*$/.test(basePath) || /\/\.{1,2}(?:\/|$)/.test(basePath)) {
  throw new Error('A PAGES_BASE_PATH értéke például /dzsufizio-web lehet.');
}
const paths = new Set();
for (const page of manifest) {
  if (!/^(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(page.path) || paths.has(page.path)) {
    throw new Error('Hibás vagy ismétlődő oldalútvonal: ' + page.path);
  }
  if (!/^[a-z0-9/-]+\.html$/.test(page.file) || !menu.some(([path]) => path === page.nav)) {
    throw new Error('Hibás forrás vagy menüpont: ' + page.file);
  }
  paths.add(page.path);
}
if (menu.some(([path]) => !paths.has(path))) throw new Error('Egy menüpont céloldala hiányzik.');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c]);
}

function render(page, fragment, root) {
  const nav = menu.map(([path, label]) => (
    '<a href="' + escapeHtml(root + (path ? path + '/' : '')) + '"' +
    (path === page.nav ? ' aria-current="' + (page.path === path ? 'page' : 'location') + '"' : '') +
    '>' + escapeHtml(label) + '</a>'
  )).join('\n        ');
  const values = {
    TITLE: escapeHtml(page.title),
    DESCRIPTION: escapeHtml(page.description),
    ROOT: escapeHtml(root),
    NAV: nav,
    CONTENT: fragment.replaceAll('{{root}}', escapeHtml(root)).trimEnd(),
  };
  return layout.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(values, key)) throw new Error('Ismeretlen sablonmező: ' + key);
    return values[key];
  });
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(src, 'assets'), join(dist, 'assets'), { recursive: true });
for (const page of manifest) {
  const folder = join(dist, page.path);
  const back = posix.relative('/' + page.path, '/');
  const root = back ? back + '/' : './';
  const fragment = await readSource('pages/' + page.file);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'index.html'), render(page, fragment, root), 'utf8');
}
// GitHub Pages can serve this document under any missing URL, so use its actual base path.
await writeFile(join(dist, '404.html'), render({
  title: 'Az oldal nem található',
  description: 'A keresett oldal nem található a Dzsufizio weboldalán.',
}, notFound, basePath + '/'), 'utf8');
await writeFile(join(dist, '.nojekyll'), '');
console.log('Elkészült ' + manifest.length + ' önálló oldal és a 404-es oldal a dist/ mappában.');
