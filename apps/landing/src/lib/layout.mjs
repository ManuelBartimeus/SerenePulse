// Shared page frame: <head>, header, footer, breadcrumbs and structured data.
import { h, raw } from './html.mjs';
import { COMPANY, CONTACT, NAV } from '../content/site.mjs';
import { PRODUCTS } from '../content/products.mjs';

/** Set by build.mjs before rendering: asset URLs, site origin and build year. */
export const ctx = { assets: {}, origin: '', year: new Date().getFullYear() };

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

function header(page) {
  const current = (item) => (page.section === item.label ? 'page' : null);
  return h`<header class="site-header" data-header>
  <div class="wrap header-row">
    <a class="brand" href="/">
      <img src="${asset('logo')}" alt="Serene Insurance home" width="116" height="56" />
    </a>
    <nav class="nav" id="site-nav" aria-label="Main">
      <ul class="nav-links">
        ${NAV.map((item) => h`<li><a href="${item.href}"${current(item) ? raw(' aria-current="page"') : ''}>${item.label}</a></li>`)}
      </ul>
      <div class="nav-actions">
        <a class="btn btn-quiet" href="/account/">Sign in</a>
        <a class="btn btn-primary" href="/#quote">Get a quote</a>
      </div>
      <p class="nav-contact">
        <a href="tel:${CONTACT.phoneTel}">${icon('phone')}${CONTACT.phoneDisplay}</a>
        <a href="${CONTACT.whatsappUrl}" rel="noopener">${icon('chat')}WhatsApp ${CONTACT.whatsappDisplay}</a>
      </p>
    </nav>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav" hidden>
      <span class="menu-label">Menu</span>
      ${icon('menu', 'ico ico-menu')}${icon('close', 'ico ico-close')}
    </button>
  </div>
</header>`;
}

function crumbs(page) {
  if (!page.crumbs?.length) return '';
  const items = [['Home', '/'], ...page.crumbs];
  return h`<nav class="crumbs wrap" aria-label="Breadcrumb">
  <ol>
    ${items.map(([name, path], i) =>
      i === items.length - 1
        ? h`<li><a href="${path}" aria-current="page">${name}</a></li>`
        : h`<li><a href="${path}">${name}</a></li>`,
    )}
  </ol>
</nav>`;
}

function footer() {
  const personal = PRODUCTS.filter((p) => p.audience.includes('individual'));
  const business = [
    ['Fire & property', '/insurance/fire/'],
    ['Liability', '/insurance/public-liability/'],
    ['Marine cargo', '/insurance/marine-cargo/'],
    ['Engineering', '/insurance/contractors-all-risks/'],
    ['Bonds & guarantees', '/insurance/bonds/'],
    ['All business cover', '/insurance/#business'],
  ];
  return h`<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div class="footer-about">
        <img src="${asset('logoReversed')}" alt="Serene Insurance" width="116" height="56" loading="lazy" />
        <p>${COMPANY.legalName}<br />${CONTACT.headOffice.line1}<br />${CONTACT.headOffice.line2}</p>
        <ul class="footer-contact">
          <li><a href="tel:${CONTACT.phoneTel}">${icon('phone')}${CONTACT.phoneRange}</a></li>
          <li><a href="${CONTACT.whatsappUrl}" rel="noopener">${icon('chat')}WhatsApp ${CONTACT.whatsappDisplay}</a></li>
          <li><a href="mailto:${CONTACT.email}">${icon('mail')}${CONTACT.email}</a></li>
        </ul>
      </div>
      <nav class="footer-nav" aria-label="Footer">
        <div>
          <h2>Personal</h2>
          <ul>
            ${personal.map((p) => h`<li><a href="/insurance/${p.slug}/">${p.name.replace(' (Home Flexible)', '').replace('Burglary (private premises)', 'Home burglary')}</a></li>`)}
          </ul>
        </div>
        <div>
          <h2>Business</h2>
          <ul>
            ${business.map(([n, u]) => h`<li><a href="${u}">${n}</a></li>`)}
          </ul>
        </div>
        <div>
          <h2>Customers</h2>
          <ul>
            <li><a href="/account/">Sign in</a></li>
            <li><a href="/claims/">Make a claim</a></li>
            <li><a href="/verify/">Check a certificate</a></li>
            <li><a href="/downloads/">Proposal forms</a></li>
            <li><a href="/help/">Help</a></li>
            <li><a href="/customerfeedback">Share your feedback</a></li>
          </ul>
        </div>
        <div>
          <h2>Company</h2>
          <ul>
            <li><a href="/about/">About Serene</a></li>
            <li><a href="/branches/">Branches</a></li>
            <li><a href="/contact/">Contact us</a></li>
            <li><a href="/contact/#complaints">Complaints</a></li>
          </ul>
        </div>
      </nav>
    </div>
    <div class="footer-base">
      <p>© ${ctx.year} ${COMPANY.legalName}. Licensed by the National Insurance Commission.</p>
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
 * page: { path, title, description, section?, crumbs?: [name, path][], body, robots?, ogImage? }
 * `title` is the page's own title; the site name is appended except on the home page.
 */
export function layout(page) {
  const fullTitle = page.path === '/' ? page.title : `${page.title} | Serene Insurance`;
  const url = abs(page.path);
  return h`<!doctype html>
<html lang="en-GH">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${fullTitle}</title>
<meta name="description" content="${page.description}" />
${page.robots ? h`<meta name="robots" content="${page.robots}" />` : h`<link rel="canonical" href="${url}" />`}
<meta name="theme-color" content="#1108bf" />
<link rel="preload" href="/fonts/plus-jakarta-sans-latin-wght-v5.woff2" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="${asset('css')}" />
<link rel="icon" type="image/png" sizes="64x64" href="${asset('favicon')}" />
<link rel="apple-touch-icon" href="${asset('touch')}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Serene Insurance" />
<meta property="og:title" content="${page.title}" />
<meta property="og:description" content="${page.description}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${abs(asset(page.ogImage ?? 'tower800'))}" />
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
${crumbs(page)}
${page.body}
</main>
${footer()}
</body>
</html>
`;
}
