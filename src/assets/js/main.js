import { initAnchors, initNavigation } from './navigation.js';
import { rotateTeam } from './team.js';
import { initInstagram } from './media/instagram.js';
import { initTikTok } from './media/tiktok.js';

const main = document.querySelector('main');
initNavigation();
initAnchors();
rotateTeam(main);
initInstagram(main);
initTikTok(main);
