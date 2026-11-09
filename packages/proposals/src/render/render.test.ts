// Renders every proposal form (motor with a realistic answer set, the others with generated
// answers) to PDF and Word, and the certificates to PDF. Set SAMPLES_DIR to keep the files.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateRawSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildCertificate } from '../certificate';
import { FORMS } from '../forms';
import { productByFormId } from '../products';
import type { Answers, AnswerValue, Field, FormDefinition, TableRow } from '../schema';
import { evaluate, validateForm, visibleFields, visibleSections } from '../validate';
import {
  buildProposalDocument,
  renderCertificatePdf,
  renderProposalDocx,
  renderProposalPdf,
  type ProposalMeta,
} from './index';
import { oneLine, winAnsi } from './format';

const logoPng = new Uint8Array(readFileSync(new URL('../../../ui/assets/serene-logo.png', import.meta.url)));
const SAMPLES = process.env.SAMPLES_DIR;
if (SAMPLES) mkdirSync(SAMPLES, { recursive: true });
const save = (name: string, bytes: Uint8Array) => {
  if (SAMPLES) writeFileSync(join(SAMPLES, name), bytes);
};

// ---------------------------------------------------------------------------------------------
// A small PNG encoder for a fake drawn signature (ink squiggle on transparent background).

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function signaturePng(w = 360, h = 110): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  const dot = (x: number, y: number) => {
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const xx = Math.round(x + dx);
        const yy = Math.round(y + dy);
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const i = (yy * w + xx) * 4;
        px[i] = 15;
        px[i + 1] = 30;
        px[i + 2] = 110;
        px[i + 3] = 255;
      }
  };
  for (let t = 0; t < 1; t += 0.0004) {
    const x = 20 + t * 320;
    const y = 55 + 28 * Math.sin(t * 18) * Math.exp(-t * 1.5) + 10 * Math.sin(t * 50);
    dot(x, y);
  }
  for (let t = 0; t < 1; t += 0.001) dot(60 + t * 250, 88 - t * 6);
  const raw = new Uint8Array(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) raw.set(px.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', new Uint8Array(0)),
    ]),
  );
}
const SIG = signaturePng();
const SIG_B64 = Buffer.from(SIG).toString('base64');

// ---------------------------------------------------------------------------------------------
// Reading word/document.xml back out of a .docx (zip central directory + raw deflate).

function zipEntry(zip: Uint8Array, name: string): string | null {
  const b = Buffer.from(zip);
  let eocd = b.length - 22;
  while (eocd >= 0 && b.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) return null;
  const count = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = b.readUInt16LE(p + 10);
    const csize = b.readUInt32LE(p + 20);
    const nlen = b.readUInt16LE(p + 28);
    const xlen = b.readUInt16LE(p + 30);
    const clen = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42);
    const entry = b.subarray(p + 46, p + 46 + nlen).toString('utf8');
    if (entry === name) {
      const lnlen = b.readUInt16LE(local + 26);
      const lxlen = b.readUInt16LE(local + 28);
      const data = b.subarray(local + 30 + lnlen + lxlen, local + 30 + lnlen + lxlen + csize);
      return (method === 0 ? data : inflateRawSync(data)).toString('utf8');
    }
    p += 46 + nlen + xlen + clen;
  }
  return null;
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------------------------------------
// Answers

const motorBase: Answers = {
  title: 'mr',
  full_name: 'Isaac Kwame Asante',
  date_of_birth: '1984-03-12',
  postal_address: 'P.O. Box AN 11234, Accra North',
  phone: '0244123456',
  email: 'isaac.asante@example.com',
  id_type: 'ghana_card',
  id_number: 'GHA-712345678-3',
  occupation: 'Pharmacist, Asante Chemists Ltd',
  vehicles: [
    {
      reg_no: 'GN 3181-18',
      make: 'nissan',
      model: 'Rogue',
      body_type: 'suv',
      cubic_capacity: 2500,
      seating_capacity: 5,
      year_of_make: 2017,
      estimated_value: 145000,
      trailer_value: null,
      colour: 'silver',
    },
  ],
  accessories: 'Android head unit GH₵ 2,500; reverse camera GH₵ 800',
  chassis_no: 'JN8AT2MV5HW123456',
  engine_no: 'QR25-778812',
  vehicle_use: 'private',
  is_owner: 'yes',
  registered_in_name: 'no',
  registered_in_name__details: 'Akosua Asante (spouse), House No. 14, Mango Tree Avenue, Dzorwulu, Accra',
  hire_purchase: 'no',
  physical_defect: 'no',
  previously_insured: 'yes',
  previous_insurer: 'enterprise-insurance',
  years_insured: 6,
  ncd_entitled: 'yes',
  ncd_renewal_notice: ['f-ncd'],
  cover_type: 'comprehensive',
  tppd_increase: 'yes',
  tppd_increase_amount: 12000,
  cover_start: '2026-11-26',
  cover_end: '2027-11-25',
  id_front: ['f-1'],
  id_back: ['f-2'],
  registration_document: ['f-3'],
  roadworthy: ['f-4'],
  photo_front: ['p1'],
  photo_rear: ['p2'],
  photo_left: ['p3'],
  photo_right: ['p4'],
  photo_dashboard: ['p5'],
  photo_chassis: ['p6'],
  agent_broker: '',
};

// The motor form keeps evolving; anything it asks beyond the set above is filled generically.
const motorAnswers: Answers = generateAnswers(FORMS.motor!, motorBase);

function sampleText(field: Field, i: number): string {
  if ('format' in field && field.format) {
    return {
      ghanaCard: 'GHA-712345678-3',
      digitalAddress: 'GA-543-0125',
      vehicleReg: 'GR 2224-AD',
      passport: 'G2847561',
      tin: 'C0012345678',
      chassis: 'JN8AT2MV5HW123456',
    }[field.format];
  }
  const id = field.id;
  if (/company|business_name|firm|insured_name/.test(id)) return 'Adom Logistics Company Limited';
  if (/name/.test(id)) return ['Ama Serwaa Boateng', 'Kofi Mensah', 'Yaw Owusu'][i % 3] ?? 'Ama Boateng';
  if (/address|situation|location|premises|site/.test(id))
    return 'House No. 12, Nii Okaiman Street, Dzorwulu, Accra (GA-543-0125)';
  if (/occupation|profession/.test(id)) return 'Civil engineer';
  if (/country|destination|nationality|citizenship/.test(id)) return 'Germany';
  const base = `Sample answer for ${field.label.toLowerCase()}`;
  const max = 'maxLength' in field && field.maxLength ? field.maxLength : 200;
  return base.slice(0, max);
}

function sampleCell(
  col: { id: string; type: string; options?: readonly { value: string }[] },
  r: number,
): AnswerValue {
  switch (col.type) {
    case 'number':
      return 2 + r;
    case 'money':
      return 15000 * (r + 1);
    case 'year':
      return 2018 + r;
    case 'date':
      return `2026-0${(r % 8) + 1}-15`;
    case 'select':
      return col.options?.[r % (col.options.length || 1)]?.value ?? null;
    default:
      return /name/.test(col.id)
        ? (['Efua Mensah', 'Kojo Antwi', 'Abena Ofori'][r] ?? 'Kojo')
        : `Item ${r + 1} ${col.id.replace(/_/g, ' ')}`;
  }
}

function sampleValue(field: Field, i: number, answers: Answers): void {
  switch (field.type) {
    case 'text':
    case 'textarea':
      answers[field.id] =
        field.type === 'textarea' && !/address/.test(field.id)
          ? `${sampleText(field, i)}. Further details are given here so the answer runs over more than one line on the printed form.`
          : sampleText(field, i);
      return;
    case 'email':
      answers[field.id] = 'ama.boateng@example.com';
      return;
    case 'phone':
      answers[field.id] = '0201234567';
      return;
    case 'number':
      answers[field.id] = field.min !== undefined ? Math.max(field.min, 3) : 3;
      return;
    case 'money':
      answers[field.id] = 250000 + i * 1000;
      if (field.currency === 'select') answers[`${field.id}__currency`] = 'USD';
      return;
    case 'percent':
      answers[field.id] = 10;
      return;
    case 'year':
      answers[field.id] = 2019;
      return;
    case 'date':
      answers[field.id] =
        field.minAge !== undefined || /birth|dob/.test(field.id)
          ? '1986-07-21'
          : field.role === 'coverEnd'
            ? '2027-11-30'
            : '2026-12-01';
      return;
    case 'select':
    case 'radio':
      answers[field.id] = field.options[0]?.value ?? '';
      return;
    case 'checkboxes':
      answers[field.id] = field.options.slice(0, 2).map((o) => o.value);
      return;
    case 'yesno':
      answers[field.id] = i % 2 === 0 ? 'yes' : 'no';
      if (field.details && answers[field.id] === field.details.when)
        answers[`${field.id}__details`] =
          'Details given by the proposer, for example dates, amounts and the people involved.';
      return;
    case 'table':
      answers[field.id] = Array.from({ length: Math.min(field.maxRows ?? 2, 2) }, (_, r) =>
        Object.fromEntries(field.columns.map((c) => [c.id, sampleCell(c, r)])),
      ) as TableRow[];
      return;
    case 'file':
      answers[field.id] = [`file-${field.id}`];
      return;
    case 'read':
      if (field.acknowledge) answers[field.id] = true;
      return;
  }
}

/** Fills every visible field with a plausible value (repeating until conditional fields settle). */
function generateAnswers(def: FormDefinition, start: Answers = {}): Answers {
  const answers: Answers = { ...start };
  for (let pass = 0; pass < 4; pass++) {
    let i = 0;
    const fields: Field[] = [];
    for (const step of def.steps)
      for (const s of visibleSections(step, answers)) fields.push(...visibleFields(s, answers));
    for (const f of def.declaration.fields ?? []) if (evaluate(f.showIf, answers)) fields.push(f);
    for (const f of fields) {
      i++;
      if (f.id in answers) continue;
      sampleValue(f, i, answers);
    }
  }
  return answers;
}

function fileFields(
  def: FormDefinition,
  answers: Answers,
): { kind: string; name: string; size: number; createdAt: string }[] {
  const out: { kind: string; name: string; size: number; createdAt: string }[] = [];
  for (const step of def.steps)
    for (const s of visibleSections(step, answers))
      for (const f of visibleFields(s, answers))
        if (f.type === 'file' && Array.isArray(answers[f.id]))
          out.push({
            kind: f.kind,
            name: `${f.kind}.jpg`,
            size: 180_000 + out.length * 23_456,
            createdAt: '2026-11-06T09:12:44Z',
          });
  return out;
}

function meta(def: FormDefinition, answers: Answers, draft = false): ProposalMeta {
  const product = productByFormId(def.id);
  const m: ProposalMeta = {
    proposalNo: 'PRP-26-000123',
    productName: product?.name ?? def.id,
    customerNo: 'USR10017',
    phone: '+233244123456',
    confirmations: [
      {
        id: 'privacy',
        label:
          'I agree that Serene Insurance may process my personal data to assess this proposal and administer my policy (Data Protection Act, 2012).',
      },
      {
        id: 'electronic',
        label:
          'I agree to sign this proposal electronically and that my electronic signature has the same effect as a handwritten one.',
      },
      ...def.declaration.confirmations,
    ],
    files: fileFields(def, answers),
    status: draft ? 'draft' : 'submitted',
  };
  if (!draft) {
    m.submittedAt = '2026-11-06T09:20:31Z';
    m.signature = {
      method: 'drawn',
      signedName: String(answers.full_name ?? 'Ama Serwaa Boateng'),
      signedAt: '2026-11-06T09:20:05Z',
      imagePng: SIG_B64,
    };
    m.ip = '154.160.23.117';
    m.userAgent =
      'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
    m.answersSha256 = '9f2c4e1a7b3d5f60812e4c9a0b7d3f5e2a1c8b6d4e0f9a7c5b3d1e8f6a4c2b09';
  }
  return m;
}

async function checkPdf(bytes: Uint8Array, title: string): Promise<number> {
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(0);
  expect(pdf.getTitle() ?? '').toContain(winAnsi(title));
  return pdf.getPageCount();
}

function checkDocx(bytes: Uint8Array, title: string): void {
  const xml = zipEntry(bytes, 'word/document.xml');
  expect(xml).not.toBeNull();
  expect(xml ?? '').toContain(xmlEscape(title));
}

// ---------------------------------------------------------------------------------------------

describe('proposal documents', () => {
  it('motor (realistic answers) renders to PDF and Word with the signature record', async () => {
    const def = FORMS.motor!;
    expect(validateForm(def, motorAnswers, new Date('2026-11-06T00:00:00Z'))).toEqual([]);
    const model = buildProposalDocument(def, motorAnswers, meta(def, motorAnswers));
    expect(model.draft).toBe(false);
    // Wizard help text (section descriptions) is not printed, and neither are uploads.
    expect(model.blocks.some((b) => b.kind === 'note')).toBe(false);
    expect(model.blocks.some((b) => b.kind === 'files')).toBe(false);
    expect(model.declaration.signaturePng?.length).toBeGreaterThan(0);
    expect(model.declaration.lines.flat().map((l) => l.label)).toContain('Insurance to commence on');
    expect(model.record.rows.find((r) => r.label === 'Answers SHA-256')?.value).toMatch(/^[0-9a-f]{64}$/);
    const table = model.blocks.find((b) => b.kind === 'table');
    expect(table && table.kind === 'table' ? table.rows.length : 0).toBe(2); // printRows
    const pdf = await renderProposalPdf(model, { logoPng });
    expect(await checkPdf(pdf, def.title)).toBeGreaterThanOrEqual(2);
    save('motor-proposal.pdf', pdf);
    const docx = await renderProposalDocx(model, { logoPng });
    checkDocx(docx, def.title);
    save('motor-proposal.docx', docx);
  });

  it('motor draft (unsigned) renders with the DRAFT watermark', async () => {
    const def = FORMS.motor!;
    const answers = { ...motorAnswers, cover_type: 'tpo' };
    const model = buildProposalDocument(def, answers, meta(def, answers, true));
    expect(model.draft).toBe(true);
    expect(model.declaration.signaturePng).toBeUndefined();
    const pdf = await renderProposalPdf(model, { logoPng });
    await checkPdf(pdf, def.title);
    save('motor-proposal-draft.pdf', pdf);
    const docx = await renderProposalDocx(model, { logoPng });
    expect(zipEntry(docx, 'word/header2.xml') ?? zipEntry(docx, 'word/header1.xml') ?? '').toContain('DRAFT');
    save('motor-proposal-draft.docx', docx);
  });

  const others = Object.values(FORMS).filter((f) => f.id !== 'motor');
  it.each(others.map((f) => [f.id, f] as const))('%s renders with generated answers', async (id, def) => {
    const answers = generateAnswers(def);
    const model = buildProposalDocument(def, answers, meta(def, answers));
    const pdf = await renderProposalPdf(model, { logoPng });
    await checkPdf(pdf, def.title);
    save(`${id}-proposal.pdf`, pdf);
    const docx = await renderProposalDocx(model, { logoPng });
    checkDocx(docx, def.title);
    save(`${id}-proposal.docx`, docx);
  });

  // User direction 2026-11-09: the identity check, vehicle documents and photos of the vehicle are
  // not part of the form (on screen, PDF or Word); the files are the proposal's documents instead.
  it('leaves uploads and upload-only sections off the motor form, keeping them in the signature record', async () => {
    const def = FORMS.motor!;
    const model = buildProposalDocument(def, motorAnswers, meta(def, motorAnswers));
    const headings = model.blocks.flatMap((b) => (b.kind === 'heading' ? [b.title] : []));
    for (const gone of ['Identity check', 'Vehicle documents', 'Photos of the vehicle'])
      expect(headings).not.toContain(gone);
    expect(model.blocks.some((b) => b.kind === 'files')).toBe(false);
    expect(model.declaration.lines.flat().some((l) => /photo|document/i.test(l.label))).toBe(false);
    // The electronic signature record still lists every attached file.
    expect(model.record.files.length).toBe(meta(def, motorAnswers).files.length);
    expect(model.record.files.length).toBeGreaterThan(0);
    const xml = zipEntry(await renderProposalDocx(model, { logoPng }), 'word/document.xml') ?? '';
    for (const gone of [
      'Identity check',
      'IDENTITY CHECK',
      'Vehicle documents',
      'VEHICLE DOCUMENTS',
      'Photos of the vehicle',
      'PHOTOS OF THE VEHICLE',
      'A photo of your face',
    ])
      expect(xml).not.toContain(gone);
    // Answers around them are still printed.
    expect(xml).toContain(xmlEscape(String(motorAnswers.chassis_no)));
  });

  it.each(Object.values(FORMS).map((f) => [f.id, f] as const))(
    '%s: no upload field or upload-only section is printed',
    (_id, def) => {
      const answers = generateAnswers(def, def.id === 'motor' ? motorBase : {});
      const model = buildProposalDocument(def, answers, meta(def, answers));
      expect(model.blocks.some((b) => b.kind === 'files')).toBe(false);
      const printedHeadings = new Set(model.blocks.flatMap((b) => (b.kind === 'heading' ? [b.title] : [])));
      for (const step of def.steps)
        for (const section of step.sections)
          if (section.title && section.fields.every((f) => f.type === 'file'))
            expect(printedHeadings.has(section.title), `${def.id} › ${section.title}`).toBe(
              // a same-named section with printable fields elsewhere may legitimately print it
              def.steps.some((st) =>
                st.sections.some(
                  (x) =>
                    x !== section && x.title === section.title && x.fields.some((f) => f.type !== 'file'),
                ),
              ),
            );
    },
  );

  // Regression (2026-11-09, PRP-26-000001…3 on production): an answer typed on several lines (an
  // address) in a field printed on one line threw "WinAnsi cannot encode \n", so the PDF failed.
  it('joins lines of a multi-line answer printed on one line', () => {
    expect(oneLine('P. O. Box CE 11319,\nTema.')).toBe('P. O. Box CE 11319, Tema.');
    expect(oneLine('Line 1\nLine 2')).toBe('Line 1, Line 2');
    expect(oneLine('  a \n\n  b  \n')).toBe('a, b');
    expect(oneLine('no breaks')).toBe('no breaks');
    expect(winAnsi('a\r\nb\rc\td\u2028e')).toBe('a\nb\nc d\ne');
  });

  it.each(Object.values(FORMS).map((f) => [f.id, f] as const))(
    '%s renders when every text answer spans several lines (\n, \r\n, tabs)',
    async (_id, def) => {
      const base = generateAnswers(def, def.id === 'motor' ? motorBase : {});
      const multi = (v: string, i: number) =>
        [`${v},\nsecond line`, `${v}\r\nsecond line\r\n`, `\t${v}\n\n  third`][i % 3] ?? v;
      let i = 0;
      const answers: Answers = Object.fromEntries(
        Object.entries(base).map(([k, v]) => [
          k,
          typeof v === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(v) && !/^[a-z0-9_-]+$/.test(v)
            ? multi(v, i++)
            : Array.isArray(v) && v.every((r) => r && typeof r === 'object')
              ? (v as TableRow[]).map((r) =>
                  Object.fromEntries(
                    Object.entries(r).map(([c, x]) => [c, typeof x === 'string' ? multi(x, i++) : x]),
                  ),
                )
              : v,
        ]),
      ) as Answers;
      for (const draft of [false, true]) {
        const model = buildProposalDocument(def, answers, meta(def, answers, draft));
        await checkPdf(await renderProposalPdf(model, { logoPng }), def.title);
        checkDocx(await renderProposalDocx(model, { logoPng }), def.title);
      }
    },
  );

  it('never throws on characters outside WinAnsi', async () => {
    const def = FORMS.motor!;
    const answers = { ...motorAnswers, occupation: 'Ɛkuaba ŋkɔ → trader ≥ 5 yrs ✓ 😀 “quoted” – ₵500 中文' };
    const model = buildProposalDocument(def, answers, meta(def, answers));
    await expect(renderProposalPdf(model, { logoPng })).resolves.toBeInstanceOf(Uint8Array);
    expect(winAnsi('GH₵ 5 → ok (GH₵) ₵20')).toBe('GHS 5 -> ok (GHS) GHS 20');
  });
});

describe('certificate documents', () => {
  const motorProduct = productByFormId('motor')!;
  const base = {
    policyNo: 'SE26MCO10001-E',
    certificateNo: 'C01-26-10001',
    customerNo: 'USR10017',
    policyHolder: 'Isaac Kwame Asante',
    startsOn: '2026-11-26',
    expiresOn: '2027-11-25',
    issuedAt: '2026-11-21T18:45:57Z',
    tppdLimit: 8000,
    verifyUrl: 'https://sereneinsurance.com/verify?certificate=C01-26-10001',
  };

  it('motor third party only', async () => {
    const cert = buildCertificate({
      ...base,
      policyNo: 'SE26MTP10001-E',
      product: motorProduct,
      answers: { ...motorAnswers, cover_type: 'tpo', tppd_increase: 'no', tppd_increase_amount: null },
    });
    const pdf = await renderCertificatePdf(cert, { logoPng });
    expect(await checkPdf(pdf, 'C01-26-10001')).toBe(1);
    save('motor-certificate-tpo.pdf', pdf);
  });

  it('motor comprehensive with a signature image', async () => {
    const cert = buildCertificate({ ...base, product: motorProduct, answers: motorAnswers });
    const pdf = await renderCertificatePdf(cert, { logoPng, signaturePng: SIG });
    expect(await checkPdf(pdf, 'C01-26-10001')).toBe(1);
    save('motor-certificate-comprehensive.pdf', pdf);
  });

  it.each(['taxi', 'general_cartage', 'passenger_bus'])('motor %s renders', async (use) => {
    const cert = buildCertificate({
      ...base,
      product: motorProduct,
      answers: { ...motorAnswers, vehicle_use: use },
    });
    const pdf = await renderCertificatePdf(cert, { logoPng });
    expect(await checkPdf(pdf, 'C01-26-10001')).toBe(1);
    save(`motor-certificate-${use}.pdf`, pdf);
  });

  it.each(
    Object.values(FORMS)
      .filter((f) => f.id !== 'motor')
      .map((f) => [f.id, f] as const),
  )('%s general certificate renders', async (id, def) => {
    const product = productByFormId(def.id)!;
    const cert = buildCertificate({
      ...base,
      policyNo: `SE26${product.code}10001-E`,
      product,
      answers: generateAnswers(def),
    });
    expect(cert.kind).toBe('general');
    const pdf = await renderCertificatePdf(cert, { logoPng });
    expect(await checkPdf(pdf, 'C01-26-10001')).toBe(1);
    save(`${id}-certificate.pdf`, pdf);
  });
});
