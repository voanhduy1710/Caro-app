import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins truthy values and nested lists', () => {
    expect(cn('a', false, null, undefined, ['b', ['c']], '')).toBe('a b c');
  });

  it('lets a later utility of the same group win', () => {
    expect(cn('h-8 px-3 rounded-[6px] text-[13px]', 'h-9 px-2 rounded-md text-xs')).toBe('h-9 px-2 rounded-md text-xs');
  });

  it('keeps colour and size apart, and variants apart', () => {
    expect(cn('text-xs text-muted hover:bg-a bg-b', 'text-ink')).toBe('text-xs hover:bg-a bg-b text-ink');
  });

  it('keeps border width and border colour apart', () => {
    expect(cn('border border-line', 'border-accent')).toBe('border border-accent');
  });

  it('does not let overflow-y replace overflow', () => {
    expect(cn('overflow-hidden', 'overflow-y-auto')).toBe('overflow-hidden overflow-y-auto');
  });
});
