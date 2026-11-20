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

export function renderRevisions(source, { replace = [], remove = [], move }) {
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
  if (move) {
    const old = section(source, move).replace(/\s+id="[^"]+"/g, '');
    comparison = moveSection(comparison, move,
      mark('del', old.trimEnd(), true) + '\n',
      mark('ins', section(modified, move).trimEnd(), true) + '\n');
    modified = moveSection(modified, move);
  }
  return { modified, comparison };
}
