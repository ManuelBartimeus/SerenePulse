// Invisible Turnstile, loaded asynchronously and only on the last page (PERFORMANCE survey techniques).
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

export class Turnstile {
  private loading: Promise<boolean> | undefined;
  private widget: string | undefined;
  private waiter: ((token: string | null) => void) | undefined;
  private interactive = false;

  constructor(
    private readonly siteKey: string,
    private readonly container: HTMLElement | null,
    private readonly note: HTMLElement | null,
  ) {}

  load(): Promise<boolean> {
    if (!this.siteKey || !this.container) return Promise.resolve(false);
    this.loading ??= new Promise<boolean>((resolve) => {
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

  private settle(token: string | null): void {
    const w = this.waiter;
    this.waiter = undefined;
    w?.(token);
  }

  private render(): boolean {
    const api = window.turnstile;
    if (!api || !this.container) return false;
    try {
      this.widget = api.render(this.container, {
        sitekey: this.siteKey,
        execution: 'execute',
        appearance: 'interaction-only',
        action: 'submit',
        callback: (t: string) => this.settle(t),
        'error-callback': () => {
          this.settle(null);
          return true;
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

  /** A fresh single-use token, or null when Turnstile cannot run (treated as an outage server-side). */
  async token(): Promise<string | null> {
    if (!(await this.load()) || !this.widget || !window.turnstile) return null;
    const api = window.turnstile;
    const id = this.widget;
    return new Promise<string | null>((resolve) => {
      this.waiter = resolve;
      const timeout = () => {
        if (!this.waiter) return;
        if (this.interactive) setTimeout(timeout, 2000);
        else this.settle(null);
      };
      setTimeout(timeout, TOKEN_TIMEOUT_MS);
      try {
        api.reset(id);
        api.execute(id);
      } catch {
        this.settle(null);
      }
    });
  }
}
