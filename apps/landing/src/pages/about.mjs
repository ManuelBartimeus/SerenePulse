// /about/. Sources: sereneinsurance.com /sections/pages/company-profile (dates, licence, capital
// statement, First Sky Group) and /sections/pages/who-we-are (shareholders, capital raised, vision,
// values, claim principle, reinsurers), fetched 2026-11-06. Serene's site links to "Our Board" and
// "Senior Management" pages but publishes no names in the pages reviewed, so no leadership section is shown.
// Serene publishes no mission statement; none is shown. Photo credits: src/assets/stock/CREDITS.md.
import { h } from '../lib/html.mjs';
import { asset, icon } from '../lib/layout.mjs';
import { photo, photoCredits } from '../lib/photos.mjs';
import { COMPANY, CONTACT } from '../content/site.mjs';
import { BRANCHES, REGIONS } from '../content/branches.mjs';

const SLOT_NAMES = {
  hero: 'Home page',
  motor: 'Motor',
  transport: 'Commercial vehicles',
  motorcycle: 'Motorcycles',
  home: 'Home insurance',
  property: 'Fire and property',
  travel: 'Travel',
  health: 'Personal accident',
  business: 'Business and financial lines',
  marine: 'Marine',
  engineering: 'Engineering',
  bonds: 'Bonds',
  liability: 'Liability',
  claims: 'Claims',
  app: 'Buying online',
  about: 'About',
};

export default function about() {
  const credits = photoCredits();
  const body = h`<div class="wrap page-grid about-grid">
  <nav class="toc" aria-label="On this page">
    <p class="toc-title">On this page</p>
    <ul>
      <li><a href="#profile">Company profile</a></li>
      <li><a href="#history">Key dates</a></li>
      <li><a href="#vision">Vision and values</a></li>
      <li><a href="#reinsurance">Reinsurance</a></li>
      <li><a href="#regulation">Regulation</a></li>
      <li><a href="#credits">Photo credits</a></li>
    </ul>
  </nav>
  <div class="content">
    <section id="profile" aria-labelledby="profile-title">
      <h2 id="profile-title">Company profile</h2>
      <p>Serene Insurance was set up to bring speed and agility to the way insurance is delivered in Ghana. ${COMPANY.licence}</p>
      <p>We are a member of the ${COMPANY.group}. Our main shareholders are ${COMPANY.shareholders}. The group’s other businesses include cocoa trading, bitumen, construction, rural banking, renewable energy and hospitality.</p>
      <p>The company is capitalised above the regulatory minimum: ${COMPANY.capital}. A Board of Directors oversees our operations.</p>
      <!-- Image: SU Tower, Ridge (head office). -->
      <figure class="inline-figure">
        <img class="img" src="${asset('tower800')}" srcset="${asset('tower480')} 480w, ${asset('tower800')} 800w" sizes="(min-width: 1024px) 640px, 100vw" width="800" height="584" loading="lazy" decoding="async" alt="SU Tower on Castle Road, Ridge, Accra, at dusk. Serene Insurance’s head office is on the fourth floor." />
        <figcaption>Our head office is on the 4th floor of SU Tower, ${CONTACT.headOffice.line2}.</figcaption>
      </figure>
    </section>

    <section id="history" aria-labelledby="history-title">
      <h2 id="history-title">Key dates</h2>
      <ol class="timeline">
        <li><p class="timeline-date">${COMPANY.incorporated}</p><p>Incorporated as ${COMPANY.legalName}</p></li>
        <li><p class="timeline-date">${COMPANY.commencement}</p><p>Commencement certificate from the National Insurance Commission</p></li>
        <li><p class="timeline-date">${COMPANY.fullOperations}</p><p>Full operations begin</p></li>
      </ol>
    </section>

    <section id="vision" aria-labelledby="vision-title">
      <h2 id="vision-title">Vision and values</h2>
      <blockquote class="principle">
        <p>“${COMPANY.vision}”</p>
        <footer>Our vision</footer>
      </blockquote>
      <dl class="facts">
        <div><dt>Values</dt><dd>${COMPANY.values.join(', ')}</dd></div>
        <div><dt>Claim principle</dt><dd>${COMPANY.claimPrinciple}</dd></div>
      </dl>
    </section>

    <section id="reinsurance" aria-labelledby="reins-title">
      <h2 id="reins-title">Reinsurance</h2>
      <p>Reinsurers share the large risks we take on, so a big loss can be paid in full. Serene’s reinsurance is placed with:</p>
      <ul class="name-list">${COMPANY.reinsurers.map((r) => h`<li>${icon('globe')}${r}</li>`)}</ul>
    </section>

    <section id="regulation" aria-labelledby="reg-title">
      <h2 id="reg-title">Regulation and data protection</h2>
      <dl class="facts">
        <div><dt>Regulator</dt><dd>National Insurance Commission (NIC). Licensed for general (non-life) insurance business.</dd></div>
        <div><dt>Data protection</dt><dd>Registered with the Data Protection Commission under the Data Protection Act, 2012 (Act 843). Read our <a href="/privacy/">privacy notice</a>.</dd></div>
        <div><dt>Head office</dt><dd>${CONTACT.headOffice.line1}, ${CONTACT.headOffice.line2}</dd></div>
      </dl>
      <!-- Image source: sereneinsurance.com home page carousel (alt "the new team"). -->
      <figure class="inline-figure">
        <img class="img" src="${asset('team1280')}" srcset="${asset('team720')} 720w, ${asset('team1280')} 1280w" sizes="(min-width: 1024px) 760px, 100vw" width="1280" height="523" loading="lazy" decoding="async" alt="Members of the Serene Insurance team standing together in front of a Serene Insurance backdrop." />
        <figcaption>The Serene Insurance team. Tell us how we did at <a href="/customerfeedback">customer feedback</a>.</figcaption>
      </figure>
    </section>

    <section id="credits" aria-labelledby="credits-title">
      <h2 id="credits-title">Photo credits</h2>
      <p>The head office and team photos are Serene’s own. The other photos on this site are licensed stock from Pexels under the Pexels License. The people in them are models, not Serene customers or staff.</p>
      ${
        credits.length
          ? h`<ul class="credits">${credits.map(
              (c) =>
                h`<li><span class="credit-slot">${SLOT_NAMES[c.slot] ?? c.slot}</span> <span>${c.source ? h`<a href="${c.source}" rel="noopener">${c.credit}</a>` : c.credit}</span></li>`,
            )}</ul>`
          : ''
      }
    </section>
  </div>
</div>`;
  return {
    path: '/about/',
    title: 'About Serene Insurance',
    description:
      'Serene Insurance Company Limited: a Ghanaian general insurer licensed by the National Insurance Commission, member of the First Sky Group, reinsured by Ghana Re, African Re, WAICA Re, Mainstream Re and GN Re.',
    section: 'About',
    crumbs: [['About', '/about/']],
    band: {
      title: 'About Serene Insurance',
      lede: `${COMPANY.legalName} is a Ghanaian general insurer. We insure vehicles, homes, businesses, cargo, travel and construction projects for individuals and companies, from ${BRANCHES.length} branches in ${REGIONS.length} regions.`,
      photo: photo('about', {
        eager: true,
        sizes: '(min-width: 1280px) 560px, (min-width: 1024px) 44vw, 100vw',
        ratio: [3, 2],
      }),
    },
    body,
  };
}
