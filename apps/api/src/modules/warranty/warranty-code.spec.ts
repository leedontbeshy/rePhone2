import { describe, expect, it } from 'vitest';
import { generateWarrantyCode } from './warranty-code.js';

describe('warranty code', () => {
  it('uses the public prefix, business date and unambiguous eight-character alphabet', () => {
    const code = generateWarrantyCode(new Date('2026-08-23T03:00:00.000Z'), 'UTC');

    expect(code).toMatch(/^RPH-W-20260823-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
  });

  it('derives the date in the configured business timezone', () => {
    const instant = new Date('2026-08-22T17:30:00.000Z');

    expect(generateWarrantyCode(instant, 'UTC')).toMatch(/^RPH-W-20260822-/);
    expect(generateWarrantyCode(instant, 'Asia/Ho_Chi_Minh')).toMatch(/^RPH-W-20260823-/);
  });
});
