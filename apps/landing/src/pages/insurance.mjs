// /insurance/ (all products) and /insurance/<slug>/ (one page per product in PRODUCTS).
import { h, md, raw, cedi } from '../lib/html.mjs';
import { icon } from '../lib/layout.mjs';
import { photo } from '../lib/photos.mjs';
import {
  buyUrl,
  coverComparison,
  crossItem,
  faqList,
  priceLine,
  productRow,
  productSlot,
  stackTable,
  tick,
} from '../lib/components.mjs';
import { CATEGORY_LABELS, PRODUCTS } from '../content/products.mjs';
import { DOCUMENTS } from '../content/documents.mjs';
import { CLAIM_TYPES, claimAnchor } from '../content/claims.mjs';
import { SHORT_PERIOD, TARIFF_DATE, TPO_TARIFF, TPPD_LIMIT, TRAVEL_ZONES } from '../content/motor.mjs';
import { CONTACT } from '../content/site.mjs';
import { fileInfo } from '../lib/files.mjs';

const ORDER = [
  'motor',
  'travel',
  'property',
  'accident',
  'liability',
  'financial',
  'marine',
  'engineering',
  'bonds',
];

function grouped(audience) {
  const list = PRODUCTS.filter((p) => p.audience.includes(audience));
  return ORDER.map((cat) => [cat, list.filter((p) => p.category === cat)]).filter(([, l]) => l.length);
}

export function insuranceIndex() {
  const section = (
    id,
    title,
    intro,
    audience,
  ) => h`<section class="section${audience === 'business' ? ' section-grey' : ''}" id="${id}" aria-labelledby="${id}-title">
  <div class="wrap">
    <div class="section-head"><div class="section-head-text">
      <span class="bar" aria-hidden="true"></span>
      <h2 id="${id}-title" class="section-title">${title}</h2>
      <p class="section-lede">${intro}</p>
    </div></div>
    <ul class="prods">${grouped(audience).flatMap(([cat, list]) => list.map((p) => productRow(p, { level: 3, overline: CATEGORY_LABELS[cat] })))}</ul>
  </div>
</section>`;
  const nPersonal = PRODUCTS.filter((p) => p.audience.includes('individual')).length;
  const nBusiness = PRODUCTS.filter((p) => p.audience.includes('business')).length;
  const body = h`${section('personal', 'Personal insurance', 'For you, your family, your car and your home.', 'individual')}
${section('business', 'Business insurance', 'For companies, partnerships, institutions and sole traders. Motor, fire and professional indemnity appear in both lists.', 'business')}`;
  return {
    path: '/insurance/',
    title: 'Insurance products',
    description: `All ${PRODUCTS.length} Serene Insurance products for individuals and businesses in Ghana: motor, travel, home, fire, liability, marine, engineering and bonds.`,
    section: 'Personal',
    crumbs: [['Insurance', '/insurance/']],
    band: {
      title: 'Insurance products',
      lede: h`All ${PRODUCTS.length} of Serene’s products can be applied for online. Four get an instant price; the rest are priced by an underwriter, usually within one working day. Prefer paper? Every proposal form is on the <a href="/downloads/">downloads page</a>.`,
      meta: h`<nav class="jump" aria-label="On this page">
        <a class="btn btn-outline" href="#personal">${icon('user')}Personal (${nPersonal})</a>
        <a class="btn btn-outline" href="#business">${icon('briefcase')}Business (${nBusiness})</a>
      </nav>`,
    },
    body,
  };
}

function identityBlock(kind) {
  const individual = h`<p>You give your <strong>Ghana Card number</strong> and take a <strong>live photo of your face</strong> with your phone. Serene checks both with the National Identification Authority. Under L.I. 2523 we cannot ask for a photo or copy of the card, so we never do. Foreign nationals without a Ghana Card upload their passport photo page instead.</p>`;
  const business = h`<p>Upload the company’s <strong>certificate of incorporation or business registration</strong>. The person signing for the company gives their <strong>Ghana Card number</strong> and a <strong>live photo of their face</strong>, which Serene checks with the National Identification Authority. We never ask for a picture of the card.</p>`;
  return h`<div class="callout">
  <h3>Identity check</h3>
  ${kind === 'business' ? business : kind === 'either' ? h`<p><strong>If you apply as an individual:</strong></p>${individual}<p><strong>If you apply as a company:</strong></p>${business}` : individual}
</div>`;
}

function documentsBlock(p) {
  const d = DOCUMENTS[p.code];
  const rows = d.documents.map((doc) => [
    doc.label,
    doc.required
      ? doc.when
        ? `Required ${doc.when}`
        : 'Required'
      : doc.when
        ? `Optional, ${doc.when}`
        : 'Optional',
  ]);
  return h`<section id="documents" aria-labelledby="documents-title">
  <h2 id="documents-title">Documents you’ll need</h2>
  <p>Have these ready as photos or PDFs (up to 10 MB each). The online form asks only for the ones that apply to your answers.</p>
  ${rows.length ? stackTable({ caption: `Documents for ${p.name}`, cols: ['Document', 'When'], rows, className: 'docs' }) : ''}
  ${identityBlock(d.identity)}
</section>`;
}

function pricingBlock(p) {
  const instant = p.purchase === 'instant';
  return h`<section id="pricing" aria-labelledby="pricing-title">
  <h2 id="pricing-title">How pricing works</h2>
  ${
    instant
      ? h`<p><strong>Instant price online.</strong> ${p.pricing?.basis ?? ''}</p>`
      : h`<p><strong>Priced by an underwriter, usually within one working day.</strong> Submit the proposal online with the documents below. An underwriter reviews it and sends you a price, or asks for anything missing. You see the price in your account and pay online if you accept it. Complex or large risks can take longer, and the underwriter may ask to inspect.</p>`
  }
  ${p.category !== 'motor' ? h`<p>Quotes for this product show VAT (15%), the NHIL (2.5%) and the GETFund levy (2.5%) as separate lines. A quote is valid for 30 days.</p>` : h`<p>Motor insurance is exempt from VAT. A quote is valid for 30 days.</p>`}
</section>`;
}

function motorExtras() {
  return h`<section id="compare" aria-labelledby="compare-title">
  <h2 id="compare-title">What each cover pays for</h2>
  ${coverComparison('motor-compare')}
</section>

<!-- Tariff: NIC minimum third-party premiums effective 16 Feb 2026 (DEFAULT_RATES.motor.tpo, packages/proposals/src/rating.ts; InsureGhana 13 Feb 2026, RMAS broker). -->
<section id="tariff" aria-labelledby="tariff-title">
  <h2 id="tariff-title">Third-party prices by class of vehicle</h2>
  <p>Third party premiums are set by the National Insurance Commission by how a vehicle is used, not by engine size. These are the yearly minimums from ${TARIFF_DATE}. Every insurer in Ghana charges at least this.</p>
  ${stackTable({
    caption: `NIC third-party motor tariff from ${TARIFF_DATE}, per vehicle per year`,
    cols: ['Class of vehicle', 'Per year', 'Notes'],
    rows: TPO_TARIFF.map(([label, amount, note]) => [label, cedi(amount), note]),
    className: 'tariff',
  })}
  <figure class="inline-figure">
    ${photo('motorcycle', { sizes: '(min-width: 1280px) 640px, (min-width: 1024px) 50vw, 100vw', ratio: [3, 2] })}
    <figcaption>Third party only for a motorcycle is ${cedi(331)} a year, and ${cedi(431)} for a tricycle or aboboyaa.</figcaption>
  </figure>
  <p class="source">Source: National Insurance Commission motor tariff effective ${TARIFF_DATE}. Agricultural vehicles and buses over 23 seats are priced by an underwriter.</p>
</section>

<section id="limits" aria-labelledby="limits-title">
  <h2 id="limits-title">Limits, the Brown Card and short covers</h2>
  <dl class="facts">
    <div>
      <dt>Damage to other people’s property</dt>
      <dd>Paid up to <strong>${cedi(TPPD_LIMIT)}</strong> for any one accident. You can buy a higher limit on the proposal form. Claims for injury or death of other people are paid up to the limits the National Insurance Commission sets.</dd>
    </div>
    <div>
      <dt>Driving outside Ghana</dt>
      <dd>Serene issues the <strong>ECOWAS Brown Card</strong>, the international motor certificate that extends third-party cover to other ECOWAS countries. Ask for it when you buy, before you travel.</dd>
    </div>
    <div>
      <dt>Covers shorter than a year</dt>
      <dd>Pick your own end date. Short covers are charged as a share of the yearly premium.</dd>
    </div>
  </dl>
  ${stackTable({
    caption: 'Short-period scale: share of the yearly premium charged',
    cols: ['Length of cover', 'Share of the yearly premium'],
    rows: SHORT_PERIOD,
    className: 'short',
    captionVisible: true,
  })}
</section>

<section id="accident" aria-labelledby="accident-title">
  <h2 id="accident-title">If you have an accident</h2>
  <ol class="numbered">
    <li><strong>Stop and make the scene safe.</strong> Switch on your hazard lights and help anyone who is hurt. Call 112 if anyone needs an ambulance or the fire service.</li>
    <li><strong>Report it to the police.</strong> The law requires you to report an accident involving injury. A police report is needed for most claims.</li>
    <li><strong>Take photos</strong> of the vehicles, number plates, the road and any damage, and write down the other driver’s name, phone number, registration and insurer.</li>
    <li><strong>Do not admit fault or promise to pay.</strong> Leave that to us.</li>
    <li><strong>Tell Serene as soon as you can</strong>, online, by WhatsApp on ${CONTACT.whatsappDisplay}, or at a branch. Do not start repairs until we have agreed the estimate.</li>
  </ol>
</section>`;
}

function travelExtras() {
  return h`<section id="zones" aria-labelledby="zones-title">
  <h2 id="zones-title">Destination zones</h2>
  ${stackTable({
    caption: 'Travel insurance zones',
    cols: ['Zone', 'Use it for'],
    rows: TRAVEL_ZONES.map(([v, l]) => [
      l,
      {
        africa: 'Trips within Africa, including ECOWAS countries.',
        schengen_europe:
          'Schengen visa applications and any trip within Europe. Medical cover of at least EUR 30,000.',
        worldwide_excl_us_ca: 'Asia, the Middle East and the rest of the world, not the USA or Canada.',
        worldwide_incl_us_ca: 'Any trip that includes the USA or Canada, even in transit.',
      }[v],
    ]),
  })}
</section>`;
}

function bondExtras(p) {
  return h`<section id="types" aria-labelledby="types-title">
  <h2 id="types-title">Bonds we issue</h2>
  <dl class="facts">
    ${p.bondTypes.map(([t, d]) => h`<div><dt>${t}</dt><dd>${d}</dd></div>`)}
  </dl>
</section>`;
}

function claimBlock(p) {
  const types = CLAIM_TYPES.filter((t) => p.claimTypes.includes(t.id));
  return h`<section id="claim" aria-labelledby="claim-title">
  <h2 id="claim-title">Making a claim</h2>
  <p>Tell us as soon as you can. You can claim online from your account, on WhatsApp, by phone or at any branch.</p>
  ${types.map(
    (t) => h`<div class="claim-type">
    <h3>${t.label}</h3>
    <p class="hint">${t.hint}</p>
    <ul class="checklist">
      ${t.documents.map(([label, req]) => h`<li>${label}${req ? '' : raw(' <span class="tag">optional</span>')}</li>`)}
    </ul>
  </div>`,
  )}
  <p><a class="see-all" href="/claims/#${claimAnchor(p)}">Full claims guidance${icon('chevron-right')}</a></p>
</section>`;
}

export function productPage(p) {
  const file = fileInfo(p.file);
  const related = PRODUCTS.filter((x) => x.category === p.category && x.code !== p.code).slice(0, 4);
  const section = p.audience.includes('individual') ? 'Personal' : 'Business';
  const toc = [
    p.covers.length ? ['covers', 'What it covers'] : p.bondTypes ? ['types', 'Bonds we issue'] : null,
    p.notCovered.length ? ['not-covered', 'Usually not covered'] : null,
    ['pricing', 'How pricing works'],
    p.slug === 'motor' ? ['tariff', 'Third-party prices'] : null,
    ['documents', 'Documents you’ll need'],
    ['questions', 'Questions'],
    ['claim', 'Making a claim'],
  ].filter(Boolean);

  const quick = p.code === 'MTR' || p.code === 'TRV';
  const body = h`<div class="wrap page-grid product-grid">
  <nav class="toc" aria-label="On this page">
    <p class="toc-title">On this page</p>
    <ul>${toc.map(([id, label]) => h`<li><a href="#${id}">${label}</a></li>`)}</ul>
  </nav>

  <div class="content">
    ${
      p.covers.length
        ? h`<section id="covers" aria-labelledby="covers-title">
      <h2 id="covers-title">What it covers</h2>
      <ul class="marks">${p.covers.map(tick)}</ul>
    </section>`
        : ''
    }
    ${p.bondTypes ? bondExtras(p) : ''}
    ${
      p.notCovered.length
        ? h`<section id="not-covered" aria-labelledby="not-covered-title">
      <h2 id="not-covered-title">Usually not covered</h2>
      <ul class="marks marks-no">${p.notCovered.map(crossItem)}</ul>
      <p class="hint">These are the main exclusions. Your policy wording lists them all, with any extensions you have added.</p>
    </section>`
        : ''
    }
    <section id="who" aria-labelledby="who-title">
      <h2 id="who-title">Who it’s for</h2>
      <p>${md(p.whoFor)}</p>
    </section>
    ${pricingBlock(p)}
    ${p.slug === 'motor' ? motorExtras() : ''}
    ${p.zones ? travelExtras() : ''}
    ${documentsBlock(p)}
    <section id="questions" aria-labelledby="questions-title">
      <h2 id="questions-title">Questions</h2>
      ${faqList(p.faqs)}
    </section>
    ${claimBlock(p)}
    ${
      related.length
        ? h`<section aria-labelledby="related-title" class="related">
      <h2 id="related-title">Related cover</h2>
      <ul class="related-list">${related.map((r) => h`<li><a class="related-card" href="/insurance/${r.slug}/"><span class="related-name">${r.name}${icon('chevron-right')}</span><span class="related-text">${r.summary}</span></a></li>`)}</ul>
    </section>`
        : ''
    }
  </div>

  <aside class="buy-box" aria-labelledby="buy-title">
    <h2 id="buy-title" class="buy-title">Apply online or on paper</h2>
    <p class="buy-price${p.purchase === 'instant' ? ' is-instant' : ''}">${icon(p.purchase === 'instant' ? 'calculator' : 'clock')}<span>${priceLine(p)}</span></p>
    ${p.slug === 'motor' ? h`<p class="buy-from">Third party from <strong>GH₵ 557</strong> a year for a private car</p>` : ''}
    <a class="btn btn-primary btn-block" href="${buyUrl(p.code)}">Start your proposal</a>
    ${quick ? h`<a class="btn btn-outline btn-block" href="${p.code === 'TRV' ? '/?quote=travel#quote' : '/#quote'}">Get a quick price</a>` : ''}
    <ul class="buy-links">
      <li><a href="/downloads/${p.file}" download>${icon('download')}<span>Download the paper form<span class="meta">${file.type}, ${file.size}</span></span></a></li>
      <li><a href="/claims/#${claimAnchor(p)}">${icon('file')}<span>Make a claim</span></a></li>
      <li><a href="tel:${CONTACT.phoneTel}">${icon('phone')}<span>Talk to us: ${CONTACT.phoneDisplay}</span></a></li>
    </ul>
  </aside>
</div>`;

  return {
    path: `/insurance/${p.slug}/`,
    title: p.name,
    description: `${p.summary} ${p.purchase === 'instant' ? 'Get an instant price and buy online' : 'Apply online and get a price from an underwriter'} with Serene Insurance, Ghana.`,
    section,
    crumbs: [
      ['Insurance', '/insurance/'],
      [p.name, `/insurance/${p.slug}/`],
    ],
    band: {
      title: p.name,
      lede: p.intro,
      meta: h`<p class="band-meta${p.purchase === 'instant' ? ' is-instant' : ''}">${icon(p.purchase === 'instant' ? 'calculator' : 'clock')}<span>${priceLine(p)}</span></p>`,
      actions: h`<a class="btn btn-primary btn-lg" href="${buyUrl(p.code)}">Start your proposal</a>${
        quick
          ? h`<a class="btn btn-outline btn-lg" href="${p.code === 'TRV' ? '/?quote=travel#quote' : '/#quote'}">Get a quick price</a>`
          : h`<a class="btn btn-outline btn-lg" href="/downloads/${p.file}" download>${icon('download')}Paper form<span class="sr-only"> (${file.type}, ${file.size})</span></a>`
      }`,
      photo: photo(productSlot(p), {
        eager: true,
        sizes: '(min-width: 1280px) 560px, (min-width: 1024px) 44vw, 100vw',
        ratio: [3, 2],
      }),
    },
    body,
  };
}
