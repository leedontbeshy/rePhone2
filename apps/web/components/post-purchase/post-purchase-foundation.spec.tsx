import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConfirmationDialog } from './confirmation-dialog';
import { LifecycleJourney } from './lifecycle-journey';
import {
  CollectionSurface,
  Pagination,
  PostPurchasePageHeader,
  ProductTextSummary,
  SafeNotFoundState,
  StatusPill,
} from './shared';

describe('customer post-purchase foundation', () => {
  it('renders an ordered lifecycle with one authoritative current step', () => {
    const markup = renderToStaticMarkup(
      <LifecycleJourney
        ariaLabel="Tiến trình đơn hàng"
        currentSummary="Đơn hàng đang trên đường đến địa chỉ nhận hàng."
        stages={[
          {
            id: 'placed',
            icon: 'order',
            label: 'Đã đặt hàng',
            state: 'complete',
          },
          {
            id: 'shipping',
            icon: 'shipping',
            label: 'Đang giao đến bạn',
            state: 'current',
          },
          {
            id: 'completed',
            icon: 'complete',
            label: 'Đã nhận hàng',
            state: 'upcoming',
          },
        ]}
        title="Tiến trình đơn hàng"
      />,
    );

    expect(markup).toContain('<ol');
    expect(markup).toContain('aria-label="Tiến trình đơn hàng"');
    expect(markup.match(/aria-current="step"/g)).toHaveLength(1);
    expect(markup).toContain('Hiện tại: Đang giao đến bạn');
    expect(markup).toContain('Bước 2 trên 3');
  });

  it('does not invent a current step when the projection has none', () => {
    const markup = renderToStaticMarkup(
      <LifecycleJourney
        ariaLabel="Tiến trình đang cập nhật"
        stages={[
          { id: 'placed', icon: 'order', label: 'Đã đặt hàng', state: 'complete' },
          { id: 'shipping', icon: 'shipping', label: 'Đang giao', state: 'upcoming' },
        ]}
        title="Tiến trình đang cập nhật"
      />,
    );

    expect(markup).not.toContain('Hiện tại:');
    expect(markup).not.toContain('Bước 1 trên 2');
    expect(markup).not.toContain('aria-current="step"');
  });

  it('keeps terminal branches explicit instead of presenting them as success', () => {
    const markup = renderToStaticMarkup(
      <LifecycleJourney
        ariaLabel="Tiến trình hỗ trợ"
        stages={[
          { id: 'requested', icon: 'support', label: 'Đã gửi', state: 'complete' },
          {
            id: 'cancelled',
            icon: 'cancelled',
            label: 'Đã hủy',
            state: 'terminal',
            tone: 'danger',
          },
        ]}
        title="Tiến trình xử lý"
      />,
    );

    expect(markup).toContain('data-state="terminal"');
    expect(markup).toContain('data-tone="danger"');
    expect(markup).not.toContain('Hoàn tất');
  });

  it('renders grouped collection structure, status and URL pagination', () => {
    const markup = renderToStaticMarkup(
      <>
        <PostPurchasePageHeader
          description="Theo dõi thông tin sau khi mua hàng."
          status={<StatusPill tone="info">Đang giao</StatusPill>}
          title="Đơn hàng của bạn"
        />
        <CollectionSurface
          ariaLabel="Danh sách đơn hàng"
          busy
          footer={
            <Pagination
              buildHref={(page) => `/orders?page=${String(page)}`}
              page={2}
              totalPages={4}
            />
          }
        >
          <ProductTextSummary name="iPhone 14 Pro" secondary="1 sản phẩm" />
        </CollectionSurface>
      </>,
    );

    expect(markup).toContain('<h1>Đơn hàng của bạn</h1>');
    expect(markup).toContain('aria-label="Danh sách đơn hàng"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Đang cập nhật danh sách…');
    expect(markup).toContain('href="/orders?page=1"');
    expect(markup).toContain('href="/orders?page=3"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).not.toContain('<svg');
  }, 15_000);

  it('uses one safe not-found state without implementation details', () => {
    const markup = renderToStaticMarkup(<SafeNotFoundState />);

    expect(markup).toContain('Không mở được thông tin này');
    expect(markup).toContain('href="/"');
    expect(markup).not.toMatch(/token|cookie|localStorage|endpoint|bucket/i);
  });

  it('gives cancellation confirmation a named dialog and linked reason error', () => {
    const markup = renderToStaticMarkup(
      <ConfirmationDialog
        confirmLabel="Xác nhận hủy"
        description="Đơn hàng sẽ được cập nhật theo trạng thái mới nhất."
        error="Vui lòng nhập từ 5 đến 500 ký tự."
        onClose={() => undefined}
        onConfirm={() => undefined}
        onReasonChange={() => undefined}
        open
        reason="ngắn"
        reasonLabel="Lý do hủy"
        title="Hủy đơn hàng?"
      />,
    );

    expect(markup).toContain('<dialog');
    const labelledBy = markup.match(/aria-labelledby="([^"]+)"/)?.[1];
    const describedBy = markup.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(describedBy).toBeTruthy();
    if (labelledBy === undefined || describedBy === undefined) {
      throw new Error('Expected the dialog to expose generated accessible IDs.');
    }
    expect(markup).toContain(`id="${labelledBy}"`);
    expect(markup).toContain(`id="${describedBy}"`);
    expect(markup.match(/aria-describedby="([^"]+)"/g)).toHaveLength(2);
    expect(markup).toContain('minLength="5"');
    expect(markup).toContain('maxLength="500"');
  });
});
