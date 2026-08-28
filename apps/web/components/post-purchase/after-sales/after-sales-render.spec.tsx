import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { components } from '@rephone/api-client';
import type { AfterSalesListItem } from '@/lib/after-sales-api';
import { LifecycleJourney } from '@/components/post-purchase';
import { afterSalesJourney } from '@/lib/after-sales-presenter';
import {
  AfterSalesOrderPickerLink,
  AfterSalesRow,
  buildAfterSalesListHref,
} from './after-sales-list';

const item = {
  requestNumber: 'RPH-AS-20260828-ABC234',
  type: 'EXCHANGE',
  status: 'RECEIVED',
  issueDescription: 'Sản phẩm hoạt động không ổn định.',
  requestedAt: '2026-08-25T01:00:00.000Z',
  updatedAt: '2026-08-26T01:00:00.000Z',
  orderItem: {
    id: '0199b354-d818-7f7c-b966-3932599978d0',
    orderNumber: 'RPH-20260825-ABC23456',
    productName: 'Cáp USB-C sang Lightning',
    variantName: 'Trắng',
    quantity: 1,
  },
} satisfies AfterSalesListItem;

describe('after-sales presentation', () => {
  it('renders a text-only collection row with neutral Vietnamese copy', () => {
    const html = renderToStaticMarkup(<AfterSalesRow item={item} />);
    expect(html).toContain('Cáp USB-C sang Lightning');
    expect(html).toContain('Yêu cầu đổi sản phẩm');
    expect(html).toContain('Xem tiến độ');
    expect(html).not.toContain('<img');
  });

  it('renders a cancelled request as a terminal branch', () => {
    const detail: components['schemas']['AfterSalesDetailDto'] = {
      ...item,
      status: 'CANCELLED',
      requestedResolution: null,
      warranty: null,
      attachments: [],
      availableActions: [],
      timeline: {
        requestedAt: item.requestedAt,
        cancelledAt: item.updatedAt,
      },
    };
    const html = renderToStaticMarkup(
      <LifecycleJourney
        ariaLabel="Tiến trình"
        stages={afterSalesJourney(detail)}
        title="Tiến trình xử lý"
      />,
    );
    expect(html).toContain('Đã hủy');
    expect(html).not.toContain('Đã hoàn tất');
  });

  it('builds pagination URLs only from supported filters', () => {
    expect(
      buildAfterSalesListHref({
        type: 'WARRANTY',
        status: 'RECEIVED',
        page: 2,
        token: 'secret',
      } as { type: string; status: string; page: number }),
    ).toBe('/after-sales?type=WARRANTY&status=RECEIVED&page=2');
    expect(buildAfterSalesListHref({ type: 'UNKNOWN', status: 'HACKED', page: -1 })).toBe(
      '/after-sales',
    );
  });

  it('marks the order picker as the primary after-sales call to action', () => {
    const html = renderToStaticMarkup(<AfterSalesOrderPickerLink />);
    expect(html).toContain('href="/after-sales/new"');
    expect(html).toContain('Chọn sản phẩm từ đơn hàng');
    expect(html).toMatch(/class="[^"]*primaryLink[^"]*"/);
  });
});
