import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderRevisions } from './content-revisions.mjs';

const project = fileURLToPath(new URL('..', import.meta.url));
const src = join(project, 'src');
const dist = join(project, 'dist');
const readSource = name => readFile(join(src, name), 'utf8');
const [manifest, layout, notFound, mediaSlot, mainScript, siteStyles, reviewAssets, revisionPlan, contentView] = await Promise.all([
  readSource('pages.json').then(JSON.parse),
  readSource('layouts/base.html'),
  readSource('layouts/not-found.html'),
  readSource('components/media-slot.html'),
  readSource('assets/js/main.js'),
  readSource('assets/css/site.css'),
  Promise.all(['assets/js/review/panel.js', 'assets/js/review/resize.js', 'assets/css/review.css'].map(readSource)),
  readSource('content-revisions.json').then(JSON.parse),
  readSource('assets/js/content-view.js'),
]);
const revision = source => createHash('sha256').update(source).digest('hex').slice(0, 12);
const mainRevision = revision([mainScript, contentView, ...reviewAssets].join('\0'));
const siteRevision = revision(siteStyles);
const slotMarker = '{{media-slot}}';

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
for (const file of Object.keys(revisionPlan)) {
  if (!manifest.some(page => page.file === file)) throw new Error('A módosítások forrásoldala hiányzik: ' + file);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c]);
}

function renderMediaSlot(page, fragment) {
  const slot = page.mediaSlot;
  const count = fragment.split(slotMarker).length - 1;
  if (count !== (slot ? 1 : 0)) {
    throw new Error('A médiahely jelölése és az oldalleírás nem egyezik: ' + page.path);
  }
  if (!slot) return fragment;
  if (['title', 'note'].some(key => typeof slot[key] !== 'string' || !slot[key].trim())) {
    throw new Error('Hiányzik a médiahely címe vagy leírása: ' + page.path);
  }
  const component = mediaSlot.replace(/\{\{(TITLE|NOTE)\}\}/g, (_, key) => escapeHtml(slot[key.toLowerCase()]));
  return fragment.replace(slotMarker, () => component.trimEnd());
}

function renderContent(page, fragment, root) {
  return renderMediaSlot(page, fragment).replaceAll('{{root}}', escapeHtml(root)).trimEnd();
}

function render(page, fragment, root, revisions = '') {
  const nav = menu.map(([path, label]) => (
    '<a href="' + escapeHtml(root + (path ? path + '/' : '')) + '"' +
    (path === page.nav ? ' aria-current="' + (page.path === path ? 'page' : 'location') + '"' : '') +
    '>' + escapeHtml(label) + '</a>'
  )).join('\n        ');
  const values = {
    TITLE: escapeHtml(page.title),
    DESCRIPTION: escapeHtml(page.description),
    ROOT: escapeHtml(root),
    MAIN_REV: mainRevision,
    SITE_REV: siteRevision,
    NAV: nav,
    CONTENT: renderContent(page, fragment, root),
    REVISIONS: revisions ? ' data-revisions="' + escapeHtml(root + revisions) + '"' : '',
  };
  return layout.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(values, key)) throw new Error('Ismeretlen sablonmező: ' + key);
    return values[key];
  });
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(src, 'assets'), join(dist, 'assets'), { recursive: true });
await mkdir(join(dist, 'assets', 'revisions'), { recursive: true });
for (const page of manifest) {
  const folder = join(dist, page.path);
  const back = posix.relative('/' + page.path, '/');
  const root = back ? back + '/' : './';
  const fragment = await readSource('pages/' + page.file);
  await mkdir(folder, { recursive: true });
  const plan = revisionPlan[page.file];
  let revisions;
  if (plan) {
    try {
      const { modified, comparison } = renderRevisions(fragment, plan);
      const data = JSON.stringify({
        modified: renderContent(page, modified, root),
        comparison: renderContent(page, comparison, root),
      });
      revisions = 'assets/revisions/' + revision(data) + '.json';
      await writeFile(join(dist, revisions), data, 'utf8');
    } catch (cause) {
      throw new Error('A tartalomváltozatok építése sikertelen: ' + page.file, { cause });
    }
  }
  await writeFile(join(folder, 'index.html'), render(page, fragment, root, revisions), 'utf8');
}
// GitHub Pages can serve this document under any missing URL, so use its actual base path.
await writeFile(join(dist, '404.html'), render({
  title: 'Az oldal nem található',
  description: 'A keresett oldal nem található a Dzsufizio weboldalán.',
}, notFound, basePath + '/'), 'utf8');
await writeFile(join(dist, '.nojekyll'), '');
console.log('Elkészült ' + manifest.length + ' önálló oldal és a 404-es oldal a dist/ mappában.');
