// Invisible Turnstile, loaded asynchronously near the end of the form (PERFORMANCE survey techniques).
// The token is fetched in advance — as soon as the customer reaches the last page — so pressing Submit
// never waits for a Turnstile challenge. Tokens are single use and expire after 300 s, so a used or
// stale token is replaced in the background.
interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  execute(id: string): void;
  reset(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const LOAD_TIMEOUT_MS = 10000;
const TOKEN_TIMEOUT_MS = 12000;
/** Turnstile tokens are valid for 300 s; anything older than this is replaced before use. */
export const TOKEN_MAX_AGE_MS = 270_000;

export class Turnstile {
  private loading: Promise<boolean> | undefined;
  private widget: string | undefined;
  private waiters: ((token: string | null) => void)[] = [];
  private interactive = false;
  /** The token fetched in advance and when it arrived. */
  private ready: { token: string; at: number } | undefined;
  /** An execution is running (its callback has not fired yet). */
  private running = false;
  private refresher: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly siteKey: string,
    private readonly container: HTMLElement | null,
    private readonly note: HTMLElement | null,
    private readonly now: () => number = () => Date.now(),
  ) {}

  load(): Promise<boolean> {
    if (!this.siteKey || !this.container) return Promise.resolve(false);
    this.loading ??= new Promise<boolean>((resolve) => {
      if (window.turnstile) {
        resolve(true);
        return;
      }
      const s = document.createElement('script');
      s.src = SCRIPT;
      s.async = true;
      s.onload = () => resolve(!!window.turnstile);
      s.onerror = () => resolve(false);
      setTimeout(() => resolve(!!window.turnstile), LOAD_TIMEOUT_MS);
      document.head.appendChild(s);
    }).then((ok) => ok && this.render());
    return this.loading;
  }

  /** Loads the widget and starts fetching a token now, so it is ready when Submit is pressed. */
  async prepare(): Promise<void> {
    if (!(await this.load())) return;
    if (this.fresh() || this.running) return;
    this.execute();
  }

  private fresh(): boolean {
    return !!this.ready && this.now() - this.ready.at < TOKEN_MAX_AGE_MS;
  }

  private settle(token: string | null): void {
    this.running = false;
    clearTimeout(this.refresher);
    const waiters = this.waiters;
    this.waiters = [];
    const [first, ...rest] = waiters;
    if (token && first) {
      first(token); // someone is waiting (Submit was pressed before the token arrived): it is theirs
      for (const w of rest) w(null);
      return;
    }
    for (const w of waiters) w(null);
    if (!token) return;
    this.ready = { token, at: this.now() };
    // Replace it before it expires, so a customer who lingers on the last page still has a valid one.
    this.refresher = setTimeout(() => {
      this.ready = undefined;
      this.execute();
    }, TOKEN_MAX_AGE_MS);
  }

  private execute(): void {
    const api = window.turnstile;
    if (!api || !this.widget) return;
    this.running = true;
    try {
      api.reset(this.widget);
      api.execute(this.widget);
    } catch {
      this.settle(null);
    }
  }

  private render(): boolean {
    const api = window.turnstile;
    if (!api || !this.container) return false;
    if (this.widget) return true;
    try {
      this.widget = api.render(this.container, {
        sitekey: this.siteKey,
        execution: 'execute',
        appearance: 'interaction-only',
        action: 'submit',
        // We refresh ourselves (see settle) so a token is never swapped while it is being used.
        'refresh-expired': 'manual',
        callback: (t: string) => this.settle(t),
        'error-callback': () => {
          this.settle(null);
          return true;
        },
        'expired-callback': () => {
          this.ready = undefined;
        },
        'timeout-callback': () => this.settle(null),
        'before-interactive-callback': () => {
          this.interactive = true;
          if (this.note) this.note.hidden = false;
        },
        'after-interactive-callback': () => {
          this.interactive = false;
          if (this.note) this.note.hidden = true;
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * A single-use token: the one fetched in advance when it is still fresh (no wait), otherwise the
   * one being fetched, otherwise a new one. null when Turnstile cannot run (an outage server-side).
   */
  async token(): Promise<string | null> {
    if (!(await this.load()) || !this.widget || !window.turnstile) return null;
    if (this.fresh() && this.ready) {
      const t = this.ready.token;
      this.ready = undefined; // single use; prepare() fetches another if a retry needs one
      clearTimeout(this.refresher);
      return t;
    }
    return new Promise<string | null>((resolve) => {
      let settled = false;
      const done = (t: string | null) => {
        if (settled) return;
        settled = true;
        resolve(t);
      };
      this.waiters.push(done);
      const timeout = () => {
        if (settled) return;
        if (this.interactive) setTimeout(timeout, 2000);
        else {
          this.waiters = this.waiters.filter((w) => w !== done);
          done(null);
        }
      };
      setTimeout(timeout, TOKEN_TIMEOUT_MS);
      if (!this.running) this.execute();
    });
  }
}
