import type { CSSProperties } from "react";

export function Icon({
  name,
  size = 20,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  const paths: Record<string, React.ReactNode> = {
    about: (
      <>
        <path d="m3 10 9-7 9 7v10H3Z" />
        <path d="M9 20v-7h6v7M7 9h.01M17 9h.01" />
      </>
    ),
    projects: (
      <>
        <rect x="3" y="7" width="18" height="14" rx="2" />
        <path d="M8 7V3h8v4m-9 6 3 3-3 3m6-1h4" />
      </>
    ),
    research: (
      <>
        <path d="M9 3h6M10 3v7L4 20h16l-6-10V3M7 15h10" />
        <circle cx="11" cy="17" r=".6" />
      </>
    ),
    docs: (
      <>
        <path d="M12 6c-3-3-6-3-10-2v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-4-1-7-1-10 2Zm0 0v15M5 8h3m-3 4h3m8-4h3m-3 4h3" />
      </>
    ),
    album: (
      <>
        <rect x="3" y="6" width="18" height="15" rx="2" />
        <path d="M8 6V3h8v3m-13 10 5-5 6 6 3-3 4 4" />
        <circle cx="16" cy="10" r="1" />
      </>
    ),
    contact: (
      <>
        <rect x="3" y="5" width="18" height="15" rx="2" />
        <path d="m3 7 9 7 9-7" />
      </>
    ),
    game: (
      <>
        <path d="M6 7h12c2 0 4 11 3 12s-4-3-5-3H8c-1 0-4 4-5 3S4 7 6 7Z" />
        <path d="M6 11h5m-2.5-2.5v5M16 11h.01m2 3h.01" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h16m-6-6 6 6-6 6" />
      </>
    ),
    back: (
      <>
        <path d="M20 12H4m6-6-6 6 6 6" />
      </>
    ),
    external: (
      <>
        <path d="M14 3h7v7m0-7L10 14" />
        <path d="M10 3H4v17h17v-6" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />
      </>
    ),
    moon: <path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z" />,
    plane: (
      <>
        <path d="m3 12 18-5-6 5 6 5-18-5Z" />
        <path d="m10 11 2-7 2 1-1 6m-3 2 2 7 2-1-1-6" />
      </>
    ),
    locate: (
      <>
        <circle cx="12" cy="12" r="7" />
        <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
      </>
    ),
    move: (
      <>
        <path d="M12 3v18m-3-3 3 3 3-3M12 3 9 6m3-3 3 3M3 12h18m-3-3 3 3-3 3M3 12l3-3m-3 3 3 3" />
      </>
    ),
    location: (
      <>
        <path d="M19 10c0 6-7 11-7 11S5 16 5 10a7 7 0 1 1 14 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M16 8V3H3v13h5" />
      </>
    ),
    check: <path d="m4 12 5 5L20 6" />,
    close: <path d="m5 5 14 14M5 19 19 5" />,
    github: (
      <>
        <path d="M8 21v-4c-4 1-4-2-6-3m14 7v-4c0-1-.4-2-1-2 4-.5 6-2.5 6-6 0-1.5-.5-3-1.5-4 .5-1.5 0-3 0-3s-2 0-3.5 1a15 15 0 0 0-8 0C6.5 2 4.5 2 4.5 2s-.5 1.5 0 3C3.5 6 3 7.5 3 9c0 3.5 2 5.5 6 6-.6.5-1 1-1 2" />
      </>
    ),
    star: <path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" />,
    zoom: (
      <>
        <circle cx="10" cy="10" r="7" />
        <path d="m16 16 6 6M6 10h8m-4-4v8" />
      </>
    ),
    map: (
      <>
        <path d="m2 5 6-3 8 3 6-3v17l-6 3-8-3-6 3Zm6-3v17m8-14v17" />
      </>
    ),
    mail: (
      <>
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m2 6 10 8L22 6" />
      </>
    ),
    pin: (
      <>
        <path d="m8 3 8 0-1 6 4 4H5l4-4-1-6ZM12 13v8" />
      </>
    ),
    expand: (
      <>
        <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
      </>
    ),
    rotate: (
      <>
        <path d="M20 10a8 8 0 1 0 0 5M20 4v6h-6" />
      </>
    ),
    pause: (
      <>
        <path d="M8 5v14M16 5v14" strokeWidth="3" />
      </>
    ),
    play: <path d="m8 4 12 8-12 8Z" />,
    chevron: <path d="m9 5 7 7-7 7" />,
  };
  return (
    <svg
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.about}
    </svg>
  );
}
