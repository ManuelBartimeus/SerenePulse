// Building blocks shared by several pages.
import { h, md, raw, cedi } from './html.mjs';
import { icon } from './layout.mjs';
import { COVER_ROWS, COVERS } from '../content/motor.mjs';
import { claimAnchor } from '../content/claims.mjs';

export const buyUrl = (code) => `/account/buy?product=${code}`;

export const priceLine = (p) =>
  p.purchase === 'instant'
    ? 'Instant price online'
    : 'Priced by an underwriter, usually within one working day';

/** One product in a list: name, summary, how it is priced, and the three actions. */
export function productRow(p, { level = 3 } = {}) {
  const tag = raw(`h${level}`);
  return h`<li class="prod">
  <div class="prod-main">
    <${tag} class="prod-name"><a href="/insurance/${p.slug}/">${p.name}</a></${tag}>
    <p>${p.summary}</p>
  </div>
  <p class="prod-price${p.purchase === 'instant' ? ' is-instant' : ''}">${priceLine(p)}</p>
  <ul class="prod-links">
    <li><a href="${buyUrl(p.code)}">Get a quote<span class="sr-only"> for ${p.name}</span></a></li>
    <li><a href="/insurance/${p.slug}/">Cover details<span class="sr-only">: ${p.name}</span></a></li>
    <li><a href="/claims/#${claimAnchor(p)}">Make a claim<span class="sr-only"> on ${p.name}</span></a></li>
  </ul>
</li>`;
}

const mark = (v) =>
  v === true
    ? h`<span class="yes">${icon('check')}<span>Covered</span></span>`
    : v === false
      ? h`<span class="no">${icon('cross')}<span>Not covered</span></span>`
      : h`<span class="maybe">${v}</span>`;

/** The motor cover comparison: a table on wider screens, one list per cover on phones. */
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
  const cards = h`<div class="compare-cards">
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
 * A data table that becomes stacked label/value rows on phones (CSS reads data-label).
 * cols: [label, ...]; rows: arrays of cells (first cell is the row header).
 */
export function stackTable({ caption, cols, rows, className = '', captionVisible = false }) {
  return h`<table class="table stack ${className}">
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
</table>`;
}

/** Questions and answers as native disclosure widgets (keyboard and screen-reader friendly, no JS). */
export function faqList(items, { level = 3 } = {}) {
  const tag = raw(`h${level}`);
  return h`<div class="faqs">
  ${items.map(
    (it) => h`<details class="faq">
    <summary><${tag} class="faq-q">${it.q}</${tag}></summary>
    <div class="faq-a">${(Array.isArray(it.a) ? it.a : [it.a]).map((p) => h`<p>${md(p)}</p>`)}</div>
  </details>`,
  )}
</div>`;
}

export const tick = (text) => h`<li>${icon('check')}<span>${md(text)}</span></li>`;
export const crossItem = (text) => h`<li>${icon('cross')}<span>${md(text)}</span></li>`;

export const money = (n) => cedi(n);

/** Contact routes used on claims, contact and help pages. */
export function contactRoutes(CONTACT, { claim = false } = {}) {
  return h`<dl class="routes">
  <div>
    <dt>${icon('arrow')}Online</dt>
    <dd><a href="/account/">Sign in to your account</a>${claim ? ', open the policy and choose Make a claim. You can upload photos and documents from your phone and follow the claim’s progress.' : ' to see your policies, proposals and certificates.'}</dd>
  </div>
  <div>
    <dt>${icon('chat')}WhatsApp</dt>
    <dd><a href="${CONTACT.whatsappUrl}" rel="noopener">${CONTACT.whatsappDisplay}</a>${claim ? '. Send your policy number, what happened and photos.' : ''}</dd>
  </div>
  <div>
    <dt>${icon('phone')}Phone</dt>
    <dd><a href="tel:${CONTACT.phoneTel}">${CONTACT.phoneRange}</a>, head office</dd>
  </div>
  <div>
    <dt>${icon('pin')}Branch</dt>
    <dd>Any of our <a href="/branches/">13 branches</a>${claim ? ' can help you make a claim.' : ' can help with new cover, renewals and claims.'}</dd>
  </div>
</dl>`;
}
