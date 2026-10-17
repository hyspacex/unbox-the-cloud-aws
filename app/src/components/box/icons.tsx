/** Box-style line icons, 20 px grid, currentColor. Drawn here so the replica needs no icon dependency. */
type P = { size?: number; className?: string };
const svg = (size: number, className: string | undefined, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
    {children}
  </svg>
);

export const IconFolder = ({ size = 20, className }: P) =>
  svg(size, className, <path d="M2.75 5.5A1.75 1.75 0 0 1 4.5 3.75h3.2l1.6 1.75h6.2a1.75 1.75 0 0 1 1.75 1.75v7.25a1.75 1.75 0 0 1-1.75 1.75H4.5a1.75 1.75 0 0 1-1.75-1.75V5.5Z" />);
export const IconClock = ({ size = 20, className }: P) =>
  svg(size, className, <><circle cx="10" cy="10" r="7.25" /><path d="M10 6v4.25l2.75 1.75" /></>);
export const IconSync = ({ size = 20, className }: P) =>
  svg(size, className, <><path d="M15.5 8.25A5.75 5.75 0 0 0 5 6.2L3.75 7.5" /><path d="M3.75 4.25V7.5H7" /><path d="M4.5 11.75A5.75 5.75 0 0 0 15 13.8l1.25-1.3" /><path d="M16.25 15.75V12.5H13" /></>);
export const IconNote = ({ size = 20, className }: P) =>
  svg(size, className, <><rect x="4" y="2.75" width="12" height="14.5" rx="1.75" /><path d="M7 7h6M7 10h6M7 13h3.5" /></>);
export const IconTrash = ({ size = 20, className }: P) =>
  svg(size, className, <><path d="M3.75 5.5h12.5M8 5.5V3.75h4V5.5" /><path d="M5.25 5.5l.75 10.25a1.5 1.5 0 0 0 1.5 1.5h5a1.5 1.5 0 0 0 1.5-1.5l.75-10.25" /><path d="M8.5 8.5v5.5M11.5 8.5v5.5" /></>);
export const IconSearch = ({ size = 20, className }: P) =>
  svg(size, className, <><circle cx="8.75" cy="8.75" r="5.25" /><path d="m12.75 12.75 3.75 3.75" /></>);
export const IconPlusCircle = ({ size = 20, className }: P) =>
  svg(size, className, <><circle cx="10" cy="10" r="7.25" /><path d="M10 6.75v6.5M6.75 10h6.5" /></>);
export const IconBell = ({ size = 20, className }: P) =>
  svg(size, className, <><path d="M5.25 8.25a4.75 4.75 0 0 1 9.5 0c0 4.25 1.75 5.5 1.75 5.5h-13s1.75-1.25 1.75-5.5Z" /><path d="M8.25 16.25a1.9 1.9 0 0 0 3.5 0" /></>);
export const IconInfo = ({ size = 20, className }: P) =>
  svg(size, className, <><circle cx="10" cy="10" r="7.25" /><path d="M10 9v4.5" /><circle cx="10" cy="6.4" r=".4" fill="currentColor" /></>);
export const IconChevronDown = ({ size = 12, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
    <path d="m3 4.5 3 3 3-3" />
  </svg>
);
export const IconChevronRight = ({ size = 12, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
    <path d="m4.5 3 3 3-3 3" />
  </svg>
);
export const IconBack = ({ size = 20, className }: P) => svg(size, className, <><path d="M16 10H4.5" /><path d="M9 5 4 10l5 5" /></>);
export const IconCheck = ({ size = 16, className }: P) => svg(size, className, <path d="m4.5 10.5 3.5 3.5 7.5-8" />);
export const IconMore = ({ size = 20, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" aria-hidden className={className}>
    <circle cx="5" cy="10" r="1.4" />
    <circle cx="10" cy="10" r="1.4" />
    <circle cx="15" cy="10" r="1.4" />
  </svg>
);
export const IconClose = ({ size = 16, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden className={className}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </svg>
);
export const IconUploadFile = ({ size = 18, className }: P) =>
  svg(size, className, <><path d="M5.5 2.75h6l3.75 3.75v9a1.75 1.75 0 0 1-1.75 1.75h-8A1.75 1.75 0 0 1 3.75 15.5v-11A1.75 1.75 0 0 1 5.5 2.75Z" /><path d="M10 14V9M7.75 11.25 10 9l2.25 2.25" /></>);
export const IconUploadFolder = ({ size = 18, className }: P) =>
  svg(size, className, <><path d="M2.75 5.5A1.75 1.75 0 0 1 4.5 3.75h3.2l1.6 1.75h6.2a1.75 1.75 0 0 1 1.75 1.75v7.25a1.75 1.75 0 0 1-1.75 1.75H4.5a1.75 1.75 0 0 1-1.75-1.75V5.5Z" /><path d="M10 13.5v-4.25M8 11.25l2-2 2 2" /></>);
export const IconNewVersion = ({ size = 18, className }: P) =>
  svg(size, className, <><path d="M5.5 2.75h6l3.75 3.75v9a1.75 1.75 0 0 1-1.75 1.75h-8A1.75 1.75 0 0 1 3.75 15.5v-11A1.75 1.75 0 0 1 5.5 2.75Z" /><path d="M12.5 11.5a2.75 2.75 0 1 1-.8-1.95" /><path d="M12.25 8.75v1.5h-1.5" /></>);

/** Box's document file icon (text / markdown): a page with a folded corner and text lines. */
export function FileTypeIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <path d="M8 3h11l7 7v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="#FFFFFF" stroke="#C7CDD6" strokeWidth="1" />
      <path d="M19 3v5a2 2 0 0 0 2 2h5" fill="#EEF1F5" stroke="#C7CDD6" strokeWidth="1" strokeLinejoin="round" />
      <rect x="10" y="14" width="12" height="1.6" rx=".8" fill="#4B6A9B" />
      <rect x="10" y="18" width="12" height="1.6" rx=".8" fill="#9AABC4" />
      <rect x="10" y="22" width="8" height="1.6" rx=".8" fill="#9AABC4" />
    </svg>
  );
}

/** The lowercase "box" wordmark, drawn so it renders the same with or without the brand font. */
export function BoxWordmark({ height = 24 }: { height?: number }) {
  return (
    <svg height={height} viewBox="0 0 52 28" aria-label="box" role="img">
      <g fill="none" stroke="#0061D5" strokeWidth="4" strokeLinecap="round">
        <path d="M3.5 3v14.5" />
        <circle cx="10.5" cy="17.5" r="7" />
        <circle cx="28" cy="17.5" r="7" />
        <path d="m39.5 11 9 13M48.5 11l-9 13" />
      </g>
    </svg>
  );
}
