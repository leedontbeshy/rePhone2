import { describe, expect, it } from 'vitest';
import {
  centeredScrollOffset,
  clampScrollOffset,
  scrollOffsetForVisibleTarget,
} from './backoffice-shell-scroll';

describe('backoffice shell scroll helpers', () => {
  it('keeps an already visible navigation item in place', () => {
    expect(
      scrollOffsetForVisibleTarget({
        currentOffset: 320,
        scrollSize: 1_432,
        targetEnd: 420,
        targetSize: 54,
        targetStart: 366,
        viewportSize: 644,
      }),
    ).toBe(320);
  });

  it('centers an item below the sidebar viewport and clamps to the available range', () => {
    expect(
      scrollOffsetForVisibleTarget({
        currentOffset: 0,
        scrollSize: 1_432,
        targetEnd: 1_210,
        targetSize: 54,
        targetStart: 1_156,
        viewportSize: 644,
      }),
    ).toBe(788);
  });

  it('preserves horizontal centering within scroll bounds', () => {
    expect(
      centeredScrollOffset({
        currentOffset: 0,
        scrollSize: 760,
        targetSize: 120,
        targetStart: 520,
        viewportSize: 320,
      }),
    ).toBe(420);
    expect(clampScrollOffset(900, 760, 320)).toBe(440);
  });
});
