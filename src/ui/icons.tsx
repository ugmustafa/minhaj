import React from 'react';

const P = (d: React.ReactNode, sw = 1.8) => (props: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={props.size ?? 24} height={props.size ?? 24} fill="none" stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

export const INow = P(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>);
export const IBooks = P(<><path d="M4 5.5C6.5 4 9.5 4 12 5.5 14.5 4 17.5 4 20 5.5V19c-2.5-1.5-5.5-1.5-8 0-2.5-1.5-5.5-1.5-8 0z" /><path d="M12 5.5V19" /></>);
export const IPlan = P(<><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></>);
export const IStats = P(<path d="M5 19V11M12 19V5M19 19v-6" />);
export const ISettings = P(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>, 1.6);
export const ICheck = P(<path d="M5 12.5l4.5 4.5L19 7.5" />, 2.4);
export const ITimer = P(<><circle cx="12" cy="13" r="7.5" /><path d="M12 9.5V13M9.5 2.5h5" /></>, 2);
export const IStop = P(<rect x="7" y="7" width="10" height="10" rx="2" />, 2);
export const IAsk = P(<><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.4M12 17h.01" /></>, 2);
export const IPlus = P(<path d="M12 5v14M5 12h14" />, 2);
export const IMinus = P(<path d="M5 12h14" />, 2);
export const IGrip = P(<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />, 3);
export const IMore = P(<path d="M6 12h.01M12 12h.01M18 12h.01" />, 3);
export const IChevron = P(<path d="M9 6l6 6-6 6" />, 2);
export const IBack = P(<path d="M15 6l-6 6 6 6" />, 2);
export const IWarn = P(<><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>, 1.8);
export const IFeather = P(<><path d="M20 4c-6 0-12 4-14 12l-2 4" /><path d="M8 14h6" /></>);
export const ITrash = P(<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />);

/** Тихий восьмиконечный узор для карточек. */
export function Star8({ size = 220 }: { size?: number }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="20" y="20" width="60" height="60" />
        <rect x="20" y="20" width="60" height="60" transform="rotate(45 50 50)" />
        <circle cx="50" cy="50" r="18" />
        <rect x="35" y="35" width="30" height="30" />
        <rect x="35" y="35" width="30" height="30" transform="rotate(45 50 50)" />
      </g>
    </svg>
  );
}
