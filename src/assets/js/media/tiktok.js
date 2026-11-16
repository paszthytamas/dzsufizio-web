export function initTikTok(root) {
  let active = null;
  function stop(details) {
    details.querySelector('[data-player]')?.replaceChildren();
    if (active === details) active = null;
  }

  root.addEventListener('toggle', ({ target }) => {
    if (!target.matches('details[data-embed]')) return;
    if (!target.open) {
      stop(target);
      return;
    }
    const mount = target.querySelector('[data-player]');
    if (!mount || mount.children.length) return;
    const src = new URL(target.dataset.embed);
    if (src.origin !== 'https://www.tiktok.com' || !/^\/player\/v1\/\d+$/.test(src.pathname)) return;

    if (active && active !== target) {
      active.open = false;
      stop(active);
    }
    const frame = document.createElement('iframe');
    frame.className = 'embedded-frame';
    frame.title = target.dataset.title + ' – TikTok';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    src.searchParams.set('autoplay', '1');
    src.searchParams.set('muted', '1');
    frame.src = src.href;
    mount.append(frame);
    active = target;
  }, true);
}
