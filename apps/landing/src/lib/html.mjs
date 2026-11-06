// Tiny HTML templating for the static builder. `h` is a tagged template that escapes every
// interpolated value unless it is already a SafeHtml (from `h` itself or `raw`). Arrays are joined.
// No dependencies, no runtime: everything here runs at build time only.

class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text for use in element content and quoted attribute values. */
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

/** Marks trusted, already-built markup (never pass user or file content here). */
export const raw = (s) => new SafeHtml(String(s));

function part(v) {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(part).join('');
  return esc(v);
}

/** Tagged template: h`<p>${text}</p>` escapes `text`; nested h`` results pass through. */
export function h(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** Inline-formatted copy: escapes the text, then turns **bold** into <strong>. */
export const md = (s) => raw(esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'));

/** URL-safe id from a heading. */
export const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** GH₵ amount with thousands separators; whole numbers drop the decimals. */
export function cedi(n) {
  const whole = Number.isInteger(n);
  return `GH₵ ${n.toLocaleString('en-GB', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}
