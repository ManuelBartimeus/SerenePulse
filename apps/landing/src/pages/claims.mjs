// /claims/: Serene's claim principle (sereneinsurance.com /sections/pages/who-we-are), how to claim,
// online document checklists (CLAIM_TYPES, packages/proposals/src/claims.ts) and Serene's published
// paper checklists (/sections/pages/claims). Time limits are general guidance on Ghana's Limitation Act,
// 1972 (NRCD 54), not legal advice.
import { h, raw } from '../lib/html.mjs';
import { contactRoutes } from '../lib/components.mjs';
import { CLAIM_GROUPS, CLAIM_TYPES, PAPER_LISTS } from '../content/claims.mjs';
import { COMPANY, CONTACT } from '../content/site.mjs';

export default function claims() {
  const typeById = Object.fromEntries(CLAIM_TYPES.map((t) => [t.id, t]));
  const body = h`<div class="wrap page">

  <div class="claims-top">
    <section aria-labelledby="first-title" class="callout callout-strong">
      <h2 id="first-title">Straight after an accident, theft or loss</h2>
      <ul class="plain">
        <li>Make people and property safe. Call 112 for an ambulance, the police or the fire service.</li>
        <li>Report theft, burglary, robbery and road accidents to the police and keep the report number.</li>
        <li>Take photos before anything is moved or repaired, and keep damaged items.</li>
        <li>Do not admit fault or agree to pay anyone. We deal with the other side for you.</li>
      </ul>
    </section>
    <section aria-labelledby="how-title">
      <h2 id="how-title">Tell us</h2>
      ${contactRoutes(CONTACT, { claim: true })}
    </section>
  </div>

  <section class="section-block" aria-labelledby="steps-title">
    <h2 id="steps-title">What happens after you tell us</h2>
    <ol class="timeline">
      <li>
        <h3>We register the claim</h3>
        <p>You get a claim number. Online claims appear in your account straight away with the list of documents still needed.</p>
      </li>
      <li>
        <h3>You send the documents</h3>
        <p>Upload them, send them on WhatsApp, or bring them to a branch. The lists below show what each type of claim needs.</p>
      </li>
      <li>
        <h3>We assess it</h3>
        <p>A claims officer checks the cover and the documents. For larger losses we may appoint an assessor or loss adjuster to inspect. If we need anything else, we tell you what and why.</p>
      </li>
      <li>
        <h3>We settle</h3>
        <p>Once we have your last document we aim to settle within a week. Small motor claims such as dents, scratches or a broken windscreen should be settled within a day of the repair estimate.</p>
      </li>
    </ol>
    <p class="hint">Online claims show their status in your account: received, being assessed, we need more from you, approved, or paid.</p>
  </section>

  <section class="section-block two-col" aria-labelledby="who-title">
    <div>
      <h2 id="who-title">Who can claim</h2>
      <ul class="plain">
        <li><strong>The policyholder</strong>, or someone they authorise in writing.</li>
        <li><strong>Your broker or agent</strong>, on your behalf.</li>
        <li><strong>Other people you have injured or whose property you damaged</strong> can claim against your motor or liability policy. Give them your policy number; we handle their claim directly.</li>
        <li><strong>A named beneficiary or the administrator of an estate</strong>, for death claims under personal accident and workmen’s compensation.</li>
      </ul>
    </div>
    <div>
      <h2 id="time-title">Time limits</h2>
      <p><strong>Notify us immediately.</strong> Most policies require prompt notice, and a late report can make a claim harder to prove or reduce what we can pay.</p>
      <p>Separately, Ghana’s Limitation Act, 1972 (NRCD 54) sets how long a person has to bring a court claim. The usual periods are:</p>
      <dl class="facts facts-compact">
        <div><dt>Personal injury or death</dt><dd>3 years</dd></div>
        <div><dt>Damage to property, and contract</dt><dd>6 years</dd></div>
      </dl>
      <p class="hint">This is general guidance, not legal advice. Your policy’s conditions apply to claims under it.</p>
    </div>
  </section>

  <section class="section-block" id="documents" aria-labelledby="docs-title">
    <h2 id="docs-title">Documents for each type of claim</h2>
    <p>These are the documents the online claim form asks for. Optional items help us settle faster.</p>
    <div class="claim-groups">
      ${CLAIM_GROUPS.map(
        (g) => h`<section class="claim-group" id="${g.id}" aria-labelledby="${g.id}-title">
        <h3 id="${g.id}-title">${g.title}</h3>
        ${g.types.map((id) => {
          const t = typeById[id];
          return h`<div class="claim-type">
          <h4>${t.label}</h4>
          <p class="hint">${t.hint}</p>
          <ul class="checklist">
            ${t.documents.map(([label, req]) => h`<li>${label}${req ? '' : raw(' <span class="tag">optional</span>')}</li>`)}
          </ul>
        </div>`;
        })}
      </section>`,
      )}
    </div>
  </section>

  <section class="section-block" aria-labelledby="paper-title">
    <h2 id="paper-title">Claiming on a paper claim form</h2>
    <p>If you claim at a branch, these are the documents Serene lists for each line of insurance. Originals may be asked for on total-loss and marine claims.</p>
    <div class="faqs">
      ${PAPER_LISTS.map(
        ([title, items]) => h`<details class="faq">
        <summary><h3 class="faq-q">${title}</h3></summary>
        <div class="faq-a"><ul class="checklist">${items.map((i) => h`<li>${i}</li>`)}</ul></div>
      </details>`,
      )}
    </div>
  </section>

  <section class="section-block" id="complaints" aria-labelledby="complaints-title">
    <h2 id="complaints-title">If you are unhappy with a claim decision</h2>
    <ol class="numbered">
      <li><strong>Talk to the branch or claims officer</strong> handling your claim. Ask for the reason for the decision in writing.</li>
      <li><strong>Write to the head office</strong> at <a href="mailto:${CONTACT.email}">${CONTACT.email}</a> or ${CONTACT.headOffice.line1}, ${CONTACT.headOffice.line2}, with your claim number, and we will review the decision.</li>
      <li><strong>Go to the National Insurance Commission.</strong> If you are still not satisfied, the NIC’s complaints unit handles complaints from the public against insurers in Ghana.</li>
    </ol>
    <p>${COMPANY.legalName} is licensed by the National Insurance Commission.</p>
  </section>
</div>`;
  return {
    path: '/claims/',
    title: 'Make a claim',
    description:
      'How to make an insurance claim with Serene Insurance: what to do first, documents for each type of claim, time limits and what happens next. Our aim is to settle within a week of your last document.',
    section: 'Claims',
    crumbs: [['Claims', '/claims/']],
    band: {
      title: 'Make a claim',
      lede: h`Tell us as soon as something happens. Our rule is that no claim should wait in our books more than one week after we receive the last document from you.`,
    },
    body,
  };
}
