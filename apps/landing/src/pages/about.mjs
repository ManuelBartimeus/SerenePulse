// /about/. Sources: sereneinsurance.com /sections/pages/company-profile (dates, licence, capital
// statement, First Sky Group) and /sections/pages/who-we-are (shareholders, capital raised, vision,
// values, claim principle, reinsurers), fetched 2026-11-06. Serene's site links to "Our Board" and
// "Senior Management" pages but publishes no names in the pages reviewed, so no leadership section is shown.
// Serene publishes no mission statement; none is shown.
import { h } from '../lib/html.mjs';
import { asset } from '../lib/layout.mjs';
import { COMPANY, CONTACT } from '../content/site.mjs';
import { BRANCHES, REGIONS } from '../content/branches.mjs';

export default function about() {
  const body = h`<div class="wrap page">
  <div class="about-hero">
  <header class="page-head">
    <h1>About Serene Insurance</h1>
    <p class="lede">${COMPANY.legalName} is a Ghanaian general insurer. We insure vehicles, homes, businesses, cargo, travel and construction projects for individuals and companies, from ${BRANCHES.length} branches in ${REGIONS.length} regions.</p>
  </header>

  <!-- Image: SU Tower, Ridge (head office). -->
  <figure class="photo photo-wide">
    <img src="${asset('tower800')}" srcset="${asset('tower480')} 480w, ${asset('tower800')} 800w" sizes="(min-width: 1024px) 560px, 100vw" width="800" height="584" fetchpriority="high" decoding="async" alt="SU Tower on Castle Road, Ridge, Accra, at dusk. Serene Insurance’s head office is on the fourth floor." />
    <figcaption>Our head office is on the 4th floor of SU Tower, ${CONTACT.headOffice.line2}.</figcaption>
  </figure>
  </div>

  <div class="about-grid">
    <section aria-labelledby="profile-title">
      <h2 id="profile-title">Company profile</h2>
      <p>Serene Insurance was set up to bring speed and agility to the way insurance is delivered in Ghana. ${COMPANY.licence}</p>
      <p>We are a member of the ${COMPANY.group}. Our main shareholders are ${COMPANY.shareholders}. The group’s other businesses include cocoa trading, bitumen, construction, rural banking, renewable energy and hospitality.</p>
      <p>The company is capitalised above the regulatory minimum: ${COMPANY.capital}. A Board of Directors oversees our operations.</p>
    </section>
    <section aria-labelledby="history-title">
      <h2 id="history-title">Key dates</h2>
      <dl class="timeline-dl">
        <div><dt>${COMPANY.incorporated}</dt><dd>Incorporated as ${COMPANY.legalName}</dd></div>
        <div><dt>${COMPANY.commencement}</dt><dd>Commencement certificate from the National Insurance Commission</dd></div>
        <div><dt>${COMPANY.fullOperations}</dt><dd>Full operations begin</dd></div>
      </dl>
    </section>
  </div>

  <section class="section-block about-values" aria-labelledby="vision-title">
    <h2 id="vision-title" class="sr-only">Vision and values</h2>
    <blockquote class="principle">
      <p>“${COMPANY.vision}”</p>
      <footer>Our vision</footer>
    </blockquote>
    <dl class="facts facts-compact">
      <div><dt>Values</dt><dd>${COMPANY.values.join(', ')}</dd></div>
      <div><dt>Claim principle</dt><dd>${COMPANY.claimPrinciple}</dd></div>
    </dl>
  </section>

  <section class="section-block" aria-labelledby="reins-title">
    <h2 id="reins-title">Reinsurance</h2>
    <p>Reinsurers share the large risks we take on, so a big loss can be paid in full. Serene’s reinsurance is placed with:</p>
    <ul class="name-list">${COMPANY.reinsurers.map((r) => h`<li>${r}</li>`)}</ul>
  </section>

  <section class="section-block" aria-labelledby="reg-title">
    <h2 id="reg-title">Regulation and data protection</h2>
    <dl class="facts">
      <div><dt>Regulator</dt><dd>National Insurance Commission (NIC). Licensed for general (non-life) insurance business.</dd></div>
      <div><dt>Data protection</dt><dd>Registered with the Data Protection Commission under the Data Protection Act, 2012 (Act 843). Read our <a href="/privacy/">privacy notice</a>.</dd></div>
      <div><dt>Head office</dt><dd>${CONTACT.headOffice.line1}, ${CONTACT.headOffice.line2}</dd></div>
    </dl>
  </section>

  <!-- Image source: sereneinsurance.com home page carousel (alt "the new team"). -->
  <figure class="photo photo-team">
    <img src="${asset('team1280')}" srcset="${asset('team720')} 720w, ${asset('team1280')} 1280w" sizes="(min-width: 1200px) 1120px, 100vw" width="1280" height="523" loading="lazy" decoding="async" alt="Members of the Serene Insurance team standing together in front of a Serene Insurance backdrop." />
    <figcaption>The Serene Insurance team. Tell us how we did at <a href="/customerfeedback">customer feedback</a>.</figcaption>
  </figure>
</div>`;
  return {
    path: '/about/',
    title: 'About Serene Insurance',
    description:
      'Serene Insurance Company Limited: a Ghanaian general insurer licensed by the National Insurance Commission, member of the First Sky Group, reinsured by Ghana Re, African Re, WAICA Re, Mainstream Re and GN Re.',
    crumbs: [['About', '/about/']],
    body,
  };
}
