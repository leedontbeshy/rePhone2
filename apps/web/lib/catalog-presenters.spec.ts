import { describe, expect, it } from 'vitest';
import {
  catalogLabel,
  countAcceptableChecks,
  countPassingChecks,
  fulfillmentSummary,
  groupFunctionalChecks,
} from './catalog-presenters';

describe('catalog presenters', () => {
  it('uses contract-safe Vietnamese labels', () => {
    expect(catalogLabel('NONE_KNOWN')).toBe('Không ghi nhận lịch sử sửa chữa');
    expect(catalogLabel('UNLOCKED')).toBe('Không khóa mạng');
    expect(catalogLabel('FUTURE_VALUE')).toBe('future value');
  });

  it('groups known checks and keeps future keys visible', () => {
    const groups = groupFunctionalChecks([
      { key: 'DISPLAY', label: 'Màn hình', status: 'PASS' },
      { key: 'FUTURE_SENSOR', label: 'Cảm biến mới', status: 'UNKNOWN', note: 'Cần kiểm tra' },
    ]);

    expect(groups.map((group) => group.label)).toEqual(['Hiển thị và camera', 'Khác']);
    expect(groups.flatMap((group) => group.items)).toHaveLength(2);
  });

  it('projects check and fulfillment summaries without inventing inventory facts', () => {
    expect(countPassingChecks([{ key: 'DISPLAY', label: 'Màn hình', status: 'PASS' }])).toBe(1);
    expect(
      countAcceptableChecks([
        { key: 'DISPLAY', label: 'Màn hình', status: 'PASS' },
        { key: 'ESIM', label: 'eSIM', status: 'NOT_APPLICABLE' },
        { key: 'BATTERY', label: 'Pin', status: 'DEGRADED' },
      ]),
    ).toBe(2);
    expect(fulfillmentSummary(true, false)).toBe('Nhận tại cửa hàng');
    expect(fulfillmentSummary(false, false)).toBe('Tạm thời chưa thể đặt mua');
  });
});
