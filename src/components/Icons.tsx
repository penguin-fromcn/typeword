import type { SVGProps } from 'react';

export type IconName =
  | 'home'
  | 'book'
  | 'chart'
  | 'gear'
  | 'arrow-left'
  | 'arrow-right'
  | 'cards'
  | 'sound'
  | 'mute'
  | 'plus'
  | 'search'
  | 'download'
  | 'upload'
  | 'trash'
  | 'edit'
  | 'skip'
  | 'question'
  | 'hint'
  | 'folder'
  | 'check'
  | 'x'
  | 'refresh'
  | 'clock'
  | 'target'
  | 'flame'
  | 'music'
  | 'rain'
  | 'coffee'
  | 'bird'
  | 'moon'
  | 'wind'
  | 'copy'
  | 'star'
  | 'bookmark'
  | 'enter';

const PATHS: Record<IconName, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V21H3zM9 21v-7h6v7" />,
  book: <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22.5zM4 19.5A2.5 2.5 0 0 1 6.5 17H20" />,
  chart: <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 3.17 16.9l.06-.06A1.7 1.7 0 0 0 3.57 15a1.7 1.7 0 0 0-1.55-1H2a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 3.64 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 6.07 4.1l.06.06a1.7 1.7 0 0 0 1.87.34H8a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
    </>
  ),
  'arrow-left': <path d="m14 6-6 6 6 6M8 12h12" />,
  'arrow-right': <path d="m10 6 6 6-6 6M16 12H4" />,
  cards: (
    <>
      <rect x="3" y="6" width="14" height="16" rx="1.5" />
      <path d="M7 6V4.5A1.5 1.5 0 0 1 8.5 3H19a1.5 1.5 0 0 1 1.5 1.5V17" />
    </>
  ),
  sound: <path d="M4 9v6h4l5 4V5L8 9zm12.5-1.5a6 6 0 0 1 0 9m2.5-12a9.5 9.5 0 0 1 0 15" />,
  mute: <path d="M4 9v6h4l5 4V5L8 9zm13 1 5 5m0-5-5 5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <path d="m21 21-5.2-5.2M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z" />,
  download: <path d="M12 3v12m0 0 4.5-4.5M12 15 7.5 10.5M4 17v3h16v-3" />,
  upload: <path d="M12 16V4m0 0 4.5 4.5M12 4 7.5 8.5M4 17v3h16v-3" />,
  trash: <path d="M4 7h16M9 7V4h6v3m-8 0 1 14h8l1-14M10 11v6m4-6v6" />,
  edit: <path d="M4 20h4L20 8l-4-4L4 16zM14 6l4 4" />,
  skip: <path d="m5 5 9 7-9 7zM18 5v14" />,
  question: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9a2.8 2.8 0 1 1 4.1 2.5c-.9.5-1.4 1.1-1.4 2.1M12 17h.01" />
    </>
  ),
  hint: (
    <>
      <path d="M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
    </>
  ),
  folder: <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />,
  check: <path d="m4 12 5 5L20 6" />,
  x: <path d="M5 5 19 19M19 5 5 19" />,
  refresh: <path d="M20 11a8 8 0 0 0-14-4L3 10m0-6v6h6M4 13a8 8 0 0 0 14 4l3-3m0 6v-6h-6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" />
    </>
  ),
  flame: <path d="M12 22c4 0 6.5-2.6 6.5-6 0-4.5-3.6-6.2-3.2-10.5C13 7 11 8.5 11 11c0 1.4.5 2.2.5 3.1 0 1.2-.9 2-2 2-1.4 0-2.3-1.3-2-2.8C5.8 14.4 5.5 15.9 5.5 17c0 3.1 2.4 5 6.5 5z" />,
  music: (
    <path d="M9 18V5l10-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
  ),
  rain: (
    <path d="M6.5 14.5a4 4 0 0 1 .8-7.9 5.5 5.5 0 0 1 10.6 1.1 3.5 3.5 0 0 1-.4 6.8M8 18l-1 2M12 18l-1 2M16 18l-1 2" />
  ),
  coffee: (
    <path d="M4 8h12v5.5A4.5 4.5 0 0 1 11.5 18h-3A4.5 4.5 0 0 1 4 13.5zM16 9h2.5a2.5 2.5 0 0 1 0 5H16M7 3.5v2M11 3.5v2M15 3.5v2" />
  ),
  bird: (
    <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" />
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  wind: <path d="M3 8h9a3 3 0 1 0-3-3M3 12h13a3 3 0 1 1-3 3M3 16h6" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="12" rx="1" />
      <path d="M5 15V4a1 1 0 0 1 1-1h9" />
    </>
  ),
  star: <path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1-5.4-3-5.4 3 1.1-6.1L3.2 9.4l6.1-.8z" />,
  bookmark: <path d="M6 3h12v18l-6-4.5L6 21z" />,
  enter: <path d="M20 5v7a4 4 0 0 1-4 4H5m0 0 4-4m-4 4 4 4" />,
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
