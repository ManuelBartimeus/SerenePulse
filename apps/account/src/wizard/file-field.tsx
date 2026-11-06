// Photo and document uploads: drop zone, "Take photo" (camera), "Choose file"; images are
// compressed in the browser first; thumbnails, progress, retry and remove. The identity selfie
// (kind 'id_selfie') gets its own capture UI with a round face guide.
import type { FieldError, FileField } from '@serene/proposals';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { errorMessage, fileUrl } from '../api/client';
import { formatBytes } from '../lib/format';
import { compressImage, isImage, isPdf, MAX_UPLOAD_BYTES } from '../lib/image';
import { cx } from '../ui/components';
import { Icon, Spinner } from '../ui/icons';
import { ErrorText } from '../ui/inputs';
import { useTouch, useWizard, type UploadedFile } from './context';

interface Pending {
  key: string;
  name: string;
  size: number;
  preview?: string;
  pdf: boolean;
  progress: number;
  error?: string;
  file: File;
}

export interface UploaderProps {
  domId: string;
  fieldId: string;
  kind: string;
  label: ReactNode;
  help?: string | undefined;
  guidance?: string | undefined;
  accept: readonly ('image' | 'pdf')[];
  multiple?: boolean | undefined;
  maxFiles?: number | undefined;
  capture?: 'environment' | 'user' | undefined;
  required?: boolean | undefined;
  value: readonly string[];
  onChange: (ids: string[] | undefined) => void;
  files: ReadonlyMap<string, UploadedFile>;
  addFile: (f: UploadedFile) => void;
  upload: (form: FormData, onProgress: (f: number) => void, signal: AbortSignal) => Promise<UploadedFile>;
  remove?: ((fileId: string) => Promise<void>) | undefined;
  error?: string | undefined;
}

export function FileFieldInput({ field, errors }: { field: FileField; errors: readonly FieldError[] }) {
  const ctx = useWizard();
  const v = ctx.answers[field.id];
  const ids = Array.isArray(v) ? (v as string[]) : [];
  const props: UploaderProps = {
    domId: `f-${field.id}`,
    fieldId: field.id,
    kind: field.kind,
    label: (
      <>
        {field.number && <span className="mr-1.5 text-secondary">{field.number}.</span>}
        {field.label}
        {!field.required && <span className="font-normal text-secondary"> (optional)</span>}
      </>
    ),
    help: field.help,
    guidance: field.guidance,
    accept: field.accept,
    multiple: field.multiple,
    maxFiles: field.maxFiles,
    capture: field.capture,
    required: field.required,
    value: ids,
    onChange: (next) => ctx.set(field.id, next),
    files: ctx.files,
    addFile: ctx.addFile,
    upload: ctx.upload,
    remove: ctx.remove,
    error: errors.find((e) => e.field === field.id)?.message,
  };
  return field.kind === 'id_selfie' ? <SelfieUploader {...props} /> : <FileUploader {...props} />;
}

const acceptAttr = (accept: readonly ('image' | 'pdf')[]) =>
  [accept.includes('image') ? 'image/*' : '', accept.includes('pdf') ? 'application/pdf,.pdf' : '']
    .filter(Boolean)
    .join(',');

/** Upload queue shared by both UIs. */
function useUploads(p: UploaderProps) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const valueRef = useRef(p.value);
  valueRef.current = p.value;
  const limit = p.multiple ? (p.maxFiles ?? 10) : (p.maxFiles ?? 1);

  useEffect(
    () => () => {
      for (const c of controllers.current.values()) c.abort();
    },
    [],
  );

  async function send(item: Pending, replace: boolean) {
    const ac = new AbortController();
    controllers.current.set(item.key, ac);
    setPending((xs) =>
      xs.map((x) =>
        x.key === item.key ? (({ error: _e, ...rest }) => ({ ...rest, progress: 0.02 }))(x) : x,
      ),
    );
    try {
      const form = new FormData();
      form.append('fieldId', p.fieldId);
      form.append('kind', p.kind);
      form.append('file', item.file, item.file.name);
      const rec = await p.upload(
        form,
        (f) =>
          setPending((xs) => xs.map((x) => (x.key === item.key ? { ...x, progress: Math.max(0.02, f) } : x))),
        ac.signal,
      );
      p.addFile({ ...rec, ...(item.preview ? { preview: item.preview } : {}) });
      const previous = valueRef.current;
      const next = replace ? [rec.id] : [...previous, rec.id];
      valueRef.current = next;
      p.onChange(next);
      setPending((xs) => xs.filter((x) => x.key !== item.key));
      if (replace) for (const old of previous) void p.remove?.(old).catch(() => undefined);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setPending((xs) =>
        xs.map((x) =>
          x.key === item.key
            ? { ...x, error: errorMessage(e, 'Upload failed. Check your connection and try again.') }
            : x,
        ),
      );
    } finally {
      controllers.current.delete(item.key);
    }
  }

  async function addFiles(list: FileList | File[]) {
    setNote(null);
    const chosen = [...list];
    const replace = limit === 1;
    const room = replace ? 1 : limit - valueRef.current.length - pending.length;
    if (room <= 0) {
      setNote(`You can attach up to ${limit} files here. Remove one to add another.`);
      return;
    }
    if (chosen.length > room)
      setNote(`Only the first ${room} ${room === 1 ? 'file was' : 'files were'} added (up to ${limit}).`);
    for (const raw of chosen.slice(0, room)) {
      const okType = (p.accept.includes('image') && isImage(raw)) || (p.accept.includes('pdf') && isPdf(raw));
      if (!okType) {
        setNote(
          p.accept.includes('pdf') ? 'Attach a photo (JPG or PNG) or a PDF.' : 'Attach a photo (JPG or PNG).',
        );
        continue;
      }
      const file = isImage(raw) ? await compressImage(raw) : raw;
      if (file.size > MAX_UPLOAD_BYTES) {
        setNote(`${raw.name} is ${formatBytes(file.size)}. Files must be under 10 MB.`);
        continue;
      }
      const item: Pending = {
        key: `${Date.now()}-${Math.random()}`,
        name: file.name,
        size: file.size,
        pdf: isPdf(file),
        progress: 0,
        file,
        ...(isImage(file) ? { preview: URL.createObjectURL(file) } : {}),
      };
      setPending((xs) => (replace ? [item] : [...xs, item]));
      void send(item, replace);
    }
  }

  async function removeUploaded(id: string) {
    const next = valueRef.current.filter((x) => x !== id);
    valueRef.current = next;
    p.onChange(next.length ? next : undefined);
    await p.remove?.(id).catch(() => undefined);
  }

  function cancel(key: string) {
    controllers.current.get(key)?.abort();
    setPending((xs) => xs.filter((x) => x.key !== key));
  }

  return {
    pending,
    note,
    addFiles,
    removeUploaded,
    cancel,
    retry: (it: Pending) => void send(it, limit === 1),
    limit,
  };
}

export function FileUploader(p: UploaderProps) {
  const u = useUploads(p);
  const coarse = useTouch();
  const camRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const canPhoto = p.accept.includes('image');
  const uploaded = p.value.map(
    (id) =>
      p.files.get(id) ?? {
        id,
        name: 'Attached file',
        mime: '',
        size: 0,
        fieldId: p.fieldId,
        kind: p.kind,
        createdAt: '',
      },
  );
  const count = uploaded.length + u.pending.length;
  const full = u.limit > 1 && count >= u.limit;
  const empty = count === 0;
  const errId = `${p.domId}-err`;

  return (
    <div className="min-w-0">
      <p className="label" id={`${p.domId}-label`}>
        {p.label}
      </p>
      {p.help && <p className="hint mt-1">{p.help}</p>}
      <div
        id={p.domId}
        tabIndex={-1}
        className={cx(
          'mt-2.5 rounded-2xl border bg-white transition-colors',
          drag
            ? 'border-brand bg-brand-50'
            : p.error
              ? 'border-danger'
              : empty
                ? 'border-dashed border-border-strong'
                : 'border-border',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) void u.addFiles(e.dataTransfer.files);
        }}
        aria-describedby={p.error ? errId : undefined}
      >
        {!empty && (
          <ul className="m-0 grid list-none gap-2 p-3 pb-0" aria-live="polite">
            {uploaded.map((f) => (
              <FileRow
                key={f.id}
                name={f.name}
                size={f.size}
                pdf={f.mime === 'application/pdf' || /\.pdf$/i.test(f.name)}
                preview={f.preview ?? (f.mime.startsWith('image/') ? fileUrl(f.id) : undefined)}
                status="done"
                onRemove={() => void u.removeUploaded(f.id)}
              />
            ))}
            {u.pending.map((x) => (
              <FileRow
                key={x.key}
                name={x.name}
                size={x.size}
                pdf={x.pdf}
                preview={x.preview}
                status={x.error ? 'error' : 'uploading'}
                progress={x.progress}
                error={x.error}
                onRetry={() => u.retry(x)}
                onRemove={() => u.cancel(x.key)}
              />
            ))}
          </ul>
        )}
        {!full && (
          <div className={cx('flex flex-col items-center gap-3 p-4 text-center', empty ? 'py-6' : 'pt-3')}>
            {empty && (
              <>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand">
                  <Icon name={canPhoto ? 'camera' : 'upload'} size={24} />
                </span>
                {p.guidance && <p className="max-w-md text-[14px] leading-5 text-secondary">{p.guidance}</p>}
              </>
            )}
            <div className="flex w-full flex-col gap-2 tab:w-auto tab:flex-row">
              {canPhoto && coarse && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => camRef.current?.click()}
                >
                  <Icon name="camera" size={18} />
                  {empty || u.limit === 1 ? (empty ? 'Take photo' : 'Retake photo') : 'Take another photo'}
                </button>
              )}
              <button
                type="button"
                className={cx(
                  'btn btn-sm',
                  canPhoto && coarse ? 'btn-secondary' : empty ? 'btn-primary' : 'btn-secondary',
                )}
                onClick={() => pickRef.current?.click()}
              >
                <Icon name="upload" size={18} />
                {empty ? 'Choose file' : u.limit === 1 ? 'Replace file' : 'Add another file'}
              </button>
            </div>
            {empty && !coarse && (
              <p className="hint">
                or drag and drop here · {p.accept.includes('pdf') ? 'JPG, PNG or PDF' : 'JPG or PNG'}, up to
                10 MB
              </p>
            )}
          </div>
        )}
        {full && <p className="hint px-4 py-3">You’ve attached the maximum of {u.limit}.</p>}
      </div>
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture={p.capture ?? 'environment'}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          if (e.target.files?.length) void u.addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={pickRef}
        type="file"
        accept={acceptAttr(p.accept)}
        multiple={u.limit > 1}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          if (e.target.files?.length) void u.addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      {u.note && (
        <p className="hint mt-2" role="status">
          {u.note}
        </p>
      )}
      {p.error && <ErrorText id={errId}>{p.error}</ErrorText>}
    </div>
  );
}

function FileRow({
  name,
  size,
  pdf,
  preview,
  status,
  progress = 1,
  error,
  onRemove,
  onRetry,
}: {
  name: string;
  size: number;
  pdf: boolean;
  preview?: string | undefined;
  status: 'done' | 'uploading' | 'error';
  progress?: number;
  error?: string | undefined;
  onRemove: () => void;
  onRetry?: () => void;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <li
      className={cx(
        'flex items-center gap-3 rounded-xl p-2 pr-1',
        status === 'error' ? 'bg-danger-bg' : 'bg-subtle',
      )}
    >
      <span className="grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-lg bg-white ring-1 ring-border-subtle">
        {preview && !pdf && !broken ? (
          <img src={preview} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
        ) : (
          <Icon name={pdf ? 'pdf' : 'file'} size={26} className={pdf ? 'text-danger' : 'text-secondary'} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{name}</span>
        {status === 'uploading' ? (
          <span className="mt-1.5 block">
            <span
              className="block h-1.5 overflow-hidden rounded-full bg-border-subtle"
              role="progressbar"
              aria-label={`Uploading ${name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            >
              <span
                className="block h-full rounded-full bg-brand transition-[width] duration-200"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </span>
          </span>
        ) : status === 'error' ? (
          <span className="block text-[13px] font-semibold text-danger">{error}</span>
        ) : (
          <span className="flex items-center gap-1.5 text-[13px] text-success">
            <Icon name="check" size={15} />
            Uploaded{size ? ` · ${formatBytes(size)}` : ''}
          </span>
        )}
      </span>
      {status === 'uploading' && <Spinner className="flex-none text-brand" />}
      {status === 'error' && onRetry && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
      <button
        type="button"
        className="btn btn-ghost btn-icon flex-none text-secondary"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
      >
        <Icon name="close" size={18} />
      </button>
    </li>
  );
}

// ---- Identity selfie ---------------------------------------------------------------------------------

function SelfieUploader(p: UploaderProps) {
  const u = useUploads({ ...p, multiple: false, maxFiles: 1 });
  const coarse = useTouch();
  const camRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const hintId = useId();
  const current = p.value[0] ? p.files.get(p.value[0]) : undefined;
  const pend = u.pending[0];
  const preview = pend?.preview ?? current?.preview ?? (p.value[0] ? fileUrl(p.value[0]) : undefined);
  const has = !!p.value[0] || !!pend;
  const canWebcam = !coarse && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);

  async function openWebcam() {
    setCamError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      setStream(s);
    } catch {
      setCamError(
        'We couldn’t use your camera. Allow camera access in your browser, or choose a photo instead.',
      );
    }
  }
  function stopWebcam() {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  }
  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const side = Math.min(v.videoWidth, v.videoHeight);
    const c = document.createElement('canvas');
    c.width = side;
    c.height = side;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    // Un-mirror: store the photo the right way round.
    ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, side, side);
    c.toBlob(
      (b) => {
        if (!b) return;
        stopWebcam();
        void u.addFiles([new File([b], 'face-photo.jpg', { type: 'image/jpeg' })]);
      },
      'image/jpeg',
      0.9,
    );
  }

  return (
    <div className="min-w-0">
      <p className="label">{p.label}</p>
      {p.help && <p className="hint mt-1">{p.help}</p>}
      <div
        id={p.domId}
        tabIndex={-1}
        className={cx(
          'mt-2.5 flex flex-col items-center gap-5 rounded-2xl border bg-white px-4 py-6 md:flex-row md:items-center md:gap-8 md:px-6',
          p.error ? 'border-danger' : 'border-border',
        )}
      >
        <div className="relative flex-none">
          <div className="face-frame">
            {stream ? (
              <video
                ref={videoRef}
                className="mirror"
                autoPlay
                playsInline
                muted
                aria-label="Camera preview"
              />
            ) : preview ? (
              <img src={preview} alt="Your face photo" />
            ) : (
              <div className="grid h-full w-full place-items-center text-[#9aa0b8]">
                <svg
                  width="120"
                  height="120"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="9" r="4" />
                  <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
                </svg>
              </div>
            )}
          </div>
          {pend && !pend.error && (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-white/60">
              <Spinner size={28} className="text-brand" />
            </span>
          )}
          {!pend && p.value[0] && (
            <span className="absolute right-3 bottom-3 grid h-9 w-9 place-items-center rounded-full bg-[var(--success-strong)] text-white ring-4 ring-white">
              <Icon name="check" size={20} />
            </span>
          )}
        </div>
        <div className="flex w-full min-w-0 flex-col gap-3 md:flex-1">
          {p.guidance && (
            <p id={hintId} className="text-center text-[15px] leading-[22px] text-secondary md:text-left">
              {p.guidance}
            </p>
          )}
          {pend?.error && <p className="error-text justify-center md:justify-start">{pend.error}</p>}
          <div className="flex flex-col gap-2 tab:flex-row tab:flex-wrap">
            {stream ? (
              <>
                <button type="button" className="btn btn-primary" onClick={snap}>
                  <Icon name="camera" size={18} />
                  Take photo
                </button>
                <button type="button" className="btn btn-secondary" onClick={stopWebcam}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                {coarse ? (
                  <button
                    type="button"
                    className={cx('btn', has ? 'btn-secondary' : 'btn-primary')}
                    onClick={() => camRef.current?.click()}
                    aria-describedby={p.guidance ? hintId : undefined}
                  >
                    <Icon name="camera" size={18} />
                    {has ? 'Retake' : 'Take a selfie'}
                  </button>
                ) : canWebcam ? (
                  <button
                    type="button"
                    className={cx('btn', has ? 'btn-secondary' : 'btn-primary')}
                    onClick={() => void openWebcam()}
                  >
                    <Icon name="camera" size={18} />
                    {has ? 'Retake' : 'Use my camera'}
                  </button>
                ) : null}
                {pend?.error && (
                  <button type="button" className="btn btn-secondary" onClick={() => u.retry(pend)}>
                    Try upload again
                  </button>
                )}
                <button type="button" className="btn btn-ghost" onClick={() => pickRef.current?.click()}>
                  <Icon name="upload" size={18} />
                  {has ? 'Choose a different photo' : 'Choose a photo'}
                </button>
              </>
            )}
          </div>
          {camError && <p className="hint text-danger">{camError}</p>}
        </div>
      </div>
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="user"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          if (e.target.files?.length) void u.addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={pickRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          if (e.target.files?.length) void u.addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      {u.note && (
        <p className="hint mt-2" role="status">
          {u.note}
        </p>
      )}
      {p.error && <ErrorText id={`${p.domId}-err`}>{p.error}</ErrorText>}
    </div>
  );
}
