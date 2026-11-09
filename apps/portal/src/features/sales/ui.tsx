// Building blocks shared by the sales pages: responsive tables (cards on phones), badges,
// detail lists, a lightbox for customer documents and query states.
import * as RadixDialog from '@radix-ui/react-dialog';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { toUserError } from '../../lib/errors';
import { Alert, Badge, EmptyState, Skeleton } from '../../ui/controls';
import {
  IconArrowDown,
  IconArrowUp,
  IconClose,
  IconDownload,
  IconExternal,
  IconSearch,
} from '../../ui/icons';
import { isMissingObject } from './api';
import { identityStatus, paymentStatus, policyStatus, proposalStatus, type SortDir } from './format';

export const ProposalBadge = ({ status }: { status: string }) => {
  const s = proposalStatus(status);
  return <Badge tone={s.tone}>{s.label}</Badge>;
};
export const PolicyBadge = ({ status }: { status: string }) => {
  const s = policyStatus(status);
  return <Badge tone={s.tone}>{s.label}</Badge>;
};
export const PaymentBadge = ({ status }: { status: string }) => {
  const s = paymentStatus(status);
  return <Badge tone={s.tone}>{s.label}</Badge>;
};
export const IdentityBadge = ({ status }: { status: string | null | undefined }) => {
  const s = identityStatus(status);
  return <Badge tone={s.tone}>{s.label}</Badge>;
};

/** White panel with an optional heading. */
export function Panel({
  title,
  actions,
  children,
  className = '',
  padded = true,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      aria-label={title}
      className={`rounded-lg border border-border-subtle bg-white shadow-xs ${padded ? 'p-4 md:p-6' : ''} ${className}`}
    >
      {(title || actions) && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 ${padded ? 'mb-4' : 'px-4 pt-4 md:px-6'}`}
        >
          {title && <h2 className="text-[18px] font-semibold leading-6 tracking-[-0.01em]">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Label / value pairs, two columns on wider screens. */
export function DetailList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-[13px] font-medium leading-5 text-muted">{i.label}</dt>
          <dd className="mt-0.5 break-words text-[15px] leading-6 text-ink">
            {i.value === null || i.value === undefined || i.value === '' ? (
              <span className="text-muted">—</span>
            ) : (
              i.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Loading, "not set up yet", error and content states for a query. */
export function QueryState<T>({
  query,
  children,
  skeleton = 'h-48',
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  skeleton?: string;
}) {
  if (query.isPending) {
    return (
      <div role="status" aria-label="Loading" className="rounded-lg bg-white p-4">
        <Skeleton className={`w-full ${skeleton}`} />
      </div>
    );
  }
  if (query.isError) {
    if (isMissingObject(query.error)) {
      return (
        <Alert tone="info" title="Online sales isn’t switched on yet">
          This area will fill in once online sales is set up on this system.
        </Alert>
      );
    }
    const e = toUserError(query.error);
    return (
      <Alert tone="danger" title="This didn’t load" detail={e.detail}>
        {e.message}
      </Alert>
    );
  }
  return <>{children(query.data)}</>;
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const e = toUserError(error);
  return (
    <Alert tone="danger" detail={e.detail}>
      {e.message}
    </Alert>
  );
}

export function SearchBox({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-[260px]">
      <label htmlFor={id} className="text-[14px] font-medium leading-5">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-muted">
          <IconSearch size={18} />
        </span>
        <input
          id={id}
          type="search"
          value={value}
          placeholder={placeholder}
          maxLength={100}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full rounded-sm border border-border-strong bg-white pl-10 pr-3 text-[16px] outline-none hover:border-ink focus-visible:border-brand md:text-[14px]"
        />
      </div>
    </div>
  );
}

export const fieldClass =
  'h-11 w-full rounded-sm border border-border-strong bg-white px-3 text-[16px] outline-none hover:border-ink focus-visible:border-brand md:text-[14px]';

export function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-56">
      <label htmlFor={id} className="text-[14px] font-medium leading-5">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
        {children}
      </select>
    </div>
  );
}

export function DateInput({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: string | undefined;
  max?: string | undefined;
}) {
  const id = useId();
  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-44">
      <label htmlFor={id} className="text-[14px] font-medium leading-5">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className={fieldClass}
      />
    </div>
  );
}

// ---- Responsive data table ---------------------------------------------------------------

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Value used for sorting; columns without it are not sortable. */
  sort?: (row: T) => string | number | null | undefined;
  numeric?: boolean;
  /** Shown on the phone card (default true). The first column is the card title. */
  card?: boolean;
}

export interface SortState {
  key: string;
  dir: SortDir;
}

/**
 * A table on tablets and desktops; a list of cards under 768 px, so the page never scrolls
 * sideways on a phone. The first column is the row's link and the card's title.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowLink,
  caption,
  sort,
  onSort,
  empty,
}: {
  rows: readonly T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowLink?: (row: T) => { to: string; params?: Record<string, string> };
  caption: string;
  sort?: SortState | undefined;
  onSort?: (next: SortState) => void;
  empty?: ReactNode;
}) {
  if (rows.length === 0) {
    return <EmptyState title="Nothing to show">{empty ?? 'Nothing matches these filters.'}</EmptyState>;
  }
  const [first, ...rest] = columns;
  const titleCell = (row: T) => {
    const content = first?.cell(row);
    const link = rowLink?.(row);
    return link ? (
      <Link
        to={link.to}
        params={link.params as never}
        className="font-medium text-brand underline-offset-2 hover:underline"
      >
        {content}
      </Link>
    ) : (
      content
    );
  };
  const header = (c: Column<T>) => {
    const sortable = !!c.sort && !!onSort;
    const active = sort?.key === c.key;
    const ariaSort = active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : undefined;
    return (
      <th
        key={c.key}
        scope="col"
        aria-sort={ariaSort}
        className={`whitespace-nowrap px-3 py-2.5 text-[12px] font-medium tracking-[0.02em] text-muted ${c.numeric ? 'text-right' : 'text-left'}`}
      >
        {sortable ? (
          <button
            type="button"
            onClick={() =>
              onSort?.({
                key: c.key,
                dir: active && sort?.dir === 'asc' ? 'desc' : active ? 'asc' : c.numeric ? 'desc' : 'asc',
              })
            }
            className={`inline-flex items-center gap-1 rounded-xs hover:text-ink focus-visible:outline-2 focus-visible:outline-brand ${active ? 'text-ink' : ''}`}
          >
            {c.header}
            {active && (sort?.dir === 'asc' ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />)}
          </button>
        ) : (
          c.header
        )}
      </th>
    );
  };
  return (
    <>
      <div className="hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr className="border-b border-border">{columns.map(header)}</tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={rowKey(row)} className="border-b border-border-subtle last:border-0 hover:bg-subtle">
                  {columns.map((c, i) =>
                    i === 0 ? (
                      <th key={c.key} scope="row" className="px-3 py-3 text-left text-[14px] font-normal">
                        {titleCell(row)}
                      </th>
                    ) : (
                      <td
                        key={c.key}
                        className={`px-3 py-3 text-[14px] ${c.numeric ? 'text-right tabular-nums' : ''}`}
                      >
                        {c.cell(row)}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ul className="divide-y divide-border-subtle md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={rowKey(row)} className="px-4 py-3">
            <div className="text-[15px]">{titleCell(row)}</div>
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px]">
              {rest
                .filter((c) => c.card !== false)
                .map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-muted">{c.header}</dt>
                    <dd className="min-w-0 break-words">{c.cell(row)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---- Documents ---------------------------------------------------------------------------

export interface DocItem {
  id: string;
  name: string;
  mime: string;
  url: string | undefined;
  caption?: string;
}

/**
 * A signed Storage link that downloads instead of opening. The `download` attribute is ignored for
 * cross-origin links (Storage is on the Supabase origin), so Storage is asked to send the file as an
 * attachment with this name instead.
 */
export function downloadHref(url: string, name: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(name)}`;
}

/** Full-screen view of one image with Download and Close; arrows step through the set. */
export function Lightbox({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: DocItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const item = items[index];
  if (!item) return null;
  return (
    <RadixDialog.Root open onOpenChange={(o) => !o && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="serene-fade fixed inset-0 z-40 bg-[rgb(17_17_17/0.85)]" />
        <RadixDialog.Content
          aria-describedby={undefined}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
            if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
          }}
          className="fixed inset-0 z-50 flex flex-col outline-none"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
            <RadixDialog.Title className="min-w-0 truncate text-[15px] font-medium">
              {item.caption ?? item.name}
              {items.length > 1 && (
                <span className="ml-2 text-white/70">
                  {index + 1} of {items.length}
                </span>
              )}
            </RadixDialog.Title>
            <div className="flex shrink-0 items-center gap-1">
              {item.url && (
                <a
                  href={downloadHref(item.url, item.name)}
                  download={item.name}
                  className="grid size-11 place-items-center rounded-full hover:bg-white/10"
                  aria-label={`Download ${item.name}`}
                >
                  <IconDownload size={20} />
                </a>
              )}
              <RadixDialog.Close
                className="grid size-11 place-items-center rounded-full hover:bg-white/10"
                aria-label="Close"
              >
                <IconClose size={20} />
              </RadixDialog.Close>
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4">
            {item.url ? (
              <img
                src={item.url}
                alt={item.caption ?? item.name}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <p className="text-white">Loading…</p>
            )}
            {index > 0 && (
              <button
                type="button"
                onClick={() => onIndex(index - 1)}
                className="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60"
                aria-label="Previous"
              >
                ‹
              </button>
            )}
            {index < items.length - 1 && (
              <button
                type="button"
                onClick={() => onIndex(index + 1)}
                className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60"
                aria-label="Next"
              >
                ›
              </button>
            )}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Thumbnails of images (open in the lightbox) and tiles for PDFs (open in a new tab). */
export function DocumentGrid({ items, empty = 'No documents.' }: { items: DocItem[]; empty?: string }) {
  const images = items.filter((i) => i.mime.startsWith('image/'));
  const [open, setOpen] = useState<number | null>(null);
  if (items.length === 0) return <p className="text-[15px] text-secondary">{empty}</p>;
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((it) => {
          const isImage = it.mime.startsWith('image/');
          return (
            <li
              key={it.id}
              className="min-w-0 overflow-hidden rounded-md border border-border-subtle bg-subtle"
            >
              {isImage ? (
                <button
                  type="button"
                  onClick={() => setOpen(images.indexOf(it))}
                  className="block aspect-[4/3] w-full bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand"
                  aria-label={`View ${it.caption ?? it.name}`}
                >
                  {it.url ? (
                    <img src={it.url} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <Skeleton className="size-full" />
                  )}
                </button>
              ) : (
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid aspect-[4/3] w-full place-items-center bg-white text-[13px] font-semibold text-brand hover:bg-brand-50"
                  aria-label={`Open ${it.caption ?? it.name} (PDF, opens in a new tab)`}
                >
                  <span className="flex flex-col items-center gap-1">
                    PDF
                    <IconExternal size={16} />
                  </span>
                </a>
              )}
              <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                <p className="min-w-0 truncate text-[13px]" title={it.name}>
                  {it.caption ?? it.name}
                </p>
                {it.url && (
                  <a
                    href={downloadHref(it.url, it.name)}
                    download={it.name}
                    className="grid size-8 shrink-0 place-items-center rounded-full text-secondary hover:bg-white hover:text-ink"
                    aria-label={`Download ${it.caption ?? it.name}`}
                  >
                    <IconDownload size={16} />
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {open !== null && (
        <Lightbox items={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

/** Starts a browser download of bytes produced in the page (PDF, Word). */
export function saveBytes(bytes: Uint8Array | Blob, name: string, type: string) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  clickDownload(url, name);
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function clickDownload(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Downloads of files built in the page (proposal PDF/Word, documents zip). Building takes a moment,
 * and some browsers (Safari on iPhone and iPad in particular, and some download-protection settings)
 * silently drop a download started after the click's moment has passed. So the file is offered twice:
 * started automatically, and kept as a real "Save" link the person can click, which every browser
 * honours. The link stays until the next file replaces it or the page closes.
 */
export function useBuiltFile() {
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  useEffect(() => () => void (file && URL.revokeObjectURL(file.url)), [file]);
  return {
    file,
    offer(bytes: Uint8Array | Blob, name: string, type: string) {
      const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type });
      const url = URL.createObjectURL(blob);
      setFile({ url, name });
      clickDownload(url, name);
    },
    clear: () => setFile(null),
  };
}

/** "Your file is ready" with a Save link, for when the automatic download didn't start. */
export function BuiltFileNote({
  file,
  onDismiss,
}: {
  file: { url: string; name: string } | null;
  onDismiss: () => void;
}) {
  if (!file) return null;
  return (
    <Alert tone="success">
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>Your file is ready. If the download didn’t start,</span>
        <a
          href={file.url}
          download={file.name}
          className="font-medium text-brand underline underline-offset-2"
        >
          save “{file.name}”
        </a>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[14px] text-secondary underline-offset-2 hover:underline"
        >
          Dismiss
        </button>
      </span>
    </Alert>
  );
}

/** "Back to …" link above a detail page. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      search={((prev: Record<string, unknown>) => prev) as never}
      className="mb-3 inline-flex h-10 items-center gap-1 text-[14px] font-medium text-brand hover:underline"
    >
      ‹ {children}
    </Link>
  );
}
