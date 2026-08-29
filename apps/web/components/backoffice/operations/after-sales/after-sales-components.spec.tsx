import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AfterSalesDetail, AfterSalesListItem } from '@/lib/after-sales-backoffice-api';
import {
  rejectReasonMaximum,
  validateReceiveFields,
  validateRequiredText,
} from './after-sales-action-panel';
import { InspectionLoadFailure } from './after-sales-detail-view';
import { AfterSalesQueueList } from './after-sales-queue-view';

describe('AfterSalesQueueList', () => {
  it('renders a compact Vietnamese queue without internal vocabulary', () => {
    const markup = renderToStaticMarkup(<AfterSalesQueueList items={[queueItem()]} />);

    expect(markup).toContain('RPH-AS-20260829-0001');
    expect(markup).toContain('Bảo hành');
    expect(markup).toContain('Chờ tiếp nhận');
    expect(markup).toContain('Chưa phân công');
    expect(markup).not.toContain('REQUESTED');
    expect(markup).not.toContain('UUID');
  });

  it('renders an actionable inspection loading failure', () => {
    const markup = renderToStaticMarkup(
      <InspectionLoadFailure error="Kết nối tạm thời gián đoạn." onRetry={() => undefined} />,
    );

    expect(markup).toContain('Chưa tải được phiếu kiểm định');
    expect(markup).toContain('Kết nối tạm thời gián đoạn.');
    expect(markup).toContain('Thử tải lại phiếu');
  });

  it('matches receive and iPhone return-note limits from the API contract', () => {
    expect(validateReceiveFields('location-1', 'Đủ năm')).toEqual({});
    expect(validateReceiveFields('location-1', 'Bốn')).toHaveProperty('receiveNote');
    expect(validateRequiredText('a'.repeat(2001), 5, 2000, 'Ghi chú')).toContain('2.000');
    expect(
      rejectReasonMaximum({
        orderItem: { inventoryCode: 'RPH-U-001' } as AfterSalesDetail['orderItem'],
      }),
    ).toBe(1000);
    expect(
      rejectReasonMaximum({
        orderItem: { inventoryCode: null } as AfterSalesDetail['orderItem'],
      }),
    ).toBe(2000);
  });
});

function queueItem(): AfterSalesListItem {
  return {
    assignedTo: null,
    attachmentCount: 2,
    customer: {
      email: 'khach@example.com',
      id: 'customer-1',
      name: 'Khách hàng Demo',
      phone: '0900000000',
    },
    id: 'case-1',
    issueDescription: 'Máy không sạc được.',
    orderItem: {
      id: 'item-1',
      inventoryCode: 'RPH-U-001',
      orderNumber: 'RPH-20260829-ABCDEFGH',
      productName: 'iPhone 15',
      quantity: 1,
      variantName: '128 GB Đen',
    },
    requestNumber: 'RPH-AS-20260829-0001',
    requestedAt: '2026-08-29T00:00:00.000Z',
    status: 'REQUESTED',
    type: 'WARRANTY',
    updatedAt: '2026-08-29T01:00:00.000Z',
  };
}
