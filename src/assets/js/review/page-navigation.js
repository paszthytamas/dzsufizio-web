export function reviewRoute(address, root) {
  if (address.origin !== root.origin || !address.pathname.startsWith(root.pathname)) return null;
  const route = address.pathname.slice(root.pathname.length).replace(/index\.html$/, '');
  return /^([a-z0-9-]+\/)*$/.test(route) ? route : null;
}

export function createReviewNavigation(main, root, { loadContentView, showContentView, activateArticle }) {
  return async (address, view, { signal, fromHistory = false } = {}) => {
    if (reviewRoute(address, root) === null) throw new Error('review page');
    const source = new URL(address.pathname, address.origin);
    const response = await fetch(source, { signal });
    if (!response.ok) throw new Error('review page');
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    const article = page.querySelector('main#tartalom');
    const legend = page.getElementById('revision-legend');
    const toc = page.getElementById('toc-toggle');
    const currentLinks = [...document.querySelectorAll('#site-nav a')];
    const incomingLinks = [...page.querySelectorAll('#site-nav a')];
    if (!article || !legend || !toc || currentLinks.length !== incomingLinks.length) throw new Error('review page');

    await loadContentView(article, view, address, signal);
    signal?.throwIfAborted();

    // Resolve the article's relative links against the new URL before it enters the document.
    if (!fromHistory) history.pushState(null, '', address);
    document.title = page.title;
    const description = page.querySelector('meta[name="description"]')?.content ?? '';
    document.querySelector('meta[name="description"]').content = description;
    document.querySelector('.brand').href = root.href;
    for (const [i, link] of currentLinks.entries()) {
      link.href = new URL(incomingLinks[i].getAttribute('href'), address).href;
      const selected = incomingLinks[i].getAttribute('aria-current');
      if (selected) link.setAttribute('aria-current', selected);
      else link.removeAttribute('aria-current');
    }
    document.getElementById('site-nav').classList.remove('is-open');
    document.getElementById('menu-toggle').setAttribute('aria-expanded', 'false');
    document.getElementById('revision-legend').replaceWith(legend);
    document.getElementById('toc-toggle').replaceWith(toc);
    if (article.dataset.revisions) main.dataset.revisions = article.dataset.revisions;
    else delete main.dataset.revisions;
    main.replaceChildren(...article.childNodes);
    showContentView(main, view);
    activateArticle();
  };
}
