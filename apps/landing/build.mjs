/* global process, console, Buffer */
// Builds the static Serene Insurance website into dist/. No dependencies.
//
//   node apps/landing/build.mjs            (SITE_URL=https://… overrides the canonical origin)
//
// * Pages are plain functions in src/pages/*.mjs that return { path, title, description, body, … };
//   src/lib/layout.mjs wraps them in the shared head, header and footer. Content lives in src/content/.
// * Every page is written to dist/<path>/index.html, so /claims, /insurance/motor etc. resolve through
//   the Worker's auto-trailing-slash handling; the not-found page is dist/404.html.
// * One stylesheet, one script and the icon sprite are minified and fingerprinted into dist/assets/
//   (content hash in the name, safe to cache forever). Images and icons are fingerprinted too.
// * Inline <script> and <style> blocks of ALL pages are hashed into dist/csp.json, which
//   scripts/assemble-site.mjs pins into the Worker's Content-Security-Policy. JSON-LD data blocks are not
//   executed and need no hash. No page uses style="" attributes (the CSP would block them).
// * Proposal forms in src/downloads/ are copied to dist/downloads/ under their stable names.
// * sitemap.xml and robots.txt are generated from the page list.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { ctx, layout } from './src/lib/layout.mjs';
import { DOWNLOADS_DIR } from './src/lib/files.mjs';
import home from './src/pages/home.mjs';
import { insuranceIndex, productPage } from './src/pages/insurance.mjs';
import claims from './src/pages/claims.mjs';
import branches from './src/pages/branches.mjs';
import about from './src/pages/about.mjs';
import verify from './src/pages/verify.mjs';
import help from './src/pages/help.mjs';
import downloads from './src/pages/downloads.mjs';
import contact from './src/pages/contact.mjs';
import { notFound, privacy, terms } from './src/pages/legal.mjs';
import { PRODUCTS } from './src/content/products.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'src');
const dist = join(here, 'dist');
const uiAssets = join(here, '../../packages/ui/assets');
const ORIGIN = (process.env.SITE_URL ?? 'https://serene.eliteservicesagency3.workers.dev').replace(/\/$/, '');

const hash = (buf, len = 10) => createHash('sha256').update(buf).digest('hex').slice(0, len);
const cspHash = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

/** The logo is an interim trace with 3-decimal coordinates; whole units are invisible at display size. */
function optimiseSvg(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n))))
    .replace(/,\s+/g, ',')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
}

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/([^\s]):\s+/g, '$1:') // "prop: value" → "prop:value"; selectors never have ": " in this file
    .replace(/;}/g, '}')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

function minifyJs(js) {
  // Conservative: drop full-line comments and indentation only. main.js keeps every statement on lines
  // that stand alone (no multi-line template literals), so this is safe.
  return js
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('/*') && !l.startsWith('*'))
    .join('\n');
}

function minifyHtml(html) {
  // Keeps source and note comments (they record where facts come from); drops the rest. Collapses
  // indentation but never removes whitespace between tags, so inline text spacing is preserved.
  return html
    .replace(
      /<!--(?!\s*(Source|Sources|Note|Image|Price|Cover|Claim|Branches|Company|Buying|Tariff|Kumasi|LEGAL))[\s\S]*?-->/g,
      '',
    )
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'assets'), { recursive: true });

// ---- Assets --------------------------------------------------------------------------------------
const FILES = {
  logo: join(uiAssets, 'serene-logo.svg'),
  logoReversed: join(uiAssets, 'serene-logo-reversed.svg'),
  logoPng: join(uiAssets, 'serene-logo.png'),
  favicon: join(uiAssets, 'serene-favicon-64.png'),
  touch: join(uiAssets, 'serene-apple-touch-icon.png'),
  tower480: join(src, 'assets/su-tower-480.webp'),
  tower800: join(src, 'assets/su-tower-800.webp'),
  team720: join(src, 'assets/serene-team-720.webp'),
  team1280: join(src, 'assets/serene-team-1280.webp'),
  icons: join(src, 'icons.svg'),
};
const emitted = [];
function emit(key, buf, ext) {
  const name = `${key}.${hash(buf)}${ext}`;
  writeFileSync(join(dist, 'assets', name), buf);
  ctx.assets[key] = `/assets/${name}`;
  emitted.push([`assets/${name}`, buf]);
}
for (const [key, file] of Object.entries(FILES)) {
  let buf = readFileSync(file);
  if (extname(file) === '.svg') buf = Buffer.from(optimiseSvg(buf.toString('utf8')));
  emit(key, buf, extname(file));
}
emit('css', Buffer.from(minifyCss(readFileSync(join(src, 'styles.css'), 'utf8'))), '.css');
emit('js', Buffer.from(minifyJs(readFileSync(join(src, 'main.js'), 'utf8'))), '.js');

ctx.origin = ORIGIN;
ctx.year = new Date().getFullYear();

// ---- Pages ---------------------------------------------------------------------------------------
const pages = [
  home(),
  insuranceIndex(),
  ...PRODUCTS.map(productPage),
  claims(),
  branches(),
  about(),
  verify(),
  help(),
  downloads(),
  contact(),
  privacy(),
  terms(),
  notFound(),
];

const scriptHashes = new Set();
const styleHashes = new Set();
const seen = new Set();
for (const page of pages) {
  if (seen.has(page.path)) throw new Error(`Duplicate page ${page.path}`);
  seen.add(page.path);
  const html = minifyHtml(String(layout(page)));
  if (/\sstyle="/.test(html)) throw new Error(`${page.path}: style attributes are blocked by the CSP`);
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) scriptHashes.add(cspHash(m[1]));
  for (const m of html.matchAll(/<style>([\s\S]*?)<\/style>/g)) styleHashes.add(cspHash(m[1]));
  const out = page.path.endsWith('.html') ? join(dist, page.path) : join(dist, page.path, 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  emitted.push([out.slice(dist.length + 1).replace(/\\/g, '/'), Buffer.from(html)]);
}

writeFileSync(
  join(dist, 'csp.json'),
  JSON.stringify({ 'script-src': [...scriptHashes], 'style-src': [...styleHashes] }, null, 2) + '\n',
);

// ---- Downloads (stable names, not hashed: brokers bookmark and share them) ----------------------
mkdirSync(join(dist, 'downloads'), { recursive: true });
let downloadBytes = 0;
for (const f of readdirSync(DOWNLOADS_DIR)) {
  if (!/^[a-z0-9-]+\.(pdf|docx)$/.test(f)) throw new Error(`Unexpected file in src/downloads: ${f}`);
  copyFileSync(join(DOWNLOADS_DIR, f), join(dist, 'downloads', f));
  downloadBytes += readFileSync(join(DOWNLOADS_DIR, f)).length;
}

// ---- SEO files -----------------------------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
const urls = pages.filter((p) => !p.robots).map((p) => p.path);
writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${ORIGIN}${u}</loc><lastmod>${today}</lastmod></url>`)
    .join('\n')}\n</urlset>\n`,
);
writeFileSync(
  join(dist, 'robots.txt'),
  `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /account/\nDisallow: /api/\n\nSitemap: ${ORIGIN}/sitemap.xml\n`,
);

// ---- Report --------------------------------------------------------------------------------------
let raw = 0;
let gz = 0;
for (const [, buf] of emitted) {
  raw += buf.length;
  gz += gzipSync(buf).length;
}
const show = (name) => {
  const e = emitted.find(([n]) => n === name || n.startsWith(name));
  return e ? `${String(e[1].length).padStart(8)} B ${String(gzipSync(e[1]).length).padStart(7)} B gz` : '';
};
console.log(`pages              ${pages.length}`);
console.log(`home               ${show('index.html')}`);
console.log(`styles             ${show('assets/css.')}`);
console.log(`script             ${show('assets/js.')}`);
console.log(`site total         ${String(raw).padStart(8)} B ${String(gz).padStart(7)} B gz`);
console.log(`downloads          ${String(downloadBytes).padStart(8)} B`);
console.log(`csp                ${scriptHashes.size} script hash(es), ${styleHashes.size} style hash(es)`);
