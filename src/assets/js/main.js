import { initAnchors, initNavigation } from './navigation.js';
import { rotateTeam } from './team.js';
import { initInstagram } from './media/instagram.js';
import { initTikTok } from './media/tiktok.js';
import { readReviewSession } from './review/session.js';

const main = document.querySelector('main');
const review = readReviewSession();
initNavigation();
initAnchors();
rotateTeam(main);
initInstagram(main, { useScript: !review });
initTikTok(main);
if (review) import('./review/panel.js').then(({ initReview }) => initReview(main, review));
