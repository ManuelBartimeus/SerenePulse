// /help/: questions and answers by topic (content/help.mjs), as native <details> disclosures.
import { h } from '../lib/html.mjs';
import { contactRoutes, faqList } from '../lib/components.mjs';
import { HELP } from '../content/help.mjs';
import { CONTACT } from '../content/site.mjs';

export default function help() {
  const body = h`<div class="wrap page">
  <header class="page-head">
    <h1>Help</h1>
    <p class="lede">Answers about buying online, signing in, paying, the identity check, documents, renewals, claims and certificates.</p>
  </header>
  <div class="help-layout">
    <nav class="toc toc-sticky" aria-label="Help topics">
      <ul>${HELP.map((s) => h`<li><a href="#${s.id}">${s.title}</a></li>`)}</ul>
    </nav>
    <div class="help-body">
      ${HELP.map(
        (s) => h`<section id="${s.id}" class="help-section" aria-labelledby="${s.id}-title">
        <h2 id="${s.id}-title">${s.title}</h2>
        ${faqList(s.items)}
      </section>`,
      )}
      <section class="help-section" aria-labelledby="contact-title">
        <h2 id="contact-title">Still need help?</h2>
        ${contactRoutes(CONTACT)}
      </section>
    </div>
  </div>
</div>`;
  return {
    path: '/help/',
    title: 'Help',
    description:
      'Help with Serene Insurance online: buying, sign-in codes, MoMo and card payments, the Ghana Card identity check, documents, renewals, claims and certificates.',
    section: 'Help',
    crumbs: [['Help', '/help/']],
    body,
  };
}
