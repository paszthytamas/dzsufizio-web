const instagramOrigin = 'https://www.instagram.com';
// The caption-free Reel embed places the video between a 54px header and a 154px footer.
const headerHeight = 54;
const footerHeight = 154;

const reelSelector = '[data-ig-permalink]';
const gallerySelector = '[data-reel-gallery]';

function initPlayers(slots) {
  if (!slots.length) return;

  const players = new Map();
  function updatePlayer(event) {
    if (event.origin !== instagramOrigin) return;
    const player = players.get(event.source);
    if (!player) return;

    let message = event.data;
    if (typeof message === 'string') {
      try { message = JSON.parse(message); } catch { return; }
    }
    if (message?.type === 'MEASURE' && Number.isFinite(message.details?.height)) {
      player.embedHeight = message.details.height;
    } else if (message?.type === 'MOUNTED') {
      player.mounted = true;
    } else {
      return;
    }

    const width = player.frame.clientWidth;
    const height = player.embedHeight - headerHeight - footerHeight;
    if (!player.mounted || !width || height < width * 0.45 || height > width * 2) return;

    player.slot.style.aspectRatio = width + ' / ' + height;
    player.mount.inert = false;
    player.slot.classList.add('is-ready');
  }

  function mountReel(slot) {
    if (slot.closest('[hidden],details:not([open])')) return;
    const link = new URL(slot.dataset.igPermalink, instagramOrigin);
    if (link.origin !== instagramOrigin || !/^\/reel\/[A-Za-z0-9_-]+\/$/.test(link.pathname)) return;
    const mount = slot.querySelector('.ig-mount');
    if (!mount || mount.firstElementChild) return;

    const frame = document.createElement('iframe');
    frame.title = slot.dataset.igTitle + ' – Instagram';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.scrolling = 'no';
    frame.allow = 'encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.style.setProperty('--ig-header-height', headerHeight + 'px');
    frame.style.setProperty('--ig-footer-height', footerHeight + 'px');
    frame.src = new URL('embed/', link).href;
    mount.replaceChildren(frame);
    players.set(frame.contentWindow, { frame, slot, mount, mounted: false, embedHeight: 0 });
  }

  window.addEventListener('message', updatePlayer);
  let observer;
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      for (const { isIntersecting, target } of entries) {
        if (isIntersecting && !target.closest('[hidden],details:not([open])')) {
          mountReel(target);
          observer.unobserve(target);
        }
      }
    }, { rootMargin: '420px 0px' });
    slots.forEach(slot => observer.observe(slot));
  } else {
    slots.forEach(mountReel);
  }
  return () => {
    observer?.disconnect();
    window.removeEventListener('message', updatePlayer);
    for (const { slot, mount } of players.values()) {
      mount.replaceChildren();
      mount.inert = true;
      slot.style.removeProperty('aspect-ratio');
      slot.classList.remove('is-ready');
    }
    players.clear();
  };
}


function initReelGallery(gallery, initialView) {
  const list = gallery.querySelector('[data-reel-cards]');
  const controls = gallery.querySelector('[data-reel-controls]');
  const count = controls.querySelector('[data-reel-count]');
  const cards = Array.from(list.children);
  const pagedCards = cards.slice();
  for (let index = pagedCards.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [pagedCards[index], pagedCards[other]] = [pagedCards[other], pagedCards[index]];
  }

  const events = new AbortController();
  const options = { signal: events.signal };
  const warmedPlayers = new Map();
  let position = 0;
  let view;
  let pagedOpen = gallery.open;
  let disposeGrid;

  function stopCard(card) {
    warmedPlayers.get(card)?.();
    warmedPlayers.delete(card);
  }

  function clearPlayers() {
    disposeGrid?.();
    disposeGrid = undefined;
    for (const card of warmedPlayers.keys()) stopCard(card);
  }

  function select(offset) {
    return pagedCards[(position + offset + pagedCards.length) % pagedCards.length];
  }

  function showPage() {
    const active = select(0);
    const nearby = new Set(gallery.open ? [select(1), select(-1)] : []);
    nearby.delete(active);
    for (const card of pagedCards) {
      const warm = nearby.has(card);
      card.hidden = card !== active && !warm;
      card.inert = warm;
      card.toggleAttribute('data-reel-preload', warm);
      if (!gallery.open || card.hidden) stopCard(card);
    }
    count.textContent = (position + 1) + ' / ' + pagedCards.length;
    if (!gallery.open) return;

    // Keep the neighbours laid out and ready to reveal while they are invisible.
    for (const card of [active, ...nearby]) {
      if (!warmedPlayers.has(card)) {
        warmedPlayers.set(card, initPlayers(card.querySelectorAll(reelSelector)));
      }
    }
  }

  function move(direction) {
    // Removing the departed player also stops any video that was playing.
    stopCard(select(0));
    position = (position + direction + pagedCards.length) % pagedCards.length;
    showPage();
  }

  function setView(next) {
    if (view === next) return;
    if (view === 'paged') pagedOpen = gallery.open;
    clearPlayers();
    view = next;
    const grid = view === 'grid';
    gallery.classList.toggle('is-grid', grid);
    list.classList.toggle('is-paged', !grid);
    controls.hidden = grid || cards.length < 2;
    gallery.open = grid || pagedOpen;
    if (grid) {
      list.append(...cards);
      for (const card of cards) {
        card.hidden = false;
        card.inert = false;
        card.removeAttribute('data-reel-preload');
      }
      disposeGrid = initPlayers(list.querySelectorAll(reelSelector));
    } else {
      list.append(...pagedCards);
      showPage();
    }
  }

  controls.querySelector('[data-reel-prev]').addEventListener('click', () => move(-1), options);
  controls.querySelector('[data-reel-next]').addEventListener('click', () => move(1), options);
  gallery.addEventListener('toggle', () => {
    if (view === 'paged') showPage();
  }, options);
  setView(initialView);

  return {
    setView,
    dispose() {
      events.abort();
      clearPlayers();
      gallery.classList.remove('is-grid');
      list.classList.remove('is-paged');
      controls.hidden = true;
      for (const card of cards) {
        card.hidden = false;
        card.inert = false;
        card.removeAttribute('data-reel-preload');
      }
    },
  };
}

export function initInstagram(page, { galleryView = 'paged' } = {}) {
  const players = initPlayers([...page.querySelectorAll(reelSelector)].filter(slot => !slot.closest(gallerySelector)));
  const galleries = [...page.querySelectorAll(gallerySelector)].map(gallery => initReelGallery(gallery, galleryView));

  return {
    setGalleryView(view) {
      for (const gallery of galleries) gallery.setView(view);
    },
    dispose() {
      players?.();
      for (const gallery of galleries) gallery.dispose();
    },
  };
}
