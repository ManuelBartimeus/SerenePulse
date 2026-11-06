// /verify/: public certificate check (GET /api/verify, VerifyResponse in packages/proposals/src/api.ts)
// and the NIC Motor Insurance Database USSD code. Certificates carry a QR code to /verify/?certificate=…
import { h } from '../lib/html.mjs';
import { CONTACT } from '../content/site.mjs';

export default function verify() {
  const body = h`<div class="wrap page narrow">

  <div class="verify-grid">
    <section class="panel" aria-labelledby="check-title">
      <h2 id="check-title">Certificate details</h2>
      <form class="verify-form" action="/verify/" method="get" novalidate data-verify>
        <div class="field">
          <label for="v-cert">Certificate number</label>
          <input id="v-cert" name="certificate" autocomplete="off" spellcheck="false" autocapitalize="characters" aria-describedby="v-cert-hint" required />
          <p class="hint" id="v-cert-hint">Printed at the top of the certificate, for example C01-26-10001.</p>
        </div>
        <div class="field">
          <label for="v-reg">Vehicle registration or policy number</label>
          <input id="v-reg" name="reg" autocomplete="off" spellcheck="false" autocapitalize="characters" aria-describedby="v-reg-hint" required />
          <p class="hint" id="v-reg-hint">For example GR 1234-22, GR 2224-AD or SE26MTP10001-E.</p>
        </div>
        <button class="btn btn-primary" type="submit">Check certificate</button>
      </form>
      <noscript><p class="notice">The check needs JavaScript. You can also call us on <a href="tel:${CONTACT.phoneTel}">${CONTACT.phoneDisplay}</a> or use the USSD code below for motor policies.</p></noscript>
      <div class="verify-result" data-verify-result tabindex="-1" aria-live="polite"></div>
    </section>

    <section class="ussd" aria-labelledby="mid-title">
      <h2 id="mid-title">Motor: check the NIC sticker</h2>
      <p>Every motor policy issued in Ghana is uploaded to the National Insurance Commission’s Motor Insurance Database, which issues the electronic sticker. To check any vehicle, whoever insures it, dial:</p>
      <p class="ussd-code"><a href="tel:*920*57%23">*920*57#</a></p>
      <p>Follow the prompts and enter the vehicle registration number.</p>
    </section>
  </div>

  <section class="section-block" aria-labelledby="results-title">
    <h2 id="results-title">What the result means</h2>
    <dl class="facts">
      <div><dt>Valid</dt><dd>The certificate is genuine and the cover is in force today.</dd></div>
      <div><dt>Not yet started</dt><dd>Genuine, but the cover starts on a later date.</dd></div>
      <div><dt>Expired</dt><dd>Genuine, but the cover has ended. The vehicle needs a new certificate before it goes on the road.</dd></div>
      <div><dt>Cancelled</dt><dd>The policy was cancelled and the certificate no longer gives cover.</dd></div>
      <div><dt>Not found</dt><dd>No Serene certificate matches both details. Check them against the certificate. If they are right, the certificate may not be genuine: please call us.</dd></div>
    </dl>
  </section>
</div>`;
  return {
    path: '/verify/',
    title: 'Check a certificate',
    description:
      'Check that a Serene Insurance certificate is genuine and in force, or check any vehicle’s NIC motor sticker by dialling *920*57#.',
    crumbs: [['Check a certificate', '/verify/']],
    band: {
      title: 'Check a certificate',
      lede: h`Confirm that a Serene Insurance certificate is genuine and in force. We show the cover, the dates and the policyholder’s initials, never their full name.`,
    },
    body,
  };
}
