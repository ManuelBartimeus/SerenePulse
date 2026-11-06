// /privacy/ and /terms/. DRAFTS FOR SERENE'S LEGAL REVIEW before go-live: written plainly from the
// system's actual behaviour (docs/sales/architecture.md, packages/proposals/src/kyc.ts and api.ts) and
// the survey's privacy notice (apps/survey-worker/src/pages.ts, privacyPage). Serene's Data Protection
// Commission registration number is not known to us; it is shown as a marked placeholder.
import { h } from '../lib/html.mjs';
import { COMPANY, CONTACT } from '../content/site.mjs';

const UPDATED = '6 November 2026';

function prose(title, intro, sections, path, description) {
  const body = h`<div class="wrap page narrow">
  <!-- LEGAL REVIEW: draft wording, to be approved by Serene Insurance's legal and compliance team before go-live. -->
  <nav class="toc toc-inline" aria-label="Contents">
    <ol>${sections.map(([id, t]) => h`<li><a href="#${id}">${t}</a></li>`)}</ol>
  </nav>
  <div class="prose">
    ${sections.map(([id, t, content]) => h`<section id="${id}" aria-labelledby="${id}-title"><h2 id="${id}-title">${t}</h2>${content}</section>`)}
  </div>
</div>`;
  return {
    path,
    title,
    description,
    crumbs: [[title, path]],
    band: { title, lede: intro, meta: h`<p class="band-meta">Last updated ${UPDATED}.</p>` },
    body,
  };
}

export function privacy() {
  return prose(
    'Privacy notice',
    'How Serene Insurance uses your personal data when you get a quote, buy or renew a policy online, make a claim or give us feedback.',
    [
      [
        'who',
        'Who we are',
        h`<p>${COMPANY.legalName}, ${CONTACT.headOffice.line1}, ${CONTACT.headOffice.line2}, is the data controller. We are registered with Ghana’s Data Protection Commission (registration number: <span class="placeholder">to be added by Serene</span>) and process personal data under the Data Protection Act, 2012 (Act 843).</p>`,
      ],
      [
        'collect',
        'What we collect',
        h`<ul>
          <li><strong>Contact and sign-in:</strong> your mobile number, and the one-time sign-in codes we send to it (kept only as a code we cannot read back, and deleted after 24 hours).</li>
          <li><strong>Proposal details:</strong> the answers on the proposal form, such as your name, date of birth, address, occupation, vehicle, property, travel or business details, and your previous insurance and claims.</li>
          <li><strong>Identity check:</strong> your Ghana Card number and a live photo of your face, or the photo page of your passport if you are a foreign national without a Ghana Card. For a company, its registration document and the signatory’s Ghana Card number and face photo. We never collect a photo or copy of a Ghana Card.</li>
          <li><strong>Documents and photos</strong> you upload, such as vehicle photos, a DVLA registration document or audited accounts.</li>
          <li><strong>Your electronic signature</strong>, with the time, your IP address, your device’s browser and a fingerprint (SHA-256 hash) of your answers, so the signed proposal can be proved later.</li>
          <li><strong>Payments:</strong> the amount, method and network, and a masked card or MoMo number. We do not store full card numbers or security codes.</li>
          <li><strong>Claims:</strong> what happened, photos, reports and, for injury claims, medical information.</li>
          <li><strong>Feedback:</strong> your answers to the customer survey. The survey has its <a href="/customerfeedback/privacy">own privacy notice</a>.</li>
        </ul>`,
      ],
      [
        'why',
        'Why we use it, and on what basis',
        h`<table class="table stack">
          <caption class="sr-only">Purposes and legal bases</caption>
          <thead><tr><th scope="col">Purpose</th><th scope="col">Basis under Act 843</th></tr></thead>
          <tbody>
            <tr><th scope="row">To price your cover, issue the policy and certificate, collect payment and renew</th><td data-label="Basis">Needed to enter into and perform the insurance contract, and your consent given on the proposal</td></tr>
            <tr><th scope="row">To confirm your identity with the National Identification Authority</th><td data-label="Basis">Legal obligation (Anti-Money Laundering Act, 2020, Act 1044; NIC directives) and your consent</td></tr>
            <tr><th scope="row">To upload motor policies to the NIC Motor Insurance Database</th><td data-label="Basis">Legal obligation</td></tr>
            <tr><th scope="row">To assess and pay claims, including health information for injury claims</th><td data-label="Basis">Performance of the contract and your explicit consent</td></tr>
            <tr><th scope="row">To prevent and detect fraud</th><td data-label="Basis">Legal obligation and our legitimate interest</td></tr>
            <tr><th scope="row">To send you news and offers</th><td data-label="Basis">Only with your separate consent, which you can withdraw at any time</td></tr>
          </tbody>
        </table>`,
      ],
      [
        'share',
        'Who we share it with',
        h`<p>Only as needed for the purposes above:</p>
        <ul>
          <li>The National Identification Authority, for the identity check, and the National Insurance Commission, for motor policies and as our regulator.</li>
          <li>Our reinsurers, and assessors, loss adjusters and lawyers working on a claim.</li>
          <li>The agent or broker you name on your proposal.</li>
          <li>The companies that run our systems for us: SMS, payment, and cloud hosting and storage providers, including servers in the United Kingdom. They act on our instructions and must keep your data secure.</li>
          <li>Courts, the police and other authorities where the law requires it.</li>
        </ul>
        <p>We do not sell personal data.</p>`,
      ],
      [
        'keep',
        'How long we keep it',
        h`<ul>
          <li><strong>Policies, proposals, identity checks and payments:</strong> for as long as you are a customer and at least five years after the policy or relationship ends, as anti-money-laundering law requires, and longer while a claim is open.</li>
          <li><strong>Claims:</strong> until the claim is settled and the time for any legal action has passed.</li>
          <li><strong>Proposals you never submit:</strong> deleted after a period of inactivity.</li>
          <li><strong>Sign-in codes:</strong> 24 hours. <strong>Signed-in sessions:</strong> up to 30 days.</li>
        </ul>`,
      ],
      [
        'rights',
        'Your rights',
        h`<p>Under Act 843 you can ask what personal data we hold about you and for a copy, ask us to correct or update it, ask us to delete data we no longer need, object to how we use it, and withdraw consent to marketing at any time. Some data we must keep by law even if you ask us to delete it; we will tell you if that applies.</p>
        <p>You can also complain to the Data Protection Commission.</p>`,
      ],
      [
        'security',
        'Keeping it safe',
        h`<p>Data is encrypted in transit, uploads are kept in private storage that only you and authorised Serene staff can open, and staff access is limited to their role and recorded in an audit log.</p>`,
      ],
      [
        'contact',
        'Contact',
        h`<p>For any privacy question or request, email <a href="mailto:${CONTACT.email}">${CONTACT.email}</a>, call <a href="tel:${CONTACT.phoneTel}">${CONTACT.phoneDisplay}</a>, or write to the Data Protection Officer at our head office. Tell us your phone number and policy number, if you have one, so we can find your records.</p>`,
      ],
    ],
    '/privacy/',
    'How Serene Insurance collects and uses personal data for online quotes, proposals, the Ghana Card identity check, payments, claims and feedback, under the Data Protection Act, 2012 (Act 843).',
  );
}

export function terms() {
  return prose(
    'Terms of business online',
    'The terms for getting quotes and buying insurance from Serene Insurance on this website. Your policy is governed by its own wording and schedule, which take priority over these terms.',
    [
      [
        'quotes',
        'Quotes and prices',
        h`<p>A quick quote on this website is based on the few answers you give and the rates in force on the day. The price on your proposal is based on all your answers and may differ.</p>
        <p>Prices marked <strong>indicative</strong> are subject to underwriting. An underwriter may confirm, change or decline them after reviewing your answers, photos and documents. We tell you before you pay if the price changes. Third-party motor premiums follow the National Insurance Commission’s minimum tariff.</p>
        <p>A quote is valid for the period shown on it, normally 30 days. Products marked “priced by an underwriter” have no automatic price: we review the proposal and send you a quote, usually within one working day.</p>`,
      ],
      [
        'disclosure',
        'Your answers and the duty of disclosure',
        h`<p>You must answer every question truthfully and completely, and tell us about anything that could affect our decision to insure you or the price, even if we did not ask about it. This applies when you apply, when you renew and when your circumstances change.</p>
        <p>If an answer is wrong or something important is left out, we may be entitled to change the terms, reduce a claim payment, or treat the policy as void, as the law and your policy allow.</p>`,
      ],
      [
        'cover',
        'When cover starts',
        h`<p>Cover starts only when <strong>both</strong> of these have happened: we have accepted your proposal, and we have received your payment in full. It then runs from the start date on your schedule and certificate. Submitting a proposal or receiving a quote does not, on its own, give you cover.</p>`,
      ],
      [
        'identity',
        'Identity check',
        h`<p>We confirm your identity with the National Identification Authority using your Ghana Card number and a live photo of your face. We may decline a proposal, or cancel a policy, if the check fails or the details do not match.</p>`,
      ],
      [
        'signature',
        'Electronic signature',
        h`<p>When you sign a proposal on screen after signing in with a one-time code sent to your phone, you agree that your electronic signature has the same effect as your handwritten signature, under the Electronic Transactions Act, 2008 (Act 772). We keep a record of the signature, the time, your phone number and a fingerprint of your answers.</p>`,
      ],
      [
        'payment',
        'Payment',
        h`<p>You can pay by mobile money or card. You pay the total shown, including any taxes and levies listed on the quote.</p>
        <p class="notice"><strong>Test mode.</strong> Online payment is simulated while we connect our payment provider. No money is taken, and a policy issued from a simulated payment is not valid insurance. To buy cover now, pay at a branch or through your broker.</p>`,
      ],
      [
        'cancel',
        'Cancellations and refunds',
        h`<p>You can cancel a proposal at any time before you pay. Once a policy is issued, you or we can cancel it, and any refund of premium is worked out as set out in your policy.</p>`,
      ],
      [
        'documents',
        'Certificates and documents',
        h`<p>Your certificate, policy schedule and signed proposal are available in your account to download. The certificate carries a QR code that anyone can use to check it on our verify page. Keep your sign-in phone secure: anyone who can receive your codes can see your policies.</p>`,
      ],
      [
        'law',
        'Complaints and law',
        h`<p>If something goes wrong, contact us first; see <a href="/contact/#complaints">complaints</a>. These terms are governed by the laws of Ghana.</p>`,
      ],
    ],
    '/terms/',
    'Terms for buying insurance online from Serene Insurance: quotes and indicative prices, the duty of disclosure, when cover starts, electronic signatures (Act 772), payments and cancellations.',
  );
}

export function notFound() {
  const body = h`<div class="wrap page narrow not-found">
  <ul class="plain link-list">
    <li><a href="/#quote">Get a motor or travel price</a></li>
    <li><a href="/insurance/">All insurance products</a></li>
    <li><a href="/claims/">Make a claim</a></li>
    <li><a href="/branches/">Find a branch</a></li>
    <li><a href="/help/">Help</a></li>
  </ul>
  <p>Or call us on <a href="tel:${CONTACT.phoneTel}">${CONTACT.phoneDisplay}</a>.</p>
</div>`;
  return {
    path: '/404.html',
    title: 'Page not found',
    description: 'This page could not be found on the Serene Insurance website.',
    robots: 'noindex',
    band: {
      title: 'We can’t find that page',
      lede: 'The address may be mistyped, or the page has moved since our site was rebuilt.',
    },
    body,
  };
}
