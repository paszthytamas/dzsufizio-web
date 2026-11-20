const words = new Intl.Segmenter('hu', { granularity: 'word' });

function replaceOnce(content, before, after) {
  const at = content.indexOf(before);
  if (!before || at === -1 || content.indexOf(before, at + before.length) !== -1) {
    throw new Error('A módosítandó résznek pontosan egyszer kell szerepelnie: ' + before);
  }
  return content.slice(0, at) + after + content.slice(at + before.length);
}

function mark(tag, content, block = false) {
  if (!content) return '';
  const attrs = block ? ' class="revision-block"' : '';
  return '<' + tag + attrs + '>' + content + '</' + tag + '>';
}

function compareText(before, after) {
  const oldWords = Array.from(words.segment(before), ({ segment }) => segment);
  const newWords = Array.from(words.segment(after), ({ segment }) => segment);
  const scores = Array.from({ length: oldWords.length + 1 }, () => new Uint32Array(newWords.length + 1));

  // Align unchanged words and punctuation before grouping each deletion and insertion.
  for (let old = oldWords.length - 1; old >= 0; old--) {
    for (let next = newWords.length - 1; next >= 0; next--) {
      scores[old][next] = oldWords[old] === newWords[next]
        ? scores[old + 1][next + 1] + 1
        : Math.max(scores[old + 1][next], scores[old][next + 1]);
    }
  }

  let result = '';
  let deleted = '';
  let inserted = '';
  let old = 0;
  let next = 0;
  while (old < oldWords.length || next < newWords.length) {
    if (oldWords[old] === newWords[next]) {
      result += mark('del', deleted) + mark('ins', inserted) + oldWords[old];
      deleted = inserted = '';
      old++;
      next++;
    } else if (old < oldWords.length && (next === newWords.length || scores[old + 1][next] >= scores[old][next + 1])) {
      deleted += oldWords[old++];
    } else {
      inserted += newWords[next++];
    }
  }
  return result + mark('del', deleted) + mark('ins', inserted);
}

function paragraph(html, id) {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error('Hibás bekezdésazonosító: ' + id);
  const match = html.match(new RegExp('<p\\b[^>]*\\sid="' + id + '"[^>]*>[\\s\\S]*?</p>'));
  if (!match) throw new Error('Hiányzó bekezdés: ' + id);
  return match[0];
}

function replaceText(html, oldText, newText, id) {
  if (!id) return replaceOnce(html, oldText, newText);
  const block = paragraph(html, id);
  return replaceOnce(html, block, replaceOnce(block, oldText, newText));
}

function sectionRange(html, [from, to]) {
  const headings = [...html.matchAll(/^[ \t]*(?:<span id="[^"]+"><\/span>)?<h2 id="([a-z0-9-]+)">/gm)];
  const index = headings.findIndex(([, id]) => id === from);
  const destination = headings.find(([, id]) => id === to);
  const next = headings[index + 1];
  if (index < 0 || !next || !destination || destination.index <= next.index) {
    throw new Error('A szakasz vagy a célhely hiányzik: ' + from + ' → ' + to);
  }
  return { start: headings[index].index, end: next.index, destination: destination.index };
}

function section(html, move) {
  const { start, end } = sectionRange(html, move);
  return html.slice(start, end);
}

function tocEntry(html, id) {
  const start = '<li><a href="#' + id + '">';
  const line = html.split('\n').find(item => item.trimStart().startsWith(start));
  if (!line) throw new Error('Hiányzó tartalomjegyzék-bejegyzés: ' + id);
  return line + '\n';
}

function moveSection(html, move, oldPlace = '', newPlace = section(html, move)) {
  const { start, end, destination } = sectionRange(html, move);
  const body = html.slice(0, start) + oldPlace + html.slice(end, destination) + newPlace + html.slice(destination);
  const entry = tocEntry(body, move[0]);
  const before = tocEntry(body, move[1]);
  return replaceOnce(replaceOnce(body, entry, ''), before, entry + before);
}

function replaceBookingLinks(html, destination, comparing) {
  const defaultUrl = 'https://dzsufizio.salonic.hu/';
  const pattern = /<a href="https:\/\/dzsufizio\.salonic\.hu\/"[^>]*\bclass="[^"]*\bbooking-cta\b[^"]*"[^>]*>[\s\S]*?<\/a>/g;
  let matches = 0;
  const updated = html.replace(pattern, link => {
    matches++;
    const personal = link.replace(defaultUrl, () => destination);
    if (!comparing) return personal;
    return '<del class="revision-booking" title="Általános foglaló">' + link + '</del> ' +
      '<ins class="revision-booking" title="Személyes foglaló">' + personal + '</ins>';
  });
  if (!matches) throw new Error('Hiányzó foglalógomb a bemutatkozóoldalon.');
  return updated;
}

function replaceParagraph(html, id, content, comparing) {
  const original = paragraph(html, id);
  const updated = original.slice(0, original.indexOf('>') + 1) + content + '</p>';
  if (!comparing) return replaceOnce(html, original, updated);
  const old = original.replace(/\s+id="[^"]+"/g, '');
  return replaceOnce(html, original, mark('del', old, true) + '\n' + mark('ins', updated, true));
}

function singleBlock(html, pattern, attribute) {
  const matches = [...html.matchAll(pattern)].map(([block]) => block).filter(block => block.includes(attribute));
  if (matches.length !== 1) throw new Error('A videó nem azonosítható egyértelműen: ' + attribute);
  return matches[0];
}

function removeInstagramCard(html, id, comparing) {
  const card = singleBlock(html, /<article class="guest-card">[\s\S]*?<\/article>/g,
    'data-ig-permalink="https://www.instagram.com/reel/' + id + '/"');
  return replaceOnce(html, card, comparing ? mark('del', card, true) : '');
}

function separateTikTok(html, { id, anchor, from, title, intro }, comparing) {
  const video = singleBlock(html, /<figure class="media-player tiktok\b[^"]*">[\s\S]*?<\/figure>/g,
    'data-embed="https://www.tiktok.com/player/v1/' + id + '?');
  const renamed = replaceOnce(video, '<strong>' + from + '</strong>', '').replaceAll(from, title);
  const section = '<section aria-labelledby="' + anchor + '">\n' +
    '<h3 id="' + anchor + '">' + title + '</h3>\n' +
    '<p class="word-p">' + intro + '</p>\n' + renamed + '\n</section>\n';
  const updated = comparing ? mark('del', video, true) + '\n' + mark('ins', section.trimEnd(), true) + '\n' : section;
  return replaceOnce(html, video, updated);
}

function additionalTikToks(html, { before, title, videoIds }, comparing) {
  const destination = '<h2 id="' + before + '">';
  const videos = videoIds.map((id, index) => {
    if (!/^\d+$/.test(id)) throw new Error('Hibás TikTok-azonosító: ' + id);
    const label = (index + 1) + '. videó';
    const player = 'https://www.tiktok.com/player/v1/' + id + '?autoplay=0&amp;controls=1&amp;description=1&amp;music_info=0';
    const permalink = 'https://www.tiktok.com/@dzsufizio/video/' + id;
    return '<figure class="media-player tiktok compact">\n' +
      '<details class="video-embed" data-embed="' + player + '" data-title="' + title + ' – ' + label + '">\n' +
      '<summary class="video-summary"><span class="video-closed-label">▶ ' + label + ' lejátszása</span>' +
      '<span class="video-open-label">' + label + ' bezárása</span></summary>\n' +
      '<div class="play-space" data-player></div>\n' +
      '</details>\n' +
      '<figcaption><a href="' + permalink + '" class="player-link" target="_blank" rel="noopener noreferrer" ' +
      'aria-label="' + label + ' megnyitása a TikTokon">Megnyitás a TikTokon</a></figcaption>\n' +
      '</figure>';
  }).join('\n');
  const block = '<section aria-labelledby="teniszkonyok-videok">\n' +
    '<h3 id="teniszkonyok-videok">' + title + '</h3>\n' +
    '<div class="gallery">\n' + videos + '\n</div>\n</section>';
  return replaceOnce(html, destination, (comparing ? mark('ins', block, true) : block) + '\n' + destination);
}

export function renderRevisions(source, { replace = [], remove = [], paragraphs = [], move, booking, compactComplaints, removeInstagramCard: removedReel, separateTikTok: videoSection, additionalTikToks: extraVideos }) {
  let modified = source;
  let comparison = source;
  for (const [before, after, id] of replace) {
    if (/[<>&]/.test(before + after)) throw new Error('A szövegcsere csak szöveget tartalmazhat.');
    modified = replaceText(modified, before, after, id);
    comparison = replaceText(comparison, before, compareText(before, after), id);
  }
  for (const id of remove) {
    const block = paragraph(source, id);
    modified = replaceOnce(modified, block + '\n', '');
    comparison = replaceOnce(comparison, block, mark('del', block, true));
  }
  for (const [id, content] of paragraphs) {
    modified = replaceParagraph(modified, id, content, false);
    comparison = replaceParagraph(comparison, id, content, true);
  }
  if (move) {
    const old = section(source, move).replace(/\s+id="[^"]+"/g, '');
    comparison = moveSection(comparison, move,
      mark('del', old.trimEnd(), true) + '\n',
      mark('ins', section(modified, move).trimEnd(), true) + '\n');
    modified = moveSection(modified, move);
  }
  if (booking) {
    modified = replaceBookingLinks(modified, booking, false);
    comparison = replaceBookingLinks(comparison, booking, true);
  }
  if (compactComplaints) {
    const grid = '<div class="complaints-grid">';
    const compactGrid = '<div class="complaints-grid complaints-grid--compact">';
    modified = replaceOnce(modified, grid, compactGrid);
    comparison = replaceOnce(comparison, grid, compactGrid);
  }
  if (removedReel) {
    modified = removeInstagramCard(modified, removedReel, false);
    comparison = removeInstagramCard(comparison, removedReel, true);
  }
  if (videoSection) {
    modified = separateTikTok(modified, videoSection, false);
    comparison = separateTikTok(comparison, videoSection, true);
  }
  if (extraVideos) {
    modified = additionalTikToks(modified, extraVideos, false);
    comparison = additionalTikToks(comparison, extraVideos, true);
  }
  return { modified, comparison };
}
