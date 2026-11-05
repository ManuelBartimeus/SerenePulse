import * as RadixDialog from '@radix-ui/react-dialog';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { toUserError } from '../../lib/errors';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Badge, Button, EmptyState, Spinner } from '../../ui/controls';
import { RecordCasePanel } from '../cases/record-panels';
import { RecordCorrectionsPanel } from '../reports/record-corrections';
import { RATING_BANDS, RECOMMEND_GROUPS, WORDS } from '../../lib/terms';
import { useRpc, type RecordDetail, type RecordPage, type RecordRow } from './api';
import { FilterBar, useAnalyticsFilters } from './filters';
import { formatCount, formatDateTime, formatDuration } from './format';
import { QueryView, Skeleton } from './ui';

const RECOMMEND_TONE = { promoter: 'success', passive: 'neutral', detractor: 'danger' } as const;
const bandOf = (csat: number) => (csat >= 4 ? 'positive' : csat <= 2 ? 'negative' : 'neutral');
const BAND_TONE = { positive: 'success', neutral: 'neutral', negative: 'danger' } as const;
const CASE_LABEL: Record<string, string> = {
  new: 'New',
  assigned: 'Assigned',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

/** "Satisfied · 4 of 5": the band in words, the score for detail. */
function Satisfaction({ csat }: { csat: number }) {
  const band = bandOf(csat);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge tone={BAND_TONE[band]}>{RATING_BANDS[band]}</Badge>
      <span className="text-[12px] text-muted tabular-nums">{csat} of 5</span>
    </span>
  );
}

function Recommend({ r }: { r: RecordRow }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge tone={RECOMMEND_TONE[r.nps_class]}>{RECOMMEND_GROUPS[r.nps_class]}</Badge>
      <span className="text-[12px] text-muted tabular-nums">{r.nps} of 10</span>
    </span>
  );
}

const yesNo = (v: boolean) => (v ? 'Yes' : <span className="text-muted">—</span>);

function RecordDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = useRpc<RecordDetail>('record_detail', { p_response_id: id });
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <RadixDialog.Root open onOpenChange={(open) => !open && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-[rgb(17_17_17/0.48)]" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 overflow-y-auto bg-white p-6 shadow-float-strong outline-none md:inset-y-0 md:left-auto md:right-0 md:w-[560px]"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <RadixDialog.Title className="text-[24px] font-medium leading-8">
              {detail.data?.reference ?? WORDS.record}
            </RadixDialog.Title>
            <RadixDialog.Close
              className="grid size-11 place-items-center rounded-full hover:bg-surface-muted"
              aria-label="Close"
            >
              ✕
            </RadixDialog.Close>
          </div>
          <QueryView query={detail} skeleton="h-96">
            {(d) => (
              <div className="grid gap-5 text-[14px]">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" className="h-11 text-[14px]" onClick={copy}>
                    Copy link
                  </Button>
                  <span aria-live="polite" className="text-secondary">
                    {copied ? 'Link copied.' : ''}
                  </span>
                </div>
                <dl className="grid grid-cols-[max-content_1fr] gap-x-5 gap-y-2">
                  <dt className="text-secondary">Received</dt>
                  <dd>{formatDateTime(d.submitted_at)}</dd>
                  <dt className="text-secondary">Branch</dt>
                  <dd>
                    {d.attribution.label}
                    {d.attribution.region && ` · ${d.attribution.region.name}`}
                    {d.attribution.is_corrected && (
                      <span className="block text-secondary">
                        Corrected. The customer originally chose: {d.attribution.original.label}
                      </span>
                    )}
                  </dd>
                  <dt className="text-secondary">Time to complete</dt>
                  <dd>
                    {d.completion_duration_ms === null
                      ? 'Not recorded'
                      : formatDuration(d.completion_duration_ms / 1000)}
                  </dd>
                </dl>
                <section aria-label="Answers">
                  <h3 className="mb-2 text-[18px] font-medium">Answers</h3>
                  <ul className="grid gap-2">
                    {d.answers.map((a) => (
                      <li key={a.question_id} className="rounded-sm bg-subtle p-3">
                        <p className="text-secondary">{a.label}</p>
                        <p className="font-medium">{a.display ?? '—'}</p>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[12px] text-muted">Submitted answers can’t be edited.</p>
                </section>
                <section aria-label="Comment">
                  <h3 className="mb-2 text-[18px] font-medium">Comment</h3>
                  {!d.comment_visible ? (
                    <p className="text-secondary">
                      {d.has_comment
                        ? 'The customer left a comment, but your role can’t view comments.'
                        : 'No comment.'}
                    </p>
                  ) : d.comment ? (
                    <p className="whitespace-pre-wrap break-words rounded-sm bg-subtle p-3">{d.comment}</p>
                  ) : (
                    <p className="text-secondary">No comment.</p>
                  )}
                  {d.text_redacted_at && (
                    <p className="mt-1 text-[12px] text-muted">
                      The comment was removed when its keeping period ended.
                    </p>
                  )}
                </section>
                <section aria-label="Call back">
                  <h3 className="mb-2 text-[18px] font-medium">Call back</h3>
                  {!d.has_contact_consent ? (
                    <p className="text-secondary">The customer didn’t ask for a call back.</p>
                  ) : d.contact?.erased ? (
                    <p className="text-secondary">
                      Asked for a call back, but the number has since been deleted.
                    </p>
                  ) : (
                    <p>
                      Asked for a call back ·{' '}
                      <span className="font-medium tabular-nums">{d.contact?.masked ?? 'Unavailable'}</span>
                    </p>
                  )}
                </section>
                <RecordCasePanel responseId={d.id} hasContactConsent={d.has_contact_consent} />
                <RecordCorrectionsPanel responseId={d.id} />
              </div>
            )}
          </QueryView>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Feedback records explorer (M10, REQ §6.6): keyset-paginated list, search, detail drawer. */
export function RecordsPage() {
  const { supabase, can } = useSession();
  const { rpcFilters } = useAnalyticsFilters();
  const search = useSearch({ strict: false }) as { record?: string; q?: string };
  const navigate = useNavigate();
  const [text, setText] = useState(search.q ?? '');
  const limit = 25;
  const term = search.q ?? '';
  const commentSearch = can('responses.comment.view');
  const setSearch = (next: { record?: string | undefined; q?: string | undefined }) =>
    navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => {
        return Object.fromEntries(
          Object.entries({ ...prev, ...next }).filter(([, v]) => v !== undefined && v !== ''),
        );
      },
    } as Parameters<typeof navigate>[0]);

  const list = useInfiniteQuery({
    queryKey: ['analytics', 'records', rpcFilters, term, limit],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('records_list', {
        p_filters: rpcFilters,
        p_search: term || null,
        p_cursor: pageParam,
        p_limit: limit,
      });
      if (error) throw error;
      return data as RecordPage;
    },
    getNextPageParam: (last) => last.next_cursor,
  });
  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];
  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setSearch({ q: text.trim() || undefined });
  };

  return (
    <>
      <PageHeader title={WORDS.records} subtitle="Each customer’s answers, newest first." />
      <FilterBar caseStatus />
      <section className="rounded-lg bg-white">
        <form
          onSubmit={onSearch}
          role="search"
          className="flex flex-wrap items-end gap-2 border-b border-border p-4"
        >
          <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-[14px] font-medium">
            {commentSearch ? 'Search by reference or a word in the comment' : 'Search by reference'}
            <input
              type="search"
              maxLength={100}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={commentSearch ? 'FB-2026-000123 or a word from a comment' : 'FB-2026-000123'}
              className="h-11 rounded-sm border border-border-strong px-3 text-[16px] outline-none focus-visible:border-brand"
            />
          </label>
          <Button type="submit" className="h-11">
            Search
          </Button>
        </form>
        <p className="px-4 pt-3 text-[12px] text-muted" aria-live="polite">
          {list.isSuccess && rows.length > 0
            ? `Showing ${formatCount(rows.length)} response${rows.length === 1 ? '' : 's'}${list.hasNextPage ? '. Load more below.' : ''}`
            : ''}
        </p>
        {list.isPending && (
          <div className="p-4" role="status" aria-label="Loading">
            <Skeleton className="h-64" />
          </div>
        )}
        {list.isError && (
          <div className="p-4">
            <Alert tone="danger" detail={toUserError(list.error).detail}>
              {toUserError(list.error).message}
            </Alert>
          </div>
        )}
        {list.isSuccess && rows.length === 0 && (
          <EmptyState title={WORDS.noData}>Try a longer period or clear some filters.</EmptyState>
        )}
        {rows.length > 0 && (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1100px] text-[14px]">
                <caption className="sr-only">{WORDS.records}</caption>
                <thead>
                  <tr className="text-left text-[12px] uppercase tracking-[1px] text-muted">
                    {[
                      'Reference',
                      'Date',
                      'Channel',
                      'Branch',
                      'Product',
                      'Satisfaction',
                      'Ease of service',
                      'Would recommend',
                      WORDS.factor,
                      'Comment',
                      'Wants a call back',
                      'Case',
                    ].map((h) => (
                      <th key={h} scope="col" className="sticky top-0 bg-white px-3 py-2.5 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-muted">
                      <th scope="row" className="px-3 py-3 text-left">
                        <button
                          type="button"
                          className="min-h-11 font-medium text-brand hover:underline"
                          onClick={() => setSearch({ record: r.id })}
                        >
                          {r.reference}
                        </button>
                      </th>
                      <td className="px-3 py-3 tabular-nums">{formatDateTime(r.submitted_at)}</td>
                      <td className="px-3 py-3">{r.channel.label}</td>
                      <td className="px-3 py-3">{r.branch_label}</td>
                      <td className="px-3 py-3">{r.product.label}</td>
                      <td className="px-3 py-3">
                        <Satisfaction csat={r.csat} />
                      </td>
                      <td className="px-3 py-3 tabular-nums">{r.ces} of 5</td>
                      <td className="px-3 py-3">
                        <Recommend r={r} />
                      </td>
                      <td className="px-3 py-3">{r.factor?.label ?? '—'}</td>
                      <td className="px-3 py-3">{yesNo(r.has_comment)}</td>
                      <td className="px-3 py-3">{yesNo(r.contact_consent)}</td>
                      <td className="px-3 py-3">
                        {r.case ? `${r.case.reference} · ${CASE_LABEL[r.case.status] ?? r.case.status}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="grid gap-2 p-4 md:hidden">
              {rows.map((r) => (
                <li key={r.id} className="rounded-sm border border-border p-3">
                  <p className="font-medium">{r.reference}</p>
                  <p className="text-[12px] text-muted">{formatDateTime(r.submitted_at)}</p>
                  <p>
                    {r.channel.label} · {r.branch_label}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Satisfaction csat={r.csat} />
                    <Recommend r={r} />
                  </div>
                  <p className="mt-1 text-[13px] text-secondary">
                    Ease of service {r.ces} of 5{r.has_comment && ' · Comment'}
                    {r.contact_consent && ' · Wants a call back'}
                  </p>
                  <Button
                    variant="secondary"
                    className="mt-2 h-11 w-full text-[14px]"
                    onClick={() => setSearch({ record: r.id })}
                  >
                    Details
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
        {list.hasNextPage && (
          <div className="flex justify-center p-4">
            <Button variant="secondary" busy={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
        {list.isFetching && !list.isPending && !list.isFetchingNextPage && (
          <p className="p-4 text-center">
            <Spinner label="Updating" />
          </p>
        )}
      </section>
      {search.record && <RecordDrawer id={search.record} onClose={() => setSearch({ record: undefined })} />}
    </>
  );
}
