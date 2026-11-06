// Survey island (SPEC M06): enhances the server-rendered five-section form into five client-side
// pages. Visibility, requiredness and clearing come from @serene/survey-engine, the same code the
// server mirrors in SQL, so client and server always agree.
import {
  clean,
  isRequired,
  isVisible,
  pageOf,
  questions,
  validate,
  type Answers,
  type FieldError,
  type Json,
  type Question,
} from '@serene/survey-engine';
import { API, LOCAL_ONLY, STORAGE_KEY, type BootData, type SubmitBody } from '../shared/boot';
import { BASE, COPY, fieldMessage } from '../shared/copy';
import { FRESH_PARAM, RESUME_PARAM, firstOpenPage, hasDraftAnswers } from '../shared/resume';
import { DraftSync, Telemetry } from './net';
import { Turnstile } from './turnstile';

declare global {
  interface Window {
    __sv?: boolean;
  }
}

const HOLD_MS = 250;
/** How long the drawn tick stays on screen before the thank-you page (shorter without motion). */
const CHECK_MS = 750;
const CHECK_MS_REDUCED = 300;
const SVG_NS = 'http://www.w3.org/2000/svg';
const LOCAL = new Set<string>(LOCAL_ONLY);

interface Stored {
  sid: string;
  answers: Answers;
  page: number;
  seq: number;
  idem: string;
  dirty: boolean;
}

function readStore(): Stored | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const omit = (o: Answers, key: string): Answers =>
  Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));
const same = (a: Json | undefined, b: Json | undefined) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function start(): void {
  const bootEl = document.getElementById('sv-boot');
  const form = document.getElementById('sv-form') as HTMLFormElement | null;
  if (!bootEl || !form) return;
  const formEl: HTMLFormElement = form;
  window.__sv = true;
  document.documentElement.className = 'js';

  const boot = JSON.parse(bootEl.textContent ?? '{}') as BootData;
  const def = boot.definition;
  const snap = boot.snapshot;
  const total = def.pages.length;
  const all = questions(def);
  const byId = new Map(all.map((q) => [q.id, q]));
  const sections = Array.from(form.querySelectorAll<HTMLElement>('section.page'));
  const live = document.getElementById('sv-live');
  const stepEl = document.getElementById('sv-step');
  const bar = document.getElementById('sv-bar');
  const msg = document.getElementById('sv-msg');
  const continueBtn = form.querySelector<HTMLButtonElement>('[data-continue]');
  const submitBtn = form.querySelector<HTMLButtonElement>('[data-submit]');

  // ---- state: the server draft is the source of truth; sessionStorage covers unsynced changes.
  // "Start a new feedback form" (boot.fresh) must not bring anything back from this device.
  if (boot.fresh) {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  const stored = boot.fresh ? null : readStore();
  let answers: Answers = { ...boot.answers };
  let page = boot.page;
  let idem = uuid();
  let pushAll = false;
  let seq = boot.seq;
  if (stored && stored.sid === boot.sessionId) {
    idem = stored.idem || idem;
    if (stored.dirty) {
      answers = { ...stored.answers };
      page = stored.page;
      pushAll = true;
    } else {
      for (const k of LOCAL_ONLY) if (stored.answers[k] !== undefined) answers[k] = stored.answers[k];
    }
    seq = Math.max(seq, stored.seq);
  } else if (stored && boot.isNew && Object.keys(boot.answers).length === 0) {
    // Session expired: a fresh session starts, answers come back from this device (api.md §1).
    answers = { ...stored.answers };
    page = stored.page;
    pushAll = Object.keys(answers).length > 0;
  }
  answers = clean(def, snap, answers);
  let committed: Answers = { ...answers };
  let done = false;
  let busy = false;
  let hold: ReturnType<typeof setTimeout> | undefined;
  let arrowNav = false;
  /** History entries this page pushed, so Back never leaves the survey by accident. */
  let pushed = 0;

  const tel = new Telemetry(API.events);
  const sync = new DraftSync(API.answers, seq, (status) => {
    // A draft still in flight when Submit was pressed is answered 409 once the response is stored:
    // the submit path owns the outcome then, so it must not reload the page under the overlay.
    if (busy || done) return;
    if (status === 410 || status === 409) {
      persist(true);
      location.reload();
    }
  });
  const ts = new Turnstile(
    boot.turnstileSiteKey,
    document.getElementById('sv-ts'),
    document.getElementById('sv-ts-note'),
  );

  function persist(dirty = sync.dirty): void {
    try {
      const s: Stored = { sid: boot.sessionId, answers, page, seq: sync.seq, idem, dirty };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // private mode or quota: the server draft still has the answers
    }
  }

  const wrap = (id: string) => form.querySelector<HTMLElement>(`[data-q="${id}"]`);
  const inputs = (id: string) =>
    Array.from(
      form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${id}"]`),
    );

  function setDom(q: Question, v: Json | undefined): void {
    for (const el of inputs(q.id)) {
      if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
        el.checked = el.type === 'radio' ? v !== undefined && String(v) === el.value : v === true;
      } else {
        el.value = v === undefined || v === null ? '' : String(v);
      }
    }
  }

  function readValue(q: Question, el: Element): Json | undefined {
    if (el instanceof HTMLInputElement && el.type === 'checkbox') return el.checked;
    if (el instanceof HTMLInputElement && el.type === 'radio') {
      if (!el.checked) return answers[q.id];
      return q.type.startsWith('rating') ? Number(el.value) : el.value;
    }
    const v = (el as HTMLInputElement).value;
    return v === '' ? undefined : v;
  }

  function pageErrors(n: number, list = validate(def, snap, answers).errors): FieldError[] {
    return list.filter((e) => pageOf(def, e.field) === n - 1);
  }

  function firstInvalidPageBefore(n: number): number {
    const errs = validate(def, snap, answers).errors;
    for (let p = 1; p < n; p++) if (pageErrors(p, errs).length) return p;
    return n;
  }

  function announce(text: string): void {
    if (!live) return;
    live.textContent = '';
    setTimeout(() => (live.textContent = text), 30);
  }

  function setError(id: string, message: string): void {
    const w = wrap(id);
    const e = document.getElementById(`e-${id}`);
    if (e) e.textContent = message;
    if (w) {
      if (message) w.setAttribute('data-invalid', '');
      else w.removeAttribute('data-invalid');
    }
  }

  function showErrors(errs: FieldError[]): void {
    for (const e of errs) setError(e.field, fieldMessage(e.field, e.code));
    const first = errs[0] && wrap(errs[0].field);
    if (!first) return;
    first.removeAttribute('data-flash');
    void first.offsetWidth;
    first.setAttribute('data-flash', '');
    first.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    const target = first.querySelector<HTMLElement>('input:checked, input, select, textarea');
    target?.focus({ preventScroll: true });
  }

  function refresh(reveal: boolean): void {
    const errs = validate(def, snap, answers).errors;
    const failing = new Set(errs.map((e) => e.field));
    for (const q of all) {
      const w = wrap(q.id);
      if (!w) continue;
      const vis = isVisible(def, snap, answers, q);
      const wasVisible = !w.hasAttribute('data-off');
      if (vis !== wasVisible) {
        if (vis) {
          w.removeAttribute('data-off');
          if (reveal) {
            w.setAttribute('data-reveal', '');
            const said = COPY.revealed[q.id];
            if (said) announce(said);
          }
        } else {
          w.setAttribute('data-off', '');
          w.removeAttribute('data-reveal');
        }
      }
      const opt = w.querySelector<HTMLElement>('[data-optional]');
      if (opt) opt.hidden = isRequired(def, snap, answers, q);
      if (w.hasAttribute('data-invalid') && !failing.has(q.id)) setError(q.id, '');
      const counter = document.getElementById(`c-${q.id}`);
      if (counter && q.type === 'text_long') {
        const len = [...String(answers[q.id] ?? '')].length;
        const max = q.max_length ?? 1000;
        counter.hidden = len < 800;
        counter.textContent = len >= 800 ? COPY.counter(len, max) : '';
      }
    }
    continueBtn?.setAttribute('aria-disabled', String(pageErrors(1, errs).length > 0));
    submitBtn?.setAttribute(
      'aria-disabled',
      String(busy || (answers.contact_consent === true && failing.has('phone'))),
    );
    const h = sections[total - 1]?.querySelector<HTMLElement>('h1[data-title-low]');
    if (h) {
      const low = typeof answers.csat === 'number' && answers.csat <= 2;
      const text = (low ? h.dataset.titleLow : h.dataset.title) ?? '';
      if (h.textContent?.trim() !== text) h.textContent = text;
    }
  }

  /** Records an answer, clears answers that became hidden, queues the draft diff. */
  function setAnswer(id: string, v: Json | undefined, commit: boolean): void {
    const base = v === undefined ? omit(answers, id) : answers;
    const next: Answers = v === undefined ? base : { ...base, [id]: v };
    const cleaned = clean(def, snap, next);
    const diff: Record<string, Json> = {};
    for (const k of Object.keys(next)) {
      if (k !== id && !(k in cleaned)) {
        const hidden = byId.get(k);
        if (hidden) setDom(hidden, undefined);
        if (committed[k] !== undefined) diff[k] = null;
        committed = omit(committed, k);
      }
    }
    answers = cleaned;
    if (commit && !same(committed[id], answers[id])) {
      const prev = committed[id];
      committed = answers[id] === undefined ? omit(committed, id) : { ...committed, [id]: answers[id] };
      diff[id] = answers[id] ?? null;
      if (answers[id] !== undefined)
        tel.add(prev === undefined ? 'answer_set' : 'answer_changed', page, { q: id });
    }
    const remote = Object.fromEntries(Object.entries(diff).filter(([k]) => !LOCAL.has(k)));
    if (Object.keys(remote).length) sync.queue(remote);
    persist();
    refresh(true);
    if (hasDraftAnswers(answers)) markInProgress();
  }

  let marked = false;
  /** Once there is something to lose, the address carries ?resume=1 (see resumableUrl). */
  function markInProgress(): void {
    if (marked) return;
    marked = true;
    history.replaceState(history.state, '', resumableUrl());
  }

  function header(n: number): void {
    if (stepEl) stepEl.textContent = COPY.step(n, total);
    bar?.querySelectorAll('span').forEach((s, i) => {
      if (i < n) s.setAttribute('data-on', '');
      else s.removeAttribute('data-on');
    });
  }

  function show(n: number, direction: 'none' | 'forward' | 'back'): void {
    for (const s of sections) {
      const current = Number(s.dataset.page) === n;
      s.classList.remove('enter', 'enter-back');
      if (current) {
        s.setAttribute('data-current', '');
        if (direction !== 'none') s.classList.add(direction === 'forward' ? 'enter' : 'enter-back');
      } else s.removeAttribute('data-current');
    }
    header(n);
  }

  function go(target: number, opts: { pop?: boolean; replace?: boolean } = {}): void {
    if (done) return;
    clearTimeout(hold);
    let n = Math.min(Math.max(target, 1), total);
    if (n > page) n = firstInvalidPageBefore(n);
    if (n === page) return;
    const prev = page;
    page = n;
    show(n, n > prev ? 'forward' : 'back');
    window.scrollTo(0, 0);
    sections[n - 1]?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    announce(COPY.questionOf(n, total));
    tel.add('page_view', n);
    if (n < prev) tel.add('back', prev, { to: n });
    if (!opts.pop) {
      if (opts.replace || n < prev) history.replaceState({ sv: n }, '');
      else {
        history.pushState({ sv: n }, '');
        pushed++;
      }
    }
    sync.queue({}, n);
    persist();
    warmTurnstile(n);
  }

  /** Turnstile loads one page early and fetches its token on the last page, never at Submit. */
  function warmTurnstile(n: number): void {
    if (n >= total - 1) void ts.load();
    if (n === total) void ts.prepare();
  }

  // ---- events
  form.addEventListener('keydown', (e) => {
    const el = e.target as HTMLElement;
    if (el instanceof HTMLInputElement && el.type === 'radio') {
      if (e.key.startsWith('Arrow')) {
        arrowNav = true;
        setTimeout(() => (arrowNav = false), 0);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        el.checked = true;
        onRadio(el, true);
      }
    } else if (e.key === 'Enter' && el instanceof HTMLInputElement) {
      e.preventDefault(); // no implicit submission from text fields
    }
  });

  function onRadio(el: HTMLInputElement, advance: boolean): void {
    const q = byId.get(el.name);
    if (!q) return;
    setAnswer(q.id, readValue(q, el), true);
    const p = pageOf(def, q.id) + 1;
    if (advance && q.type.startsWith('rating') && p === page && p < total) {
      clearTimeout(hold);
      hold = setTimeout(() => go(p + 1), HOLD_MS);
    }
  }

  form.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el instanceof HTMLInputElement && el.type === 'radio') {
      onRadio(el, !arrowNav);
      return;
    }
    const btn = el.closest('button');
    if (!btn) return;
    if (btn.hasAttribute('data-back')) {
      e.preventDefault();
      if (history.state && history.state.sv === page && page > 1 && pushed > 0) history.back();
      else go(page - 1);
    } else if (btn.hasAttribute('data-continue')) {
      e.preventDefault();
      const errs = pageErrors(1);
      if (errs.length) {
        tel.add('validation_blocked', 1, { fields: errs.map((x) => x.field) });
        showErrors(errs);
      } else go(2);
    }
  });

  form.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    const q = byId.get(el.name);
    if (!q || el.type === 'radio') return;
    setAnswer(q.id, readValue(q, el), true);
  });

  form.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    const q = byId.get(el.name);
    if (!q || el.type === 'radio' || el.type === 'checkbox' || el.tagName === 'SELECT') return;
    setAnswer(q.id, readValue(q, el), false);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (page === total) void submit();
  });

  window.addEventListener('popstate', (e) => {
    if (done) return;
    if (busy) {
      history.pushState({ sv: page }, ''); // the form is locked while it is being sent
      return;
    }
    const n = (e.state as { sv?: number } | null)?.sv;
    if (typeof n !== 'number') return;
    if (n < page) pushed = Math.max(0, pushed - 1);
    else pushed++;
    go(n, { pop: true });
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) location.reload();
  });
  const flushAll = () => {
    tel.flush();
    void sync.flush(true);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll();
  });
  window.addEventListener('pagehide', flushAll);
  window.addEventListener('online', () => void sync.flush());

  // ---- submit
  function setBusy(on: boolean): void {
    busy = on;
    if (!submitBtn) return;
    submitBtn.setAttribute('aria-busy', String(on));
    submitBtn.replaceChildren();
    if (on) {
      const spin = document.createElement('span');
      spin.className = 'spin';
      spin.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = COPY.sending;
      submitBtn.append(spin, label);
    } else {
      const label = document.createElement('span');
      label.textContent = COPY.submit;
      submitBtn.append(label);
    }
    refresh(false);
  }

  function fail(text: string, code: string): void {
    tel.add('submit_error', page, { code });
    tel.flush();
    unlock();
    setBusy(false);
    sync.resume();
    void ts.prepare(); // the token was used (or may have been): have a new one ready for the retry
    if (msg) msg.textContent = text;
  }

  // ---- submit overlay: blurs and locks the form, spinner → tick, then the thank-you page
  let overlay: HTMLElement | null = null;
  let locked: (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement)[] = [];
  const shell = () =>
    [document.getElementById('main'), document.querySelector<HTMLElement>('header.top'), bar].filter(
      (n): n is HTMLElement => !!n,
    );

  function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }

  function trap(e: KeyboardEvent): void {
    if (!overlay) return;
    if (e.key === 'Tab' || e.key === 'Escape') {
      e.preventDefault();
      overlay.querySelector<HTMLElement>('.sv-card')?.focus();
    }
  }

  function lock(): void {
    if (overlay) return;
    for (const n of shell()) n.setAttribute('inert', '');
    locked = Array.from(
      formEl.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>(
        'input, select, textarea, button',
      ),
    ).filter((x) => !x.disabled);
    for (const x of locked) x.disabled = true;
    document.documentElement.classList.add('sv-locked');

    overlay = el('div', undefined, 'sv-ov');
    overlay.setAttribute('data-submit-overlay', '');
    const card = el('div', undefined, 'sv-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'sv-ov-text');
    card.tabIndex = -1;
    const icon = el('div', undefined, 'sv-icon');
    icon.setAttribute('aria-hidden', 'true');
    const ring = svgEl('svg', { viewBox: '0 0 52 52', class: 'sv-spin', focusable: 'false' });
    ring.append(svgEl('circle', { class: 'sv-ring', cx: '26', cy: '26', r: '23' }));
    const tick = svgEl('svg', { viewBox: '0 0 52 52', focusable: 'false' });
    tick.append(svgEl('path', { class: 'sv-check', d: 'M16 27l7 7 13-14' }));
    icon.append(ring, tick);
    const text = el('p', COPY.submitting);
    text.id = 'sv-ov-text';
    text.setAttribute('role', 'status');
    text.setAttribute('aria-live', 'polite');
    card.append(icon, text);
    overlay.append(card);
    document.body.append(overlay);
    document.addEventListener('keydown', trap, true);
    card.focus({ preventScroll: true });
  }

  function unlock(opts: { fade?: boolean } = {}): void {
    document.removeEventListener('keydown', trap, true);
    for (const n of shell()) n.removeAttribute('inert');
    for (const x of locked) x.disabled = false;
    locked = [];
    document.documentElement.classList.remove('sv-locked');
    const ov = overlay;
    overlay = null;
    if (!ov) return;
    if (opts.fade && !reducedMotion()) {
      ov.setAttribute('data-leaving', '');
      setTimeout(() => ov.remove(), 220);
    } else ov.remove();
    if (!done) submitBtn?.focus({ preventScroll: true });
  }

  /** The server confirmed: the spinner closes into a filled circle and the tick draws itself. */
  function received(): Promise<void> {
    if (!overlay) return Promise.resolve();
    overlay.setAttribute('data-done', '');
    const text = overlay.querySelector('#sv-ov-text');
    if (text) text.textContent = COPY.received;
    return new Promise((r) => setTimeout(r, reducedMotion() ? CHECK_MS_REDUCED : CHECK_MS));
  }

  async function submit(): Promise<void> {
    if (busy || done) return;
    const errs = validate(def, snap, answers).errors;
    if (errs.length) {
      const p = pageOf(def, errs[0]?.field ?? '') + 1;
      if (p !== page) go(p);
      const onPage = pageErrors(p, errs);
      tel.add('validation_blocked', p, { fields: onPage.map((x) => x.field) });
      showErrors(onPage);
      return;
    }
    if (msg) msg.textContent = '';
    setBusy(true);
    lock(); // nothing can change from here on, whatever the network does
    tel.add('submit_attempt', page);
    sync.stop();
    // Normally instant: the token was fetched when the customer reached this page.
    const token = await ts.token();
    const body: SubmitBody = { answers: clean(def, snap, answers) };
    if (token) body.turnstileToken = token;
    else body.turnstile = 'unavailable';
    let res: Response;
    try {
      res = await fetch(API.submit, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'idempotency-key': idem },
        body: JSON.stringify(body),
      });
    } catch {
      fail(navigator.onLine === false ? COPY.offline : COPY.serverError, 'network');
      return;
    }
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      // empty or non-JSON body
    }
    if (res.ok && typeof data.reference === 'string') {
      const reference = data.reference;
      const masked = typeof data.contactMasked === 'string' ? data.contactMasked : null;
      done = true; // the response is stored: nothing (Back, a late draft reply) may reopen the form
      await received();
      for (const n of shell()) n.removeAttribute('inert');
      confirm(reference, masked);
      unlock({ fade: true });
      return;
    }
    switch (res.status) {
      case 409:
        alreadyShared();
        return;
      case 403:
        fail(
          data.code === 'verification-failed' ? COPY.verificationFailed : COPY.serverError,
          String(data.code),
        );
        return;
      case 410:
        persist(true);
        location.reload();
        return;
      case 422: {
        fail('', 'validation-failed');
        const list = Array.isArray(data.errors) ? (data.errors as FieldError[]) : [];
        if (list.length) {
          const p = pageOf(def, list[0]?.field ?? '') + 1;
          if (p > 0 && p !== page) go(p);
          showErrors(list.filter((x) => pageOf(def, x.field) + 1 === (p > 0 ? p : page)));
        } else if (msg) msg.textContent = COPY.serverError;
        return;
      }
      case 429:
        fail(COPY.rateLimited, 'rate-limited');
        return;
      default:
        fail(COPY.serverError, String(res.status));
    }
  }

  function finish(nodes: Node[]): void {
    done = true;
    clearTimeout(hold);
    sync.stop();
    tel.flush();
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    stepEl?.remove();
    bar?.remove();
    const main = document.getElementById('main');
    main?.replaceChildren(...nodes);
    history.replaceState({ svDone: true }, '');
    main?.querySelector<HTMLElement>('h1')?.focus();
  }

  function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text?: string,
    cls?: string,
  ): HTMLElementTagNameMap[K] {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  function privacy(): HTMLElement {
    const p = el('p', undefined, 'foot');
    const a = el('a', COPY.privacyLink);
    a.href = `${BASE}/privacy`;
    p.append(a);
    return p;
  }

  function confirm(reference: string, masked: string | null): void {
    tel.add('submit_success', page);
    const panel = el('div', undefined, 'thanks');
    const h = el('h1', COPY.thanksHeading);
    h.tabIndex = -1;
    const ref = el('p', reference, 'ref');
    ref.setAttribute('data-reference', '');
    panel.append(h, el('p', COPY.thanksReference), ref, el('p', COPY.thanksBody));
    if (masked) panel.append(el('p', COPY.thanksContact(masked)));
    // A brand-new blank survey; the draft was already cleared by finish().
    const more = el('a', COPY.shareMore, 'btn btn-secondary');
    more.href = `${BASE}/new`;
    more.setAttribute('data-share-more', '');
    finish([panel, more, privacy()]);
  }

  function alreadyShared(): void {
    done = true;
    unlock();
    const h = el('h1', COPY.alreadyShared);
    h.tabIndex = -1;
    finish([h, privacy()]);
  }

  // ---- hydrate
  for (const q of all) setDom(q, answers[q.id]);
  // "Pick up where you left off" opens the first page that still needs an answer.
  page = boot.resumed
    ? firstOpenPage(def, snap, answers)
    : firstInvalidPageBefore(Math.min(Math.max(page, 1), total));
  show(page, 'none');
  refresh(false);
  history.replaceState({ sv: page }, '');
  if (hasDraftAnswers(answers)) markInProgress();
  tel.add('interactive', page);
  tel.add('page_view', page);
  tel.flush(); // interactive_at drives completion time (Rule 18), so it goes now
  if (pushAll) {
    const diff: Record<string, Json> = {};
    for (const [k, v] of Object.entries(answers)) if (!LOCAL.has(k) && v !== undefined) diff[k] = v;
    sync.queue(diff, page);
  }
  persist();
  warmTurnstile(page);
}

/**
 * The address of this form once it is in progress: with ?resume=1, so a reload (or coming Back from
 * the privacy notice) carries on instead of asking "pick up or start again" in the middle of it. A
 * customer who comes back later through their SMS link (no ?resume) is asked.
 */
function resumableUrl(): string {
  const u = new URL(location.href);
  u.searchParams.set(RESUME_PARAM, '1');
  u.searchParams.delete(FRESH_PARAM);
  return u.pathname + u.search + u.hash;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
