// /downloads/: Serene's paper proposal forms, one canonical file per product (the `source` named in
// packages/proposals/src/forms/<id>.ts; the PDF where one exists, otherwise the Word file).
import { h } from '../lib/html.mjs';
import { icon } from '../lib/layout.mjs';
import { fileInfo } from '../lib/files.mjs';
import { CATEGORY_LABELS, PRODUCTS } from '../content/products.mjs';

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

export default function downloads() {
  const groups = ORDER.map((c) => [c, PRODUCTS.filter((p) => p.category === c)]).filter(([, l]) => l.length);
  const body = h`<div class="wrap page">
  <header class="page-head">
    <h1>Proposal forms</h1>
    <p class="lede">Serene’s paper proposal forms, for brokers, companies and anyone who prefers paper. Fill one in and take it to any branch, or send it through your broker. Applying online asks the same questions and saves you the trip.</p>
  </header>
  ${groups.map(
    ([cat, list]) => h`<section class="section-block" aria-labelledby="dl-${cat}">
    <h2 id="dl-${cat}">${CATEGORY_LABELS[cat]}</h2>
    <table class="table stack downloads">
      <caption class="sr-only">${CATEGORY_LABELS[cat]} proposal forms</caption>
      <thead><tr><th scope="col">Product</th><th scope="col">File</th><th scope="col"><span class="sr-only">Download</span></th></tr></thead>
      <tbody>
        ${list.map((p) => {
          const f = fileInfo(p.file);
          return h`<tr>
          <th scope="row"><a href="/insurance/${p.slug}/">${p.name}</a></th>
          <td data-label="File">${f.type}, ${f.size}</td>
          <td data-label="Download"><a class="btn btn-secondary btn-sm" href="/downloads/${p.file}" download>${icon('download')}Download<span class="sr-only"> the ${p.name} proposal form (${f.type}, ${f.size})</span></a></td>
        </tr>`;
        })}
      </tbody>
    </table>
  </section>`,
  )}
  <p class="hint">Word files open in Microsoft Word, Google Docs or LibreOffice. If a form will not open, ask any branch for a printed copy.</p>
</div>`;
  return {
    path: '/downloads/',
    title: 'Proposal forms',
    description:
      'Download Serene Insurance paper proposal forms for motor, travel, fire, burglary, accident, liability, marine, engineering and bonds.',
    crumbs: [['Proposal forms', '/downloads/']],
    body,
  };
}
