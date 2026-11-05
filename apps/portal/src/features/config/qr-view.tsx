// On-screen QR code and the poster / image downloads (M05). Generated in the browser; nothing is stored.
import { useMemo, useState } from 'react';
import logoSvgUrl from '@serene/ui/assets/serene-logo.svg';
import { Button } from '../../ui/controls';
import { buildPosterPdf, type PosterSize } from './poster';
import { QUIET_ZONE, download, qrMatrix, qrPath, qrSvg, svgToPng } from './qr';
import { ErrorAlert } from './shared';

/** The QR code as inline SVG, drawn from the same module matrix as the downloads. */
export function QrCodeView({ url, label, size = 240 }: { url: string; label: string; size?: number }) {
  const { path, total } = useMemo(() => {
    const m = qrMatrix(url);
    return { path: qrPath(m), total: m.size + QUIET_ZONE * 2 };
  }, [url]);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="h-auto max-w-full rounded-md bg-white"
    >
      <rect width={total} height={total} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}

let logoCache: Promise<ArrayBuffer> | null = null;
/** The Serene logo rasterised at its full vector size (1776 × 864) for print. */
function logoPng(): Promise<ArrayBuffer> {
  logoCache ??= fetch(logoSvgUrl)
    .then((r) => {
      if (!r.ok) throw new Error('The logo could not be loaded.');
      return r.text();
    })
    .then((svg) => svgToPng(svg, 1776, 864))
    .then((b) => b.arrayBuffer())
    .catch((e: unknown) => {
      logoCache = null;
      throw e;
    });
  return logoCache;
}

type Job = PosterSize | 'svg' | 'png';

export function PosterDownloads({
  url,
  filenameBase,
  compact = false,
}: {
  url: string;
  filenameBase: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<Job | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState('');
  async function run(job: Job) {
    setBusy(job);
    setError(null);
    setDone('');
    try {
      if (job === 'svg') {
        download(
          new Blob([qrSvg(url, `QR code for ${url}`)], { type: 'image/svg+xml' }),
          `${filenameBase}-qr.svg`,
        );
      } else if (job === 'png') {
        const m = qrMatrix(url);
        const px = (m.size + QUIET_ZONE * 2) * 16;
        download(await svgToPng(qrSvg(url, 'QR code'), px, px), `${filenameBase}-qr.png`);
      } else {
        const bytes = await buildPosterPdf({ size: job, url, logoPng: await logoPng() });
        download(
          new Blob([bytes as BlobPart], { type: 'application/pdf' }),
          `${filenameBase}-poster-${job}.pdf`,
        );
      }
      setDone(
        job === 'svg' || job === 'png'
          ? `QR image (${job.toUpperCase()}) downloaded.`
          : `${job} poster downloaded.`,
      );
    } catch (e) {
      setError({
        code: '22023',
        message: `We couldn’t create the file. ${e instanceof Error ? e.message : ''} Try again, or use another browser.`,
      });
    } finally {
      setBusy(null);
    }
  }
  const cls = compact ? 'h-11 px-4 text-[14px]' : '';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          className={cls}
          busy={busy === 'A4'}
          disabled={!!busy}
          onClick={() => run('A4')}
        >
          A4 poster (PDF)
        </Button>
        <Button
          variant="secondary"
          className={cls}
          busy={busy === 'A5'}
          disabled={!!busy}
          onClick={() => run('A5')}
        >
          A5 poster (PDF)
        </Button>
        <Button
          variant="ghost"
          className={cls}
          busy={busy === 'svg'}
          disabled={!!busy}
          onClick={() => run('svg')}
        >
          QR as SVG
        </Button>
        <Button
          variant="ghost"
          className={cls}
          busy={busy === 'png'}
          disabled={!!busy}
          onClick={() => run('png')}
        >
          QR as PNG
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {busy ? 'Creating the file…' : done}
      </p>
      {error ? <ErrorAlert error={error} /> : null}
    </div>
  );
}
