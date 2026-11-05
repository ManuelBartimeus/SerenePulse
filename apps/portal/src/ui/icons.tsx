import type { ReactNode, SVGProps } from 'react';

/**
 * Inline SVG icon set (24 × 24 grid, 1.75 px round strokes, currentColor). No icon library is installed.
 * Icons are decorative by default (aria-hidden). Pass `title` only when the icon is the sole content of a
 * control and there is no other accessible name.
 *
 *   <IconSearch />            decorative, 20 px
 *   <IconBell size={16} />    decorative, 16 px
 *   <IconClose title="Close" />
 */
export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number; title?: string };

function make(name: string, paths: ReactNode) {
  function Icon({ size = 20, title, className = '', ...rest }: IconProps) {
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
        aria-hidden={title ? undefined : true}
        role={title ? 'img' : undefined}
        focusable="false"
        className={`shrink-0 ${className}`}
        {...rest}
      >
        {title && <title>{title}</title>}
        {paths}
      </svg>
    );
  }
  Icon.displayName = name;
  return Icon;
}

export const IconMenu = make('IconMenu', <path d="M4 7h16M4 12h16M4 17h16" />);
export const IconClose = make('IconClose', <path d="m6 6 12 12M18 6 6 18" />);
export const IconChevronRight = make('IconChevronRight', <path d="m9.5 6 6 6-6 6" />);
export const IconChevronLeft = make('IconChevronLeft', <path d="m14.5 6-6 6 6 6" />);
export const IconChevronDown = make('IconChevronDown', <path d="m6 9.5 6 6 6-6" />);
export const IconChevronUp = make('IconChevronUp', <path d="m6 14.5 6-6 6 6" />);
export const IconArrowRight = make('IconArrowRight', <path d="M5 12h14m-5-5 5 5-5 5" />);
export const IconArrowLeft = make('IconArrowLeft', <path d="M19 12H5m5-5-5 5 5 5" />);
export const IconArrowUp = make('IconArrowUp', <path d="M12 19V5m-5 5 5-5 5 5" />);
export const IconArrowDown = make('IconArrowDown', <path d="M12 5v14m-5-5 5 5 5-5" />);
export const IconExternal = make(
  'IconExternal',
  <path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />,
);
export const IconSearch = make(
  'IconSearch',
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </>,
);
export const IconFilter = make('IconFilter', <path d="M4 5.5h16l-6.25 7.25v5.5l-3.5 1.75v-7.25L4 5.5Z" />);
export const IconPlus = make('IconPlus', <path d="M12 5v14M5 12h14" />);
export const IconMinus = make('IconMinus', <path d="M5 12h14" />);
export const IconCheck = make('IconCheck', <path d="m5 12.5 4.5 4.5L19 7.5" />);
export const IconMore = make('IconMore', <path d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth={3} />);
export const IconEdit = make(
  'IconEdit',
  <path d="M4.5 19.5h4l10-10a2.83 2.83 0 0 0-4-4l-10 10v4ZM13.5 6.5l4 4" />,
);
export const IconTrash = make(
  'IconTrash',
  <path d="M4.5 7h15M9.5 7V4.75h5V7M6.5 7l.75 12.25a1.5 1.5 0 0 0 1.5 1.25h6.5a1.5 1.5 0 0 0 1.5-1.25L17.5 7M10 11v5.5M14 11v5.5" />,
);
export const IconCopy = make(
  'IconCopy',
  <>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </>,
);
export const IconDownload = make('IconDownload', <path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14" />);
export const IconUpload = make('IconUpload', <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14" />);
export const IconRefresh = make(
  'IconRefresh',
  <path d="M19.5 12a7.5 7.5 0 0 1-13.1 5M4.5 12a7.5 7.5 0 0 1 13.1-5M17.6 3.5V7h-3.5M6.4 20.5V17h3.5" />,
);
export const IconEye = make(
  'IconEye',
  <>
    <path d="M2.75 12S6 5.5 12 5.5 21.25 12 21.25 12 18 18.5 12 18.5 2.75 12 2.75 12Z" />
    <circle cx="12" cy="12" r="2.75" />
  </>,
);
export const IconEyeOff = make(
  'IconEyeOff',
  <path d="M4 4l16 16M10.2 6.2c.6-.1 1.2-.2 1.8-.2 6 0 9.25 6 9.25 6a16 16 0 0 1-2.6 3.4M6.6 7.6A15.6 15.6 0 0 0 2.75 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1.1M9.9 10a2.75 2.75 0 0 0 3.9 3.9" />,
);
export const IconBell = make(
  'IconBell',
  <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15L6 16.5ZM10 20.5h4" />,
);
export const IconUser = make(
  'IconUser',
  <>
    <circle cx="12" cy="8.5" r="3.75" />
    <path d="M4.75 20a7.25 7.25 0 0 1 14.5 0" />
  </>,
);
export const IconUsers = make(
  'IconUsers',
  <>
    <circle cx="9" cy="8" r="3.25" />
    <path d="M3 19.5a6 6 0 0 1 12 0M15.5 5a3.25 3.25 0 0 1 0 6.25M17.5 14a6 6 0 0 1 3.5 5.5" />
  </>,
);
export const IconSignOut = make(
  'IconSignOut',
  <path d="M14 4.5H6.5a1.5 1.5 0 0 0-1.5 1.5v12a1.5 1.5 0 0 0 1.5 1.5H14M10 12h10m-3.5-3.5L20 12l-3.5 3.5" />,
);
export const IconHome = make(
  'IconHome',
  <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19v-8.5Z" />,
);
export const IconChart = make('IconChart', <path d="M4.5 19.5h15M7.5 16v-5M12 16V6.5M16.5 16v-3" />);
export const IconTrend = make('IconTrend', <path d="m4 16.5 5-5 3.5 3.5L20 7.5M15 7.5h5v5" />);
export const IconTable = make(
  'IconTable',
  <>
    <rect x="3.75" y="4.75" width="16.5" height="14.5" rx="2" />
    <path d="M3.75 9.5h16.5M3.75 14.25h16.5M9.5 9.5v9.75" />
  </>,
);
export const IconInbox = make(
  'IconInbox',
  <path d="M3.75 13.5 6 5.75A1.5 1.5 0 0 1 7.45 4.75h9.1A1.5 1.5 0 0 1 18 5.75l2.25 7.75M3.75 13.5V18a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5v-4.5M3.75 13.5H8.5l1 2h5l1-2h4.75" />,
);
export const IconFlag = make('IconFlag', <path d="M5.5 20.5V4.5M5.5 4.5h11l-2 4 2 4h-11" />);
export const IconFolder = make(
  'IconFolder',
  <path d="M3.75 7.5A1.75 1.75 0 0 1 5.5 5.75h3.75l2 2h7.25a1.75 1.75 0 0 1 1.75 1.75v8.75A1.75 1.75 0 0 1 18.5 20h-13a1.75 1.75 0 0 1-1.75-1.75V7.5Z" />,
);
export const IconBoard = make(
  'IconBoard',
  <>
    <rect x="3.75" y="4.75" width="16.5" height="14.5" rx="2" />
    <path d="M9.25 4.75v14.5M14.75 4.75v14.5" />
  </>,
);
export const IconTarget = make(
  'IconTarget',
  <>
    <circle cx="12" cy="12" r="8.25" />
    <circle cx="12" cy="12" r="4.25" />
    <path d="M12 12h.01" strokeWidth={3} />
  </>,
);
export const IconFile = make(
  'IconFile',
  <path d="M13.5 3.75H7A1.75 1.75 0 0 0 5.25 5.5v13A1.75 1.75 0 0 0 7 20.25h10a1.75 1.75 0 0 0 1.75-1.75V9m-5.25-5.25L18.75 9m-5.25-5.25V9h5.25M8.75 13h6.5M8.75 16.5h4" />,
);
export const IconCalendar = make(
  'IconCalendar',
  <>
    <rect x="3.75" y="5.25" width="16.5" height="15" rx="2" />
    <path d="M3.75 10h16.5M8 3.25v4M16 3.25v4" />
  </>,
);
export const IconClock = make(
  'IconClock',
  <>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M12 7.5V12l3 2" />
  </>,
);
export const IconSettings = make(
  'IconSettings',
  <>
    <circle cx="12" cy="12" r="2.75" />
    <path d="M19.4 14.6a1.4 1.4 0 0 0 .3 1.5l.1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.4 1.4 0 0 0-1.5-.3 1.4 1.4 0 0 0-.8 1.3v.2a1.7 1.7 0 0 1-3.4 0v-.1a1.4 1.4 0 0 0-.9-1.3 1.4 1.4 0 0 0-1.5.3l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.4 1.4 0 0 0 .3-1.5 1.4 1.4 0 0 0-1.3-.8h-.2a1.7 1.7 0 0 1 0-3.4h.1a1.4 1.4 0 0 0 1.3-.9 1.4 1.4 0 0 0-.3-1.5l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.4 1.4 0 0 0 1.5.3h.1a1.4 1.4 0 0 0 .8-1.3v-.2a1.7 1.7 0 0 1 3.4 0v.1a1.4 1.4 0 0 0 .8 1.3 1.4 1.4 0 0 0 1.5-.3l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.4 1.4 0 0 0-.3 1.5v.1a1.4 1.4 0 0 0 1.3.8h.2a1.7 1.7 0 0 1 0 3.4h-.1a1.4 1.4 0 0 0-1.3.8Z" />
  </>,
);
export const IconSliders = make(
  'IconSliders',
  <path d="M4.5 7h9M17.5 7h2M4.5 17h3M11.5 17h8M15.5 4.75v4.5M9.5 14.75v4.5" />,
);
export const IconShield = make(
  'IconShield',
  <path d="M12 3.25 4.75 6.25v5.5c0 4.5 3 7.9 7.25 9 4.25-1.1 7.25-4.5 7.25-9v-5.5L12 3.25Z" />,
);
export const IconShieldCheck = make(
  'IconShieldCheck',
  <>
    <path d="M12 3.25 4.75 6.25v5.5c0 4.5 3 7.9 7.25 9 4.25-1.1 7.25-4.5 7.25-9v-5.5L12 3.25Z" />
    <path d="m9 12 2.25 2.25L15.25 10" />
  </>,
);
export const IconLock = make(
  'IconLock',
  <>
    <rect x="5" y="10.25" width="14" height="10" rx="2" />
    <path d="M8.25 10.25V7.5a3.75 3.75 0 0 1 7.5 0v2.75" />
  </>,
);
export const IconKey = make(
  'IconKey',
  <>
    <circle cx="8" cy="15.5" r="3.75" />
    <path d="m10.75 12.75 8.5-8.5M16.5 7l2.5 2.5M14.5 9l2 2" />
  </>,
);
export const IconBuilding = make(
  'IconBuilding',
  <path d="M4 21V9.5L12 4l8 5.5V21M4 21h16M9 21v-5.5h6V21M8.5 11h.01M12 11h.01M15.5 11h.01" />,
);
export const IconMapPin = make(
  'IconMapPin',
  <>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.25" />
  </>,
);
export const IconQr = make(
  'IconQr',
  <>
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 20h.01M20 14h.01" />
  </>,
);
export const IconMessage = make(
  'IconMessage',
  <path d="M4 20l1.3-3.9A8.5 8.5 0 1 1 8.4 19L4 20ZM9 10.5h6M9 13.5h3.5" />,
);
export const IconMail = make(
  'IconMail',
  <>
    <rect x="3.25" y="5.25" width="17.5" height="13.5" rx="2" />
    <path d="m4 6.5 8 6 8-6" />
  </>,
);
export const IconPhone = make(
  'IconPhone',
  <path d="M5.5 3.5h3l1.5 4-2 1.25a11 11 0 0 0 7.25 7.25L16.5 14l4 1.5v3a2 2 0 0 1-2 2A15.5 15.5 0 0 1 3.5 5.5a2 2 0 0 1 2-2Z" />,
);
export const IconList = make(
  'IconList',
  <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
);
export const IconLayers = make(
  'IconLayers',
  <path d="m12 4 8.5 4.5L12 13 3.5 8.5 12 4ZM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5" />,
);
export const IconInfo = make(
  'IconInfo',
  <>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M12 11v5M12 8h.01" />
  </>,
);
export const IconAlert = make(
  'IconAlert',
  <path d="M10.3 4.6 3.4 16.8A2 2 0 0 0 5.1 19.8h13.8a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0ZM12 9.5v4M12 16.5h.01" />,
);
export const IconCheckCircle = make(
  'IconCheckCircle',
  <>
    <circle cx="12" cy="12" r="8.25" />
    <path d="m8.5 12.25 2.5 2.5 4.75-5" />
  </>,
);
export const IconXCircle = make(
  'IconXCircle',
  <>
    <circle cx="12" cy="12" r="8.25" />
    <path d="m9.25 9.25 5.5 5.5M14.75 9.25l-5.5 5.5" />
  </>,
);
export const IconHelp = make(
  'IconHelp',
  <>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M9.75 9.5a2.25 2.25 0 1 1 3.1 2.1c-.5.2-.85.7-.85 1.25V13.5M12 16.5h.01" />
  </>,
);
export const IconSparkline = make('IconSparkline', <path d="M3.5 15.5 7.5 11l3 3 4.5-6 5.5 5.5" />);
