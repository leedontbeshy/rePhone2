import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui';
import {
  OperationsActionRail,
  OperationsDetailLayout,
  OperationsMoneySummary,
  OperationsPagination,
  OperationsPageHeader,
  OperationsPanel,
  OperationsStatusAxes,
  OperationsTimeline,
} from './operations-primitives';

describe('FE-07 operations primitives', () => {
  it('renders the approved three-axis order summary without exposing raw states', () => {
    const markup = renderToStaticMarkup(
      <OperationsStatusAxes
        axes={[
          { kind: 'order', label: 'Đơn hàng', value: 'Đang chuẩn bị', tone: 'info' },
          { kind: 'fulfillment', label: 'Giao nhận', value: 'Chờ bàn giao', tone: 'warning' },
          { kind: 'payment', label: 'Thanh toán', value: 'Đã xác nhận cọc', tone: 'success' },
        ]}
      />,
    );

    expect(markup).toContain('aria-label="Trạng thái hồ sơ"');
    expect(markup).toContain('Đang chuẩn bị');
    expect(markup).toContain('Chờ bàn giao');
    expect(markup).toContain('Đã xác nhận cọc');
    expect(markup).not.toContain('PREPARING');
  });

  it('keeps one primary action in the action rail and the record content in the main column', () => {
    const markup = renderToStaticMarkup(
      <OperationsDetailLayout
        main={<OperationsPanel title="Sản phẩm trong đơn">iPhone 15 Pro</OperationsPanel>}
        rail={
          <OperationsActionRail
            primary={<Button>Bàn giao đơn vị vận chuyển</Button>}
            supporting={<Button variant="secondary">Hủy đơn</Button>}
            title="Xử lý đơn hàng"
          />
        }
      />,
    );

    expect(markup).toContain('<aside');
    expect(markup).toContain('Xử lý đơn hàng');
    expect(markup).toContain('Bàn giao đơn vị vận chuyển');
    expect(markup).toContain('Sản phẩm trong đơn');
    expect(markup.indexOf('<aside')).toBeLessThan(markup.indexOf('Sản phẩm trong đơn'));
    expect(markup.match(/>Bàn giao đơn vị vận chuyển<\/span>/g)).toHaveLength(1);
  });

  it('renders a semantic timeline and financial summary', () => {
    const markup = renderToStaticMarkup(
      <>
        <OperationsPageHeader title="Đơn hàng RPH-001" description="Nguyễn Văn An" />
        <OperationsTimeline
          orientation="horizontal"
          items={[
            { label: 'Đã đặt hàng', at: '09:20 29/08/2026' },
            { label: 'Đang chuẩn bị', state: 'current' },
          ]}
        />
        <OperationsMoneySummary
          rows={[
            { label: 'Tạm tính', value: '15.000.000 đ' },
            { label: 'Còn phải thu', value: '10.000.000 đ', emphasis: 'primary' },
          ]}
        />
      </>,
    );

    expect(markup).toContain('<h1>Đơn hàng RPH-001</h1>');
    expect(markup).toContain('<ol');
    expect(markup).toContain('data-orientation="horizontal"');
    expect(markup).toContain('<time>09:20 29/08/2026</time>');
    expect(markup).toContain('<dl');
    expect(markup).toContain('Còn phải thu');
  });

  it('keeps the timeline vertical when no orientation is provided', () => {
    const markup = renderToStaticMarkup(<OperationsTimeline items={[{ label: 'Đã đặt hàng' }]} />);

    expect(markup).toContain('data-orientation="vertical"');
  });

  it('renders list pagination as a named navigation landmark', () => {
    const markup = renderToStaticMarkup(
      <OperationsPagination
        disabled={false}
        label="Phân trang hồ sơ hỗ trợ"
        page={2}
        totalItems={42}
        totalPages={3}
        onPageChange={() => undefined}
      />,
    );

    expect(markup).toContain('<nav');
    expect(markup).toContain('aria-label="Phân trang hồ sơ hỗ trợ"');
    expect(markup).toContain('aria-live="polite">42 kết quả');
    expect(markup).toContain('Trang trước');
    expect(markup).toContain('Trang sau');
  });
});
