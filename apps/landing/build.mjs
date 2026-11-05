/* global process, console, Buffer */
// Builds the static landing page into dist/: inlines minified CSS and JS, fingerprints assets
// (content hash in the file name, so dist/assets/* can be cached immutably) and writes the CSP hashes
// of the inline blocks to dist/csp.json for the hosting Worker. No dependencies.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'src');
const dist = join(here, 'dist');
const uiAssets = join(here, '../../packages/ui/assets');

const ASSETS = {
  logo: join(uiAssets, 'serene-logo.svg'),
  favicon: join(uiAssets, 'serene-favicon-64.png'),
  touch: join(uiAssets, 'serene-apple-touch-icon.png'),
  tower480: join(src, 'assets/su-tower-480.webp'),
  tower800: join(src, 'assets/su-tower-800.webp'),
  team720: join(src, 'assets/serene-team-720.webp'),
  team1280: join(src, 'assets/serene-team-1280.webp'),
};

const hash = (buf, len = 10) => createHash('sha256').update(buf).digest('hex').slice(0, len);
const cspHash = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

/** The logo is an interim trace with 3-decimal coordinates; whole units (1/12 px at the 148 px display width) are invisible. */
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
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

function minifyJs(js) {
  // Conservative: drop full-line comments and indentation only (no string-aware tokenising needed).
  return js
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
    .join('\n');
}

function minifyHtml(html) {
  return html
    .replace(/<!--(?!\s*Source|\s*Note|\s*Image|\s*[A-Z ]+\.)[\s\S]*?-->/g, '')
    .replace(/\n\s+/g, '\n')
    .replace(/>\n</g, '><')
    .trim();
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'assets'), { recursive: true });

const urls = {};
for (const [key, file] of Object.entries(ASSETS)) {
  let buf = readFileSync(file);
  if (extname(file) === '.svg') buf = Buffer.from(optimiseSvg(buf.toString('utf8')));
  const name = `${key}.${hash(buf)}${extname(file)}`;
  writeFileSync(join(dist, 'assets', name), buf);
  urls[key] = `/assets/${name}`;
}

const css = minifyCss(readFileSync(join(src, 'styles.css'), 'utf8'));
const js = minifyJs(readFileSync(join(src, 'main.js'), 'utf8'));
let html = readFileSync(join(src, 'index.html'), 'utf8')
  .replace(/\{\{asset:(\w+)\}\}/g, (_, k) => {
    if (!urls[k]) throw new Error(`Unknown asset ${k}`);
    return urls[k];
  })
  .replace('{{year}}', String(new Date().getFullYear()));
html = minifyHtml(html)
  .replace('{{css}}', () => css)
  .replace('{{js}}', () => js);

const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => cspHash(m[1]));
const inlineStyles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => cspHash(m[1]));
writeFileSync(join(dist, 'index.html'), html);
writeFileSync(
  join(dist, 'csp.json'),
  JSON.stringify({ 'script-src': inlineScripts, 'style-src': inlineStyles }, null, 2) + '\n',
);

const report = [['index.html', Buffer.from(html)]];
for (const u of Object.values(urls)) report.push([u.slice(1), readFileSync(join(dist, u.slice(1)))]);
let raw = 0;
let gz = 0;
for (const [name, buf] of report) {
  const g = /\.(html|svg|css|js)$/.test(name) ? gzipSync(buf).length : buf.length;
  raw += buf.length;
  gz += g;
  console.log(`${name.padEnd(44)} ${String(buf.length).padStart(8)} B  ${String(g).padStart(8)} B gz`);
}
console.log(`${'total'.padEnd(44)} ${String(raw).padStart(8)} B  ${String(gz).padStart(8)} B gz`);
process.exitCode = 0;
