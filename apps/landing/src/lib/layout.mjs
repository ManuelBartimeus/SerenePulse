// Shared page frame: <head>, header (dropdowns on desktop, a sheet with accordions on phones), the
// title band with breadcrumbs on inner pages, the footer and structured data.
import { h, raw } from './html.mjs';
import { COMPANY, CONTACT, NAV } from '../content/site.mjs';

/** Set by build.mjs before rendering: asset URLs, photos, site origin and build year. */
export const ctx = { assets: {}, photos: {}, ownPhotos: {}, origin: '', year: new Date().getFullYear() };

export const asset = (key) => {
  const url = ctx.assets[key];
  if (!url) throw new Error(`Unknown asset ${key}`);
  return url;
};

export const icon = (name, cls = 'ico') =>
  h`<svg class="${cls}" aria-hidden="true" focusable="false"><use href="${asset('icons')}#${name}"></use></svg>`;

const abs = (path) => ctx.origin + path;

function jsonLd(page) {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'InsuranceAgency',
    '@id': abs('/#organisation'),
    name: COMPANY.legalName,
    alternateName: COMPANY.name,
    url: abs('/'),
    logo: abs(asset('logoPng')),
    image: abs(asset('tower800')),
    telephone: CONTACT.phoneTel,
    email: CONTACT.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: `${CONTACT.headOffice.line1}, No. 18 Castle Road, Ridge`,
      addressLocality: 'Accra',
      addressRegion: 'Greater Accra',
      addressCountry: 'GH',
    },
    areaServed: { '@type': 'Country', name: 'Ghana' },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '09:00',
        closes: '17:00',
      },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Saturday', opens: '09:00', closes: '14:00' },
    ],
  };
  const blocks = [org];
  if (page.crumbs?.length) {
    const items = [['Home', '/'], ...page.crumbs];
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items.map(([name, path], i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name,
        item: abs(path),
      })),
    });
  }
  // JSON in a non-executable data block; "<" is escaped so the text can never close the element.
  const json = JSON.stringify(blocks.length === 1 ? blocks[0] : blocks).replace(/</g, '\\u003c');
  return raw(`<script type="application/ld+json">${json}</script>`);
}

const pathOf = (href) => href.split('#')[0];

/** The top-level menu a page belongs to: its own `section`, or the menu that links to its path. */
function currentMenu(page) {
  const bySection = {
    Personal: 'personal',
    Business: 'business',
    Claims: 'claims',
    About: 'about',
    Branches: 'about',
    Help: 'about',
  };
  if (page.section && bySection[page.section]) return bySection[page.section];
  return (
    NAV.find((m) => m.links.some(([, href]) => pathOf(href) === page.path && pathOf(href) !== '/'))?.id ??
    null
  );
}

function header(page) {
  const current = currentMenu(page);
  return h`<header class="site-header" data-header>
  <div class="wrap header-row">
    <a class="brand" href="/">
      <img src="${asset('logo')}" alt="Serene Insurance home" width="116" height="56" />
    </a>
    <nav class="nav" id="site-nav" aria-label="Main" data-nav>
      <div class="sheet-head">
        <img src="${asset('logo')}" alt="" width="116" height="56" />
        <button class="sheet-close" type="button" data-nav-close>${icon('close')}<span class="sr-only">Close menu</span></button>
      </div>
      <ul class="nav-list">
        <li class="nav-item">
          <a class="nav-top nav-home${page.path === '/' ? ' is-current' : ''}" href="/"${page.path === '/' ? raw(' aria-current="page"') : ''}>Home</a>
        </li>
        ${NAV.map(
          (m) => h`<li class="nav-item${m.wide ? ' is-wide' : ''}" data-menu>
          <button class="nav-top${current === m.id ? ' is-current' : ''}" type="button" aria-expanded="false" aria-controls="menu-${m.id}">${m.label}${icon('chevron-down', 'ico chev')}</button>
          <div class="nav-menu" id="menu-${m.id}">
            <ul>
              ${m.links.map(
                ([label, href]) =>
                  h`<li><a href="${href}"${pathOf(href) === page.path && !href.includes('#') ? raw(' aria-current="page"') : ''}>${label}</a></li>`,
              )}
            </ul>
          </div>
        </li>`,
        )}
      </ul>
      <div class="nav-actions">
        <a class="btn btn-outline" href="/account/">${icon('user')}Sign in</a>
        <a class="btn btn-primary" href="/#quote">Get a quote</a>
      </div>
      <ul class="nav-contact">
        <li><a href="tel:${CONTACT.phoneTel}">${icon('phone')}${CONTACT.phoneDisplay}</a></li>
        <li><a href="${CONTACT.whatsappUrl}" rel="noopener">${icon('chat')}WhatsApp ${CONTACT.whatsappDisplay}</a></li>
      </ul>
    </nav>
    <div class="header-end">
      <a class="btn btn-primary header-quote" href="/#quote">Get a quote</a>
      <a class="menu-link" href="#footer-nav">Menu</a>
      <button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav" hidden>
        ${icon('menu')}<span class="sr-only">Menu</span>
      </button>
    </div>
  </div>
  <div class="nav-scrim" data-nav-close hidden></div>
</header>`;
}

function crumbs(page) {
  if (!page.crumbs?.length) return '';
  const items = [['Home', '/'], ...page.crumbs];
  return h`<nav class="crumbs" aria-label="Breadcrumb">
  <ol>
    ${items.map((item, i) =>
      i === items.length - 1
        ? h`<li><a href="${item[1]}" aria-current="page">${item[0]}</a></li>`
        : h`<li><a href="${item[1]}">${item[0]}</a>${icon('chevron-right', 'ico sep')}</li>`,
    )}
  </ol>
</nav>`;
}

/** Title band for inner pages: breadcrumbs, H1, intro; optionally actions and a photo (product pages). */
function band(page) {
  const b = page.band;
  if (!b) return '';
  return h`<section class="band${b.photo ? ' band-photo' : ''}" aria-labelledby="page-title">
  <div class="wrap band-grid">
    <div class="band-copy">
      ${crumbs(page)}
      <h1 id="page-title">${b.title}</h1>
      ${b.lede ? h`<p class="band-lede">${b.lede}</p>` : ''}
      ${b.meta ?? ''}
      ${b.actions ? h`<div class="band-actions">${b.actions}</div>` : ''}
    </div>
    ${b.photo ? h`<div class="band-media">${b.photo}</div>` : ''}
  </div>
</section>`;
}

function footer() {
  const col = (title, links) => h`<div class="footer-col">
    <h2>${title}</h2>
    <ul>${links.map(([n, u]) => h`<li><a href="${u}">${icon('chevron-right', 'ico chev')}${n}</a></li>`)}</ul>
  </div>`;
  const personal = NAV.find((m) => m.id === 'personal').links.slice(1);
  return h`<footer class="site-footer">
  <div class="wrap">
    <div class="footer-top">
      <div class="footer-brand">
        <img src="${asset('logo')}" alt="Serene Insurance" width="116" height="56" loading="lazy" />
        <p>${COMPANY.legalName} is a Ghanaian general insurer, licensed by the National Insurance Commission and a member of the ${COMPANY.group}.</p>
      </div>
      <ul class="footer-lines" aria-label="Claims and help">
        <li><a href="${CONTACT.whatsappUrl}" rel="noopener">${icon('chat')}<span><strong>WhatsApp ${CONTACT.whatsappDisplay}</strong><span>Claims, renewals and questions</span></span></a></li>
        <li><a href="tel:${CONTACT.phoneTel}">${icon('phone')}<span><strong>${CONTACT.phoneRange}</strong><span>Head office and claims line</span></span></a></li>
      </ul>
    </div>
    <nav class="footer-nav" id="footer-nav" aria-label="Footer">
      ${col('Personal', personal)}
      ${col('Business', [
        ['Fire & property', '/insurance/fire/'],
        ['Liability', '/insurance/public-liability/'],
        ['Marine cargo', '/insurance/marine-cargo/'],
        ['Engineering', '/insurance/contractors-all-risks/'],
        ['Bonds & guarantees', '/insurance/bonds/'],
        ['All business cover', '/insurance/#business'],
      ])}
      ${col('Customers', [
        ['Sign in', '/account/'],
        ['Get a quote', '/#quote'],
        ['Make a claim', '/claims/'],
        ['Check a certificate', '/verify/'],
        ['Proposal forms', '/downloads/'],
        ['Help', '/help/'],
        ['Share your feedback', '/customerfeedback'],
      ])}
      ${col('Company', [
        ['About Serene', '/about/'],
        ['Branches', '/branches/'],
        ['Contact us', '/contact/'],
        ['Complaints', '/contact/#complaints'],
        ['Photo credits', '/about/#credits'],
      ])}
    </nav>
    <div class="footer-contact">
      <h2>Head office</h2>
      <p>${CONTACT.headOffice.line1}, ${CONTACT.headOffice.line2}</p>
      <p><a href="mailto:${CONTACT.email}">${CONTACT.email}</a></p>
      <p>${CONTACT.hours.slice(0, 2).map(([d, t], i) => h`${i ? '; ' : ''}${d} ${t}`)}</p>
    </div>
  </div>
  <div class="footer-base">
    <div class="wrap footer-base-row">
      <p>© ${ctx.year} ${COMPANY.legalName}.</p>
      <ul>
        <li><a href="/privacy/">Privacy notice</a></li>
        <li><a href="/terms/">Terms of business online</a></li>
        <li><a href="/admin">Staff sign-in</a></li>
      </ul>
    </div>
  </div>
</footer>`;
}

/**
 * page: { path, title, description, section?, crumbs?: [name, path][], band?, body, robots?, ogImage? }
 * `band` is the inner-page title band: { title, lede?, meta?, actions?, photo? }.
 * `title` is the page's own title; the site name is appended except on the home page.
 */
export function layout(page) {
  const fullTitle = page.path === '/' ? page.title : `${page.title} | Serene Insurance`;
  const url = abs(page.path);
  return h`<!doctype html>
<html lang="en-GH">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${fullTitle}</title>
<meta name="description" content="${page.description}" />
${page.robots ? h`<meta name="robots" content="${page.robots}" />` : h`<link rel="canonical" href="${url}" />`}
<meta name="theme-color" content="#1108bf" />
<link rel="preload" href="/fonts/dm-sans-latin-wght-v17.woff2" as="font" type="font/woff2" crossorigin />
${page.preload ?? ''}
<link rel="stylesheet" href="${asset('css')}" />
<link rel="icon" type="image/png" sizes="64x64" href="${asset('favicon')}" />
<link rel="apple-touch-icon" href="${asset('touch')}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Serene Insurance" />
<meta property="og:title" content="${page.title}" />
<meta property="og:description" content="${page.description}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${abs(page.ogImageUrl ?? asset(page.ogImage ?? 'tower800'))}" />
<meta property="og:locale" content="en_GH" />
<meta name="twitter:card" content="summary_large_image" />
${page.head ?? ''}
<script>document.documentElement.classList.add('js')</script>
<script src="${asset('js')}" defer></script>
${jsonLd(page)}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${header(page)}
<main id="main" tabindex="-1">
${band(page)}
${page.body}
</main>
${footer()}
</body>
</html>
`;
}
