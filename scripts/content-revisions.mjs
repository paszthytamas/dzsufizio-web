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

function replaceVideoExercise(html, { id, headingId, anchor, from, title, steps }, comparing) {
  const video = singleBlock(html, /<figure class="media-player tiktok\b[^"]*">[\s\S]*?<\/figure>/g,
    'data-embed="https://www.tiktok.com/player/v1/' + id + '?');
  const start = html.indexOf('<h3 id="' + headingId + '">');
  const end = html.indexOf('</h3>', start);
  const playerStart = html.indexOf(video);
  if (start === -1 || end === -1 || playerStart <= end) {
    throw new Error('A gyakorlat címe nem azonosítható: ' + headingId);
  }
  const descriptionStart = end + '</h3>'.length;
  const previousDescription = html.slice(descriptionStart, playerStart).trim();
  if (!previousDescription.startsWith('<ol class="word-list">') || /<h[1-6]\b/.test(previousDescription)) {
    throw new Error('Megváltozott a gyakorlat szerkezete: ' + headingId);
  }

  const name = escapeExerciseText(title);
  const newTitle = '<span id="' + anchor + '">' + name + '</span>';
  const heading = replaceOnce(html.slice(start, descriptionStart), from,
    comparing ? mark('del', from) + ' ' + mark('ins', newTitle) : newTitle);
  const instructions = '<ol class="word-list">\n' +
    steps.map(step => '<li>' + escapeExerciseText(step) + '</li>').join('\n') + '\n</ol>';
  const description = comparing
    ? mark('del', previousDescription, true) + '\n' + mark('ins', instructions, true)
    : instructions;
  const renamed = replaceOnce(video, '<strong>' + from + '</strong>', '').replaceAll(from, () => name);

  return replaceOnce(html, html.slice(start, playerStart + video.length),
    [heading, description, renamed].join('\n'));
}

function escapeExerciseText(value) {
  return value.replace(/[&<>"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  })[character]);
}

function renderExercise({ id, title, intro, steps }, number, coverTemplate) {
  if (!/^\d+$/.test(id)) throw new Error('Hibás TikTok-azonosító: ' + id);
  const heading = escapeExerciseText(title);
  const description = intro ? '<p>' + escapeExerciseText(intro) + '</p>\n' : '';
  const instructions = steps.map(step => '<li>' + escapeExerciseText(step) + '</li>').join('\n');
  const player = coverTemplate
    .replaceAll('7297618909971090720', id)
    .replaceAll('Alkarnyújtás asztalnál', () => heading);
  return '<section class="exercise" aria-labelledby="gyakorlat-' + id + '">\n' +
    '<div class="exercise-instructions">\n<h4 id="gyakorlat-' + id + '">5.' + number + '. ' + heading + '</h4>\n' +
    description + '<ol class="steps-list">\n' + instructions + '\n</ol>\n</div>\n' +
    player + '\n</section>';
}

function renderExerciseChapter(html, items, comparing) {
  const heading = '<h2 id="resz-27">';
  const start = html.indexOf(heading);
  const end = html.indexOf('<h2 id="resz-38">', start);
  if (start === -1 || end === -1) throw new Error('Hiányzik az otthoni gyakorlatok fejezete.');
  const original = html.slice(start, end);
  const oldTitle = original.match(/^<h2 id="resz-27">([^<]+)<\/h2>/)?.[1];
  const oldStretch = original.indexOf('<h3 id="resz-31">');
  const oldGroup = original.match(/<div class="exercise-group">\s*<h3>([^<]+)<\/h3>\s*<p>([^<]+)<\/p>/);
  const golfExercises = [...original.matchAll(/<section class="exercise">[\s\S]*?<\/section>/g)];
  if (!oldTitle || !oldGroup || oldStretch === -1 || oldStretch >= oldGroup.index || golfExercises.length !== 2) {
    throw new Error('Megváltozott az otthoni gyakorlatok eredeti szerkezete.');
  }

  const title = '5. Otthoni gyakorlat teniszkönyökre';
  const differenceTitle = '5.1. Mi a különbség a golfkönyök és a teniszkönyök között?';
  const difference = replaceOnce(oldGroup[2],
    ' A két alábbi videó golfkönyökhöz készült; más területet céloznak, mint a fenti teniszkönyök-gyakorlatok.', '');
  const text = (before, after) => comparing ? compareText(before, after) : after;
  const added = block => comparing ? mark('ins', block, true) : block;
  const removedStretch = comparing ? mark('del', original.slice(oldStretch, oldGroup.index).trimEnd(), true) + '\n' : '';
  const coverTemplate = singleBlock(golfExercises[0][0], /<figure class="media-player tiktok\b[^"]*">[\s\S]*?<\/figure>/g,
    'data-embed="https://www.tiktok.com/player/v1/7297618909971090720?');
  const golfVideos = golfExercises.map(([exercise]) => exercise.replace('<h3>', '<h4>').replace('</h3>', '</h4>')).join('\n');
  const tennisVideos = items.map((item, index) => added(renderExercise(item, index + 5, coverTemplate))).join('\n');
  const updated = [
    heading + text(oldTitle, title) + '</h2>',
    '<h3>' + text(oldGroup[1], differenceTitle) + '</h3>',
    '<p>' + text(oldGroup[2], difference) + '</p>',
    paragraph(original, 'resz-28'),
    '<section class="exercise-group" aria-labelledby="golfkonyok-gyakorlatok">',
    '<h3 id="golfkonyok-gyakorlatok">Golfkönyök-gyakorlatok</h3>',
    added('<p>A lassú könyökhajlítás mindkét gyakorlatsorhoz használható bemelegítésként.</p>'),
    '<h4 id="resz-29">5.2. Lassú könyökhajlítás és -nyújtás</h4>',
    paragraph(original, 'resz-30'),
    removedStretch + golfVideos,
    '</section>',
    '<section class="exercise-group" aria-labelledby="teniszkonyok-videok">',
    '<h3 id="teniszkonyok-videok">Teniszkönyök-gyakorlatok</h3>',
    tennisVideos,
    '</section>',
    '',
  ].join('\n');
  const updatedChapter = replaceOnce(html, original, updated);
  return replaceOnce(updatedChapter, '<a href="#resz-27">' + oldTitle + '</a>', '<a href="#resz-27">' + title + '</a>');
}

export function renderRevisions(source, { replace = [], remove = [], paragraphs = [], move, booking, compactComplaints, removeInstagramCard: removedReel, videoExercise, exerciseChapter }) {
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
  if (videoExercise) {
    modified = replaceVideoExercise(modified, videoExercise, false);
    comparison = replaceVideoExercise(comparison, videoExercise, true);
  }
  if (exerciseChapter) {
    modified = renderExerciseChapter(modified, exerciseChapter.items, false);
    comparison = renderExerciseChapter(comparison, exerciseChapter.items, true);
  }
  return { modified, comparison };
}
