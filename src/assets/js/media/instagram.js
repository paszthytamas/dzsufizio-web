const instagramOrigin = 'https://www.instagram.com';
// The caption-free Reel embed places the video between a 54px header and a 154px footer.
const headerHeight = 54;
const footerHeight = 154;

export function initInstagram(page) {
  const slots = page.querySelectorAll('[data-ig-permalink]');
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
