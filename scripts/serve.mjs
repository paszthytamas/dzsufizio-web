import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const host = '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let file;
  try {
    const url = new URL(req.url, 'http://' + host);
    const pathname = decodeURIComponent(url.pathname);
    file = resolve(root, '.' + pathname);
    const within = relative(root, file);
    if (isAbsolute(within) || within === '..' || within.startsWith('..' + sep)) {
      res.writeHead(403).end();
      return;
    }
    if ((await stat(file)).isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        res.writeHead(308, { Location: url.pathname + '/' + url.search }).end();
        return;
      }
      file = join(file, 'index.html');
    }
    if (!(await stat(file)).isFile()) throw new Error('Nem található.');
  } catch {
    res.statusCode = 404;
    file = join(root, '404.html');
  }
  res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).on('error', () => res.end()).pipe(res);
}).listen(port, host, () => console.log('Előnézet: http://' + host + ':' + port + '/'));
