import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BackofficeActionDialog, validateBackofficeActionReason } from './backoffice-action-dialog';
import {
  BackofficeDataBoard,
  BackofficeFilterToolbar,
  BackofficePagination,
  CatalogVoucherStatusChip,
  paginationItems,
} from './catalog-voucher-primitives';

describe('FE-05 backoffice primitives', () => {
  it('renders a semantic data table with labels needed by the mobile card layout', () => {
    const markup = renderToStaticMarkup(
      <BackofficeDataBoard
        ariaLabel="Danh sách sản phẩm"
        columns={[
          {
            key: 'name',
            label: 'Sản phẩm',
            mobileRole: 'primary',
            render: (row: { id: string; name: string; status: string }) => row.name,
          },
          {
            key: 'status',
            label: 'Trạng thái',
            render: (row: { id: string; name: string; status: string }) => row.status,
          },
        ]}
        getRowKey={(row) => row.id}
        rows={[{ id: 'product-1', name: 'iPhone 15 Pro', status: 'Đang hoạt động' }]}
      />,
    );

    expect(markup).toContain('role="region"');
    expect(markup).toContain('aria-label="Danh sách sản phẩm"');
    expect(markup).toContain('<table>');
    expect(markup).toContain('<caption');
    expect(markup).toContain('data-label="Sản phẩm"');
    expect(markup).toContain('data-mobile-role="primary"');
  });

  it('keeps filter fields and actions in one labelled form', () => {
    const markup = renderToStaticMarkup(
      <BackofficeFilterToolbar
        actions={<button type="submit">Áp dụng</button>}
        summary="12 sản phẩm"
      >
        <label>
          Tìm kiếm
          <input name="q" />
        </label>
      </BackofficeFilterToolbar>,
    );

    expect(markup).toContain('<form');
    expect(markup).toContain('aria-label="Bộ lọc"');
    expect(markup).toContain('12 sản phẩm');
    expect(markup).toContain('Áp dụng');
  });

  it('translates lifecycle states instead of showing raw API values', () => {
    const markup = renderToStaticMarkup(
      <>
        <CatalogVoucherStatusChip status="DRAFT" />
        <CatalogVoucherStatusChip status="PAUSED" />
        <CatalogVoucherStatusChip status="CONSUMED" />
        <CatalogVoucherStatusChip label="Đang bán" status="ACTIVE" />
      </>,
    );

    expect(markup).toContain('Bản nháp');
    expect(markup).toContain('Tạm dừng');
    expect(markup).toContain('Đã sử dụng');
    expect(markup).toContain('Đang bán');
    expect(markup).not.toContain('DRAFT');
  });

  it('renders server-authoritative pagination with current and adjacent links', () => {
    const markup = renderToStaticMarkup(
      <BackofficePagination
        buildHref={(page) => `/backoffice/catalog/products?page=${String(page)}`}
        page={4}
        pageSize={20}
        totalItems={203}
        totalPages={11}
      />,
    );

    expect(markup).toContain('aria-label="Phân trang dữ liệu"');
    expect(markup).toContain('61–80 trên 203 kết quả');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('rel="prev"');
    expect(markup).toContain('rel="next"');
    expect(paginationItems(1, 11)).toEqual([1, 2, 'ellipsis-end', 11]);
    expect(paginationItems(6, 11)).toEqual([1, 'ellipsis-start', 5, 6, 7, 'ellipsis-end', 11]);
    expect(paginationItems(11, 11)).toEqual([1, 'ellipsis-start', 10, 11]);
  });

  it('associates action confirmation copy and a required reason field', () => {
    const markup = renderToStaticMarkup(
      <BackofficeActionDialog
        confirmLabel="Lưu trữ sản phẩm"
        description="Sản phẩm sẽ không còn xuất hiện tại cửa hàng."
        destructive
        open
        reason={{ value: '', onChange: vi.fn() }}
        title="Lưu trữ sản phẩm này?"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(markup).toContain('<dialog');
    expect(markup).toContain('aria-labelledby=');
    expect(markup).toContain('aria-describedby=');
    expect(markup).toContain('Lưu trữ sản phẩm này?');
    expect(markup).toContain('required=""');
    expect(markup).toContain('Lý do');
    expect(validateBackofficeActionReason(' bốn ')).toContain('ít nhất 5');
    expect(validateBackofficeActionReason('Lý do hợp lệ')).toBeUndefined();
  });
});
