// Signature: Draw (pointer events, smoothed, high-DPI), Type (script font to canvas) or Upload
// (photo of a handwritten signature, cropped and made transparent). Calls onChange with PNG base64.
import type { SignatureInfo } from '@serene/proposals';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  drawStrokes,
  drawTypedSignature,
  inkLength,
  simplify,
  strokesToPng,
  typedToPng,
  uploadedToPng,
  type Point,
  type Stroke,
} from '../lib/signature';
import { cx } from '../ui/components';
import { Icon } from '../ui/icons';

export interface SignatureValue {
  method: SignatureInfo['method'];
  png: string;
}

type Tab = 'drawn' | 'typed' | 'uploaded';
const TABS: { id: Tab; label: string }[] = [
  { id: 'drawn', label: 'Draw' },
  { id: 'typed', label: 'Type' },
  { id: 'uploaded', label: 'Upload' },
];
const LINE = 2.6;

export function SignaturePad({
  name,
  onChange,
  invalid,
}: {
  name: string;
  onChange: (v: SignatureValue | null) => void;
  invalid?: boolean;
}) {
  const [tab, setTab] = useState<Tab>('drawn');
  return (
    <div>
      <div
        role="tablist"
        aria-label="How do you want to sign?"
        className="segmented !max-w-none !grid-cols-3 tab:!max-w-[400px]"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`sig-tab-${t.id}`}
            aria-controls={`sig-panel-${t.id}`}
            aria-selected={tab === t.id}
            type="button"
            className={cx(
              'min-h-[46px] cursor-pointer rounded-[10px] border-0 font-semibold',
              tab === t.id
                ? 'bg-white text-brand shadow-[0_1px_2px_rgb(17_17_17/0.08),0_0_0_1px_var(--color-brand)]'
                : 'bg-transparent text-secondary',
            )}
            onClick={() => {
              setTab(t.id);
              onChange(null);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`sig-panel-${tab}`} aria-labelledby={`sig-tab-${tab}`} className="mt-3">
        {tab === 'drawn' && <DrawPad onChange={onChange} invalid={invalid ?? false} />}
        {tab === 'typed' && <TypedPad name={name} onChange={onChange} invalid={invalid ?? false} />}
        {tab === 'uploaded' && <UploadPad onChange={onChange} invalid={invalid ?? false} />}
      </div>
    </div>
  );
}

function Surface({
  children,
  invalid,
  className,
}: {
  children: React.ReactNode;
  invalid: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'relative overflow-hidden rounded-2xl border bg-white',
        invalid ? 'border-danger' : 'border-border-strong',
        className,
      )}
    >
      {children}
      <div
        className="pointer-events-none absolute right-5 bottom-[38px] left-5 border-b border-dashed border-border-strong"
        aria-hidden="true"
      />
      <span
        className="pointer-events-none absolute bottom-[14px] left-5 text-[12px] font-medium text-muted"
        aria-hidden="true"
      >
        Sign above the line
      </span>
    </div>
  );
}

function DrawPad({ onChange, invalid }: { onChange: (v: SignatureValue | null) => void; invalid: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const drawing = useRef<Point[] | null>(null);
  const [count, setCount] = useState(0);
  const [tooShort, setTooShort] = useState(false);

  const redraw = () => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    drawStrokes(ctx, drawing.current ? [...strokes.current, drawing.current] : strokes.current, LINE);
  };

  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const resize = () => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      redraw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  const emit = () => {
    const all = strokes.current;
    setCount(all.length);
    if (all.length === 0) return onChange(null);
    if (inkLength(all) < 60) {
      setTooShort(true);
      return onChange(null);
    }
    setTooShort(false);
    try {
      onChange({ method: 'drawn', png: strokesToPng(all, LINE) });
    } catch {
      onChange(null);
    }
  };

  const pt = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div>
      <Surface invalid={invalid}>
        <canvas
          ref={canvas}
          className="block h-[200px] w-full cursor-crosshair touch-none select-none md:h-[220px]"
          role="img"
          aria-label={
            count
              ? 'Your drawn signature'
              : 'Signature area. Draw your signature with your finger, a stylus or the mouse.'
          }
          onPointerDown={(e) => {
            if (e.button !== 0 && e.pointerType === 'mouse') return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = [pt(e)];
            redraw();
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const events =
              typeof e.nativeEvent.getCoalescedEvents === 'function'
                ? e.nativeEvent.getCoalescedEvents()
                : [];
            const r = e.currentTarget.getBoundingClientRect();
            if (events.length)
              for (const ev of events)
                drawing.current.push({ x: ev.clientX - r.left, y: ev.clientY - r.top });
            else drawing.current.push(pt(e));
            redraw();
          }}
          onPointerUp={() => {
            if (!drawing.current) return;
            strokes.current = [...strokes.current, simplify(drawing.current as Stroke)];
            drawing.current = null;
            redraw();
            emit();
          }}
          onPointerCancel={() => {
            drawing.current = null;
            redraw();
          }}
        />
      </Surface>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="hint">
          {tooShort
            ? 'That looks too short for a signature. Please sign in full.'
            : 'Use your finger, a stylus or the mouse.'}
        </p>
        <div className="flex flex-none gap-1">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={count === 0}
            onClick={() => {
              strokes.current = strokes.current.slice(0, -1);
              redraw();
              emit();
            }}
          >
            <Icon name="undo" size={18} />
            Undo
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={count === 0}
            onClick={() => {
              strokes.current = [];
              redraw();
              emit();
            }}
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

function TypedPad({
  name,
  onChange,
  invalid,
}: {
  name: string;
  onChange: (v: SignatureValue | null) => void;
  invalid: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const trimmed = name.trim();
  useLayoutEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const r = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTypedSignature(ctx, trimmed, r.width, r.height - 30);
  }, [trimmed]);
  useEffect(() => {
    if (trimmed.length < 3) return onChange(null);
    const t = window.setTimeout(() => {
      try {
        onChange({ method: 'typed', png: typedToPng(trimmed) });
      } catch {
        onChange(null);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [trimmed]);
  return (
    <div>
      <Surface invalid={invalid}>
        <canvas
          ref={canvas}
          className="block h-[200px] w-full"
          role="img"
          aria-label={trimmed ? `Signature rendered from the name ${trimmed}` : 'Typed signature preview'}
        />
        {!trimmed && (
          <p className="absolute inset-x-0 top-[70px] text-center text-[15px] text-secondary">
            Enter your full name above. It appears here as your signature.
          </p>
        )}
      </Surface>
      <p className="hint mt-2">We draw your signature from the full name you entered above.</p>
    </div>
  );
}

function UploadPad({
  onChange,
  invalid,
}: {
  onChange: (v: SignatureValue | null) => void;
  invalid: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function pick(f: File) {
    setBusy(true);
    setError(null);
    try {
      const { b64, preview: url } = await uploadedToPng(f);
      setPreview(url);
      onChange({ method: 'uploaded', png: b64 });
    } catch {
      setPreview(null);
      onChange(null);
      setError(
        'We couldn’t find a signature in that photo. Sign in dark ink on plain white paper and take the photo in good light.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div
        className={cx(
          'checker grid min-h-[200px] place-items-center rounded-2xl border p-4',
          invalid ? 'border-danger' : 'border-border-strong',
        )}
      >
        {preview ? (
          <img src={preview} alt="Your signature, cropped from the photo" className="max-h-[160px] w-auto" />
        ) : (
          <div className="max-w-sm text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand">
              <Icon name="camera" size={24} />
            </span>
            <p className="mt-3 text-[15px] text-secondary">
              Sign on plain white paper, then take a photo or choose one. We crop it and remove the
              background.
            </p>
          </div>
        )}
      </div>
      {error && <p className="error-text mt-2">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          <Icon name="upload" size={18} />
          {busy ? 'Processing…' : preview ? 'Choose another photo' : 'Choose photo'}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
