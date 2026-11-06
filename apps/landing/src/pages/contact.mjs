// /contact/. Phone and WhatsApp: sereneinsurance.com home page. Email and office hours:
// sereneinsurance.com /contacts. Head office address: /contacts/branches.
import { h } from '../lib/html.mjs';
import { icon } from '../lib/layout.mjs';
import { CONTACT, mapsUrl } from '../content/site.mjs';
import { BRANCHES } from '../content/branches.mjs';

export default function contact() {
  const address = `${CONTACT.headOffice.line1}, ${CONTACT.headOffice.line2}`;
  const body = h`<div class="wrap page">

  <div class="contact-grid">
    <section aria-labelledby="ways-title">
      <h2 id="ways-title">Head office</h2>
      <dl class="facts">
        <div><dt>Phone</dt><dd><a href="tel:${CONTACT.phoneTel}">${icon('phone')}${CONTACT.phoneRange}</a></dd></div>
        <div><dt>WhatsApp</dt><dd><a href="${CONTACT.whatsappUrl}" rel="noopener">${icon('chat')}${CONTACT.whatsappDisplay}</a></dd></div>
        <div><dt>Email</dt><dd><a href="mailto:${CONTACT.email}">${icon('mail')}${CONTACT.email}</a></dd></div>
        <div><dt>Address</dt><dd>${address}<br /><a href="${mapsUrl(`SU Tower, 18 Castle Road, Ridge, Accra, Ghana`)}" rel="noopener">${icon('pin')}Directions (Google Maps)</a></dd></div>
      </dl>
    </section>
    <section aria-labelledby="hours-title">
      <h2 id="hours-title">Office hours</h2>
      <table class="table hours">
        <caption class="sr-only">Head office opening hours</caption>
        <tbody>${CONTACT.hours.map(([d, t]) => h`<tr><th scope="row">${d}</th><td>${t}</td></tr>`)}</tbody>
      </table>
      <p class="hint">Branch hours can differ. Call the branch before you travel.</p>
    </section>
  </div>

  <section class="section-block two-col" aria-labelledby="feedback-title">
    <div>
      <h2 id="feedback-title">Feedback</h2>
      <p>Bought a policy, renewed, made a claim or visited a branch recently? The short survey goes straight to the branch and team that served you.</p>
      <p><a class="btn btn-outline" href="/customerfeedback">Share your feedback</a></p>
    </div>
    <div id="complaints">
      <h2 id="complaints-title">Complaints</h2>
      <ol class="numbered">
        <li>Speak to the branch that handles your policy or claim.</li>
        <li>If that does not resolve it, write to <a href="mailto:${CONTACT.email}">${CONTACT.email}</a> with your policy or claim number and what you would like us to do.</li>
        <li>If you are still not satisfied, you can complain to the National Insurance Commission, which regulates insurers in Ghana.</li>
      </ol>
    </div>
  </section>
</div>`;
  return {
    path: '/contact/',
    title: 'Contact us',
    description:
      'Contact Serene Insurance: 030 291 7444, WhatsApp 050 051 7114, info@sereneinsurance.com. Head office at SU Tower, Ridge, Accra. Open Monday to Saturday.',
    crumbs: [['Contact', '/contact/']],
    band: {
      title: 'Contact us',
      lede: h`Call, message or visit. For a claim, see <a href="/claims/">how to claim</a>; for a specific branch, see <a href="/branches/">all ${BRANCHES.length} branches</a>.`,
    },
    body,
  };
}
