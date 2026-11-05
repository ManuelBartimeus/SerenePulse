// Server-rendered pages (SPEC M06 S-C1…S-C11, M16 privacy notice). Every page works without
// JavaScript; the island only enhances the survey form.
import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import {
  isRequired,
  isVisible,
  type Answers,
  type Definition,
  type Page,
  type Question,
  type Snapshot,
} from '@serene/survey-engine';
import { ISLAND_PATH, LOGO_PATH } from '../dist/island/assets.gen';
import type { BootData } from '../shared/boot';
import { BASE, COPY } from '../shared/copy';
import { CSS } from './styles';
import type { PrivacySettings } from './supabase';

type H = HtmlEscapedString | Promise<HtmlEscapedString>;

const TICK = raw(
  '<svg class="tick" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
);
const CHEVRON = raw(
  '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
);
const LEAF = raw(
  '<svg class="leaf" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path fill="currentColor" d="M27 4C14 4 6 10 6 20c0 3 1 5.5 2.5 7.5C10 21 14 16 21 12c-6 5-9.5 10-11 16.5 2 .9 4 1.5 6 1.5 10 0 13-9 11-26z"/></svg>',
);

/** Escapes JSON for an inline data block (`</script>`, U+2028/9). */
export function inlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .split(String.fromCharCode(0x2028))
    .join('\\u2028')
    .split(String.fromCharCode(0x2029))
    .join('\\u2029');
}

function doc(nonce: string, title: string, body: H, opts: { island?: boolean } = {}) {
  return html`<!doctype html>
    <html lang="en-GH" class="no-js">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="robots" content="noindex" />
        <title>${title}</title>
        <link rel="icon" href="data:," />
        <style nonce="${nonce}">
          ${raw(CSS)}
        </style>
        ${
          opts.island
            ? html`<script nonce="${nonce}">
                  ${raw(
                    "document.documentElement.className='js';setTimeout(function(){if(!window.__sv)document.documentElement.className='no-js'},10000);",
                  )};
                </script>
                <script defer nonce="${nonce}" src="${ISLAND_PATH}"></script>`
            : ''
        }
      </head>
      <body>
        ${body}
      </body>
    </html>`;
}

function header(step?: { n: number; total: number }) {
  return html`<header class="top">
      <img class="logo" src="${LOGO_PATH}" alt="${COPY.logoAlt}" width="66" height="32" />
      ${step ? html`<p class="step js-only" id="sv-step">${COPY.step(step.n, step.total)}</p>` : ''}
    </header>
    ${
      step
        ? html`<div class="bar js-only" id="sv-bar" aria-hidden="true">
            ${Array.from({ length: step.total }, (_, i) =>
              i < step.n ? html`<span data-on></span>` : html`<span></span>`,
            )}
          </div>`
        : ''
    }`;
}

const privacyLink = html`<a href="${BASE}/privacy">${COPY.privacyLink}</a>`;

// ---------------------------------------------------------------------------
// Survey form
// ---------------------------------------------------------------------------

export interface SurveyView {
  boot: BootData;
  /** Field errors to show (no-JS re-render after server validation). */
  errors?: { field: string; message: string }[];
  banner?: string;
  /** Idempotency key for the no-JS form post. */
  idem: string;
}

interface Ctx {
  def: Definition;
  snap: Snapshot;
  answers: Answers;
  errors: Map<string, string>;
}

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

function describedBy(...ids: (string | false)[]) {
  return ids.filter(Boolean).join(' ');
}

function choiceOptions(q: Question, ctx: Ctx, kind: 'cards' | 'chips') {
  const opts = q.options_source ? ctx.snap[q.options_source] : [];
  return html`<div class="opts${kind === 'chips' ? ' chips' : ''}">
    ${opts.map(
      (o, i) =>
        html`<label class="opt"
          ><input
            type="radio"
            id="f-${q.id}-${i}"
            name="${q.id}"
            value="${o.code}"
            ${ctx.answers[q.id] === o.code ? 'checked' : ''}
          /><span class="box">${o.label}${TICK}</span></label
        >`,
    )}
  </div>`;
}

function ratingOptions(q: Question, ctx: Ctx, headingId: string, errId: string) {
  const isNps = q.type === 'rating_0_10';
  const values = isNps ? Array.from({ length: 11 }, (_, i) => i) : [1, 2, 3, 4, 5];
  const anchors = q.anchors ?? [];
  return html`<div
      role="radiogroup"
      class="opts ${isNps ? 'nps' : 'scale5'}"
      aria-labelledby="${headingId}"
      aria-describedby="${errId}"
    >
      ${values.map((v, i) => {
        const name = isNps ? (v === 0 ? anchors[0] : v === 10 ? anchors[1] : undefined) : anchors[i];
        return html`<label class="opt"
          ><input
            type="radio"
            id="f-${q.id}-${v}"
            name="${q.id}"
            value="${v}"
            aria-label="${name ? `${v}, ${name}` : String(v)}"
            ${ctx.answers[q.id] === v ? 'checked' : ''}
          /><span class="box" aria-hidden="true"
            ><span class="num">${v}</span>${!isNps && name ? html`<span>${name}</span>` : ''}${TICK}</span
          ></label
        >`;
      })}
    </div>
    ${
      isNps && anchors.length === 2
        ? html`<p class="anchors" aria-hidden="true"><span>${anchors[0]}</span><span>${anchors[1]}</span></p>`
        : ''
    }`;
}

function renderQuestion(q: Question, ctx: Ctx, headingId: string): H {
  const visible = isVisible(ctx.def, ctx.snap, ctx.answers, q);
  const required = isRequired(ctx.def, ctx.snap, ctx.answers, q);
  const err = ctx.errors.get(q.id) ?? '';
  const errId = `e-${q.id}`;
  const helpId = q.help ? `h-${q.id}` : false;
  const hint = q.visible_when !== undefined ? (COPY.noJsHint[q.id] ?? '') : '';
  const hintId = hint ? `n-${q.id}` : false;
  const conditionalSuffix =
    typeof q.required === 'object' && q.required !== null
      ? html`<span data-optional ${required ? 'hidden' : ''}> ${COPY.optional}</span>`
      : '';
  const hintEl = hint ? html`<p class="hint nojs-only" id="${hintId}">${hint}</p>` : '';
  const helpEl = q.help && q.type !== 'toggle' ? html`<p class="help" id="${helpId}">${q.help}</p>` : '';
  const errEl = html`<p class="err" id="${errId}">${err}</p>`;
  let body: H;
  switch (q.type) {
    case 'single_choice':
      if (q.options_source === 'branches') {
        const opts = ctx.snap.branches;
        body = html`<label class="ql" for="f-${q.id}">${q.label}${conditionalSuffix}</label>${helpEl}${hintEl}
          <select id="f-${q.id}" name="${q.id}" aria-describedby="${describedBy(helpId, hintId, errId)}">
            <option value="">${COPY.selectBranch}</option>
            ${opts.map(
              (o) =>
                html`<option value="${o.code}" ${ctx.answers[q.id] === o.code ? 'selected' : ''}>
                  ${o.label}
                </option>`,
            )}
          </select>
          ${errEl}`;
      } else {
        body = html`<fieldset aria-describedby="${describedBy(helpId, hintId, errId)}">
          <legend class="ql">${q.label}${conditionalSuffix}</legend>
          ${helpEl}${hintEl}${choiceOptions(q, ctx, q.options_source === 'service_channels' ? 'cards' : 'chips')}
          ${errEl}
        </fieldset>`;
      }
      break;
    case 'rating_5':
    case 'rating_0_10':
      body = html`${ratingOptions(q, ctx, headingId, errId)}${errEl}`;
      break;
    case 'text_short':
    case 'phone': {
      const phone = q.type === 'phone';
      body = html`<label class="ql" for="f-${q.id}">${q.label}${conditionalSuffix}</label>${helpEl}${hintEl}
        <input
          type="${phone ? 'tel' : 'text'}"
          id="f-${q.id}"
          name="${q.id}"
          value="${str(ctx.answers[q.id])}"
          ${phone ? html`inputmode="tel" placeholder="024 123 4567"` : html`maxlength="${q.max_length ?? 80}"`}
          autocomplete="${phone ? 'tel-national' : q.id === 'first_name' ? 'given-name' : 'off'}"
          aria-describedby="${describedBy(helpId, hintId, errId)}"
        />
        ${errEl}`;
      break;
    }
    case 'text_long':
      body = html`<label class="ql" for="f-${q.id}">${q.label}</label>${helpEl}${hintEl}
        <textarea
          id="f-${q.id}"
          name="${q.id}"
          rows="4"
          maxlength="${q.max_length ?? 1000}"
          data-counter-from="800"
          aria-describedby="${describedBy(helpId, hintId, `c-${q.id}`, errId)}"
        >
${str(ctx.answers[q.id])}</textarea>
        <p class="counter" id="c-${q.id}" aria-live="polite" hidden></p>
        ${errEl}`;
      break;
    case 'toggle':
      body = html`<label class="switch"
          ><input
            type="checkbox"
            role="switch"
            id="f-${q.id}"
            name="${q.id}"
            value="true"
            ${ctx.answers[q.id] === true ? 'checked' : ''}
            aria-describedby="${describedBy(helpId, errId)}"
          /><span>${q.label}</span></label
        >
        ${q.help ? html`<p class="help" id="${helpId}">${q.help} ${privacyLink}</p>` : ''} ${errEl}`;
      break;
  }
  return html`<div
    class="q"
    id="q-${q.id}"
    data-q="${q.id}"
    ${visible ? '' : 'data-off'}
    ${err ? 'data-invalid' : ''}
  >
    ${body}
  </div>`;
}

/** The page heading: a lone rating question is its own heading (S-C2…S-C4). */
export function pageHeading(def: Definition, page: Page, index: number, answers: Answers): string {
  const only = page.questions.length === 1 ? page.questions[0] : undefined;
  if (only && only.type.startsWith('rating')) return only.label;
  if (index === 0) return def.intro;
  const csat = answers.csat;
  return page.title_when_low_csat && typeof csat === 'number' && csat <= 2
    ? page.title_when_low_csat
    : page.title;
}

function renderPage(page: Page, index: number, ctx: Ctx, view: SurveyView, total: number): H {
  const n = index + 1;
  const headingId = `t-${n}`;
  const single = page.questions.length === 1 && !!page.questions[0]?.type.startsWith('rating');
  const last = n === total;
  return html`<section
    class="page"
    data-page="${n}"
    ${n === view.boot.page ? 'data-current' : ''}
    aria-labelledby="${headingId}"
  >
    <p class="sec nojs-only">${COPY.section(n, total)}</p>
    ${
      n > 1
        ? html`<button type="button" class="back js-only" data-back>
            ${CHEVRON}<span>${COPY.back}</span>
          </button>`
        : ''
    }
    <h1
      id="${headingId}"
      tabindex="-1"
      ${page.title_when_low_csat ? html`data-title="${page.title}" data-title-low="${page.title_when_low_csat}"` : ''}
    >
      ${pageHeading(ctx.def, page, index, ctx.answers)}
    </h1>
    ${single ? html`<p class="help js-only">${COPY.autoAdvance}</p>` : ''}
    ${page.questions.map((q) => renderQuestion(q, ctx, headingId))}
    ${
      index === 0
        ? html`<div class="actions js-only">
              <button type="button" class="btn" data-continue>${COPY.continue}</button>
            </div>
            <p class="foot">${privacyLink}</p>`
        : ''
    }
    ${
      last
        ? html`<p class="banner" id="sv-msg" role="alert">${view.banner ?? ''}</p>
            <p class="help js-only" id="sv-ts-note" hidden>${COPY.verificationVisible}</p>
            <div id="sv-ts"></div>
            <div class="actions">
              <button type="submit" class="btn" data-submit><span>${COPY.submit}</span></button>
            </div>`
        : ''
    }
  </section>`;
}

export function surveyPage(nonce: string, view: SurveyView) {
  const { definition: def, snapshot: snap, answers } = view.boot;
  const total = def.pages.length;
  const ctx: Ctx = {
    def,
    snap,
    answers,
    errors: new Map((view.errors ?? []).map((e) => [e.field, e.message])),
  };
  const summary = view.errors?.length
    ? html`<div class="summary" id="sv-summary" role="alert" tabindex="-1">
        <p>${COPY.errorSummary}</p>
        <ul>
          ${view.errors.map((e) => html`<li><a href="#q-${e.field}">${e.message}</a></li>`)}
        </ul>
      </div>`
    : '';
  return doc(
    nonce,
    COPY.siteTitle,
    html`<div class="wrap">
      ${header({ n: view.boot.page, total })}
      <div id="sv-live" class="sr-only" aria-live="polite"></div>
      <main id="main">
        <form id="sv-form" method="post" action="${BASE}/submit" novalidate autocomplete="off">
          <input type="hidden" name="idem" value="${view.idem}" />
          <p class="lead nojs-only">${COPY.noJsIntro}</p>
          ${summary} ${def.pages.map((p, i) => renderPage(p, i, ctx, view, total))}
        </form>
      </main>
      <script type="application/json" id="sv-boot">
        ${raw(inlineJson(view.boot))}
      </script>
    </div>`,
    { island: true },
  );
}

// ---------------------------------------------------------------------------
// Outcome pages
// ---------------------------------------------------------------------------

export function confirmationPage(nonce: string, reference: string, contactMasked: string | null | undefined) {
  return doc(
    nonce,
    COPY.siteTitle,
    html`<div class="wrap">
      ${header()}
      <main id="main">
        <div class="thanks">
          ${LEAF}
          <h1 tabindex="-1">${COPY.thanksHeading}</h1>
          <p>${COPY.thanksReference}</p>
          <p class="ref" data-reference>${reference}</p>
          <p>${COPY.thanksBody}</p>
          ${contactMasked ? html`<p>${COPY.thanksContact(contactMasked)}</p>` : ''}
        </div>
        <p class="foot">${privacyLink}</p>
      </main>
    </div>`,
  );
}

export function alreadySharedPage(nonce: string, reference?: string | null) {
  return doc(
    nonce,
    COPY.siteTitle,
    html`<div class="wrap">
      ${header()}
      <main id="main">
        <h1>${COPY.alreadyShared}</h1>
        ${reference ? html`<p class="lead">${COPY.alreadySharedRef(reference)}</p>` : ''}
        <p class="foot">${privacyLink}</p>
      </main>
    </div>`,
  );
}

/** S-C8 "Service unavailable": no form is shown, so no answers can be lost. */
export function unavailablePage(nonce: string, retryHref = BASE) {
  return doc(
    nonce,
    COPY.siteTitle,
    html`<div class="wrap">
      ${header()}
      <main id="main">
        <h1>${COPY.unavailableHeading}</h1>
        <p class="lead">${COPY.unavailableBody}</p>
        <a class="btn" href="${retryHref}">${COPY.tryAgain}</a>
      </main>
    </div>`,
  );
}

export function messagePage(
  nonce: string,
  heading: string,
  body: string,
  action?: { href: string; label: string },
) {
  return doc(
    nonce,
    COPY.siteTitle,
    html`<div class="wrap">
      ${header()}
      <main id="main">
        <h1>${heading}</h1>
        <p class="lead">${body}</p>
        ${action ? html`<a class="btn" href="${action.href}">${action.label}</a>` : ''}
      </main>
    </div>`,
  );
}

/** S-C9 privacy notice (M16). Draft for Serene's approval (X-09); shows only settings that are set. */
export function privacyPage(nonce: string, s: PrivacySettings) {
  const company = s.company_legal_name ?? 'Serene Insurance';
  const contacts = [
    s.data_protection_contact ? html`<li>Data-protection queries: ${s.data_protection_contact}</li>` : '',
    s.support_phone ? html`<li>Phone: ${s.support_phone}</li>` : '',
    s.support_email ? html`<li>Email: ${s.support_email}</li>` : '',
  ].filter((x) => x !== '');
  return doc(
    nonce,
    `Privacy notice · ${COPY.siteTitle}`,
    html`<div class="wrap">
      ${header()}
      <main id="main" class="prose">
        <h1>Privacy notice</h1>
        <h2>Who we are</h2>
        <p>
          This feedback survey is run by ${company}, which is registered with Ghana’s Data Protection
          Commission${s.dpc_registration_number ? html` (registration number ${s.dpc_registration_number})` : ''}.
          We process your information under the Data Protection Act, 2012 (Act 843).
        </p>
        <h2>What we collect</h2>
        <p>
          Your answers to the survey: how you got your policy, the issuing branch where you choose one, the
          type of policy, your ratings, and anything you choose to write. We also record when the survey was
          opened and submitted and whether it came from an SMS link or a QR poster.
        </p>
        <p>
          Your feedback is anonymous. We only collect your mobile number and, if you give it, your first name
          when you switch on “You may contact me about my feedback”. We never ask for policy numbers or Ghana
          Card numbers.
        </p>
        <p>
          To stop the same device sending many responses, we keep a random identifier in a cookie on your
          device. It is not linked to your name or number.
        </p>
        <h2>Why</h2>
        <p>
          To understand how well we serve our customers and to improve our service. If you asked us to contact
          you, our customer experience team uses your number only to follow up on this feedback.
        </p>
        <h2>How long we keep it</h2>
        <ul>
          <li>
            Your mobile number and first name: 12 months after your feedback, or sooner if you ask us to erase
            them.
          </li>
          <li>Written comments: 24 months, then removed.</li>
          <li>Ratings and choices: kept, because they cannot identify you.</li>
          <li>Unfinished surveys: 30 days.</li>
        </ul>
        <h2>Your rights</h2>
        <p>
          Under Act 843 you may ask what information we hold about you, ask us to correct it, ask us to erase
          your contact details, and object to how we use it. You may also complain to the Data Protection
          Commission.
        </p>
        <h2>Contact</h2>
        ${
          contacts.length
            ? html`<ul>
                ${contacts}
              </ul>`
            : html`<p>Please contact any ${company} branch.</p>`
        }
        <p class="foot"><a href="${BASE}">Back to the survey</a></p>
      </main>
    </div>`,
  );
}
