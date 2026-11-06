// Layout assertions shared by the e2e specs: horizontal overflow, input text size, tap targets,
// clipped text, the sticky action bar, and which font renders a piece of text.
import { expect, type Page } from '@playwright/test';

/** Real overflow: lifts the CSS safety net (overflow-x: clip) and lists what sticks out. */
export async function overflowReport(page: Page): Promise<{ sw: number; iw: number; culprits: string[] }> {
  return page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = 'html,body{overflow-x:visible!important}';
    document.head.append(st);
    const iw = document.documentElement.clientWidth;
    const sw = (document.scrollingElement ?? document.documentElement).scrollWidth;
    const culprits: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= iw + 0.5) continue;
      let clipped = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const o = getComputedStyle(a).overflowX;
        if (o !== 'visible' && a.getBoundingClientRect().right <= iw + 0.5) clipped = true;
      }
      // Closed dialogs and the off-screen skip link are not part of the layout.
      if (el.closest('dialog:not([open])') || el.classList.contains('skip-link')) continue;
      if (!clipped && getComputedStyle(el).position !== 'fixed')
        culprits.push(
          `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(r.right)}`,
        );
    }
    st.remove();
    if (sw > iw + 1 && culprits.length === 0) culprits.push(`document scrollWidth ${sw} > ${iw}`);
    return { sw, iw, culprits: culprits.slice(0, 6) };
  });
}

/** Everything a finger can hit, measured as the user sees it. */
export async function layoutProblems(page: Page, opts: { touch: boolean }): Promise<string[]> {
  return page.evaluate(({ touch }) => {
    const out: string[] = [];
    // With a modal dialog open, everything behind it is inert: only the dialog counts.
    const modal = document.querySelector('dialog:modal');
    const visible = (el: Element) => {
      if (modal && !modal.contains(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      if (el.closest('dialog:not([open]), [aria-hidden="true"], .sr-only, [inert]')) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01;
    };
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 32)}"`;

    // 1. Inputs never below 16 px (iOS zooms into smaller ones).
    for (const el of document.querySelectorAll<HTMLElement>(
      'input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]), select, textarea',
    ))
      if (visible(el) && parseFloat(getComputedStyle(el).fontSize) < 16)
        out.push(`input text ${parseFloat(getComputedStyle(el).fontSize)}px: ${name(el)}`);

    // 2. No clipped text in buttons, badges, chips and the stepper.
    for (const el of document.querySelectorAll<HTMLElement>(
      '.btn, .chip, .filter-chip, .nav-link, .menu-item, .qlink, [data-stepper] button, [data-stepper] li, [role=tab]',
    )) {
      if (!visible(el)) continue;
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2)
        out.push(
          `clipped text ${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}: ${name(el)}`,
        );
      for (const c of el.querySelectorAll<HTMLElement>('*'))
        if (getComputedStyle(c).textOverflow === 'ellipsis' && c.scrollWidth > c.clientWidth + 1)
          out.push(`ellipsis in ${name(el)}`);
    }

    if (!touch) return out;

    // 3. Tap targets at least 44×44, not overlapping each other.
    const targets: { el: Element; r: DOMRect }[] = [];
    const seen = new Set<Element>();
    for (const el of document.querySelectorAll<HTMLElement>(
      'a[href], button, select, textarea, input:not([type=hidden]), summary, [role=tab]',
    )) {
      let t: Element = el;
      if (
        el instanceof HTMLInputElement &&
        (el.type === 'checkbox' || el.type === 'radio' || el.type === 'file')
      ) {
        const label = el.closest('label') ?? (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
        if (!label) {
          if (el.type === 'file') continue; // hidden pickers opened by a button
          t = el;
        } else t = label;
      }
      if (!visible(t) || seen.has(t)) continue;
      // Inline text links inside a sentence are exempt (WCAG 2.5.8).
      if (t.tagName === 'A' && getComputedStyle(t).display === 'inline') continue;
      if (t.classList.contains('skip-link')) continue;
      // A target nested inside another target is covered by the outer one.
      if (t.parentElement?.closest('a[href], button, label')) continue;
      seen.add(t);
      const r = t.getBoundingClientRect();
      targets.push({ el: t, r });
      if (r.height < 43.5 || r.width < 43.5)
        out.push(`target ${Math.round(r.width)}x${Math.round(r.height)}: ${name(t)}`);
    }
    for (let i = 0; i < targets.length; i++)
      for (let j = i + 1; j < targets.length; j++) {
        const a = targets[i] as { el: Element; r: DOMRect };
        const b = targets[j] as { el: Element; r: DOMRect };
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const fixedA = a.el.closest('.action-bar, .site-header');
        const fixedB = b.el.closest('.action-bar, .site-header');
        if (!!fixedA !== !!fixedB) continue; // a fixed bar over scrolled content is not a layout overlap
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 1 && h > 1) out.push(`targets overlap: ${name(a.el)} / ${name(b.el)}`);
      }

    return out.slice(0, 12);
  }, opts);
}

/**
 * With the sticky action bar on screen: the spacer reserves its height, its padding includes the
 * safe area, and at the end of the page nothing interactive is hidden under it.
 */
export async function actionBarProblems(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const out: string[] = [];
    const bar = document.querySelector<HTMLElement>('.action-bar');
    if (!bar || bar.getBoundingClientRect().height === 0) return out;
    const barH = bar.getBoundingClientRect().height;
    const spacer = document.querySelector<HTMLElement>('.action-bar-spacer');
    if (!spacer || spacer.getBoundingClientRect().height < barH)
      out.push('spacer shorter than the action bar');
    // Safe area: --safe-b is env(safe-area-inset-bottom) and the bar's bottom padding grows with it.
    const css = (rules: CSSRuleList): string =>
      [...rules]
        .map((r) =>
          r instanceof CSSStyleRule || !('cssRules' in r) ? r.cssText : css((r as CSSGroupingRule).cssRules),
        )
        .join(' ');
    const all = [...document.styleSheets]
      .map((sh) => {
        try {
          return css(sh.cssRules);
        } catch {
          return '';
        }
      })
      .join(' ');
    if (!/--safe-b:\s*env\(safe-area-inset-bottom/.test(all))
      out.push('--safe-b is not env(safe-area-inset-bottom)');
    const transition = bar.style.transition;
    bar.style.transition = 'none'; // measure the end state, not a (reduced-motion) transition
    const pad0 = parseFloat(getComputedStyle(bar).paddingBottom);
    const frames = () =>
      new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(null))));
    document.documentElement.style.setProperty('--safe-b', '34px');
    await frames(); // reduced motion still runs 0.01ms transitions
    const pad1 = parseFloat(getComputedStyle(bar).paddingBottom);
    document.documentElement.style.removeProperty('--safe-b');
    await frames();
    bar.style.transition = transition;
    if (Math.abs(pad1 - pad0 - 34) > 0.5) out.push(`action bar ignores the safe area (${pad0} → ${pad1})`);
    const y = window.scrollY;
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const top = bar.getBoundingClientRect().top;
    const main = document.querySelector('main');
    const fields = [
      ...(main?.querySelectorAll<HTMLElement>('input, select, textarea, button, a[href], label') ?? []),
    ].filter((el) => !el.closest('.action-bar, .sr-only, dialog') && el.getBoundingClientRect().height > 0);
    const last = fields[fields.length - 1];
    if (last && last.getBoundingClientRect().bottom > top + 0.5)
      out.push(
        `last control under the action bar: ${last.tagName} ${(last.textContent ?? '').trim().slice(0, 30)}`,
      );
    window.scrollTo(0, y);
    return out;
  });
}

/** The element is fully inside the clear area: below the header and above the action bar / keyboard. */
export async function clearOfChrome(page: Page, selector: string): Promise<string | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return `${sel} missing`;
    const r = el.getBoundingClientRect();
    const vv = window.visualViewport;
    const vh = vv ? vv.height : window.innerHeight;
    const header = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0;
    const bar = document.querySelector<HTMLElement>('.action-bar');
    const barTop = bar && bar.getBoundingClientRect().height > 0 ? bar.getBoundingClientRect().top : vh;
    const bottom = Math.min(vh, barTop);
    if (r.top < header - 0.5 || r.bottom > bottom + 0.5)
      return `${sel} at ${Math.round(r.top)}–${Math.round(r.bottom)}, clear area ${Math.round(header)}–${Math.round(bottom)}`;
    return null;
  }, selector);
}

/** Every visible dialog fits the viewport and its scrolling body reaches its last item. */
export async function dialogProblems(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const out: string[] = [];
    for (const d of document.querySelectorAll<HTMLDialogElement>('dialog[open]')) {
      await Promise.all(d.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => null)));
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(null))));
      const r = d.getBoundingClientRect();
      if (
        r.top < -0.5 ||
        r.left < -0.5 ||
        r.bottom > window.innerHeight + 0.5 ||
        r.right > window.innerWidth + 0.5
      )
        out.push(
          `dialog ${Math.round(r.width)}x${Math.round(r.height)} at ${Math.round(r.left)},${Math.round(r.top)} exceeds the viewport`,
        );
      const body = d.querySelector<HTMLElement>('[data-sheet-body]') ?? d;
      body.scrollTop = body.scrollHeight;
      await new Promise((res) => requestAnimationFrame(() => res(null)));
      const items = [...body.querySelectorAll<HTMLElement>('button, a[href], li, p')].filter(
        (e) => e.getBoundingClientRect().height > 0,
      );
      const last = items[items.length - 1];
      const br = body.getBoundingClientRect();
      if (last && last.getBoundingClientRect().bottom > br.bottom + 1)
        out.push('the last item of the dialog cannot be scrolled into view');
      body.scrollTop = 0;
    }
    return out;
  });
}

/** Font families Chromium actually used to draw the text of the first element matching `selector`. */
export async function renderedFonts(page: Page, selector: string): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  await cdp.detach();
  return fonts.map((f) => f.familyName);
}

export async function expectCleanLayout(page: Page, label: string, opts: { touch: boolean; full: boolean }) {
  const o = await overflowReport(page);
  expect(o.culprits, `horizontal overflow: ${label}`).toEqual([]);
  if (!opts.full) return;
  expect(await layoutProblems(page, opts), `layout: ${label}`).toEqual([]);
  expect(await actionBarProblems(page), `action bar: ${label}`).toEqual([]);
}
