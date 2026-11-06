// Home page, in the order of docs/site/design-system.md ("Home-page order"): split hero carousel, the
// quick quote band, quick links, products for you and for your business, how buying online works,
// the motor cover comparison, the claims promise, why Serene with a navy facts band, branches and the
// certificate check, and a closing call to action. Sources are noted next to each block.
import { h, slugify } from '../lib/html.mjs';
import { icon } from '../lib/layout.mjs';
import { photo } from '../lib/photos.mjs';
import { coverComparison, productCard, quickLink, sectionHead } from '../lib/components.mjs';
import { COMPANY, CONTACT } from '../content/site.mjs';
import { productByCode } from '../content/products.mjs';
import { BRANCHES, REGIONS } from '../content/branches.mjs';
import {
  COVERS,
  GOODS_BODIES,
  TARIFF_DATE,
  TPPD_LIMIT,
  TRAVEL_ZONES,
  VEHICLE_TYPES,
} from '../content/motor.mjs';
import { cedi } from '../lib/html.mjs';

// ---- Hero ----------------------------------------------------------------------------------------
const SLIDES = [
  {
    slot: 'hero',
    mobile: 'hero-mobile',
    tag: 'h1',
    title: 'Motor insurance you can price and buy online',
    lede: `Third party cover for a private car is GH₵ 557 a year, the National Insurance Commission’s tariff from ${TARIFF_DATE}. See your price in about a minute, then pay by mobile money or card.`,
    actions: [
      ['Get a quote', '#quote', 'btn-light'],
      ['Buy motor insurance', '/account/buy?product=MTR', 'btn-ghost'],
    ],
  },
  {
    slot: 'business',
    tag: 'h2',
    title: 'Insurance for your home and your business',
    lede: 'Home insurance is priced online. Fire, burglary, liability, marine, engineering and bonds are priced by an underwriter, usually within one working day.',
    actions: [
      ['Insure your home', '/insurance/home/', 'btn-light'],
      ['Business insurance', '/insurance/#business', 'btn-ghost'],
    ],
  },
  {
    slot: 'claims',
    tag: 'h2',
    title: 'Make a claim online, on WhatsApp or at a branch',
    lede: 'No claim should wait in our books more than one week after we receive your last document. Anyone can check that a Serene certificate is genuine.',
    actions: [
      ['Make a claim', '/claims/', 'btn-light'],
      ['Check a certificate', '/verify/', 'btn-ghost'],
    ],
  },
];

function hero() {
  const n = SLIDES.length;
  return h`<section class="hero" aria-roledescription="carousel" aria-label="Highlights" data-carousel>
  <div class="hero-track" data-track>
    ${SLIDES.map(
      (
        s,
        i,
      ) => h`<div class="slide${i === 0 ? ' is-current' : ''}" id="slide-${i + 1}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${n}" data-slide>
      <div class="slide-panel">
        <div class="slide-copy">
          <span class="bar bar-yellow" aria-hidden="true"></span>
          ${s.tag === 'h1' ? h`<h1 class="slide-title">${s.title}</h1>` : h`<h2 class="slide-title">${s.title}</h2>`}
          <p class="slide-lede">${s.lede}</p>
          <div class="slide-actions">
            ${s.actions.map(([label, href, cls]) => h`<a class="btn btn-lg ${cls}" href="${href}">${label}</a>`)}
          </div>
        </div>
      </div>
      <div class="slide-media">
        ${photo(s.slot, { eager: i === 0, mobile: s.mobile, sizes: '(min-width: 1024px) 50vw, 100vw', ratio: [138, 100], cls: 'img' })}
      </div>
    </div>`,
    )}
  </div>
  <div class="hero-controls js-only">
    <button class="hero-arrow" type="button" data-prev>${icon('chevron-left')}<span class="sr-only">Previous slide</span></button>
    <div class="hero-dots">
      ${SLIDES.map(
        (s, i) =>
          h`<button class="hero-dot" type="button" data-dot="${i}" aria-controls="slide-${i + 1}"${i === 0 ? h` aria-current="true"` : ''}><span class="sr-only">Show slide ${i + 1} of ${n}: ${s.title}</span></button>`,
      )}
    </div>
    <button class="hero-arrow" type="button" data-next>${icon('chevron-right')}<span class="sr-only">Next slide</span></button>
  </div>
</section>`;
}

// ---- Quick quote ---------------------------------------------------------------------------------
function quoteCard() {
  return h`<div class="quote-card" aria-labelledby="quote-title">
  <div class="tabs js-only" role="tablist" aria-label="Type of insurance">
    <button type="button" role="tab" id="tab-motor" aria-controls="panel-motor" aria-selected="true">${icon('car')}Motor</button>
    <button type="button" role="tab" id="tab-travel" aria-controls="panel-travel" aria-selected="false" tabindex="-1">${icon('plane')}Travel</button>
  </div>

  <div class="tab-panel" id="panel-motor" role="tabpanel" aria-labelledby="tab-motor">
    <form class="qq" data-product="MTR" action="/account/buy" method="get" novalidate>
      <input type="hidden" name="product" value="MTR" />
      <div class="field">
        <label for="m-vehicle">Your vehicle</label>
        <select id="m-vehicle" name="vehicle">
          ${VEHICLE_TYPES.map(
            (v) =>
              h`<option value="${v.value}" data-use="${v.use}" data-body="${v.body}" data-tpo="${v.tpo}"${v.seats ? h` data-seats="true"` : ''}${v.goods ? h` data-goods="true"` : ''}>${v.label}</option>`,
          )}
        </select>
      </div>
      <div class="field" data-show="seats" hidden>
        <label for="m-seats">Seats, including the driver</label>
        <input id="m-seats" name="seats" type="number" inputmode="numeric" min="6" max="60" value="15" aria-describedby="m-seats-hint" />
        <p class="hint" id="m-seats-hint">Over 23 seats is priced by an underwriter.</p>
      </div>
      <div class="field" data-show="goods" hidden>
        <label for="m-body">Type of vehicle</label>
        <select id="m-body" name="body">
          ${GOODS_BODIES.map(([v, l]) => h`<option value="${v}">${l}</option>`)}
        </select>
      </div>
      <fieldset class="field choices">
        <legend>Cover</legend>
        ${COVERS.map(
          (c, i) => h`<label class="choice">
          <input type="radio" name="cover_type" value="${c.value}"${i === 0 ? h` checked` : ''} />
          <span><strong>${c.name}</strong><span class="hint">${c.short}</span></span>
        </label>`,
        )}
      </fieldset>
      <div class="field-row" data-show="own-damage" hidden>
        <div class="field">
          <label for="m-value">Vehicle value (GH₵)</label>
          <input id="m-value" name="value" inputmode="numeric" autocomplete="off" aria-describedby="m-value-hint" />
          <p class="hint" id="m-value-hint">What it would cost to replace today.</p>
        </div>
        <div class="field">
          <label for="m-year">Year of make</label>
          <input id="m-year" name="year" type="number" inputmode="numeric" min="1970" max="2027" />
        </div>
      </div>
      <div class="field">
        <label for="m-start">Cover starts</label>
        <input id="m-start" name="start" type="date" aria-describedby="m-start-hint" />
        <p class="hint" id="m-start-hint">Up to 60 days ahead. Cover runs for a year.</p>
      </div>
      <button class="btn btn-primary btn-lg btn-block" type="submit">Get my price</button>
      <p class="nojs-note">Without JavaScript this button opens the proposal form, where you get the same price.</p>
    </form>
    <div class="qq-result" data-result tabindex="-1" hidden></div>
  </div>

  <div class="tab-panel js-only" id="panel-travel" role="tabpanel" aria-labelledby="tab-travel" hidden>
    <form class="qq" data-product="TRV" novalidate>
      <div class="field">
        <label for="t-zone">Where are you going?</label>
        <select id="t-zone" name="destination_zone">
          ${TRAVEL_ZONES.map(([v, l]) => h`<option value="${v}">${l}</option>`)}
        </select>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="t-start">Leaving Ghana</label>
          <input id="t-start" name="start" type="date" />
        </div>
        <div class="field">
          <label for="t-end">Back in Ghana</label>
          <input id="t-end" name="end" type="date" />
        </div>
      </div>
      <fieldset class="field travellers">
        <legend>Dates of birth of everyone travelling</legend>
        <ol class="traveller-list" data-travellers>
          <li class="traveller">
            <label for="t-dob-0">You</label>
            <input id="t-dob-0" type="date" data-dob />
          </li>
        </ol>
        <button class="btn btn-outline btn-sm" type="button" data-add-traveller>Add another traveller</button>
      </fieldset>
      <button class="btn btn-primary btn-lg btn-block" type="submit">Get my price</button>
    </form>
    <div class="qq-result" data-result tabindex="-1" hidden></div>
  </div>
</div>`;
}

// Price: NIC minimum third-party tariff effective 16 Feb 2026 (DEFAULT_RATES, packages/proposals/src/rating.ts).
function quoteBand() {
  return h`<section class="section section-tint quote-band" id="quote" aria-labelledby="quote-title">
  <div class="wrap quote-grid">
    <div class="quote-side">
    <div class="quote-intro">
      <span class="bar" aria-hidden="true"></span>
      <h2 id="quote-title" class="section-title">Get a motor or travel price</h2>
      <p class="section-lede">No sign-in needed. Motor prices use the National Insurance Commission’s tariff, so what you see is what you pay for third party cover.</p>
    </div>
    <ul class="quote-facts">
      <li>${icon('check')}<span>Third party for a private car from <strong>GH₵ 557</strong> a year, a motorcycle from <strong>GH₵ 331</strong></span></li>
      <li>${icon('check')}<span>Pay by MTN MoMo, Telecel Cash, AirtelTigo Money or card</span></li>
      <li>${icon('check')}<span>Your certificate is ready to download when the payment clears</span></li>
      <li>${icon('check')}<span>Prefer to talk? Call <a href="tel:${CONTACT.phoneTel}">${CONTACT.phoneDisplay}</a> or visit a branch</span></li>
    </ul>
    </div>
    ${quoteCard()}
  </div>
</section>`;
}

// ---- Products --------------------------------------------------------------------------------------
function personal() {
  const cards = [
    {
      p: productByCode('MTR'),
      slot: 'motor',
      title: 'Motor insurance',
      text: 'Third party only, third party fire & theft, or comprehensive, for cars, motorbikes and commercial vehicles.',
      note: 'Instant price online, from GH₵ 557 a year',
      quote: '/#quote',
    },
    {
      p: productByCode('TRV'),
      slot: 'travel',
      title: 'Travel insurance',
      text: 'Emergency medical cover, evacuation and baggage, accepted for Schengen visa applications.',
      quote: '/?quote=travel#quote',
    },
    { p: productByCode('HMF'), slot: 'home', title: 'Home insurance' },
    { p: productByCode('PAC'), slot: 'health' },
  ];
  return h`<section class="section" aria-labelledby="personal-title">
  <div class="wrap">
    ${sectionHead({ id: 'personal-title', title: 'Insurance for you', lede: 'Cover for you, your family, your car and your home. Motor, travel, home and personal accident are priced as you go.', more: ['All personal insurance', '/insurance/#personal'] })}
    <ul class="pcards">${cards.map(productCard)}</ul>
  </div>
</section>`;
}

function business() {
  const cards = [
    {
      p: productByCode('MTR'),
      slot: 'transport',
      title: 'Commercial vehicles and fleets',
      text: 'Taxis, trotros, goods vehicles and company cars, on the NIC tariff or comprehensive.',
      note: 'Instant price online for most vehicles',
      quote: '/#quote',
    },
    { p: productByCode('FIR'), slot: 'property', title: 'Fire & property' },
    { p: productByCode('MCG'), slot: 'marine' },
    {
      p: productByCode('CAR'),
      slot: 'engineering',
      title: 'Engineering and construction',
      text: 'Contractors’ all risks, erection all risks, plant and machinery, and electronic equipment.',
    },
  ];
  const more = ['PLI', 'WCA', 'GPA', 'BIN', 'CYB', 'BND'].map(productByCode);
  return h`<section class="section section-line" aria-labelledby="business-title">
  <div class="wrap">
    ${sectionHead({ id: 'business-title', title: 'Insurance for your business', lede: 'For companies, partnerships, institutions and sole traders. Apply online and an underwriter sends your price, usually within one working day.', more: ['All business insurance', '/insurance/#business'] })}
    <ul class="pcards">${cards.map(productCard)}</ul>
    <div class="more-cover">
      <h3>Also for businesses</h3>
      <ul>${more.map((p) => h`<li><a href="/insurance/${p.slug}/">${p.name}${icon('chevron-right')}</a></li>`)}</ul>
    </div>
  </div>
</section>`;
}

// Buying online: docs/sales/architecture.md. Payments are simulated until a gateway is connected.
function buying() {
  const steps = [
    [
      'calculator',
      'See the price first',
      'Motor, travel, home and personal accident are priced as you go. Other cover goes to an underwriter, who usually replies within one working day.',
    ],
    [
      'file',
      'Fill in the proposal',
      'Sign in with your phone number and a 6-digit SMS code. The questions are the ones on Serene’s paper form, and you can stop and carry on later.',
    ],
    [
      'idcard',
      'Confirm it’s you, then sign',
      'Give your Ghana Card number and take a photo of your face. We check both with the NIA, so we never need a picture of the card. Sign on the screen.',
    ],
    [
      'wallet',
      'Pay and download',
      'MTN MoMo, Telecel Cash, AirtelTigo Money or card. Your certificate is ready to download when the payment clears.',
    ],
  ];
  return h`<section class="section section-tint" aria-labelledby="buy-title">
  <div class="wrap buy-grid">
    <div class="buy-media">${photo('app', { sizes: '(min-width: 1280px) 400px, (min-width: 1024px) 32vw, 100vw', ratio: [4, 5] })}</div>
    <div class="buy-main">
      ${sectionHead({ id: 'buy-title', title: 'How buying online works', lede: 'Four steps from price to certificate, on your phone or a computer.' })}
      <ol class="steps">
        ${steps.map(
          ([ico, t, d], i) => h`<li>
          <span class="step-num" aria-hidden="true">${i + 1}</span>
          <div>
            <h3>${t}</h3>
            <p>${d}</p>
          </div>
          ${icon(ico, 'ico step-ico')}
        </li>`,
        )}
      </ol>
      <p class="callout">Online payment is in test mode while we connect our payment provider. Until it is live, pay at a branch or through your broker.</p>
    </div>
  </div>
</section>`;
}

// Cover wording: sereneinsurance.com /sections/product_details/1
function compare() {
  return h`<section class="section" aria-labelledby="covers-title">
  <div class="wrap">
    ${sectionHead({ id: 'covers-title', title: 'What each motor cover pays for', lede: 'Third party only is the minimum the law allows on a Ghanaian road. It pays others, never you. If your car is worth more than you could easily replace, compare the other two.', more: ['Prices for every vehicle', '/insurance/motor/#tariff'] })}
    ${coverComparison('home-compare')}
  </div>
</section>`;
}

// Claim principle: sereneinsurance.com /sections/pages/who-we-are
function claimsFeature() {
  return h`<section class="section section-grey" aria-labelledby="claims-title">
  <div class="wrap">
    ${sectionHead({ id: 'claims-title', title: 'Claims', lede: 'Tell us as soon as something happens, the way that suits you.' })}
    <article class="feature" aria-labelledby="promise-title">
      <div class="feature-media">${photo('claims', { sizes: '(min-width: 1280px) 608px, (min-width: 1024px) 48vw, 100vw', ratio: [17, 10] })}</div>
      <div class="feature-body">
        <span class="bar" aria-hidden="true"></span>
        <h3 id="promise-title" class="feature-title">One week after your last document</h3>
        <blockquote class="principle">
          <p>“${COMPANY.claimPrinciple}”</p>
          <footer>Serene’s claim principle</footer>
        </blockquote>
        <p>Small motor claims, such as dents, scratches or a broken windscreen, should be settled within a day of you giving us the repair estimate.</p>
        <ul class="claim-ways">
          <li>${icon('smartphone')}<span><a href="/account/">Sign in</a>, open the policy and choose Make a claim</span></li>
          <li>${icon('chat')}<span>WhatsApp <a href="${CONTACT.whatsappUrl}" rel="noopener">${CONTACT.whatsappDisplay}</a></span></li>
          <li>${icon('phone')}<span>Call <a href="tel:${CONTACT.phoneTel}">${CONTACT.phoneRange}</a></span></li>
          <li>${icon('pin')}<span>Any of our <a href="/branches/">${BRANCHES.length} branches</a></span></li>
        </ul>
        <div class="feature-actions">
          <a class="btn btn-primary" href="/claims/">How to claim and what to send</a>
          <a class="btn btn-outline" href="${CONTACT.whatsappUrl}" rel="noopener">${icon('chat')}Claim on WhatsApp</a>
        </div>
      </div>
    </article>
  </div>
</section>`;
}

// Company: sereneinsurance.com /sections/pages/company-profile and /sections/pages/who-we-are
function why() {
  const items = [
    [
      'badge',
      'Licensed by the NIC',
      'The National Insurance Commission licenses Serene for general (non-life) insurance business in Ghana.',
    ],
    [
      'globe',
      'Reinsured',
      `${COMPANY.reinsurers.slice(0, -1).join(', ')} and ${COMPANY.reinsurers.at(-1)} share our large risks, so a big loss can be paid in full.`,
    ],
    [
      'pin',
      `${BRANCHES.length} branches in ${REGIONS.length} regions`,
      'From Takoradi to Tamale. Every branch handles new cover, renewals and claims.',
    ],
    [
      'landmark',
      'GH₵ 59 million capital',
      'Raised against the National Insurance Commission’s GH₵ 50 million minimum for general insurers.',
    ],
  ];
  return h`<section class="section" aria-labelledby="why-title">
  <div class="wrap">
    ${sectionHead({ id: 'why-title', title: 'Why insure with Serene', more: ['About the company', '/about/'] })}
    <ul class="features">
      ${items.map(
        ([ico, t, d]) => h`<li>
        ${icon(ico, 'ico feat-ico')}
        <h3>${t}</h3>
        <p>${d}</p>
      </li>`,
      )}
    </ul>
  </div>
</section>`;
}

// Facts: NIC tariff (content/motor.mjs), TPPD limit (sales_tppd_limit), claim principle and small motor
// claims (sereneinsurance.com /sections/pages/who-we-are).
function facts() {
  const items = [
    ['GH₵ 557', 'a year for third party cover on a private car'],
    [cedi(TPPD_LIMIT), 'paid for damage to other people’s property in any one accident'],
    ['1 week', 'to settle a claim after your last document, under our claim principle'],
    ['1 day', 'for small motor claims, once you give us the repair estimate'],
  ];
  return h`<section class="section section-navy" aria-labelledby="facts-title">
  <div class="wrap">
    <div class="facts-head">
      <span class="bar bar-yellow" aria-hidden="true"></span>
      <h2 id="facts-title" class="section-title">Motor prices and claim times</h2>
    </div>
    <dl class="stats">
      ${items.map(([n, d]) => h`<div><dt>${n}</dt><dd>${d}</dd></div>`)}
    </dl>
    <p class="stats-source">Third-party price: National Insurance Commission tariff from ${TARIFF_DATE}.</p>
  </div>
</section>`;
}

// Branches: sereneinsurance.com /contacts/branches
function branchesAndVerify() {
  const byRegion = REGIONS.map((r) => ({ ...r, branches: BRANCHES.filter((b) => b.region === r.id) }));
  return h`<section class="section section-tint" aria-labelledby="branches-title">
  <div class="wrap split">
    <div>
      ${sectionHead({ id: 'branches-title', title: `${BRANCHES.length} branches in ${REGIONS.length} regions`, lede: `Every branch can help with new cover, renewals and claims. The head office is at ${CONTACT.headOffice.line1}, ${CONTACT.headOffice.line2}.` })}
      <dl class="region-list">
        ${byRegion.map(
          (r) => h`<div>
          <dt>${r.name}</dt>
          <dd><ul class="chips">${r.branches.map((b) => h`<li><a href="/branches/#${slugify(b.name)}">${b.name}</a></li>`)}</ul></dd>
        </div>`,
        )}
      </dl>
      <p><a class="btn btn-outline" href="/branches/">${icon('pin')}Addresses and directions</a></p>
    </div>
    <div class="card verify-card" aria-labelledby="verify-title">
      <span class="tile" aria-hidden="true">${icon('shield-check')}</span>
      <h2 id="verify-title" class="card-title">Check a certificate</h2>
      <p>Police officers, garages and buyers of used cars can check that a Serene certificate is genuine and in force.</p>
      <form class="inline-form" action="/verify/" method="get">
        <div class="field">
          <label for="home-cert">Certificate number</label>
          <input id="home-cert" name="certificate" autocomplete="off" spellcheck="false" placeholder="C01-26-10001" />
        </div>
        <button class="btn btn-primary" type="submit">Check</button>
      </form>
      <div class="ussd">
        <h3>Check any vehicle’s NIC sticker</h3>
        <p>Dial <a class="ussd-code" href="tel:*920*57%23">*920*57#</a> and enter the registration number.</p>
      </div>
    </div>
  </div>
</section>`;
}

function closing() {
  return h`<section class="section section-navy cta-band" aria-labelledby="cta-title">
  <div class="wrap cta-grid">
    <div>
      <span class="bar bar-yellow" aria-hidden="true"></span>
      <h2 id="cta-title" class="section-title">Get a price, or talk to us</h2>
      <p>Call ${CONTACT.phoneRange} or WhatsApp ${CONTACT.whatsappDisplay}. We are open ${CONTACT.hours[0][0]} ${CONTACT.hours[0][1]} and ${CONTACT.hours[1][0]} ${CONTACT.hours[1][1]}.</p>
    </div>
    <div class="cta-actions">
      <a class="btn btn-lg btn-yellow" href="#quote">Get a quote</a>
      <a class="btn btn-lg btn-ghost" href="${CONTACT.whatsappUrl}" rel="noopener">${icon('chat')}WhatsApp us</a>
    </div>
  </div>
</section>`;
}

function quickLinks() {
  const items = [
    {
      ico: 'car',
      title: 'Buy motor insurance',
      text: 'Third party from GH₵ 557 a year. Price it, sign and pay online.',
      href: '/account/buy?product=MTR',
    },
    {
      ico: 'renew',
      title: 'Renew a policy',
      text: 'Sign in with your phone number and renew your cover in one step.',
      href: '/account/',
      cta: 'Sign in to renew',
    },
    {
      ico: 'file',
      title: 'Make a claim',
      text: 'Online, on WhatsApp, by phone or at any branch. See what to send.',
      href: '/claims/',
    },
    {
      ico: 'shield-check',
      title: 'Check a certificate',
      text: 'Confirm that a Serene certificate is genuine and in force today.',
      href: '/verify/',
    },
  ];
  return h`<section class="section" aria-labelledby="quick-title">
  <div class="wrap">
    ${sectionHead({ id: 'quick-title', title: 'Quick links' })}
    <ul class="qlinks">${items.map(quickLink)}</ul>
  </div>
</section>`;
}

export default function home() {
  const body = h`
${hero()}
${quoteBand()}
${quickLinks()}
${personal()}
${business()}
${buying()}
${compare()}
${claimsFeature()}
${why()}
${facts()}
${branchesAndVerify()}
${closing()}`;
  return {
    path: '/',
    title: 'Serene Insurance | Motor, travel, property and business insurance in Ghana',
    description:
      'Get a motor or travel insurance price online in Ghana. Third party for a private car from GH₵ 557 a year. Licensed by the NIC, 13 branches in 7 regions.',
    body,
  };
}
