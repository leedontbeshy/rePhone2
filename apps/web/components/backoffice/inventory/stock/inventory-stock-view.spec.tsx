import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type {
  InventoryLocation,
  InventoryStockLevel,
  InventoryStockMovement,
} from '@/lib/backoffice-inventory-api';
import { InventoryStockMovementsView } from './inventory-stock-movements-view';
import { InventoryStockView, type StockVariantOption } from './inventory-stock-view';

const VARIANT_ID = '0199c9aa-a258-74c8-a35f-9cd11c562a03';
const STORE_ID = '0199c9aa-a258-74c8-a35f-9cd11c562a04';
const WAREHOUSE_ID = '0199c9aa-a258-74c8-a35f-9cd11c562a05';

const STORE: InventoryLocation = {
  id: STORE_ID,
  code: 'STORE-HCM',
  name: 'Cửa hàng TP.HCM',
  type: 'STORE',
  status: 'ACTIVE',
};

const WAREHOUSE: InventoryLocation = {
  id: WAREHOUSE_ID,
  code: 'WAREHOUSE-HCM',
  name: 'Kho TP.HCM',
  type: 'WAREHOUSE',
  status: 'ACTIVE',
};

const VARIANT: StockVariantOption = {
  id: VARIANT_ID,
  sku: 'CASE-MAGSAFE',
  displayName: 'Trong suốt',
  status: 'ACTIVE',
  productName: 'Ốp lưng MagSafe',
};

const LEVEL: InventoryStockLevel = {
  id: '0199c9aa-a258-74c8-a35f-9cd11c562a10',
  product: {
    id: '0199c9aa-a258-74c8-a35f-9cd11c562a02',
    name: 'Ốp lưng MagSafe',
    slug: 'op-lung-magsafe',
    status: 'ACTIVE',
  },
  variant: VARIANT,
  location: STORE,
  quantityOnHand: 20,
  quantityReserved: 3,
  quantityAvailable: 17,
  reorderThreshold: 5,
  lowStock: false,
  updatedAt: '2026-08-28T05:00:00.000Z',
};

const MOVEMENT: InventoryStockMovement = {
  id: '0199c9aa-a258-74c8-a35f-9cd11c562a08',
  type: 'TRANSFER',
  variantId: VARIANT_ID,
  product: LEVEL.product,
  variant: VARIANT,
  fromLocationId: STORE_ID,
  fromLocation: STORE,
  toLocationId: WAREHOUSE_ID,
  toLocation: WAREHOUSE,
  quantity: 4,
  referenceType: 'SHIPMENT',
  referenceId: '0199c9aa-a258-74c8-a35f-9cd11c562a11',
  reason: 'Bổ sung hàng tại kho',
  createdById: '0199c9aa-a258-74c8-a35f-9cd11c562a12',
  createdBy: {
    id: '0199c9aa-a258-74c8-a35f-9cd11c562a12',
    fullName: 'Nguyễn Kỹ Thuật',
    employeeCode: 'NV-012',
  },
  createdAt: '2026-08-28T05:30:00.000Z',
};

describe('inventory stock views', () => {
  it('renders every authoritative stock counter and named selector option', () => {
    const markup = renderToStaticMarkup(
      <InventoryStockView
        levels={[LEVEL]}
        locations={[STORE, WAREHOUSE]}
        pagination={{ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }}
        query={{ page: 1, pageSize: 20 }}
        variants={[VARIANT]}
        onCommand={vi.fn().mockResolvedValue({ ok: true })}
        onQueryChange={vi.fn()}
      />,
    );
    const text = visibleText(markup);
    expect(text).toContain('Tồn thực');
    expect(text).toContain('Đang giữ');
    expect(text).toContain('Có thể bán');
    expect(text).toContain('Ngưỡng cảnh báo');
    expect(text).toContain('Ốp lưng MagSafe');
    expect(text).toContain('Trong suốt');
    expect(text).toContain('Cửa hàng TP.HCM');
    expect(text).toContain('20');
    expect(text).toContain('17');
  });

  it('renders an immutable named movement ledger without visible raw UUIDs', () => {
    const markup = renderToStaticMarkup(
      <InventoryStockMovementsView
        locations={[STORE, WAREHOUSE]}
        movements={[MOVEMENT]}
        pagination={{ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }}
        query={{ page: 1, pageSize: 20 }}
        variants={[VARIANT]}
        onQueryChange={vi.fn()}
      />,
    );
    const text = visibleText(markup);
    expect(text).toContain('Lịch sử chỉ được ghi thêm');
    expect(text).toContain('Ốp lưng MagSafe');
    expect(text).toContain('Cửa hàng TP.HCM → Kho TP.HCM');
    expect(text).toContain('Nguyễn Kỹ Thuật');
    expect(text).toContain('Đơn giao hàng');
    expect(text).not.toContain(VARIANT_ID);
    expect(text).not.toContain(STORE_ID);
    expect(text).not.toContain(WAREHOUSE_ID);
    expect(text).not.toContain(MOVEMENT.referenceId ?? 'missing');
    expect(text).not.toContain('Giá vốn');
    expect(text).not.toContain('Chi phí nhập');
    expect(markup).not.toContain('acquisitionCost');
    expect(markup).not.toContain('additionalCost');
    expect(markup).not.toContain('>Sửa<');
    expect(markup).not.toContain('>Xóa<');
  });

  it('keeps stock rows visible while only the requested result area refreshes', () => {
    const markup = renderToStaticMarkup(
      <InventoryStockView
        levels={[LEVEL]}
        loading
        locations={[STORE, WAREHOUSE]}
        pagination={{ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }}
        query={{ page: 1, pageSize: 20 }}
        variants={[VARIANT]}
        onCommand={vi.fn().mockResolvedValue({ ok: true })}
        onQueryChange={vi.fn()}
      />,
    );

    expect(visibleText(markup)).toContain('Đang đối chiếu số lượng mới nhất');
    expect(visibleText(markup)).toContain('Ốp lưng MagSafe');
    expect(visibleText(markup)).toContain('Cửa hàng TP.HCM');
  });

  it('keeps the immutable movement ledger visible during a local refresh', () => {
    const markup = renderToStaticMarkup(
      <InventoryStockMovementsView
        loading
        locations={[STORE, WAREHOUSE]}
        movements={[MOVEMENT]}
        pagination={{ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }}
        query={{ page: 1, pageSize: 20 }}
        variants={[VARIANT]}
        onQueryChange={vi.fn()}
      />,
    );

    expect(visibleText(markup)).toContain('Đang cập nhật lịch sử');
    expect(visibleText(markup)).toContain('Cửa hàng TP.HCM → Kho TP.HCM');
    expect(markup).toContain('aria-busy="true"');
  });
});

function visibleText(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
