# Digitising a proposal form

Each paper form in `PROPOSAL FORMS (2).zip` becomes one typed definition in
`packages/proposals/src/forms/<form-id>.ts` (schema: `packages/proposals/src/schema.ts`).
`forms/motor.ts` is the reference: copy its conventions.

## Rules

1. **Wording is the paper form's.** Copy every question, option, table column, note, warranty and
   declaration paragraph from the paper form, in order, with its printed number (`number`).
   Fix spelling only. `docLabel` keeps the paper wording when the screen `label` is rephrased as a
   clearer question. Nothing on the paper form may be missing from the definition: the completed
   document is rendered from it and must read like the paper form filled in.
2. **Structured answers.** Use `select`/`radio`/`checkboxes` wherever the paper form lists
   choices or the answer comes from a known list (shared lists in `options.ts`: ID types, titles,
   regions, branches, insurers, vehicle makes, body types, wall/roof materials, currencies,
   countries). YES/NO questions with "if yes, give details" are `yesno` with `details`.
   Repeating grids (items, employees, vehicles, claims history, locations) are `table` with
   `printRows` equal to the number of blank rows on paper. Amounts are `money` (GH₵ unless the form
   allows foreign currency; then `currency: 'select'`). Dates are `date`; ages become date of
   birth where a person's age is asked.
3. **Steps.** 3–8 steps with short titles for the numbered progress bar, e.g. "Your details",
   "Business", "Property", "Cover", "History", "Documents". Group by meaning, not by page.
4. **Things to read (user requirement).** Any notice, condition, warranty, important note,
   "standard cover provides…" text, definition or exclusion the proposer is meant to read becomes a
   `read` field placed in the step where it applies (at the start of that step, or immediately
   before the questions it governs), with `acknowledge` when the proposer must confirm it
   (e.g. "I have read and understood this notice"). Preamble notices at the top of the paper form go in `preamble`
   AND as a `read` field at the start of step 1.
5. **Proposer details** are always step 1: name (`prefill: 'fullName'` for individuals, or
   `companyName` for business forms, both `saveToProfile`), phone (`prefill: 'phone'`), email,
   address, and ID (`idType`/`idNumber`) for individuals, or company registration number/TIN for
   businesses, with prefill/saveToProfile set. Use the paper's own fields; add the missing
   essentials (email, phone, ID) because an online sale needs them, and mark them clearly with a
   comment `// added for online sale`.
6. **Roles.** Mark `role: 'coverStart'` (required, `minDays: 0`, `maxDays: 60`) and
   `role: 'coverEnd'` on the period of insurance; `role: 'sumInsured'` on the total sum insured /
   limit of indemnity / bond amount / contract value; `role: 'insuredName'` on the insured's name;
   `role: 'riskAddress'` on the location of the risk. If the paper form has no period of insurance,
   add one in the Cover step with `docPlacement: 'declaration'`.
7. **Documents step** (always the last step before signing): uploads with `type: 'file'`,
   `accept`, `capture: 'environment'` on phones, `guidance`, and `showIf` where the requirement only
   applies to some answers. **Identity (law change, L.I. 2523, enforced 2 Nov 2026): never ask for a
   photo/scan of the Ghana Card (no `id_front`/`id_back`).** Put `individualIdentitySection()` from
   `src/kyc.ts` first in the Documents step of every individual form (Ghana Card number is the
   `id_number` field in step 1; the section asks for a live face photo, kind `id_selfie`, and the
   passport page for foreign nationals), or `businessIdentitySection()` for business forms
   (company registration document, the signatory's Ghana Card number and face photo). `ID_TYPES`
   now has only Ghana Card, non-citizen Ghana Card and passport. Then add what the underwriter
   needs for that line, e.g.:
   * property: photos of the building (front, inside) and valuation report (optional), inventory of contents (optional);
   * travel: passport bio page (required), visa (optional), itinerary/ticket (optional);
   * marine cargo: proforma/commercial invoice (required), bill of lading/airway bill (optional);
   * engineering: contract document, bill of quantities, site plan, project schedule;
   * bonds: tender/contract document (required), latest financial statements, board resolution;
   * workmen's comp / GPA: staff list with names, occupations and annual earnings (required, can
     instead be entered in a table on the form);
   * professional/D&O/cyber/fidelity/bankers: latest audited accounts, professional certificates;
   * money/GIT/burglary/public liability: what the paper form references, plus photos of security measures where relevant.
   The lead may refine uploads after the KYC research; keep `kind` values snake_case and specific.
8. **Declaration.** `paragraphs` verbatim from the paper form; `confirmations` are 1–3 short
   statements the customer ticks (derived from the declaration). Do NOT add generic
   terms/privacy/e-signature consents: the app adds those to every form. `fields` holds anything
   printed in the signature block (agent/broker, date, witness, capacity/position of signatory
   for companies). `signatureLabel` as printed.
9. **No invention.** Do not add questions the paper does not ask except the essentials in 5–7.
   Where the paper form is ambiguous, choose the reading an underwriter would expect and note it in
   a short comment.
10. `id` and `version: 1` are fixed (`id` = file name); `source` = archive-relative path of the
    file you used. Export name is the camelCase id (already in the stub and in `forms/index.ts`).

## Checks

`pnpm --filter @serene/proposals test` (structural tests in `src/forms.test.ts`) and
`pnpm --filter @serene/proposals typecheck` must pass for your forms. Then run
`npx prettier --write` on your files.
