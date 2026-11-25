/** A class value: a string, nothing, or a nested list of either. */
export type ClassValue = string | number | false | null | undefined | ClassValue[];

/*
 * PR 5's cn() was clsx + tailwind-merge. Both dependencies were removed, so
 * this is a small stand-in: it joins truthy class names and, like
 * tailwind-merge, lets a later Tailwind utility replace an earlier one from
 * the same group (`h-8` … `h-9`, `px-3` … `px-2`, `rounded-[6px]` …
 * `rounded-md`, `text-xs` … `text-[13px]`). Variants are kept apart
 * (`hover:bg-a` never replaces `bg-b`). Groups it does not know are simply
 * kept, so an unknown pair still renders, only without the override.
 */

const SIZE_WORDS = /^(xs|sm|base|lg|xl|[2-9]xl)$/;
const FONT_WEIGHTS = /^(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/;
const DISPLAY = /^(block|inline-block|inline|flex|inline-flex|grid|inline-grid|contents|hidden|table)$/;

const groupOf = (utility: string): string | null => {
  const base = utility.startsWith('!') ? utility.slice(1) : utility;
  if (DISPLAY.test(base)) return 'display';
  let m = /^(min-h|min-w|max-h|max-w|size|h|w)-/.exec(base);
  if (m) return m[1];
  m = /^(p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|-mt|-mr|-mb|-ml|-mx|-my)-/.exec(base);
  if (m) return m[1];
  m = /^(gap(?:-[xy])?)-/.exec(base);
  if (m) return m[1];
  m = /^rounded(-(?:t|r|b|l|tl|tr|br|bl|s|e|ss|se|es|ee))?(?:-|$)/.exec(base);
  if (m) return `rounded${m[1] ?? ''}`;
  if (base.startsWith('text-')) {
    const rest = base.slice(5);
    if (SIZE_WORDS.test(rest) || /^\[\d/.test(rest)) return 'text-size';
    if (/^(left|center|right|justify|start|end)$/.test(rest)) return 'text-align';
    return 'text-color';
  }
  if (base.startsWith('font-')) {
    const rest = base.slice(5);
    if (FONT_WEIGHTS.test(rest)) return 'font-weight';
    if (/^(sans|mono|display|serif)$/.test(rest)) return 'font-family';
    return null;
  }
  if (base.startsWith('bg-')) return 'bg';
  if (/^border(-[xytrblse])?(-\d+)?$/.test(base)) return `border-width${/^border-([xytrblse])/.exec(base)?.[1] ?? ''}`;
  if (/^border-(solid|dashed|dotted|double|none)$/.test(base)) return 'border-style';
  if (base.startsWith('border-')) return 'border-color';
  m = /^(justify|items|self|content|place-items|leading|tracking|opacity|shadow|z|top|left|right|bottom|inset|overflow-x|overflow-y|overflow|whitespace|cursor|duration)(?:-|$)/.exec(base);
  if (m) return m[1];
  return null;
};

/** Joins class names, a later utility replacing an earlier one of its group. */
export function cn(...inputs: ClassValue[]): string {
  const tokens: string[] = [];
  const walk = (value: ClassValue) => {
    if (value === null || value === undefined || value === false || value === '') return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    for (const token of String(value).split(/\s+/)) if (token) tokens.push(token);
  };
  inputs.forEach(walk);

  const seen = new Set<string>();
  const kept: string[] = [];
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i];
    const cut = token.lastIndexOf(':');
    const variants = cut === -1 ? '' : token.slice(0, cut + 1);
    const group = groupOf(cut === -1 ? token : token.slice(cut + 1));
    const key = group ? `${variants}${group}` : `=${token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(token);
  }
  return kept.reverse().join(' ');
}
