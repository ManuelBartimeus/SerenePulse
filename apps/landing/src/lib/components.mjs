// Building blocks shared by several pages.
import { h, md, raw, cedi } from './html.mjs';
import { icon } from './layout.mjs';
import { photo } from './photos.mjs';
import { COVER_ROWS, COVERS } from '../content/motor.mjs';
import { claimAnchor } from '../content/claims.mjs';

export const buyUrl = (code) => `/account/buy?product=${code}`;

export const priceLine = (p) =>
  p.purchase === 'instant'
    ? 'Instant price online'
    : 'Priced by an underwriter, usually within one working day';

/** Line icon for a product category (cards, the products index). */
export const CATEGORY_ICONS = {
  motor: 'car',
  travel: 'plane',
  property: 'home',
  accident: 'heart',
  liability: 'scale',
  financial: 'briefcase',
  marine: 'ship',
  engineering: 'hardhat',
  bonds: 'file-check',
};

/** Photo slot for a product page. */
export function productSlot(p) {
  if (p.slug === 'motor') return 'motor';
  if (p.category === 'travel') return 'travel';
  if (p.category === 'property')
    return p.audience.includes('individual') && p.slug !== 'fire' ? 'home' : 'property';
  if (p.category === 'accident') return p.slug === 'personal-accident' ? 'health' : 'business';
  if (p.category === 'liability') return p.slug === 'professional-indemnity' ? 'business' : 'liability';
  if (p.category === 'financial') return 'business';
  if (p.category === 'marine') return 'marine';
  if (p.category === 'engineering') return 'engineering';
  if (p.category === 'bonds') return 'bonds';
  return 'business';
}

/** Section header: H2 (with the 48×6 accent bar when `bar`), optional lede, optional "See all" link. */
export function sectionHead({ id, title, lede, more, bar = false, level = 2 }) {
  const tag = raw(`h${level}`);
  return h`<div class="section-head">
  <div class="section-head-text">
    ${bar ? raw('<span class="bar" aria-hidden="true"></span>') : ''}
    <${tag} id="${id}" class="section-title">${title}</${tag}>
    ${lede ? h`<p class="section-lede">${lede}</p>` : ''}
  </div>
  ${more ? h`<a class="see-all" href="${more[1]}">${more[0]}${icon('chevron-right')}</a>` : ''}
</div>`;
}

/** Quick-link card: the whole card is the link. */
export const quickLink = ({ ico, title, text, href, cta = 'Get started' }) => h`<li>
  <a class="qlink" href="${href}">
    <span class="tile" aria-hidden="true">${icon(ico)}</span>
    <span class="qlink-title">${title}</span>
    <span class="qlink-text">${text}</span>
    <span class="qlink-cta"><span class="qlink-cta-text">${cta}</span>${icon('chevron-right')}</span>
  </a>
</li>`;

/**
 * Product card with a photo: title links to the page; the three actions every product offers
 * (Get a quote, Cover details, Make a claim) sit at the foot.
 */
export function productCard({ p, title, text, slot, note, href, quote }) {
  const page = href ?? `/insurance/${p.slug}/`;
  const name = title ?? p.name;
  return h`<li class="pcard">
  <div class="pcard-media">${photo(slot, { sizes: '(min-width: 1280px) 296px, (min-width: 1024px) 23vw, (min-width: 640px) 46vw, 82vw', ratio: [16, 9] })}</div>
  <div class="pcard-body">
    <h3 class="pcard-title"><a href="${page}">${name}</a></h3>
    <p class="pcard-text">${text ?? p.summary}</p>
    <p class="pcard-note${p.purchase === 'instant' ? ' is-instant' : ''}">${note ?? priceLine(p)}</p>
    <div class="pcard-actions">
      <a class="btn btn-primary btn-sm" href="${quote ?? buyUrl(p.code)}">Get a quote<span class="sr-only"> for ${name}</span></a>
      <a class="text-link" href="${page}">Cover details<span class="sr-only">: ${name}</span></a>
      <a class="text-link" href="/claims/#${claimAnchor(p)}">Make a claim<span class="sr-only"> on ${name}</span></a>
    </div>
  </div>
</li>`;
}

/** One product in the products index: icon tile, name, summary, how it is priced, three actions. */
export function productRow(p, { level = 3, overline = '' } = {}) {
  const tag = raw(`h${level}`);
  return h`<li class="prod">
  <div class="prod-top">
    <span class="tile" aria-hidden="true">${icon(CATEGORY_ICONS[p.category] ?? 'shield-check')}</span>
    ${overline ? h`<p class="prod-cat">${overline}</p>` : ''}
  </div>
  <${tag} class="prod-name"><a href="/insurance/${p.slug}/">${p.name}</a></${tag}>
  <p class="prod-text">${p.summary}</p>
  <p class="prod-price${p.purchase === 'instant' ? ' is-instant' : ''}">${priceLine(p)}</p>
  <ul class="prod-links">
    <li><a class="btn btn-primary btn-sm" href="${buyUrl(p.code)}">Get a quote<span class="sr-only"> for ${p.name}</span></a></li>
    <li><a class="text-link" href="/insurance/${p.slug}/">Cover details<span class="sr-only">: ${p.name}</span></a></li>
    <li><a class="text-link" href="/claims/#${claimAnchor(p)}">Make a claim<span class="sr-only"> on ${p.name}</span></a></li>
  </ul>
</li>`;
}

const mark = (v) =>
  v === true
    ? h`<span class="yes">${icon('check')}<span>Covered</span></span>`
    : v === false
      ? h`<span class="no">${icon('cross')}<span>Not covered</span></span>`
      : h`<span class="maybe">${v}</span>`;

/** The motor cover comparison: a table on wider screens, one card per cover on phones. */
export function coverComparison(id = 'compare') {
  const table = h`<div class="compare-table">
  <table class="table compare">
    <caption class="sr-only">What each motor cover pays for</caption>
    <thead>
      <tr>
        <th scope="col">If this happens</th>
        ${COVERS.map((c) => h`<th scope="col">${c.name}</th>`)}
      </tr>
    </thead>
    <tbody>
      ${COVER_ROWS.map(
        ([label, ...cells]) => h`<tr>
        <th scope="row">${label}</th>
        ${cells.map((v) => h`<td>${mark(v)}</td>`)}
      </tr>`,
      )}
    </tbody>
    <tfoot>
      <tr>
        <th scope="row">How it is priced</th>
        ${COVERS.map((c) => h`<td>${c.price}</td>`)}
      </tr>
    </tfoot>
  </table>
</div>`;
  const cards = h`<div class="compare-cards" role="region" aria-label="What each motor cover pays for, one card per cover" tabindex="0">
  ${COVERS.map(
    (c, i) => h`<section class="cover-card" aria-labelledby="${id}-${c.value}">
    <h3 id="${id}-${c.value}">${c.name}</h3>
    <p class="cover-price">${c.price}</p>
    <ul class="marks">
      ${COVER_ROWS.map(([label, ...cells]) => {
        const v = cells[i];
        return h`<li class="${v === false ? 'is-no' : 'is-yes'}">${v === false ? icon('cross') : icon('check')}<span>${label}${v === false ? raw('<span class="sr-only">: not covered</span>') : typeof v === 'string' ? h` (${v.toLowerCase()})` : ''}</span></li>`;
      })}
    </ul>
  </section>`,
  )}
</div>`;
  return h`${table}${cards}`;
}

/**
 * A data table that becomes stacked cards on phones (CSS reads data-label).
 * cols: [label, ...]; rows: arrays of cells (first cell is the row header).
 */
export function stackTable({ caption, cols, rows, className = '', captionVisible = false }) {
  return h`<div class="table-wrap">
<table class="table stack ${className}">
  <caption${captionVisible ? '' : raw(' class="sr-only"')}>${caption}</caption>
  <thead><tr>${cols.map((c) => h`<th scope="col">${c}</th>`)}</tr></thead>
  <tbody>
    ${rows.map(
      ([first, ...rest]) =>
        h`<tr><th scope="row">${first}</th>${rest.map(
          (cell, i) => h`<td data-label="${cols[i + 1]}">${cell}</td>`,
        )}</tr>`,
    )}
  </tbody>
</table>
</div>`;
}

/** Questions and answers as native disclosure widgets (keyboard and screen-reader friendly, no JS). */
export function faqList(items, { level = 3 } = {}) {
  const tag = raw(`h${level}`);
  return h`<div class="faqs">
  ${items.map(
    (it) => h`<details class="faq">
    <summary><${tag} class="faq-q">${it.q}</${tag}>${icon('chevron-down', 'ico chev')}</summary>
    <div class="faq-a">${(Array.isArray(it.a) ? it.a : [it.a]).map((p) => h`<p>${md(p)}</p>`)}</div>
  </details>`,
  )}
</div>`;
}

export const tick = (text) => h`<li>${icon('check')}<span>${md(text)}</span></li>`;
export const crossItem = (text) => h`<li>${icon('cross')}<span>${md(text)}</span></li>`;

export const money = (n) => cedi(n);

/** Contact routes used on claims, contact and help pages: icon-row features. */
export function contactRoutes(CONTACT, { claim = false } = {}) {
  return h`<ul class="routes">
  <li>
    <span class="tile" aria-hidden="true">${icon('smartphone')}</span>
    <div><h3>Online</h3><p><a href="/account/">Sign in to your account</a>${claim ? ', open the policy and choose Make a claim. Upload photos and documents from your phone and follow the claim’s progress.' : ' to see your policies, proposals and certificates.'}</p></div>
  </li>
  <li>
    <span class="tile" aria-hidden="true">${icon('chat')}</span>
    <div><h3>WhatsApp</h3><p><a href="${CONTACT.whatsappUrl}" rel="noopener">${CONTACT.whatsappDisplay}</a>${claim ? '. Send your policy number, what happened and photos.' : ', for quick questions, renewals and claims.'}</p></div>
  </li>
  <li>
    <span class="tile" aria-hidden="true">${icon('phone')}</span>
    <div><h3>Phone</h3><p><a href="tel:${CONTACT.phoneTel}">${CONTACT.phoneRange}</a>, head office.</p></div>
  </li>
  <li>
    <span class="tile" aria-hidden="true">${icon('pin')}</span>
    <div><h3>Branch</h3><p>Any of our <a href="/branches/">13 branches</a>${claim ? ' can help you make a claim.' : ' can help with new cover, renewals and claims.'}</p></div>
  </li>
</ul>`;
}
