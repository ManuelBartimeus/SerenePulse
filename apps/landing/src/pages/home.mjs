// Home page: quick quote, cover comparison, products, buying online, claims, certificate check,
// branches and company. Sources are noted next to each block.
import { h } from '../lib/html.mjs';
import { asset, icon } from '../lib/layout.mjs';
import { coverComparison, productRow } from '../lib/components.mjs';
import { COMPANY, CONTACT } from '../content/site.mjs';
import { PRODUCTS, productByCode } from '../content/products.mjs';
import { BRANCHES, REGIONS } from '../content/branches.mjs';
import { COVERS, GOODS_BODIES, TARIFF_DATE, TRAVEL_ZONES, VEHICLE_TYPES } from '../content/motor.mjs';
import { slugify } from '../lib/html.mjs';

function quotePanel() {
  return h`<section class="quote" id="quote" aria-labelledby="quote-title">
  <div class="quote-head">
    <h2 id="quote-title">Get a price</h2>
    <p>No sign-in needed. It takes about a minute.</p>
  </div>
  <div class="tabs js-only" role="tablist" aria-label="Type of insurance">
    <button type="button" role="tab" id="tab-motor" aria-controls="panel-motor" aria-selected="true">Motor</button>
    <button type="button" role="tab" id="tab-travel" aria-controls="panel-travel" aria-selected="false" tabindex="-1">Travel</button>
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
      <button class="btn btn-primary btn-block" type="submit">Get my price</button>
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
        <button class="btn btn-quiet btn-sm" type="button" data-add-traveller>Add another traveller</button>
      </fieldset>
      <button class="btn btn-primary btn-block" type="submit">Get my price</button>
    </form>
    <div class="qq-result" data-result tabindex="-1" hidden></div>
  </div>
</section>`;
}

function productsBlock() {
  const personal = PRODUCTS.filter((p) => p.audience.includes('individual'));
  const businessCodes = ['MTR', 'FIR', 'WCA', 'PLI', 'GIT', 'MCG', 'CAR', 'BND'];
  const business = businessCodes.map(productByCode);
  const allBusiness = PRODUCTS.filter((p) => p.audience.includes('business')).length;
  return h`<section class="section" aria-labelledby="products-title">
  <div class="wrap">
    <h2 id="products-title" class="section-title">Insurance we offer</h2>
    <div class="two-lists">
      <section aria-labelledby="personal-title">
        <h3 id="personal-title" class="list-title">For you and your family</h3>
        <ul class="prod-list">${personal.map((p) => productRow(p, { level: 4 }))}</ul>
      </section>
      <section aria-labelledby="business-title">
        <h3 id="business-title" class="list-title">For your business</h3>
        <ul class="prod-list">${business.map((p) => productRow(p, { level: 4 }))}</ul>
        <p class="more-link"><a href="/insurance/#business">All ${allBusiness} business products${icon('arrow')}</a></p>
      </section>
    </div>
  </div>
</section>`;
}

export default function home() {
  const byRegion = REGIONS.map((r) => ({ ...r, branches: BRANCHES.filter((b) => b.region === r.id) }));
  const body = h`
<!-- Price: NIC minimum third-party tariff effective 16 Feb 2026 (DEFAULT_RATES, packages/proposals/src/rating.ts). -->
<section class="hero" aria-labelledby="hero-title">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <h1 id="hero-title">Motor and travel insurance you can price and buy online</h1>
      <p class="lede">
        Third party cover for a private car is <strong>GH₵ 557 a year</strong>, the National Insurance
        Commission’s tariff from ${TARIFF_DATE}. Get your exact price here, then fill in the proposal, confirm
        your identity and pay by mobile money or card.
      </p>
      <ul class="hero-facts">
        <li>Licensed by the National Insurance Commission</li>
        <li>${BRANCHES.length} branches in ${REGIONS.length} regions, from Takoradi to Tamale</li>
      </ul>
      <p class="hero-alt">
        Insuring a business, a building or a shipment? <a href="/insurance/#business">See business cover</a>
        or call <a href="tel:${CONTACT.phoneTel}">${CONTACT.phoneDisplay}</a>.
      </p>
    </div>
    ${quotePanel()}
  </div>
</section>

<!-- Cover wording: sereneinsurance.com /sections/product_details/1 -->
<section class="section section-alt" aria-labelledby="covers-title">
  <div class="wrap">
    <div class="section-head">
      <h2 id="covers-title" class="section-title">What each motor cover pays for</h2>
      <p>
        Third party only is the minimum the law allows on a Ghanaian road. It pays others, never you. If your
        car is worth more than you could easily replace, compare the other two.
      </p>
    </div>
    ${coverComparison('home-compare')}
    <p class="table-foot"><a href="/insurance/motor/#tariff">Third-party prices for every class of vehicle${icon('arrow')}</a></p>
  </div>
</section>

${productsBlock()}

<!-- Buying online: docs/sales/architecture.md. Payments are simulated until a gateway is connected. -->
<section class="section section-alt" aria-labelledby="buy-title">
  <div class="wrap">
    <h2 id="buy-title" class="section-title">How buying online works</h2>
    <ol class="steps">
      <li>
        <h3>See the price first</h3>
        <p>Motor, travel, home and personal accident are priced as you go. Other cover goes to an underwriter, who usually replies within one working day.</p>
      </li>
      <li>
        <h3>Fill in the proposal</h3>
        <p>Sign in with your phone number and a 6-digit SMS code. The questions are the ones on Serene’s paper form, and you can stop and carry on later.</p>
      </li>
      <li>
        <h3>Confirm it’s you, then sign</h3>
        <p>Give your Ghana Card number and take a photo of your face. We check both with the NIA, so we never need a picture of the card. Sign on the screen.</p>
      </li>
      <li>
        <h3>Pay and download</h3>
        <p>MTN MoMo, Telecel Cash, AirtelTigo Money or card. Your certificate is ready to download when the payment clears.</p>
      </li>
    </ol>
    <p class="notice">Online payment is in test mode while we connect our payment provider. Until it is live, pay at a branch or through your broker.</p>
  </div>
</section>

<!-- Claim principle: sereneinsurance.com /sections/pages/who-we-are -->
<section class="section" aria-labelledby="claims-title">
  <div class="wrap claims-split">
    <div>
      <h2 id="claims-title" class="section-title">Claims</h2>
      <blockquote class="principle">
        <p>“${COMPANY.claimPrinciple}”</p>
        <footer>Serene’s claim principle</footer>
      </blockquote>
      <p>Small motor claims, such as dents, scratches or a broken windscreen, should be settled within a day of you giving us the repair estimate.</p>
      <p><a class="btn btn-secondary" href="/claims/">How to claim and what to send</a></p>
    </div>
    <div>
      <h3 class="list-title">Report a claim</h3>
      <dl class="routes">
        <div><dt>${icon('arrow')}Online</dt><dd><a href="/account/">Sign in</a>, open the policy and choose Make a claim.</dd></div>
        <div><dt>${icon('chat')}WhatsApp</dt><dd><a href="${CONTACT.whatsappUrl}" rel="noopener">${CONTACT.whatsappDisplay}</a></dd></div>
        <div><dt>${icon('phone')}Phone</dt><dd><a href="tel:${CONTACT.phoneTel}">${CONTACT.phoneRange}</a></dd></div>
        <div><dt>${icon('pin')}In person</dt><dd>Any of our <a href="/branches/">${BRANCHES.length} branches</a></dd></div>
      </dl>
    </div>
  </div>
</section>

<section class="section section-alt" aria-labelledby="verify-title">
  <div class="wrap verify-split">
    <div>
      <h2 id="verify-title" class="section-title">Check a certificate</h2>
      <p>Police officers, garages and buyers of used cars can check that a Serene certificate is genuine and in force. Enter the number printed on it, or scan its QR code.</p>
      <form class="inline-form" action="/verify/" method="get">
        <div class="field">
          <label for="home-cert">Certificate number</label>
          <input id="home-cert" name="certificate" autocomplete="off" spellcheck="false" placeholder="C01-26-10001" />
        </div>
        <button class="btn btn-primary" type="submit">Check</button>
      </form>
    </div>
    <div class="ussd">
      <h3>Check the NIC motor sticker</h3>
      <p>Every motor policy is registered in the National Insurance Commission’s Motor Insurance Database. Dial this code and follow the prompts:</p>
      <p class="ussd-code"><a href="tel:*920*57%23">*920*57#</a></p>
    </div>
  </div>
</section>

<!-- Branches: sereneinsurance.com /contacts/branches -->
<section class="section" aria-labelledby="branches-title">
  <div class="wrap">
    <div class="section-head">
      <h2 id="branches-title" class="section-title">${BRANCHES.length} branches in ${REGIONS.length} regions</h2>
      <p>Every branch can help with new cover, renewals and claims. The head office is at ${CONTACT.headOffice.line1}, ${CONTACT.headOffice.line2}.</p>
    </div>
    <dl class="region-list">
      ${byRegion.map(
        (r) => h`<div>
        <dt>${r.name}</dt>
        <dd>${r.branches.map((b, i) => h`${i ? ', ' : ''}<a href="/branches/#${slugify(b.name)}">${b.name}</a>`)}</dd>
      </div>`,
      )}
    </dl>
    <p class="table-foot"><a href="/branches/">Addresses, phone numbers and directions${icon('arrow')}</a></p>
  </div>
</section>

<!-- Company: sereneinsurance.com /sections/pages/company-profile and /sections/pages/who-we-are -->
<section class="section section-alt" aria-labelledby="about-title">
  <div class="wrap about-split">
    <figure class="photo">
      <img src="${asset('tower800')}" srcset="${asset('tower480')} 480w, ${asset('tower800')} 800w" sizes="(min-width: 1024px) 480px, 100vw" width="800" height="584" loading="lazy" decoding="async" alt="SU Tower on Castle Road, Ridge, Accra, at dusk. Serene Insurance’s head office is on the fourth floor." />
      <figcaption>Head office, SU Tower, Ridge</figcaption>
    </figure>
    <div>
      <h2 id="about-title" class="section-title">About Serene Insurance</h2>
      <p>${COMPANY.legalName} was incorporated on ${COMPANY.incorporated}, received its commencement certificate on ${COMPANY.commencement} and has been in full operation since ${COMPANY.fullOperations}. We are a member of the ${COMPANY.group}, and ${COMPANY.licence.charAt(0).toLowerCase()}${COMPANY.licence.slice(1)}</p>
      <p class="reinsurers"><span>Reinsured by</span> ${COMPANY.reinsurers.join(', ')}.</p>
      <p class="link-row"><a href="/about/">More about the company</a> <a href="/customerfeedback">Tell us how we did</a></p>
    </div>
  </div>
</section>`;
  return {
    path: '/',
    title: 'Serene Insurance | Motor, travel, property and business insurance in Ghana',
    description:
      'Get a motor or travel insurance price online in Ghana. Third party for a private car from GH₵ 557 a year. Licensed by the NIC, 13 branches in 7 regions.',
    body,
  };
}
