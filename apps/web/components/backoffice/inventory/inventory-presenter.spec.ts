import { describe, expect, it } from 'vitest';
import {
  inspectionCheckStatusPresentation,
  inspectionResultPresentation,
  inspectionStatusLabel,
  inspectionTypeLabel,
  inventoryLifecyclePresentation,
  stockLevelPresentation,
  stockMovementLabel,
} from './inventory-presenter';

describe('FE-06 inventory presenters', () => {
  it('presents every inventory lifecycle state in natural Vietnamese', () => {
    expect(inventoryLifecyclePresentation('RECEIVED')).toEqual({
      label: 'Đã tiếp nhận',
      tone: 'info',
    });
    expect(inventoryLifecyclePresentation('AVAILABLE')).toEqual({
      label: 'Sẵn sàng bán',
      tone: 'success',
    });
    expect(inventoryLifecyclePresentation('QUARANTINED')).toEqual({
      label: 'Đang cách ly',
      tone: 'danger',
    });
    expect(inventoryLifecyclePresentation('WRITTEN_OFF').label).toBe('Đã loại khỏi kho');
  });

  it('separates inspection progress, result and purpose', () => {
    expect(inspectionStatusLabel('DRAFT')).toBe('Bản nháp');
    expect(inspectionStatusLabel('COMPLETED')).toBe('Đã hoàn tất');
    expect(inspectionResultPresentation('PASSED')).toEqual({ label: 'Đạt', tone: 'success' });
    expect(inspectionResultPresentation('PARTIAL')).toEqual({
      label: 'Cần xử lý',
      tone: 'warning',
    });
    expect(inspectionTypeLabel('PRE_SALE')).toBe('Kiểm định trước khi bán');
  });

  it('presents inspection check states without exposing raw API values', () => {
    expect(inspectionCheckStatusPresentation('DEGRADED')).toEqual({
      label: 'Hoạt động chưa tốt',
      tone: 'warning',
    });
    expect(inspectionCheckStatusPresentation('NOT_APPLICABLE').label).toBe('Không áp dụng');
    expect(inspectionCheckStatusPresentation('UNKNOWN').label).toBe('Chưa xác định');
  });

  it('presents stock movement and availability status', () => {
    expect(stockMovementLabel('RECEIPT')).toBe('Nhập kho');
    expect(stockMovementLabel('ADJUSTMENT_OUT')).toBe('Điều chỉnh giảm');
    expect(stockLevelPresentation(0, false)).toEqual({ label: 'Hết hàng', tone: 'danger' });
    expect(stockLevelPresentation(2, true)).toEqual({ label: 'Sắp hết hàng', tone: 'warning' });
    expect(stockLevelPresentation(12, false)).toEqual({ label: 'Đủ hàng', tone: 'success' });
  });
});
