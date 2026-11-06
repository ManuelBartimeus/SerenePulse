// The Turnstile token is fetched in advance, so pressing Submit never waits for a challenge.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_MAX_AGE_MS, Turnstile } from './turnstile';

type Opts = Record<string, (arg?: string) => unknown>;

function fakeApi() {
  let opts: Opts = {};
  const api = {
    render: vi.fn((_el: unknown, o: Opts) => {
      opts = o;
      return 'widget-1';
    }),
    execute: vi.fn(),
    reset: vi.fn(),
  };
  return { api, issue: (t: string) => opts.callback?.(t), error: () => opts['error-callback']?.() };
}

const container = {} as HTMLElement;
let now = 1_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  now = 1_000_000;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup() {
  const f = fakeApi();
  vi.stubGlobal('window', { turnstile: f.api });
  const ts = new Turnstile('site-key', container, null, () => now);
  return { ts, ...f };
}

describe('Turnstile token in advance', () => {
  it('prepare() starts the challenge on arrival; Submit then gets the token with no new challenge', async () => {
    const { ts, api, issue } = setup();
    await ts.prepare();
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(api.execute).toHaveBeenCalledTimes(1);
    issue('tok-1');
    const t0 = Date.now();
    await expect(ts.token()).resolves.toBe('tok-1');
    expect(Date.now() - t0).toBe(0); // no waiting at click time
    expect(api.execute).toHaveBeenCalledTimes(1);
  });

  it('a Submit pressed while the challenge is still running waits for that same challenge', async () => {
    const { ts, api, issue } = setup();
    await ts.prepare();
    const pending = ts.token();
    await Promise.resolve();
    expect(api.execute).toHaveBeenCalledTimes(1); // not restarted
    issue('tok-2');
    await expect(pending).resolves.toBe('tok-2');
  });

  it('tokens are single use: a retry fetches a new one', async () => {
    const { ts, api, issue } = setup();
    await ts.prepare();
    issue('tok-1');
    await ts.token();
    const retry = ts.token();
    await Promise.resolve();
    await Promise.resolve();
    expect(api.execute).toHaveBeenCalledTimes(2);
    issue('tok-3');
    await expect(retry).resolves.toBe('tok-3');
  });

  it('prepare() after a used token fetches the next one ahead of a retry', async () => {
    const { ts, api, issue } = setup();
    await ts.prepare();
    issue('tok-1');
    await ts.token();
    await ts.prepare();
    expect(api.execute).toHaveBeenCalledTimes(2);
    issue('tok-4');
    await expect(ts.token()).resolves.toBe('tok-4');
  });

  it('a token is replaced before it expires, so a customer who lingers still submits at once', async () => {
    const { ts, api, issue } = setup();
    await ts.prepare();
    issue('old');
    now += TOKEN_MAX_AGE_MS;
    vi.advanceTimersByTime(TOKEN_MAX_AGE_MS);
    expect(api.execute).toHaveBeenCalledTimes(2);
    issue('new');
    await expect(ts.token()).resolves.toBe('new');
  });

  it('never hands out a stale token', async () => {
    const { ts, api, issue } = setup();
    await ts.prepare();
    issue('old');
    now += TOKEN_MAX_AGE_MS + 1; // the clock moved but the refresh timer has not fired yet
    const pending = ts.token();
    await Promise.resolve();
    await Promise.resolve();
    expect(api.execute).toHaveBeenCalledTimes(2);
    issue('fresh');
    await expect(pending).resolves.toBe('fresh');
  });

  it('an error or a missing site key gives null (stored as a Turnstile outage server-side)', async () => {
    const { ts, error } = setup();
    await ts.prepare();
    const pending = ts.token();
    await Promise.resolve();
    error();
    await expect(pending).resolves.toBeNull();
    await expect(new Turnstile('', container, null).token()).resolves.toBeNull();
  });
});
