import { Hono } from 'hono';
import { loadConfig, type Bindings } from './config';
import { securityHeaders, type HeaderVariables } from './headers';
import { unavailablePage } from './pages';
import { callRpc } from './supabase';

export const app = new Hono<{ Bindings: Bindings; Variables: HeaderVariables }>();

app.use('*', securityHeaders);

app.get('/healthz', async (c) => {
  const env = loadConfig(c.env);
  const body = { status: 'ok', db: 'ok', env: env.APP_ENV, version: env.GIT_SHA };
  try {
    await callRpc(env, 'healthz');
  } catch (err) {
    console.error(JSON.stringify({ event: 'healthz_db_failed', message: (err as Error).message }));
    return c.json({ ...body, status: 'degraded', db: 'unreachable' }, 503, { 'cache-control': 'no-store' });
  }
  return c.json(body, 200, { 'cache-control': 'no-store' });
});

// The survey pages arrive in MS-06. Until then every page states the truth rather than
// showing a form that could lose answers (SPEC failure scenario "service unavailable").
app.get('*', (c) =>
  c.html(unavailablePage(c.get('cspNonce')), 503, { 'cache-control': 'no-store', 'retry-after': '3600' }),
);

app.onError((err, c) => {
  const requestId = crypto.randomUUID();
  console.error(JSON.stringify({ event: 'unhandled_error', requestId, message: err.message }));
  return c.json(
    { type: 'about:blank', title: 'Service unavailable', status: 503, request_id: requestId },
    503,
    {
      'content-type': 'application/problem+json',
    },
  );
});

export default {
  fetch: app.fetch,
  async scheduled(_controller, bindings, ctx) {
    // Keep-alive: one cheap database call a day keeps the free project from pausing.
    ctx.waitUntil(
      callRpc(loadConfig(bindings), 'healthz').catch((err: Error) =>
        console.error(JSON.stringify({ event: 'keepalive_failed', message: err.message })),
      ),
    );
  },
} satisfies ExportedHandler<Bindings>;
