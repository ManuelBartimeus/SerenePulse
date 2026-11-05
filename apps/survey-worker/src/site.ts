// Static sites served from the Workers static-assets binding: the public landing site at `/`
// and the staff portal SPA at `/admin`. `public/` is assembled by the build (landing dist at the
// root, portal dist in `public/admin/`).
import type { Context } from 'hono';
import type { Bindings } from './config';
import type { HeaderVariables } from './headers';

type C = Context<{ Bindings: Bindings; Variables: HeaderVariables }>;

const IMMUTABLE = 'public, max-age=31536000, immutable';
const HIDDEN = /(^|\/)(_headers|_redirects|_routes\.json)$|\.map$/;

async function fromAssets(c: C, pathname?: string): Promise<Response> {
  const assets = c.env.ASSETS;
  if (!assets) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  const url = new URL(c.req.url);
  if (pathname) url.pathname = pathname;
  const res = await assets.fetch(
    new Request(url.toString(), { method: c.req.method, headers: c.req.raw.headers }),
  );
  return new Response(res.body, res); // mutable headers for the security middleware
}

const isHtml = (res: Response) => (res.headers.get('content-type') ?? '').includes('text/html');

/** `/admin/*`: unknown paths fall back to the SPA shell; the shell is never cached, hashed assets forever. */
export async function servePortal(c: C): Promise<Response> {
  const path = new URL(c.req.url).pathname;
  if (HIDDEN.test(path)) return c.text('Not found', 404);
  const isAsset = path.startsWith('/admin/assets/');
  let res = await fromAssets(c);
  if (res.status === 404 && !isAsset) {
    const shell = await fromAssets(c, '/admin/');
    res = new Response(shell.body, { status: shell.ok ? 200 : shell.status, headers: shell.headers });
  }
  if (isHtml(res)) res.headers.set('cache-control', 'no-store');
  else if (isAsset && res.ok) res.headers.set('cache-control', IMMUTABLE);
  return res;
}

/** Everything else: the landing site. A missing page gets the site's 404.html when it has one. */
export async function serveLanding(c: C): Promise<Response> {
  const path = new URL(c.req.url).pathname;
  if (HIDDEN.test(path)) return c.text('Not found', 404);
  let res = await fromAssets(c);
  if (res.status === 404) {
    const page = await fromAssets(c, '/404.html');
    res = page.ok
      ? new Response(page.body, { status: 404, headers: page.headers })
      : new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }
  // Fonts carry a version in their name and never change in place.
  if (res.ok && path.startsWith('/fonts/')) res.headers.set('cache-control', IMMUTABLE);
  // Landing file names are not guaranteed to be hashed, so everything revalidates (asset ETags).
  if (isHtml(res)) res.headers.set('cache-control', 'public, max-age=0, must-revalidate');
  return res;
}
