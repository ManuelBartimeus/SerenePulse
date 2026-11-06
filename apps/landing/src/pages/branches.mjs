// /branches/: every branch, grouped by region, with a search and region filter added by main.js.
// Source: sereneinsurance.com /contacts/branches (see content/branches.mjs).
import { h, raw, slugify } from '../lib/html.mjs';
import { icon } from '../lib/layout.mjs';
import { BRANCHES, REGIONS } from '../content/branches.mjs';
import { mapsUrl } from '../content/site.mjs';

export default function branches() {
  const regions = REGIONS.map((r) => ({ ...r, list: BRANCHES.filter((b) => b.region === r.id) }));
  const body = h`<div class="wrap page">

  <form class="branch-filter js-only" role="search" aria-label="Find a branch" data-branch-filter>
    <div class="field">
      <label for="branch-q">Search by town, area or branch</label>
      <div class="input-icon">
        ${icon('search')}
        <input id="branch-q" type="search" autocomplete="off" placeholder="For example Adenta or Tema" />
      </div>
    </div>
    <div class="field">
      <label for="branch-region">Region</label>
      <select id="branch-region">
        <option value="">All regions</option>
        ${REGIONS.map((r) => h`<option value="${r.id}">${r.name}</option>`)}
      </select>
    </div>
  </form>
  <p class="filter-status" role="status" data-branch-status></p>

  <!-- Kumasi North (Suame) and Techiman are both published with 050 941 5414; Serene to confirm. -->
  <div class="regions">
    ${regions.map(
      (r) => h`<section class="region" data-region="${r.id}" aria-labelledby="region-${r.id}">
      <h2 id="region-${r.id}">${r.name} <span class="count">${r.list.length} ${r.list.length === 1 ? 'branch' : 'branches'}</span></h2>
      <ul class="branch-list">
        ${r.list.map(
          (
            b,
          ) => h`<li class="branch" id="${slugify(b.name)}" data-search="${[b.name, b.town, b.address, r.name].join(' ').toLowerCase()}">
          <div class="branch-name">
            <h3>${b.name}</h3>
            ${b.headOffice ? raw('<span class="tag tag-brand">Head office</span>') : ''}
          </div>
          <p class="branch-addr">${b.address}</p>
          <ul class="branch-contact">
            <li><a href="tel:${b.tel}">${icon('phone')}${b.phone}</a></li>
            <li><a href="mailto:${b.email}">${icon('mail')}${b.email}</a></li>
            <li><a href="${mapsUrl(`${b.mapQuery ?? b.address}, Ghana`)}" rel="noopener">${icon('pin')}Directions<span class="sr-only"> to ${b.name} (Google Maps)</span></a></li>
          </ul>
        </li>`,
        )}
      </ul>
    </section>`,
    )}
  </div>
  <p class="empty-state" data-branch-empty hidden>No branch matches. Try a nearby town or choose All regions. You can also call the head office on <a href="tel:+233302917444">030 291 7444</a>.</p>
</div>`;
  return {
    path: '/branches/',
    title: 'Branches',
    description: `Addresses, phone numbers, emails and directions for all ${BRANCHES.length} Serene Insurance branches in Greater Accra, Ashanti, Central, Western, Volta, Northern and Bono East.`,
    section: 'Branches',
    crumbs: [['Branches', '/branches/']],
    band: {
      title: 'Branches',
      lede: h`${BRANCHES.length} branches in ${REGIONS.length} regions. Every branch can help with new cover, renewals and claims.`,
    },
    body,
  };
}
