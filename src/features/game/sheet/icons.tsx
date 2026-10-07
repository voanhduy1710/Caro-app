import React from 'react';

/**
 * A generic green spreadsheet page: folded corner, white table. Close enough
 * to read as "a spreadsheet file" at a glance without copying anyone's logo.
 */
export const SheetLogo: React.FC<{ size?: number }> = ({ size = 32 }) => (
  <svg width={(size * 3) / 4} height={size} viewBox="0 0 24 32" aria-hidden="true" focusable="false">
    <path d="M2.5 0H16l8 8v21.5a2.5 2.5 0 0 1-2.5 2.5h-19A2.5 2.5 0 0 1 0 29.5v-27A2.5 2.5 0 0 1 2.5 0z" fill="#0F9D58" />
    <path d="M16 0l8 8h-5.5A2.5 2.5 0 0 1 16 5.5z" fill="#87ceac" />
    <rect x="5" y="13" width="14" height="11.5" rx="0.6" fill="#fff" />
    <path d="M5 16.8h14M5 20.7h14M10.2 13v11.5" stroke="#0F9D58" strokeWidth="1.3" />
  </svg>
);

/** The "A" with a coloured bar under it that Sheets uses for text colour. */
export const TextColorGlyph: React.FC<{ color?: string }> = ({ color = '#000000' }) => (
  <span className="flex flex-col items-center leading-none">
    <span className="text-[14px] font-medium leading-[14px]" style={{ fontFamily: 'Arial, sans-serif' }}>A</span>
    <span className="mt-[2px] h-[3px] w-4 rounded-[1px]" style={{ background: color }} />
  </span>
);

/** ".0" with a left arrow (fewer decimals) or ".00" with a right arrow (more). */
export const DecimalGlyph: React.FC<{ more?: boolean }> = ({ more = false }) => (
  <span className="flex items-center text-[12px] font-medium leading-none tracking-[-0.02em]" style={{ fontFamily: 'Arial, sans-serif' }}>
    {more ? (
      <>
        .00
        <svg width="8" height="8" viewBox="0 0 8 8" className="ml-[1px]" aria-hidden="true">
          <path d="M1 4h5M4 1.6 6.4 4 4 6.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </>
    ) : (
      <>
        <svg width="8" height="8" viewBox="0 0 8 8" className="mr-[1px]" aria-hidden="true">
          <path d="M7 4H2M4 1.6 1.6 4 4 6.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        .0
      </>
    )}
  </span>
);
