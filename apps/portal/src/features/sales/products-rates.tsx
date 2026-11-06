// Administration › Products & rates (products.manage): the product catalogue (read-only), the
// sales settings used on quotes and certificates, the certificate signature image, and the
// indicative rate tables (settings key `sales_rates`, shape RateTables in @serene/proposals).
import { useId, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  CATEGORY_LABELS,
  DEFAULT_RATES,
  MOTOR_CLASS_LABELS,
  PRODUCTS,
  resolveRates,
  type Product,
  type RateTables,
} from '@serene/proposals';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Badge, Button, TextField } from '../../ui/controls';
import { ConfirmDialog } from '../config/shared';
import {
  uploadSignature,
  useSalesSettings,
  useSignedUrl,
  useUpdateSalesSettings,
  type SalesSettingKey,
  type SettingRow,
} from './api';
import { DataTable, ErrorNote, Panel, QueryState, type Column } from './ui';

// ---- Pure helpers ------------------------------------------------------------------------

/** 0.15 → 15 (rounded to avoid 15.000000000000002). */
export const toPct = (fraction: number) => Math.round(fraction * 100 * 1e6) / 1e6;
/** 15 → 0.15 */
export const fromPct = (pct: number) => Math.round((pct / 100) * 1e9) / 1e9;

type Path = readonly (string | number)[];

function getIn(obj: unknown, path: Path): unknown {
  return path.reduce<unknown>(
    (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
    obj,
  );
}

function setIn<T>(obj: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path as [string | number, ...(string | number)[]];
  const base = (obj ?? (typeof head === 'number' ? [] : {})) as Record<string | number, unknown>;
  const copy = (Array.isArray(base) ? [...base] : { ...base }) as Record<string | number, unknown>;
  copy[head] = setIn(base[head], rest, value);
  return copy as T;
}

const settingValue = (row: SettingRow | undefined) => row?.value;
const asText = (v: unknown) => (v === null || v === undefined ? '' : String(v));

const TRAVEL_ZONE_LABELS: Record<string, string> = {
  africa: 'Africa',
  schengen_europe: 'Schengen and Europe',
  worldwide_excl_us: 'Worldwide, excluding USA and Canada',
  worldwide_incl_us: 'Worldwide, including USA and Canada',
};
const PA_CLASS_LABELS: Record<string, string> = {
  class_1: 'Class 1 (office and low-risk work)',
  class_2: 'Class 2 (light manual work)',
  class_3: 'Class 3 (heavy manual work)',
};

/** Keys the structured editor covers; anything else falls back to the generic editor. */
const KNOWN_KEYS = new Set([
  'version',
  'updatedAt',
  'taxes',
  'shortPeriod',
  'motor',
  'travel',
  'personalAccident',
  'home',
  'quoteValidityDays',
]);

// ---- Products ----------------------------------------------------------------------------

function ProductsList() {
  const columns: Column<Product>[] = [
    { key: 'name', header: 'Product', cell: (p) => p.name },
    { key: 'code', header: 'Code', cell: (p) => <span className="tabular-nums">{p.code}</span> },
    { key: 'category', header: 'Type', cell: (p) => CATEGORY_LABELS[p.category] },
    {
      key: 'purchase',
      header: 'How it is priced',
      cell: (p) =>
        p.purchase === 'instant' ? (
          <Badge tone="success">Instant price</Badge>
        ) : (
          <Badge tone="info">Priced by an underwriter</Badge>
        ),
    },
  ];
  return (
    <Panel title="Products" padded={false}>
      <p className="px-4 pb-3 pt-1 text-[14px] text-secondary md:px-6">
        The products customers can buy online. Products with an instant price are priced from the rate tables
        below; the others are sent to an underwriter, who sets the price.
      </p>
      <DataTable rows={PRODUCTS} columns={columns} rowKey={(p) => p.code} caption="Products sold online" />
    </Panel>
  );
}

// ---- Sales settings ----------------------------------------------------------------------

type Settings = Partial<Record<SalesSettingKey, SettingRow>>;

function SalesSettingsForm({ settings }: { settings: Settings }) {
  const update = useUpdateSalesSettings();
  const [tppd, setTppd] = useState(asText(settingValue(settings.sales_tppd_limit) ?? 8000));
  const [validity, setValidity] = useState(asText(settingValue(settings.sales_quote_validity_days) ?? 30));
  const [series, setSeries] = useState(asText(settingValue(settings.sales_certificate_series) ?? '01'));
  const [title, setTitle] = useState(
    asText(settingValue(settings.sales_certificate_signatory_title) ?? 'CHIEF EXECUTIVE OFFICER'),
  );
  const [showErrors, setShowErrors] = useState(false);

  const tppdN = Number(tppd);
  const validityN = Number(validity);
  const errors = {
    tppd:
      !Number.isInteger(tppdN) || tppd.trim() === '' || tppdN < 1000 || tppdN > 1_000_000
        ? 'Enter a whole number of cedis from 1,000 to 1,000,000.'
        : undefined,
    validity:
      !Number.isInteger(validityN) || validityN < 1 || validityN > 90
        ? 'Enter a whole number of days from 1 to 90.'
        : undefined,
    series: /^\d{2}$/.test(series.trim()) ? undefined : 'Enter two digits, for example 01.',
    title: title.trim().length >= 2 && title.trim().length <= 80 ? undefined : 'Enter 2 to 80 characters.',
  };
  const invalid = Object.values(errors).some(Boolean);

  const save = () => {
    setShowErrors(true);
    if (invalid) return;
    update.mutate({
      sales_tppd_limit: tppdN,
      sales_quote_validity_days: validityN,
      sales_certificate_series: series.trim(),
      sales_certificate_signatory_title: title.trim().toUpperCase(),
    });
  };
  const err = (e: string | undefined) => (showErrors ? e : undefined);

  return (
    <Panel title="Quotes and certificates">
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label="Third-party property damage limit (GH₵)"
          inputMode="decimal"
          value={tppd}
          onChange={(e) => setTppd(e.target.value)}
          helper="Printed on motor certificates as the T.P.P.D limit."
          error={err(errors.tppd)}
        />
        <TextField
          label="Days a price stays valid"
          inputMode="numeric"
          value={validity}
          onChange={(e) => setValidity(e.target.value)}
          helper="After this many days the customer has to ask for a new price."
          error={err(errors.validity)}
        />
        <TextField
          label="Certificate series"
          inputMode="numeric"
          maxLength={2}
          value={series}
          onChange={(e) => setSeries(e.target.value)}
          helper="The two digits after “C” in certificate numbers, e.g. C01-26-10001."
          error={err(errors.series)}
        />
        <TextField
          label="Title printed under the signature"
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          helper="For example CHIEF EXECUTIVE OFFICER."
          error={err(errors.title)}
        />
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button busy={update.isPending} onClick={save}>
          Save
        </Button>
        <div aria-live="polite" className="min-w-0 flex-1">
          {update.isSuccess && (
            <Alert tone="success">Saved. New quotes and certificates use these values.</Alert>
          )}
          {update.isError && <ErrorNote error={update.error} />}
        </div>
      </div>
    </Panel>
  );
}

// ---- Signature image ---------------------------------------------------------------------

const MAX_SIGNATURE_BYTES = 1024 * 1024;

function SignatureUpload({ settings }: { settings: Settings }) {
  const { supabase } = useSession();
  const update = useUpdateSalesSettings();
  const path = settingValue(settings.sales_certificate_signature_path);
  const currentPath = typeof path === 'string' && path ? path : null;
  const current = useSignedUrl(currentPath);
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setSaved(false);
    setSaveError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
    if (!f) return;
    if (!['image/png', 'image/jpeg'].includes(f.type)) {
      setError('Choose a PNG or JPG image.');
      return;
    }
    if (f.size > MAX_SIGNATURE_BYTES) {
      setError('The image is larger than 1 MB. Choose a smaller one.');
      return;
    }
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const save = async () => {
    if (!file) return;
    setBusy(true);
    setSaveError(null);
    try {
      const stored = await uploadSignature(supabase, file);
      await update.mutateAsync({ sales_certificate_signature_path: stored });
      setSaved(true);
      setFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
    } catch (e) {
      setSaveError(e);
    } finally {
      setBusy(false);
    }
  };

  const shown = preview ?? current.data ?? null;
  return (
    <Panel title="Certificate signature">
      <p className="text-[14px] leading-5 text-secondary">
        Used on every certificate issued after you save. Until a signature is uploaded, certificates show a
        dotted signature line only.
      </p>
      <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start">
        <div className="grid h-32 w-full max-w-xs place-items-center rounded-md border border-dashed border-border-strong bg-subtle p-3">
          {shown ? (
            <img
              src={shown}
              alt={preview ? 'New signature (not saved yet)' : 'Current signature'}
              className="max-h-full max-w-full object-contain"
            />
          ) : currentPath && current.isPending ? (
            <span className="text-[14px] text-muted">Loading…</span>
          ) : (
            <span className="text-center text-[14px] text-muted">No signature uploaded</span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <label htmlFor={inputId} className="text-[14px] font-medium leading-5">
            {currentPath ? 'Replace the signature image' : 'Upload a signature image'}
          </label>
          <input
            id={inputId}
            type="file"
            accept="image/png,image/jpeg"
            onChange={choose}
            aria-describedby={`${inputId}-help`}
            className="max-w-full text-[14px] file:mr-3 file:h-10 file:rounded-full file:border file:border-border-strong file:bg-white file:px-4 file:text-[14px] file:font-medium"
          />
          <p id={`${inputId}-help`} className="text-[13px] text-secondary">
            PNG or JPG, up to 1 MB. A dark signature on a white or transparent background prints best.
          </p>
          {error && <Alert tone="danger">{error}</Alert>}
          <div>
            <Button disabled={!file} busy={busy} onClick={() => void save()}>
              Save signature
            </Button>
          </div>
          <div aria-live="polite">
            {saved && <Alert tone="success">Signature saved. New certificates will show it.</Alert>}
            {saveError ? <ErrorNote error={saveError} /> : null}
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ---- Read-only modes ---------------------------------------------------------------------

function modeLabel(v: unknown) {
  return v === undefined || v === null || v === '' || v === 'simulated' ? 'Test mode' : String(v);
}

function Modes({ settings }: { settings: Settings }) {
  const sms = settingValue(settings.sales_sms_mode);
  const pay = settingValue(settings.sales_payment_mode);
  const item = (label: string, value: unknown, explain: string) => (
    <div className="min-w-0 rounded-md border border-border-subtle p-4">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-[16px] font-medium">
        {modeLabel(value)}
        {modeLabel(value) === 'Test mode' && <Badge tone="warning">Not live</Badge>}
      </p>
      <p className="mt-1 text-[14px] text-secondary">{explain}</p>
    </div>
  );
  return (
    <Panel title="Text messages and payments">
      <div className="grid gap-4 md:grid-cols-2">
        {item(
          'Sign-in codes by text message',
          sms,
          'Test mode until an SMS account is connected: no text is sent and the code is shown on screen.',
        )}
        {item(
          'Payments',
          pay,
          'Test mode until a payment account is connected: no money is taken, payments are simulated.',
        )}
      </div>
    </Panel>
  );
}

// ---- Rate tables editor ------------------------------------------------------------------

type Errors = Record<string, string>;

interface EditorCtx {
  tables: RateTables;
  set: (path: Path, value: unknown) => void;
  setError: (key: string, message: string | null) => void;
  errors: Errors;
  version: number;
}

/** A number input bound to a path. `pct` shows a fraction as a percentage. */
function NumField({
  ctx,
  path,
  label,
  pct = false,
  unit,
  integer = false,
}: {
  ctx: EditorCtx;
  path: Path;
  label: string;
  pct?: boolean;
  unit?: string;
  integer?: boolean;
}) {
  const key = path.join('.');
  const raw = getIn(ctx.tables, path);
  const display = typeof raw === 'number' ? String(pct ? toPct(raw) : raw) : '';
  const [text, setText] = useState(display);
  const id = useId();
  const error = ctx.errors[key];
  const onChange = (v: string) => {
    setText(v);
    const n = Number(v);
    let message: string | null = null;
    if (v.trim() === '' || !Number.isFinite(n)) message = 'Enter a number.';
    else if (n < 0) message = 'Must be 0 or more.';
    else if (pct && n > 100) message = 'Must be 100% or less.';
    else if (integer && !Number.isInteger(n)) message = 'Enter a whole number.';
    ctx.setError(key, message);
    if (!message) ctx.set(path, pct ? fromPct(n) : n);
  };
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[14px] leading-5">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          inputMode="decimal"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className={`h-11 w-full min-w-0 rounded-sm border bg-white px-3 text-right text-[16px] tabular-nums outline-none hover:border-ink focus-visible:border-brand md:text-[14px] ${
            error ? 'border-danger' : 'border-border-strong'
          }`}
        />
        {(pct || unit) && <span className="shrink-0 text-[14px] text-secondary">{pct ? '%' : unit}</span>}
      </div>
      {error && (
        <p id={`${id}-err`} className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Group({ title, explain, children }: { title: string; explain?: ReactNode; children: ReactNode }) {
  return (
    <details className="group rounded-md border border-border-subtle" open={false}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[16px] font-medium hover:bg-subtle">
        {title}
        <span aria-hidden className="text-muted transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="border-t border-border-subtle p-4">
        {explain && <p className="mb-4 text-[14px] text-secondary">{explain}</p>}
        {children}
      </div>
    </details>
  );
}

const grid = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';

/** A list of rows with numeric columns (short-period scale, travel bands, age factors …). */
function RowsEditor({
  ctx,
  path,
  columns,
  addLabel,
  blank,
}: {
  ctx: EditorCtx;
  path: Path;
  columns: { key: string; label: string; pct?: boolean; unit?: string; integer?: boolean }[];
  addLabel: string;
  blank: Record<string, number>;
}) {
  const list = (getIn(ctx.tables, path) as Record<string, number>[] | undefined) ?? [];
  const remove = (i: number) => {
    // Clear errors for the removed row and the ones that shift.
    Object.keys(ctx.errors)
      .filter((k) => k.startsWith(`${path.join('.')}.`))
      .forEach((k) => ctx.setError(k, null));
    ctx.set(
      path,
      list.filter((_, j) => j !== i),
    );
  };
  return (
    <div className="flex flex-col gap-3">
      {list.map((_, i) => (
        <div
          // Remount rows after a removal so the inputs show the shifted values.
          key={`${i}:${list.length}`}
          className="grid items-end gap-3 rounded-sm bg-subtle p-3 sm:grid-cols-[repeat(var(--cols),minmax(0,1fr))_auto]"
          style={{ ['--cols' as string]: columns.length }}
        >
          {columns.map((c) => (
            <NumField
              key={c.key}
              ctx={ctx}
              path={[...path, i, c.key]}
              label={c.label}
              pct={c.pct ?? false}
              integer={c.integer ?? false}
              {...(c.unit ? { unit: c.unit } : {})}
            />
          ))}
          <Button variant="ghost" className="h-11 text-danger" onClick={() => remove(i)}>
            Remove
          </Button>
        </div>
      ))}
      <div>
        <Button variant="secondary" onClick={() => ctx.set(path, [...list, { ...blank }])}>
          {addLabel}
        </Button>
      </div>
    </div>
  );
}

function TaxesEditor({ ctx }: { ctx: EditorCtx }) {
  const list = ctx.tables.taxes ?? [];
  return (
    <div className="flex flex-col gap-3">
      {list.map((t, i) => (
        <div
          key={`${i}:${list.length}`}
          className="grid items-end gap-3 rounded-sm bg-subtle p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"
        >
          <TextField
            label="Name on the quote"
            value={t.label}
            maxLength={60}
            onChange={(e) => ctx.set(['taxes', i, 'label'], e.target.value)}
          />
          <NumField ctx={ctx} path={['taxes', i, 'rate']} label="Rate" pct />
          <Button
            variant="ghost"
            className="h-11 text-danger"
            onClick={() => {
              Object.keys(ctx.errors)
                .filter((k) => k.startsWith('taxes.'))
                .forEach((k) => ctx.setError(k, null));
              ctx.set(
                ['taxes'],
                list.filter((_, j) => j !== i),
              );
            }}
          >
            Remove
          </Button>
        </div>
      ))}
      <div>
        <Button variant="secondary" onClick={() => ctx.set(['taxes'], [...list, { label: '', rate: 0 }])}>
          Add a tax
        </Button>
      </div>
    </div>
  );
}

/** Generic editor for parts of the tables the structured editor does not know (any shape). */
function GenericEditor({ ctx, path, value }: { ctx: EditorCtx; path: Path; value: unknown }): ReactNode {
  if (typeof value === 'number') {
    return <NumField ctx={ctx} path={path} label={humanKey(String(path[path.length - 1] ?? ''))} />;
  }
  if (value && typeof value === 'object') {
    const entries = Array.isArray(value)
      ? value.map((v, i) => [i, v] as const)
      : Object.entries(value as Record<string, unknown>);
    return (
      <fieldset className="min-w-0 rounded-sm border border-border-subtle p-3">
        <legend className="px-1 text-[14px] font-medium">
          {humanKey(String(path[path.length - 1] ?? ''))}
        </legend>
        <div className={grid}>
          {entries.map(([k, v]) => (
            <GenericEditor key={String(k)} ctx={ctx} path={[...path, k]} value={v} />
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <div className="min-w-0 text-[14px]">
      <p className="text-muted">{humanKey(String(path[path.length - 1] ?? ''))}</p>
      <p className="break-words">{value === null || value === undefined ? '—' : String(value)}</p>
    </div>
  );
}

function humanKey(k: string): string {
  if (/^\d+$/.test(k)) return `Row ${Number(k) + 1}`;
  const s = k
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : k;
}

function RatesEditor({ stored }: { stored: unknown }) {
  const update = useUpdateSalesSettings();
  const initial = resolveRates(stored);
  const [tables, setTables] = useState<RateTables>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [epoch, setEpoch] = useState(0); // remounts inputs after a reset
  const [confirmReset, setConfirmReset] = useState(false);
  const [dirty, setDirty] = useState(false);

  const extra =
    stored && typeof stored === 'object' ? Object.keys(stored).filter((k) => !KNOWN_KEYS.has(k)) : [];

  const ctx: EditorCtx = {
    tables,
    errors,
    version: tables.version || 1,
    set: (path, value) => {
      setTables((t) => setIn(t, path, value));
      setDirty(true);
      update.reset();
    },
    setError: (key, message) =>
      setErrors((e) => {
        if (!message) {
          if (!(key in e)) return e;
          return Object.fromEntries(Object.entries(e).filter(([k]) => k !== key));
        }
        return e[key] === message ? e : { ...e, [key]: message };
      }),
  };
  const invalid = Object.keys(errors).length > 0;

  const save = () => {
    if (invalid) return;
    const next = { ...tables, version: (tables.version || 1) + 1, updatedAt: new Date().toISOString() };
    update.mutate(
      { sales_rates: next },
      {
        onSuccess: () => {
          setTables(next);
          setDirty(false);
        },
      },
    );
  };

  const reset = () => {
    setTables({ ...DEFAULT_RATES, version: tables.version || 1 });
    setErrors({});
    setEpoch((n) => n + 1);
    setDirty(true);
    setConfirmReset(false);
  };

  const { travel, personalAccident } = tables;
  return (
    <Panel title="Rate tables">
      <Alert tone="warning" title="Indicative rates">
        Confirm with underwriting before relying on them. Motor third-party premiums are the NIC minimum
        tariff.
      </Alert>
      <p className="mt-3 text-[14px] text-secondary">
        These tables price the products sold with an instant price. Changes apply to new prices only; prices
        already sent to customers do not change.
        {tables.updatedAt ? ` Last saved ${new Date(tables.updatedAt).toLocaleString('en-GB')}.` : ''}
      </p>
      <div key={epoch} className="mt-5 flex flex-col gap-3">
        <Group
          title="Motor: third-party premiums"
          explain="Yearly premium for third-party only cover, by type of vehicle (GH₵)."
        >
          <div className={grid}>
            {(Object.keys(MOTOR_CLASS_LABELS) as (keyof typeof MOTOR_CLASS_LABELS)[]).map((c) => (
              <NumField
                key={c}
                ctx={ctx}
                path={['motor', 'tpo', c]}
                label={MOTOR_CLASS_LABELS[c]}
                unit="GH₵"
              />
            ))}
          </div>
        </Group>
        <Group title="Motor: extra seats, own damage and limits">
          <div className={grid}>
            <NumField
              ctx={ctx}
              path={['motor', 'extraSeat', 'includedSeats']}
              label="Seats included in the premium"
              integer
            />
            <NumField
              ctx={ctx}
              path={['motor', 'extraSeat', 'privateRate']}
              label="Each extra seat, private car"
              unit="GH₵"
            />
            <NumField
              ctx={ctx}
              path={['motor', 'extraSeat', 'commercialRate']}
              label="Each extra seat, commercial vehicle"
              unit="GH₵"
            />
            <NumField
              ctx={ctx}
              path={['motor', 'comprehensiveRate']}
              label="Comprehensive, share of vehicle value"
              pct
            />
            <NumField
              ctx={ctx}
              path={['motor', 'tpftRate']}
              label="Fire and theft, share of vehicle value"
              pct
            />
            <NumField
              ctx={ctx}
              path={['motor', 'tppdIncreaseRate']}
              label="Higher property damage limit, share of the increase"
              pct
            />
            <NumField
              ctx={ctx}
              path={['motor', 'referOverAgeYears']}
              label="Send to an underwriter if the vehicle is older than (years)"
              integer
            />
            <NumField
              ctx={ctx}
              path={['motor', 'referOverValue']}
              label="Send to an underwriter if the vehicle is worth more than"
              unit="GH₵"
            />
            <NumField
              ctx={ctx}
              path={['motor', 'referOverSeats']}
              label="Send to an underwriter if a bus has more seats than"
              integer
            />
          </div>
          <h3 className="mb-2 mt-5 text-[15px] font-medium">
            Extra charge on own-damage cover for older vehicles
          </h3>
          <RowsEditor
            ctx={ctx}
            path={['motor', 'ageLoadings']}
            columns={[
              { key: 'overYears', label: 'Older than (years)', integer: true },
              { key: 'rate', label: 'Extra charge', pct: true },
            ]}
            addLabel="Add an age band"
            blank={{ overYears: 0, rate: 0 }}
          />
        </Group>
        <Group
          title="Cover for less than a year"
          explain="Share of the yearly premium charged for a cover of up to this many months."
        >
          <RowsEditor
            ctx={ctx}
            path={['shortPeriod']}
            columns={[
              { key: 'months', label: 'Up to (months)', integer: true },
              { key: 'factor', label: 'Share of yearly premium', pct: true },
            ]}
            addLabel="Add a row"
            blank={{ months: 12, factor: 1 }}
          />
        </Group>
        <Group
          title="Travel"
          explain="Premium per traveller in euros, by destination and the longest trip length."
        >
          <div className={grid}>
            <NumField
              ctx={ctx}
              path={['travel', 'eurToGhs']}
              label="Exchange rate: 1 euro in cedis"
              unit="GH₵"
            />
          </div>
          {Object.keys(travel.bands).map((zone) => (
            <div key={zone} className="mt-5">
              <h3 className="mb-2 text-[15px] font-medium">{TRAVEL_ZONE_LABELS[zone] ?? humanKey(zone)}</h3>
              <RowsEditor
                ctx={ctx}
                path={['travel', 'bands', zone]}
                columns={[
                  { key: 'maxDays', label: 'Trip of up to (days)', integer: true },
                  { key: 'eur', label: 'Premium', unit: '€' },
                ]}
                addLabel="Add a trip length"
                blank={{ maxDays: 0, eur: 0 }}
              />
            </div>
          ))}
          <h3 className="mb-2 mt-5 text-[15px] font-medium">Age of the traveller</h3>
          <p className="mb-3 text-[14px] text-secondary">
            The premium is multiplied by this factor (1 = no change). Travellers older than the last row are
            sent to an underwriter.
          </p>
          <RowsEditor
            ctx={ctx}
            path={['travel', 'ageFactors']}
            columns={[
              { key: 'maxAge', label: 'Up to age', integer: true },
              { key: 'factor', label: 'Factor' },
            ]}
            addLabel="Add an age band"
            blank={{ maxAge: 0, factor: 1 }}
          />
        </Group>
        <Group
          title="Personal accident"
          explain="Yearly premium as a share of the amount insured, by type of work."
        >
          <div className={grid}>
            {Object.keys(personalAccident.classRates).map((c) => (
              <NumField
                key={c}
                ctx={ctx}
                path={['personalAccident', 'classRates', c]}
                label={PA_CLASS_LABELS[c] ?? humanKey(c)}
                pct
              />
            ))}
            <NumField ctx={ctx} path={['personalAccident', 'minPremium']} label="Lowest premium" unit="GH₵" />
            <NumField
              ctx={ctx}
              path={['personalAccident', 'referOverCapital']}
              label="Send to an underwriter if the amount insured is more than"
              unit="GH₵"
            />
          </div>
        </Group>
        <Group title="Home" explain="Yearly premium as a share of the amount insured.">
          <div className={grid}>
            <NumField ctx={ctx} path={['home', 'buildingsRate']} label="Buildings" pct />
            <NumField ctx={ctx} path={['home', 'contentsRate']} label="Contents" pct />
            <NumField ctx={ctx} path={['home', 'allRisksRate']} label="Valuables (all risks)" pct />
            <NumField ctx={ctx} path={['home', 'minPremium']} label="Lowest premium" unit="GH₵" />
            <NumField
              ctx={ctx}
              path={['home', 'referOverSum']}
              label="Send to an underwriter if the total insured is more than"
              unit="GH₵"
            />
          </div>
        </Group>
        <Group title="Taxes" explain="Added to every premium except motor.">
          <TaxesEditor ctx={ctx} />
        </Group>
        <Group title="Price validity">
          <div className={grid}>
            <NumField
              ctx={ctx}
              path={['quoteValidityDays']}
              label="Days an instant price stays valid"
              integer
            />
          </div>
        </Group>
        {extra.length > 0 && (
          <Group title="Other values" explain="Further values stored with the rate tables.">
            <div className="flex flex-col gap-3">
              {extra.map((k) => (
                <GenericEditor
                  key={k}
                  ctx={ctx}
                  path={[k]}
                  value={(tables as unknown as Record<string, unknown>)[k]}
                />
              ))}
            </div>
          </Group>
        )}
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button busy={update.isPending} disabled={invalid || !dirty} onClick={save}>
          Save rate tables
        </Button>
        <Button variant="secondary" onClick={() => setConfirmReset(true)}>
          Reset to defaults
        </Button>
        <div aria-live="polite" className="min-w-0 flex-1">
          {invalid && <Alert tone="danger">Correct the values marked in red before saving.</Alert>}
          {update.isSuccess && <Alert tone="success">Rate tables saved. New prices use them.</Alert>}
          {update.isError && <ErrorNote error={update.error} />}
        </div>
      </div>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset the rate tables?"
        description="Every value goes back to the standard rates. Nothing changes until you save."
        confirmLabel="Reset to defaults"
        onConfirm={reset}
      />
    </Panel>
  );
}

// ---- Page --------------------------------------------------------------------------------

export function ProductsRatesPage() {
  const settings = useSalesSettings();
  return (
    <>
      <PageHeader
        title="Products & rates"
        subtitle="The products sold online, how they are priced, and what is printed on certificates."
      />
      <div className="flex flex-col gap-6">
        <ProductsList />
        <QueryState query={settings}>
          {(s) => (
            <>
              <SalesSettingsForm key={`f:${s.sales_tppd_limit?.updated_at ?? ''}`} settings={s} />
              <SignatureUpload settings={s} />
              <Modes settings={s} />
              <RatesEditor
                key={`r:${s.sales_rates?.updated_at ?? ''}`}
                stored={settingValue(s.sales_rates)}
              />
            </>
          )}
        </QueryState>
      </div>
    </>
  );
}
