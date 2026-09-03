import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BackofficeWarrantyDetail, BackofficeWarrantyListItem } from '@/lib/warranty-api';
import { WarrantyDetailContent } from './warranty-detail-view';
import { WarrantyQueueList } from './warranty-queue-view';

describe('WarrantyQueueList', () => {
  it('renders validity in Vietnamese and hides enum values', () => {
    const markup = renderToStaticMarkup(<WarrantyQueueList items={[item()]} />);

    expect(markup).toContain('RPH-W-0001');
    expect(markup).toContain('Còn hiệu lực');
    expect(markup).not.toContain('ACTIVE');
    expect(markup).not.toContain('VALID');
  });

  it('keeps the loaded warranty queue visible during a local refresh', () => {
    const markup = renderToStaticMarkup(<WarrantyQueueList items={[item()]} updating />);

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('RPH-W-0001');
  });

  it('renders the irreversible action only when the detail DTO allows it', () => {
    const hidden = renderToStaticMarkup(
      <WarrantyDetailContent
        busy={false}
        detail={detail([])}
        error={null}
        notice={null}
        refreshRequired={false}
        onReload={() => undefined}
        onVoid={() => undefined}
      />,
    );
    const allowed = renderToStaticMarkup(
      <WarrantyDetailContent
        busy={false}
        detail={detail(['VOID'])}
        error={null}
        notice={null}
        refreshRequired={false}
        onReload={() => undefined}
        onVoid={() => undefined}
      />,
    );

    expect(hidden).not.toContain('Vô hiệu bảo hành');
    expect(allowed).toContain('Vô hiệu bảo hành');
  });

  it('suppresses stale actions until the authoritative detail can be reloaded', () => {
    const markup = renderToStaticMarkup(
      <WarrantyDetailContent
        busy={false}
        detail={detail(['VOID'])}
        error="Chưa tải lại được trạng thái mới nhất."
        notice={null}
        refreshRequired
        onReload={() => undefined}
        onVoid={() => undefined}
      />,
    );

    expect(markup).toContain('Tải lại chi tiết');
    expect(markup).not.toContain('Vô hiệu bảo hành');
  });
});

function item(): BackofficeWarrantyListItem {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    customer: {
      customerId: 'customer-1',
      email: 'khach@example.com',
      name: 'Khách hàng Demo',
      phone: '0900000000',
    },
    daysSnapshot: 365,
    endAt: '2027-01-01T00:00:00.000Z',
    id: 'warranty-1',
    inventoryCode: 'RPH-U-001',
    isExpired: false,
    isValid: true,
    orderItemId: 'item-1',
    orderNumber: 'RPH-20260829-ABCDEFGH',
    policy: { code: 'BH-365', id: 'policy-1', name: 'Bảo hành một năm' },
    productName: 'iPhone 15',
    startAt: '2026-01-01T00:00:00.000Z',
    status: 'ACTIVE',
    variantName: '128 GB Đen',
    warrantyCode: 'RPH-W-0001',
  };
}

function detail(
  availableActions: BackofficeWarrantyDetail['availableActions'],
): BackofficeWarrantyDetail {
  return {
    ...item(),
    availableActions,
    maskedIdentifierSuffix: '1234',
    sku: 'IP15-128-BLK',
    termsSnapshot: 'Điều khoản bảo hành phần cứng.',
    updatedAt: '2026-08-29T00:00:00.000Z',
    voidReason: null,
    voidedAt: null,
    voidedBy: null,
  };
}
