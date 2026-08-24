import { describe, expect, it } from 'vitest';
import {
  backofficeAfterSalesActions,
  customerAfterSalesActions,
  isWarrantyValid,
} from './after-sales-policy.js';

describe('after-sales policy', () => {
  it('keeps customer mutations limited to the documented non-terminal states', () => {
    expect(customerAfterSalesActions('REQUESTED')).toEqual(['UPLOAD_ATTACHMENT', 'CANCEL']);
    expect(customerAfterSalesActions('INSPECTING')).toEqual(['UPLOAD_ATTACHMENT']);
    expect(customerAfterSalesActions('APPROVED')).toEqual([]);
  });

  it('only exposes direct replacement for iPhone and OTHER for admin', () => {
    expect(backofficeAfterSalesActions('APPROVED', true, 'EMPLOYEE')).toContain(
      'RESOLVE_REPLACED',
    );
    expect(backofficeAfterSalesActions('APPROVED', false, 'EMPLOYEE')).not.toContain(
      'RESOLVE_REPLACED',
    );
    expect(backofficeAfterSalesActions('APPROVED', true, 'EMPLOYEE')).not.toContain(
      'RESOLVE_OTHER',
    );
    expect(backofficeAfterSalesActions('APPROVED', true, 'ADMIN')).toContain('RESOLVE_OTHER');
  });

  it('uses an end-exclusive warranty interval', () => {
    const startAt = new Date('2026-08-25T00:00:00.000Z');
    const endAt = new Date('2026-08-26T00:00:00.000Z');
    const warranty = { status: 'ACTIVE' as const, startAt, endAt };

    expect(isWarrantyValid(warranty, startAt)).toBe(true);
    expect(isWarrantyValid(warranty, new Date(endAt.getTime() - 1))).toBe(true);
    expect(isWarrantyValid(warranty, endAt)).toBe(false);
    expect(isWarrantyValid({ ...warranty, status: 'VOIDED' }, startAt)).toBe(false);
  });
});
