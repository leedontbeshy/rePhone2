import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WarrantyDetail as WarrantyDetailDto, WarrantyListItem } from '@/lib/warranty-api';
import { WarrantyDetail } from './warranty-detail';
import { WarrantyDetailStateHeader } from './warranty-detail-state-header';
import { WarrantyList } from './warranty-list';

describe('warranty customer components', () => {
  it('renders a text-only paginated collection without unsupported filters or claims', () => {
    const markup = renderToStaticMarkup(
      <WarrantyList items={[warranty()]} page={1} totalPages={2} />,
    );
    expect(markup).toContain('Danh sách bảo hành');
    expect(markup).toContain('RPH-W-20260828-ABC23456');
    expect(markup).toContain('href="/warranties?page=2"');
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('Sắp hết hạn');
    expect(markup).not.toContain('Lọc trạng thái');
  });

  it('renders an accessible lifecycle and contextual support navigation without promising eligibility', () => {
    const markup = renderToStaticMarkup(<WarrantyDetail detail={detail()} />);
    expect(markup).toContain('aria-current="step"');
    expect(markup).toContain(
      'href="/after-sales/new?orderNumber=RPH-20260828-ABC23456&amp;orderItemId=0199b354-d818-7f7c-b966-3932599978d0"',
    );
    expect(markup).toContain('Yêu cầu hỗ trợ');
    expect(markup).toMatch(/class="[^"]*primaryAction[^"]*"[^>]*>Yêu cầu hỗ trợ<\/a>/);
    expect(markup).toContain('không đồng nghĩa yêu cầu chắc chắn được chấp nhận');
    expect(markup).not.toMatch(/bucket|objectPath|access token|localStorage/i);
  });

  it('keeps one descriptive h1 available while detail access is loading or fails safely', () => {
    const markup = renderToStaticMarkup(<WarrantyDetailStateHeader />);
    expect(markup.match(/<h1>/g)).toHaveLength(1);
    expect(markup).toContain('<h1>Chi tiết bảo hành</h1>');
    expect(markup).toContain('Kiểm tra thông tin và thời hạn bảo hành của sản phẩm.');
  });
});

function warranty(): WarrantyListItem {
  return {
    warrantyCode: 'RPH-W-20260828-ABC23456',
    orderNumber: 'RPH-20260828-ABC23456',
    orderItemId: '0199b354-d818-7f7c-b966-3932599978d0',
    productName: 'iPhone 15',
    variantName: '128 GB · Đen',
    inventoryCode: 'IP15-001',
    daysSnapshot: 90,
    status: 'ACTIVE',
    startAt: '2026-08-01T00:00:00.000Z',
    endAt: '2026-10-30T00:00:00.000Z',
    isValid: true,
    isExpired: false,
  };
}

function detail(): WarrantyDetailDto {
  return {
    ...warranty(),
    sku: 'IP15-128-BLK',
    termsSnapshot: 'Bảo hành phần cứng theo điều khoản đã ghi nhận.',
    maskedIdentifierSuffix: '1234',
  };
}
