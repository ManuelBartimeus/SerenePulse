// Stock photography: licensed WebP files in src/assets/stock/ (manifest.json gives alt text and
// credits, CREDITS.md the licences). build.mjs calls loadPhotos() once, fingerprints every width it
// finds into dist/assets and stores the result in ctx.photos; pages call photo(slot, …) to get a
// responsive <img> (or <picture> with an art-directed phone crop) with explicit width and height.
// A slot with no files yet renders a neutral placeholder of the same shape, so layout never shifts
// when the real photo lands.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { h, raw } from './html.mjs';
import { ctx } from './layout.mjs';

export const SLOTS = [
  'hero',
  'hero-mobile',
  'motor',
  'transport',
  'motorcycle',
  'home',
  'property',
  'travel',
  'health',
  'business',
  'marine',
  'engineering',
  'bonds',
  'liability',
  'claims',
  'app',
  'about',
];

/** Width and height from a WebP header (VP8, VP8L or VP8X). */
export function webpSize(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ')
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  return null;
}

/** Normalises whatever shape manifest.json has into { [slot]: { alt, credit } }. */
function readManifest(dir) {
  const file = join(dir, 'manifest.json');
  if (!existsSync(file)) return {};
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const list = Array.isArray(json)
    ? json
    : Array.isArray(json.photos)
      ? json.photos
      : Array.isArray(json.slots)
        ? json.slots
        : Object.entries(json.slots ?? json.photos ?? json).map(([slot, v]) => ({ slot, ...v }));
  const out = {};
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const slot = item.slot ?? item.id ?? item.name;
    if (!slot) continue;
    out[slot] = {
      alt: item.alt ?? item.altText ?? '',
      credit: item.credit ?? item.photographer ?? item.author ?? '',
      source: item.source ?? item.sourceUrl ?? item.url ?? '',
      licence: item.licence ?? item.license ?? '',
      files: item.files ?? item.sources ?? item.variants ?? item.widths ?? null,
    };
  }
  return out;
}

/**
 * Finds the files for every slot: "<slot>-<width>.webp" (also "<slot>-<width>w.webp" and
 * "<slot>@<width>.webp"), or the file names listed in the manifest. Returns
 * { [slot]: { alt, credit, files: [{ path, width, height }] } } sorted by width.
 */
export function loadPhotos(dir) {
  if (!existsSync(dir)) return {};
  const manifest = readManifest(dir);
  const names = readdirSync(dir).filter((f) => /\.webp$/i.test(f));
  const photos = {};
  const add = (slot, name) => {
    const path = join(dir, name);
    if (!existsSync(path)) return;
    const size = webpSize(readFileSync(path));
    if (!size) return;
    photos[slot] ??= { ...(manifest[slot] ?? {}), files: [] };
    if (!photos[slot].files.some((f) => f.path === path)) photos[slot].files.push({ path, ...size });
  };
  for (const [slot, m] of Object.entries(manifest)) {
    const listed = Array.isArray(m.files) ? m.files : [];
    for (const f of listed) {
      const name = typeof f === 'string' ? f : (f?.file ?? f?.src ?? f?.path ?? f?.name);
      if (typeof name === 'string') add(slot, name.replace(/^.*[\\/]/, ''));
    }
  }
  for (const name of names) {
    const m = name.match(/^(.+?)[-@_](\d{3,4})w?\.webp$/i);
    if (m && (SLOTS.includes(m[1]) || manifest[m[1]])) add(m[1], name);
  }
  for (const p of Object.values(photos)) p.files.sort((a, b) => a.width - b.width);
  return photos;
}

/** Fallbacks for slots without stock files yet: Serene's own photos where they fit. */
const OWN = {
  about: 'tower',
};

/**
 * Responsive image for a slot.
 *   sizes   the CSS width the image is shown at (the `sizes` attribute)
 *   ratio   [w, h] shape it is shown at (CSS crops with object-fit: cover; width/height reserve space)
 *   eager   first hero image only: eager + fetchpriority=high
 *   mobile  slot used below 768px through <picture> (art direction)
 */
export function photo(
  slot,
  { sizes = '100vw', ratio = [16, 9], eager = false, mobile = null, cls = 'img', alt } = {},
) {
  const p = ctx.photos?.[slot];
  const loading = eager ? h` fetchpriority="high" decoding="async"` : h` loading="lazy" decoding="async"`;
  const [rw, rh] = ratio;
  if (!p?.urls?.length) {
    const own = OWN[slot];
    if (own && ctx.ownPhotos?.[own]) {
      const o = ctx.ownPhotos[own];
      return h`<img class="${cls}" src="${o.src}" srcset="${o.srcset}" sizes="${sizes}" width="${o.width}" height="${o.height}"${loading} alt="${alt ?? o.alt}" />`;
    }
    // Placeholder: same box, neutral tint, marked for the build report.
    return h`<img class="${cls} is-placeholder" src="${ctx.assets.placeholder}" width="${rw * 100}" height="${rh * 100}"${loading} alt="" data-slot="${slot}" />`;
  }
  const largest = p.urls[p.urls.length - 1];
  const srcset = p.urls.map((u) => `${u.url} ${u.width}w`).join(', ');
  const img = h`<img class="${cls}" src="${p.urls.find((u) => u.width >= 960)?.url ?? largest.url}" srcset="${srcset}" sizes="${sizes}" width="${largest.width}" height="${largest.height}"${loading} alt="${alt ?? p.alt ?? ''}" />`;
  const m = mobile && ctx.photos?.[mobile];
  if (m?.urls?.length) {
    const mset = m.urls.map((u) => `${u.url} ${u.width}w`).join(', ');
    const ml = m.urls[m.urls.length - 1];
    return h`<picture><source media="(max-width: 767.98px)" srcset="${mset}" sizes="100vw" width="${ml.width}" height="${ml.height}" />${img}</picture>`;
  }
  return img;
}

/** Credits from the manifest, for /about. */
export function photoCredits() {
  return Object.entries(ctx.photos ?? {})
    .filter(([, p]) => p.urls?.length && p.credit)
    .map(([slot, p]) => ({ slot, credit: p.credit, source: p.source, licence: p.licence }));
}

export const hasPhoto = (slot) => Boolean(ctx.photos?.[slot]?.urls?.length);
export { raw };
