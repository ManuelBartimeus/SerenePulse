/* global URL */
// Tiny static server for dist/ that behaves like the site Worker for the landing site:
// auto-trailing-slash (/claims → /claims/), dist/404.html with status 404 for unknown paths, /fonts/
// from packages/ui/assets/fonts (assembled there in production), and the landing Content-Security-Policy
// built from dist/csp.json so a blocked inline script or style shows up as a console error.
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const dist = join(here, '../dist');
const fonts = join(here, '../../../packages/ui/assets/fonts');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function csp() {
  const c = JSON.parse(readFileSync(join(dist, 'csp.json'), 'utf8'));
  return [
    "default-src 'self'",
    `script-src 'self' ${c['script-src'].join(' ')}`,
    `style-src 'self' ${c['style-src'].join(' ')}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};
const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

export async function serve() {
  const policy = csp();
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const path = decodeURIComponent(url.pathname);
    if (path.includes('..') || path.includes('\\')) return res.writeHead(400).end();
    let file = path.startsWith('/fonts/') ? join(fonts, path.slice(7)) : join(dist, path);
    if (isDir(file)) {
      if (!path.endsWith('/')) {
        res.writeHead(307, { location: `${path}/${url.search}` });
        return res.end();
      }
      file = join(file, 'index.html');
    }
    const headers = { 'content-security-policy': policy };
    if (!isFile(file)) {
      res.writeHead(404, { ...headers, 'content-type': TYPES['.html'] });
      return res.end(readFileSync(join(dist, '404.html')));
    }
    res.writeHead(200, { ...headers, 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

/** Every built page path, e.g. "/", "/claims/", "/insurance/motor/". */
export function pagePaths() {
  const sitemap = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
  return [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
}
