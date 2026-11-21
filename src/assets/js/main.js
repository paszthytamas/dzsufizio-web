import { initAnchors, initNavigation } from './navigation.js';
import { rotateTeam } from './team.js';
import { preference } from './preferences.js';
import { initTikTok } from './media/tiktok.js';

// Match Datawrapper height messages to the iframe that sent them.
window.addEventListener('message', event => {
  if (event.origin !== 'https://datawrapper.dwcdn.net') return;
  const heights = event.data?.['datawrapper-height'];
  if (!heights) return;
  for (const frame of document.querySelectorAll('iframe[data-datawrapper-chart]')) {
    if (frame.contentWindow !== event.source) continue;
    const height = Number(heights[frame.dataset.datawrapperChart]);
    if (Number.isFinite(height) && height > 0) frame.style.height = height + 'px';
  }
});

function currentModule(relative) {
  const url = new URL(relative, import.meta.url);
  url.search = new URL(import.meta.url).search;
  return import(url.href);
}

// Opening an invitation on an already open page only changes the fragment.
// Restart before showing the new review role or initializing media.
window.addEventListener('hashchange', () => {
  if (new URLSearchParams(location.hash.slice(1)).has('review')) location.reload();
});

const [
  { initContentView, loadContentView, showContentView },
  { initContents },
  { initInstagram },
  { readReviewSession },
] = await Promise.all([
  currentModule('./content-view.js'),
  currentModule('./toc.js'),
  currentModule('./media/instagram.js'),
  currentModule('./review/session.js'),
]);
const main = document.querySelector('main');
const review = readReviewSession();
const scope = document.querySelector('.brand').pathname;
const imagePreference = preference(scope, 'profile-illustrations');
const galleryPreference = preference(scope, 'profile-gallery-view');
const aiButton = document.getElementById('profile-ai-toggle');
const galleryButton = document.getElementById('profile-gallery-toggle');
let showImages = imagePreference.read() !== 'hidden';
let galleryView = galleryPreference.read() === 'grid' ? 'grid' : 'paged';
let instagram;

function showIllustration() {
  const image = main.querySelector('#kezelesi-illusztracio');
  aiButton.hidden = !image;
  if (!image) return;
  const figure = image.closest('ins.revision-block') ?? image;
  figure.hidden = !showImages;
  aiButton.textContent = showImages ? 'AI képek elrejtése' : 'AI képek felfedése';
}

function showGalleryButton() {
  galleryButton.hidden = !main.querySelector('[data-reel-gallery]');
  galleryButton.textContent = galleryView === 'paged' ? 'Videók rácsnézetben' : 'Videók lapozással';
}

aiButton.addEventListener('click', () => {
  showImages = !showImages;
  imagePreference.write(showImages ? 'visible' : 'hidden');
  showIllustration();
});
galleryButton.addEventListener('click', () => {
  galleryView = galleryView === 'paged' ? 'grid' : 'paged';
  galleryPreference.write(galleryView);
  instagram.setGalleryView(galleryView);
  showGalleryButton();
});

function activateArticle() {
  instagram?.dispose();
  if (matchMedia('(max-width: 760px)').matches) {
    for (const index of main.querySelectorAll('.quick-sidebar')) index.open = false;
  }
  initContents(main);
  rotateTeam(main);
  showIllustration();
  instagram = initInstagram(main, { galleryView });
  showGalleryButton();
}

await initContentView(main);
initNavigation();
initAnchors();
initTikTok(main);
activateArticle();
if (review) {
  const [{ initReview }, { createReviewNavigation, reviewRoute }] = await Promise.all([
    currentModule('./review/panel.js'),
    currentModule('./review/page-navigation.js'),
  ]);
  const openPage = createReviewNavigation(main, review.root, { loadContentView, showContentView, activateArticle });
  await initReview(main, review, { openPage, reviewRoute });
}
