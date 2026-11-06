// Proposal-form definitions: the digital version of Serene's paper proposal forms.
//
// One FormDefinition per paper form. The same definition drives:
//   * the customer's step-by-step wizard (apps/account),
//   * validation in the browser and again on the server (validate.ts, apps/survey-worker),
//   * the completed proposal document, laid out like the paper form, as PDF and Word (render/),
//   * the staff view of a submitted proposal (apps/portal).
//
// Wording rule: `label`, `title`, option labels and declaration text are copied from the paper
// form (spelling fixed, capitalisation normalised to sentence case for the screen). The document
// renderer prints `docLabel` when given, else `label`, so the printed form can keep the paper
// wording while the screen uses a clearer question.

/** Profile values a field can be pre-filled from (the customer's saved details). */
export type ProfileKey =
  | 'fullName'
  | 'title'
  | 'dateOfBirth'
  | 'gender'
  | 'phone'
  | 'email'
  | 'postalAddress'
  | 'residentialAddress'
  | 'digitalAddress'
  | 'occupation'
  | 'employer'
  | 'idType'
  | 'idNumber'
  | 'nationality'
  | 'tin'
  | 'companyName'
  | 'companyRegNo';

/** Show a field/section only when an earlier answer matches. */
export type Condition =
  | { field: string; equals: string | number | boolean }
  | { field: string; in: readonly string[] }
  | { field: string; notIn: readonly string[] }
  | { field: string; truthy: true }
  | { field: string; includes: string } // checkboxes field contains this value
  | { all: readonly Condition[] }
  | { any: readonly Condition[] }
  | { not: Condition };

export interface Option {
  value: string;
  label: string;
  /** Extra line under the option on screen. */
  hint?: string;
}

/** Options shared by many forms (ID types, titles, Ghana regions …) live in options.ts. */
export type OptionsRef = readonly Option[];

interface FieldBase {
  /** Unique within the form; lower_snake_case. Answers are stored under this key. */
  id: string;
  label: string;
  /** Wording printed on the completed document if different from `label`. */
  docLabel?: string;
  /** Question number as printed on the paper form, e.g. "1", "2a", "(iii)". */
  number?: string;
  help?: string;
  placeholder?: string;
  required?: boolean;
  showIf?: Condition;
  /** Screen width hint inside a 6-column grid on desktop; phones always use full width. */
  width?: 'full' | 'half' | 'third';
  /** Fields sharing a row key print on one line in the document (e.g. "FULL NAME … AGE …"). */
  row?: string;
  prefill?: ProfileKey;
  /** The answer is copied back to the customer's profile when they submit. */
  saveToProfile?: ProfileKey;
  /**
   * Where the document prints this answer. Default: in its section. 'declaration' prints it in
   * the signature block, as on the paper form (e.g. "Insurance to commence on …"), even though
   * the wizard asks it earlier because the quote needs it.
   */
  docPlacement?: 'declaration';
  /** Role the quote engine / certificate reads this field as (see products.ts). */
  role?: FieldRole;
}

/** Answers other parts of the system read by meaning rather than by form-specific id. */
export type FieldRole =
  | 'coverStart'
  | 'coverEnd'
  | 'coverType'
  | 'sumInsured'
  | 'vehicles'
  | 'vehicleUse'
  | 'tppdIncrease'
  | 'travelDestination'
  | 'travelers'
  | 'insuredName'
  | 'riskAddress';

export interface TextField extends FieldBase {
  type: 'text' | 'textarea' | 'email' | 'phone';
  maxLength?: number;
  /** Named format checked in validate.ts. */
  format?: 'ghanaCard' | 'digitalAddress' | 'vehicleReg' | 'passport' | 'tin' | 'chassis';
}

export interface NumberField extends FieldBase {
  type: 'number' | 'money' | 'percent' | 'year';
  min?: number;
  max?: number;
  /** Shown after the input, e.g. "cc", "seats", "km". Money is always GH₵ unless `currency` says otherwise. */
  unit?: string;
  /** For money fields that may be in another currency (marine cargo invoices, for example). */
  currency?: 'GHS' | 'USD' | 'EUR' | 'GBP' | 'select';
}

export interface DateField extends FieldBase {
  type: 'date';
  /** Relative bounds in days from today, e.g. { minDays: 0 } = not in the past. */
  minDays?: number;
  maxDays?: number;
  /** Date of birth: bounds in years (age). */
  minAge?: number;
  maxAge?: number;
}

export interface ChoiceField extends FieldBase {
  type: 'select' | 'radio' | 'checkboxes';
  options: OptionsRef;
  /** Adds an "Other (please specify)" choice whose text is stored under `${id}__other`. */
  allowOther?: boolean;
  /** checkboxes: at least this many ticked when required (default 1). */
  minSelected?: number;
}

/** The paper forms' "YES / NO — If YES, give particulars …" pattern. */
export interface YesNoField extends FieldBase {
  type: 'yesno';
  /** Follow-up text box, stored under `${id}__details`. */
  details?: { when: 'yes' | 'no'; label: string; docLabel?: string; required?: boolean };
}

export interface TableColumn {
  id: string;
  label: string;
  type: 'text' | 'number' | 'money' | 'date' | 'year' | 'select';
  options?: OptionsRef;
  required?: boolean;
  unit?: string;
  /** Print width weight in the document table (default 1). */
  weight?: number;
}

/** A repeating list: vehicles, employees, items, previous claims … */
export interface TableField extends FieldBase {
  type: 'table';
  columns: readonly TableColumn[];
  minRows?: number;
  maxRows?: number;
  /** Button text, e.g. "Add another vehicle". */
  addLabel: string;
  /** Rows printed in the document even when empty, to match the paper form (default = rows given). */
  printRows?: number;
}

/** Photos and documents the customer attaches (ID card, vehicle photos, invoices …). */
export interface FileField extends FieldBase {
  type: 'file';
  /** Storage/review category, e.g. "id_front", "vehicle_front", "valuation_report". */
  kind: string;
  accept: readonly ('image' | 'pdf')[];
  multiple?: boolean;
  maxFiles?: number;
  /** Open the camera directly on phones: rear camera for documents/vehicles, front for a selfie. */
  capture?: 'environment' | 'user';
  /** Short how-to shown beside the upload, e.g. "Lay the card flat, avoid glare". */
  guidance?: string;
}

/** Text the customer reads before going on (important notices, conditions, warranties). */
export interface ReadField extends FieldBase {
  type: 'read';
  paragraphs: readonly string[];
  /** If set, a checkbox the customer must tick to go on; stored as `true` under `id`. */
  acknowledge?: string;
}

export type Field =
  TextField | NumberField | DateField | ChoiceField | YesNoField | TableField | FileField | ReadField;

export type FieldType = Field['type'];

export interface Section {
  id: string;
  /** Heading as printed on the paper form (e.g. "PARTICULARS OF VEHICLE"). Optional. */
  title?: string;
  number?: string;
  description?: string;
  showIf?: Condition;
  fields: readonly Field[];
}

/** One stage of the wizard, shown in the numbered progress bar. 4–8 steps per form. */
export interface Step {
  id: string;
  /** Short, for the progress bar: "Your details", "Vehicle", "Cover", "History", "Documents". */
  title: string;
  description?: string;
  sections: readonly Section[];
}

export interface Declaration {
  title?: string;
  /** Verbatim declaration paragraphs from the paper form. */
  paragraphs: readonly string[];
  /** Each must be ticked before signing. The first is usually "I have read and agree …". */
  confirmations: readonly { id: string; label: string }[];
  /** Fields printed with the signature block on the paper form (commencement date, agent …). */
  fields?: readonly Field[];
  /** As printed beside the signature line, e.g. "Proposer's Signature". */
  signatureLabel: string;
  dateLabel?: string;
}

export interface FormDefinition {
  /** Stable id, kebab-case, also the product's form id: "motor", "travel", "fire" … */
  id: string;
  /** Bump when questions change; submitted proposals keep the version they were filled on. */
  version: number;
  /** Paper title verbatim, e.g. "MOTOR VEHICLE PROPOSAL FORM (PRIVATE & COMMERCIAL)". */
  title: string;
  /** Second title line, e.g. "Please Provide Definite Answers to Each Question". */
  subtitle?: string;
  /** Source file in the PROPOSAL FORMS archive, for traceability. */
  source: string;
  /** Notices printed at the top of the paper form (e.g. "IMPORTANT NOTICE …"); the wizard shows them first. */
  preamble?: readonly string[];
  steps: readonly Step[];
  declaration: Declaration;
}

// ---------------------------------------------------------------------------------------------
// Answers

export type Scalar = string | number | boolean | null;
export type TableRow = Record<string, Scalar>;
/** File answers are ids of uploaded files (sales.proposal_files.id). */
export type AnswerValue = Scalar | readonly string[] | readonly TableRow[];
export type Answers = Record<string, AnswerValue>;

export interface FieldError {
  field: string;
  message: string;
  /** Row index for table cells. */
  row?: number;
  column?: string;
}

// ---------------------------------------------------------------------------------------------
// Signature captured at the declaration step.

export interface SignatureInfo {
  method: 'drawn' | 'typed' | 'uploaded';
  /** The name the customer typed under the signature (always required). */
  signedName: string;
  signedAt: string; // ISO timestamp
  /** PNG data (drawn/typed rendered to PNG, or the uploaded image normalised to PNG), base64 without prefix. */
  imagePng?: string;
}

// ---------------------------------------------------------------------------------------------
// Certificate of insurance (the layout copies Serene's motor certificate; see render/certificate.ts).

export interface CertificateData {
  kind: 'motor' | 'general';
  /** Second title line, e.g. "MOTOR THIRD PARTY ONLY INSURANCE ACT 1958 (GHANA)". */
  actLine: string;
  /** Box heading, e.g. "MOTOR THIRD PARTY ONLY", "COMPREHENSIVE", "FIRE AND SPECIAL PERILS". */
  coverTitle: string;
  certificateNo: string;
  policyNo: string;
  customerNo: string;
  policyHolder: string;
  /** Motor: "1. INDEX MARK AND REGISTRATION OF VEHICLE". General: the insured subject. */
  numberedItems: readonly { label: string; value: string }[];
  /** Long-form clauses (persons entitled to drive, limitations as to use, not covered …). */
  clauses: readonly { label: string; value?: string; lines: readonly string[] }[];
  /** Two-column facts at the bottom (CHASSIS NO, SEATING CAPACITY, T.P.P.D LIMIT …). */
  facts: readonly { label: string; value: string }[];
  effectiveDate: string; // ISO date
  expiryDate: string; // ISO date
  issuedAt: string; // ISO timestamp
  footnote?: string;
  certifyText: string;
  signatoryTitle: string; // "CHIEF EXECUTIVE OFFICER"
  /** Public verification URL printed as text + QR code. */
  verifyUrl?: string;
}
