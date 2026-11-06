# Serene design system (from the nic.gov.gh standard, 2026-11-06)

The user chose **nic.gov.gh** as the UI/UX standard for the public website and the customer app:
"from their font size, font type, to everything UI/UX except the theme colour". This file is that
standard translated to Serene's colours, with NIC's own weaknesses corrected. Measurements were
taken from the live site in Chromium at 1440, 1024, 768, 390 and 360 px (screenshots in the session
scratchpad `nic/`).

## Typography

* **DM Sans** for everything (variable, weights 400/500/600/700), self-hosted in
  `packages/ui/assets/fonts/` (served at `/fonts/`): `dm-sans-latin-wght-v17.woff2` and
  `dm-sans-latin-ext-wght-v17.woff2`, each declared with its `unicode-range`. **DM Sans has no cedi
  sign (₵, U+20B5)**, so a third face, `dm-sans-cedi-wght.woff2` (1.8 KB, generated from DM Sans's
  own "C" by `apps/landing/scripts/make-cedi-font.py`, permitted by the OFL), is declared for the
  same family with `unicode-range: U+20B5`, and U+20B5 is left out of the latin-ext range. Prices
  join "GH₵" to the amount with a no-break space. Fallback `ui-sans-serif, system-ui, sans-serif`.
  Licence: `OFL-dm-sans.txt`. Vite builds must never inline `.woff2` files as `data:` URIs (the CSP
  allows fonts only from the site's own origin).
* Headings 700 with `letter-spacing: -0.025em`; overlines uppercase 600 `+0.025em`;
  `font-variant-numeric: tabular-nums` on prices, dates and stats.

| Role | Desktop ≥1024 | Phone | Line-height | Weight |
|---|---|---|---|---|
| Hero H1 | `clamp(2rem, 1.2rem + 2.6vw, 3rem)` (only grows) | 32px | 1.1 | 700 |
| Section H2 | 36px | 30px | 40 / 36px | 700 |
| Inner-page H1 (title band) | 30px | 30px | 36px | 700 |
| Content H2/H3 | 24px | 24px | 32px | 700 |
| Card title large / normal / small | 24 / 18 / 16px | same | 32 / 28 / 24px | 600 |
| Section lede | 18px | 18px | 28px | 400, muted |
| Body | 16px | 16px | 26px | 400 |
| Card text | 14px (16px on home feature blocks) | 14px | 22.75px | 400, muted |
| Nav, buttons, form text | 14px | **16px for inputs** (iOS zoom) | 20px | nav 500, buttons 600 |
| Overline, meta | 12–14px | same | 16–20px | 600 / 400 |
| Stat number | 30px | 24px | 36 / 32px | 700 |

## Layout

* Breakpoints 640 / 768 / 1024 / 1280. Container max 1280px; gutters 16px (<640), 24px (640–1023),
  32px (≥1024).
* Section padding 48 / 64 / 80px (phone / ≥640 / ≥1024). Header-to-grid 32px (24px after a lede).
  Grid gaps 32px for icon/quick-link grids, 20–24px for card grids.
* Prose capped at 70ch (NIC runs ~120 characters per line; we don't).

## Colour roles (NIC role → Serene)

| Role | Serene |
|---|---|
| primary (CTAs, links, icons, accent bars, hero panel, focus ring) | `#1108bf`, hover `#0e06a0` |
| primary tint (tinted bands, icon tiles) | `#e7e6f9` |
| accent surface (menu hover, outline-button hover) | `#f3f3fd` |
| text | `#1a1a1a` |
| muted text | `#5f5f66` (darker than NIC's `#717176`, which fails AA on tints) |
| muted fill / grey band | `#eeeef0` / `#f4f4f5` |
| border / input | `#e2e2e4` |
| dark band (stats slide, CTA band) | navy `#0a0a3a` |
| yellow `#FBDE04` | decorative only and on navy/blue (accent bars, stat numbers, active dots); never text on white |
| success / error | `#006b3f` / `#ce1126` |

## Components

* **Header:** sticky, 64px, white 90% with backdrop blur, 1px bottom border; logo left; nav triggers
  14/500, 36px tall, 8px radius, hover `#eeeef0`; dropdowns are plain link lists (white, 8px radius,
  1px ring, small shadow, 300ms fade/zoom). Right side: **"Sign in"** (outline) and **"Get a quote"**
  (primary), which NIC lacks. Hamburger below 1024 opens a left sheet (~85% width, max 360px) with
  accordions; **rows ≥ 44px** (NIC's 32px rows are too small).
* **Hero:** full-bleed split, 50/50 on desktop: solid primary panel with white H1 + lede +
  **two CTAs** (NIC has none) on the left; full-bleed photo on the right; `min-height: 58vh`.
  Phones: colour panel first, photo below (or photo with the panel overlapping). Optional stats
  slide on navy. Carousel dots with 24px hit areas, no autoplay (or with a pause control).
* **Section header:** H2 left-aligned, optional 18px muted lede, "See all" link right on ≥640.
* **Accent bar:** 48×6px primary bar; on section and featured-card titles only (NIC overuses it).
* **Quick-link card:** whole card is the link; 48px icon tile (12px radius, tint background,
  primary icon → fills primary with white icon on hover); 18/600 title; 14 muted text;
  "Get started ›" 14/500 primary; focus ring 2px primary at 12px radius.
* **Icon-row feature:** 24px line icon (primary), 16/600 title, muted text; no box.
* **Feature card:** 12px radius, 1px border, image + text side by side (stacked on phones).
* **News/product card:** 12px radius, border, `shadow-xs` → `shadow-sm` on hover, 16:9 image,
  24px padding, title 18/600 (2-line clamp; never single-line ellipsis on phones).
* **Bordered link card:** 12px radius (NIC mixes square and 16px; we use 12px for all cards),
  1px primary-at-40% border, overline → title → accent bar → meta → button.
* **Buttons:** 40px desktop / **44px on touch**, 16px padding, 6px radius, 14/600; primary solid;
  outline white with 1px border; large 44–48px / 32px padding / 16px; focus 2px primary ring with
  2px white offset.
* **Forms:** inputs 40–44px, 6px radius, 1px border, focus primary border + ring; labels 14/500
  visible (NIC hides them on filter bars; we don't). Filter bars stack on phones.
* **Tables:** header 12/600 uppercase muted on muted-50% fill; rows 14px with 1px dividers,
  12×16px padding; 8px radius wrapper; **become stacked cards under 640px**.
* **Badges:** pill, 12/600, 2×10px padding.
* **Title band (inner pages):** white band, bottom border, 32px padding; breadcrumb 14 muted with
  chevron separators; H1 30/700; optional 16 muted intro.
* **"On this page" sidebar** for long pages: 220px column with left-border list; static list on phones.
* **FAQ accordion:** 16/500 questions, chevrons, dividers, animated.
* **Callout:** muted-50% fill, 8px radius, 16px padding, 14px text.
* **Footer:** white, top border; brand block + description; four link columns (14px, muted,
  primary `›` chevrons, **44px rows on phones**); contact block; bottom bar with © and legal links.
  Serene adds WhatsApp, claims line and social links (NIC has none).
* **Icons:** lucide-style line icons, 2px stroke, `currentColor`; 16 / 24 / 32px.
* **Motion:** 150ms colour transitions; scroll reveal 600ms ease-out from `translateY(16px)`,
  opacity 0; respects `prefers-reduced-motion`.

## Imagery

Bright, natural-light, people-centred photography of Ghanaians and Ghanaian settings, no duotone
or overlays, `object-fit: cover`; hero half ≈1.38:1, feature ≈1.7:1, cards 16:9, portraits 4:5.
Licensed stock (Unsplash/Pexels) in `apps/landing/src/assets/stock/` with `CREDITS.md`.

## Home-page order (Serene)

1. Split hero carousel (motor / home & business / claims), each with CTAs; quick quote reachable
   from the hero.
2. Quick actions (buy motor, renew, make a claim, verify a certificate), as quick-link cards.
3. "Insurance for you" / "Insurance for your business": product cards with photos.
4. How buying online works (numbered steps) on a tinted band.
5. What each motor cover pays for (comparison).
6. Claims promise (one week after the last document) with a photo feature card.
7. Why Serene (licence, reinsurers, branches, capital) as an icon row, plus a navy stats band.
8. Branches teaser and the certificate check.
9. Closing CTA band (navy, yellow accent) and footer.

## NIC flaws we deliberately avoid

No hero CTA; H1 shrinking at 768; 10px dots and 32px menu/footer rows; muted grey failing contrast on
tints; one-line truncation on phones; hidden labels on mobile filter bars; inconsistent card radii;
over-wide prose; wasted 768–1023 range (we use 2-column grids at md); dead space under carousels.
