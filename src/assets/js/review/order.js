function compareDates(a, b) {
  return Date.parse(a.created_at) - Date.parse(b.created_at) ||
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}

function comparePaths(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

export async function loadReviewOrder(root, version) {
  const address = new URL('assets/review-index.json', root);
  address.search = version;
  const response = await fetch(address);
  if (!response.ok) throw new Error('review index');
  const pages = await response.json();
  if (!Array.isArray(pages)) throw new Error('review index');
  return new Map(pages.map(([route, anchors], rank) => [route, { rank, anchors }]));
}

export function compareNotes(index, order) {
  if (order === 'time') return compareDates;
  function position(note) {
    const loc = note.locator ?? {};
    if (loc.kind === 'page') return [];
    const base = index.get(note.route)?.anchors?.[loc.anchor];
    return (Array.isArray(base) ? base : [Number.MAX_SAFE_INTEGER]).concat(
      Array.isArray(loc.path) ? loc.path : []);
  }
  return (a, b) => {
    const aRank = index.get(a.route)?.rank ?? Number.MAX_SAFE_INTEGER;
    const bRank = index.get(b.route)?.rank ?? Number.MAX_SAFE_INTEGER;
    return aRank - bRank || a.route.localeCompare(b.route, 'hu') ||
      comparePaths(position(a), position(b)) || compareDates(a, b);
  };
}
