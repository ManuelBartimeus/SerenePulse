// HTTP client for /api/account/* (contract: packages/proposals/src/api.ts).
// Every request is same-origin with the session cookie; state-changing requests carry the CSRF
// header the Worker requires. With VITE_MOCK_API=1 (vite dev only) requests go to ./mock.
import type { FieldError, Problem } from '@serene/proposals';

export const API_BASE = '/api/account';
export const MOCK = import.meta.env.VITE_MOCK_API === '1';
const CSRF_HEADER = { 'x-requested-with': 'serene-account' } as const;

export class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem | undefined;
  constructor(status: number, problem?: Problem) {
    super(problem?.detail ?? problem?.title ?? `Request failed (${status})`);
    this.status = status;
    this.problem = problem;
  }
  get errors(): readonly FieldError[] {
    return this.problem?.errors ?? [];
  }
}

/** True when the browser could not reach the server at all. */
export class NetworkError extends Error {
  constructor() {
    super('We could not reach Serene. Check your connection and try again.');
  }
}

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

type MockModule = typeof import('./mock');
let mockModule: Promise<MockModule> | null = null;
function loadMock(): Promise<MockModule> {
  mockModule ??= import('./mock');
  return mockModule;
}

async function parseError(res: Response): Promise<ApiError> {
  let problem: Problem | undefined;
  try {
    const body = (await res.json()) as Partial<Problem>;
    if (body && typeof body === 'object' && typeof body.title === 'string') problem = body as Problem;
  } catch {
    /* not JSON */
  }
  return new ApiError(res.status, problem);
}

export interface RequestOptions {
  signal?: AbortSignal;
  keepalive?: boolean;
}

export async function api<T>(
  method: Method,
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  if (MOCK) {
    const mock = await loadMock();
    return mock.handle<T>(method, path, body);
  }
  const headers: Record<string, string> = { accept: 'application/json' };
  if (method !== 'GET') Object.assign(headers, CSRF_HEADER);
  if (body !== undefined && !(body instanceof FormData)) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? null : body instanceof FormData ? body : JSON.stringify(body),
      ...(opts.signal ? { signal: opts.signal } : {}),
      ...(opts.keepalive ? { keepalive: true } : {}),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new NetworkError();
  }
  if (!res.ok) {
    const err = await parseError(res);
    if (err.status === 401) notifyUnauthorised();
    throw err;
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('json')) return undefined as T;
  return (await res.json()) as T;
}

/** Multipart upload with progress (fetch cannot report upload progress). */
export function upload<T>(
  path: string,
  form: FormData,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  if (MOCK) return loadMock().then((m) => m.handleUpload<T>(path, form, onProgress, signal));
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}${path}`);
    xhr.withCredentials = false; // same-origin: cookies are sent anyway
    xhr.setRequestHeader('x-requested-with', 'serene-account');
    xhr.setRequestHeader('accept', 'application/json');
    xhr.responseType = 'text';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new NetworkError());
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    xhr.onload = () => {
      let parsed: unknown;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
      } catch {
        parsed = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(parsed as T);
      else {
        if (xhr.status === 401) notifyUnauthorised();
        const p = parsed as Problem | undefined;
        reject(new ApiError(xhr.status, p && typeof p.title === 'string' ? p : undefined));
      }
    };
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}

/** URL an <img> or link can use for an uploaded file (owner only). */
export function fileUrl(fileId: string): string {
  if (MOCK) return mockFileUrls.get(fileId) ?? '';
  return `${API_BASE}/files/${encodeURIComponent(fileId)}`;
}
/** Filled by the mock with object URLs of the files it "stored". */
export const mockFileUrls = new Map<string, string>();

// ---- Session expiry ----------------------------------------------------------------------------

type Listener = () => void;
const unauthorisedListeners = new Set<Listener>();
export function onUnauthorised(fn: Listener): () => void {
  unauthorisedListeners.add(fn);
  return () => unauthorisedListeners.delete(fn);
}
export function notifyUnauthorised(): void {
  for (const fn of unauthorisedListeners) fn();
}

/** A sentence a customer can act on, for any error. */
export function errorMessage(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (e instanceof NetworkError) return e.message;
  if (e instanceof ApiError) {
    if (e.status === 429)
      return e.problem?.detail ?? 'Too many attempts. Please wait a minute and try again.';
    if (e.status >= 500) return 'Our service is having a problem. Please try again in a few minutes.';
    return e.problem?.detail ?? e.problem?.title ?? fallback;
  }
  return fallback;
}
