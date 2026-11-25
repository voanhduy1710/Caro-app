import { describe, expect, it } from 'vitest';
import { trapTabTarget } from './useFocusTrap';

const items = ['a', 'b', 'c'];

describe('trapTabTarget', () => {
  it('wraps from the last control to the first and back', () => {
    expect(trapTabTarget(items, 'c', true, false)).toBe('a');
    expect(trapTabTarget(items, 'a', true, true)).toBe('c');
  });

  it('lets the browser move between controls in the middle', () => {
    expect(trapTabTarget(items, 'a', true, false)).toBeNull();
    expect(trapTabTarget(items, 'b', true, true)).toBeNull();
  });

  it('Shift+Tab from the dialog itself goes to the last control', () => {
    expect(trapTabTarget(items, 'dialog', true, true)).toBe('c');
    expect(trapTabTarget(items, 'dialog', true, false)).toBeNull();
  });

  it('pulls focus that escaped back in', () => {
    expect(trapTabTarget(items, 'page', false, false)).toBe('a');
    expect(trapTabTarget(items, 'page', false, true)).toBe('c');
  });

  it('has nothing to do without controls', () => {
    expect(trapTabTarget([], 'dialog', true, false)).toBeNull();
  });
});
