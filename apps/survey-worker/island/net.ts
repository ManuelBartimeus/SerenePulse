// Network side of the island: debounced draft sync (≤ 1 in flight, monotonically increasing seq)
// and batched telemetry over sendBeacon. Neither is ever on the page-change critical path.
import type { Json } from '@serene/survey-engine';

const JSON_HEADERS = { 'content-type': 'application/json' };

export class DraftSync {
  private pending: Record<string, Json> = {};
  private pendingPage: number | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inflight = false;
  private stopped = false;
  private failures = 0;
  /** True while some change has not been acknowledged by the server. */
  dirty = false;

  constructor(
    private readonly url: string,
    public seq: number,
    private readonly onStatus: (status: number) => void,
    private readonly debounceMs = 300,
  ) {}

  queue(diff: Record<string, Json>, page?: number): void {
    if (this.stopped) return;
    Object.assign(this.pending, diff);
    if (page !== undefined) this.pendingPage = page;
    if (!this.hasPending()) return;
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.debounceMs);
  }

  hasPending(): boolean {
    return Object.keys(this.pending).length > 0 || this.pendingPage !== undefined;
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  resume(): void {
    this.stopped = false;
  }

  async flush(keepalive = false): Promise<void> {
    clearTimeout(this.timer);
    if (this.stopped || this.inflight || !this.hasPending()) return;
    const answers = this.pending;
    const page = this.pendingPage;
    this.pending = {};
    this.pendingPage = undefined;
    this.seq += 1;
    this.inflight = true;
    try {
      const res = await fetch(this.url, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        credentials: 'same-origin',
        keepalive,
        body: JSON.stringify({ seq: this.seq, page, answers }),
      });
      if (res.ok) {
        this.failures = 0;
        if (!this.hasPending()) this.dirty = false;
      } else {
        if (res.status >= 500) this.requeue(answers, page);
        if (res.status === 429) this.stop();
        this.onStatus(res.status);
      }
    } catch {
      // Offline: keep the change; the next change or the `online` event retries.
      this.requeue(answers, page);
      this.failures += 1;
    } finally {
      this.inflight = false;
    }
    if (this.hasPending() && !this.stopped && navigator.onLine !== false) {
      const delay = this.failures ? Math.min(30000, 1000 * 2 ** this.failures) : this.debounceMs;
      this.timer = setTimeout(() => void this.flush(), delay);
    }
  }

  private requeue(answers: Record<string, Json>, page: number | undefined): void {
    this.pending = { ...answers, ...this.pending };
    if (this.pendingPage === undefined) this.pendingPage = page;
  }
}

export interface TelemetryEvent {
  type: string;
  page: number;
  clientTs: string;
  detail?: Record<string, Json>;
}

export class Telemetry {
  private queue: TelemetryEvent[] = [];
  constructor(private readonly url: string) {}

  add(type: string, page: number, detail?: Record<string, Json>): void {
    this.queue.push({ type, page, clientTs: new Date().toISOString(), ...(detail ? { detail } : {}) });
    if (this.queue.length >= 40) this.flush();
  }

  flush(): void {
    while (this.queue.length) {
      const batch = this.queue.splice(0, 50);
      const body = JSON.stringify(batch);
      let sent = false;
      try {
        sent = !!navigator.sendBeacon?.(this.url, new Blob([body], { type: 'application/json' }));
      } catch {
        sent = false;
      }
      if (!sent) {
        fetch(this.url, { method: 'POST', headers: JSON_HEADERS, body, keepalive: true }).catch(
          () => undefined,
        );
      }
    }
  }
}
