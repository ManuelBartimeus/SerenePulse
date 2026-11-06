// Line icons, 24 px grid, 1.75 stroke. Decorative unless given a label.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number; label?: string };

const paths = {
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  arrowRight: <path d="M5 12h14m-5-5 5 5-5 5" />,
  arrowLeft: <path d="M19 12H5m5 5-5-5 5-5" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <path d="M4.5 7h15M10 11v6m4-6v6M6.5 7l.8 11.2A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.8L17.5 7M9.5 7V5.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5V7" />
  ),
  camera: (
    <>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.3-2h5.2l1.3 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-8Z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  upload: <path d="M12 15.5V4m-4.5 4.5L12 4l4.5 4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />,
  download: <path d="M12 4v11.5m-4.5-4.5L12 15.5l4.5-4.5M5 17v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1" />,
  file: (
    <>
      <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8L14 3.5Z" />
      <path d="M14 3.5V8h4.5" />
    </>
  ),
  pdf: (
    <>
      <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8L14 3.5Z" />
      <path d="M14 3.5V8h4.5M8.5 16.5v-4h1.2a1.2 1.2 0 0 1 0 2.4H8.5m4-2.4v4h.9a1.6 1.6 0 0 0 1.6-1.6v-.8a1.6 1.6 0 0 0-1.6-1.6h-.9" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 5 6v5.5c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6l-7-2.5Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5M12 16.2v.3" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8v.3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2.75" width="10" height="18.5" rx="2.25" />
      <path d="M11 18h2" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.25" />
      <path d="M3 10h18M7 15h3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M4.75 20a7.25 7.25 0 0 1 14.5 0" />
    </>
  ),
  home: <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4V15h-5v5.5h-4A1.5 1.5 0 0 1 4 19v-8.5Z" />,
  car: (
    <>
      <path d="M5 16.5V12l1.8-4.6A2 2 0 0 1 8.7 6h6.6a2 2 0 0 1 1.9 1.4L19 12v4.5" />
      <path d="M3.5 16.5h17M5 12h14" />
      <circle cx="7.5" cy="16.5" r="1.75" />
      <circle cx="16.5" cy="16.5" r="1.75" />
    </>
  ),
  plane: (
    <path d="M10.5 13.5 4 11l1.5-1.5 7 .5 3.6-3.6a1.8 1.8 0 0 1 2.5 2.5L15 12.5l.5 7L14 21l-2.5-6.5-3 3V20L7 21l-1-3-3-1 1-1.5h2.5l3-3Z" />
  ),
  briefcase: (
    <>
      <rect x="3.5" y="7" width="17" height="12.5" rx="2" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17" />
    </>
  ),
  ship: (
    <path d="M4 17.5c1.3 1 2.7 1 4 0s2.7-1 4 0 2.7 1 4 0 2.7-1 4 0M5.5 15 4 11h16l-1.5 4M7 11V7h10v4M12 4v3" />
  ),
  flame: (
    <path d="M12 21c-3.6 0-6-2.5-6-5.8 0-2.6 1.6-4.5 3-6 .3 1.6 1.2 2.6 2 3 0-3.3 1.4-6 4-8.2-.2 2.8 1 4.6 2.2 6.2.9 1.3 1.8 2.7 1.8 5 0 3.3-3.4 5.8-7 5.8Z" />
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 19.5a6 6 0 0 1 12 0M15.5 5a3.25 3.25 0 0 1 0 6.25M17.5 14a6 6 0 0 1 3.5 5.5" />
    </>
  ),
  scale: (
    <path d="M12 4v16M7 20h10M5 8h14M5 8l-2.5 6a2.5 2.5 0 0 0 5 0L5 8Zm14 0-2.5 6a2.5 2.5 0 0 0 5 0L19 8ZM12 4l-1 1.5h2L12 4Z" />
  ),
  coins: (
    <>
      <ellipse cx="9" cy="7" rx="5.5" ry="2.5" />
      <path d="M3.5 7v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V7M9.5 16.5c.6 1.2 2.9 2 5.5 2 3 0 5.5-1.1 5.5-2.5v-4c0-1.2-1.9-2.2-4.5-2.4" />
    </>
  ),
  crane: <path d="M6 20.5V4.5L19 7M6 4.5 3.5 7H19M16 7v4M14.5 11h3v2.5h-3zM4 20.5h4" />,
  document: (
    <>
      <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8L14 3.5Z" />
      <path d="M14 3.5V8h4.5M9 12.5h6M9 16h6" />
    </>
  ),
  edit: <path d="M4.5 19.5h4l10-10a2.8 2.8 0 0 0-4-4l-10 10v4ZM13.5 6.5l4 4" />,
  logout: <path d="M14.5 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3M10 16.5 5.5 12 10 7.5M5.5 12h10" />,
  undo: <path d="M8.5 6.5 4 11l4.5 4.5M4.5 11H14a5.5 5.5 0 0 1 0 11h-2" />,
  wifiOff: (
    <path d="m3.5 3.5 17 17M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4.3-2.4M12 9.5c2.6 0 5 1 7 3M2 9a15 15 0 0 1 4-2.5M12 5c3.8 0 7.3 1.5 10 4M12 19.5v.01" />
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4" />
    </>
  ),
  list: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />,
  sparkline: <path d="M4 12h16" />,
  external: (
    <path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  face: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 10v.5M15 10v.5M8.8 14.5a4 4 0 0 0 6.4 0" />
    </>
  ),
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, label, ...rest }: IconProps & { name: IconName }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}

/** Serene's two-leaf motif (from the landing site). */
export function Leaf({ className, size = 64 }: { className?: string; size?: number }) {
  return (
    <svg
      className={className}
      width={size}
      height={(size * 40) / 64}
      viewBox="0 0 64 40"
      aria-hidden="true"
      focusable="false"
    >
      <path
        transform="rotate(-16 29 38)"
        d="M29 38C22 30 14 22 15 9c.3-4 3-6.5 6-4.5C28 9 31 22 29 38Z"
        fill="currentColor"
      />
      <path
        transform="rotate(16 35 38)"
        d="M35 38c7-8 15-16 14-29-.3-4-3-6.5-6-4.5C36 9 33 22 35 38Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Spinner({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={`spin ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
