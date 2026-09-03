import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CustomerOrderDetailSkeleton } from './customer-order-detail';

describe('customer order detail loading state', () => {
  it('reserves the order journey and detail layout while exposing one loading status', () => {
    const markup = renderToStaticMarkup(<CustomerOrderDetailSkeleton />);

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="Đang tải chi tiết đơn hàng"');
    expect(markup).toContain('<h1>Chi tiết đơn hàng</h1>');
    expect(markup.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(10);
    expect(markup).not.toMatch(/token|cookie|localStorage|endpoint/i);
  });
});
