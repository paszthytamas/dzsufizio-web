import { initAnchors, initNavigation } from './navigation.js';
import { initContents } from './toc.js';
import { rotateTeam } from './team.js';
import { initTikTok } from './media/tiktok.js';

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

const [{ initContentView, loadContentView, showContentView }, { initInstagram }, { readReviewSession }] =
  await Promise.all([
    currentModule('./content-view.js'),
    currentModule('./media/instagram.js'),
    currentModule('./review/session.js'),
  ]);
const main = document.querySelector('main');
const review = readReviewSession();
let disposeInstagram;
function activateArticle() {
  disposeInstagram?.();
  if (matchMedia('(max-width: 760px)').matches) {
    for (const index of main.querySelectorAll('.quick-sidebar')) index.open = false;
  }
  initContents(main, { reviewing: Boolean(review) });
  rotateTeam(main);
  disposeInstagram = initInstagram(main);
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
