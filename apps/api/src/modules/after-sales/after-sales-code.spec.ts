import { describe, expect, it } from 'vitest';
import { generateAfterSalesRequestNumber } from './after-sales-code.js';

describe('after-sales request number', () => {
  it('uses the public prefix, business date and unambiguous six-character alphabet', () => {
    const requestNumber = generateAfterSalesRequestNumber(
      new Date('2026-08-25T03:00:00.000Z'),
      'UTC',
    );

    expect(requestNumber).toMatch(/^RPH-AS-20260825-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
  });

  it('derives the date in the configured business timezone', () => {
    const instant = new Date('2026-08-24T17:30:00.000Z');

    expect(generateAfterSalesRequestNumber(instant, 'UTC')).toMatch(/^RPH-AS-20260824-/);
    expect(generateAfterSalesRequestNumber(instant, 'Asia/Ho_Chi_Minh')).toMatch(
      /^RPH-AS-20260825-/,
    );
  });
});
