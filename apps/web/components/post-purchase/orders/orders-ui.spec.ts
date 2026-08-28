import { describe, expect, it } from 'vitest';
import { paymentProofSelectionLabel } from './orders-ui';

describe('orders UI presentation', () => {
  it('announces the current proof file selection clearly', () => {
    expect(paymentProofSelectionLabel(null)).toBe('Chưa chọn tệp');
    expect(paymentProofSelectionLabel({ name: 'chuyen-khoan.pdf' })).toBe('chuyen-khoan.pdf');
    expect(paymentProofSelectionLabel({ name: '   ' })).toBe('Tệp đã chọn');
  });
});
