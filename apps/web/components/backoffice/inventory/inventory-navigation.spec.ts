import { describe, expect, it } from 'vitest';
import {
  canAccessInventoryWorkspace,
  canViewInventoryCost,
  INVENTORY_STOCK_MOVEMENTS_ROOT,
  INVENTORY_STOCK_ROOT,
  INVENTORY_UNITS_ROOT,
  inventoryNavigationForPath,
} from './inventory-navigation';

describe('FE-06 inventory navigation', () => {
  it('provides the six Vietnamese workspace destinations in their agreed order', () => {
    expect(inventoryNavigationForPath(INVENTORY_UNITS_ROOT)).toMatchObject([
      { label: 'Máy vật lý', href: '/backoffice/inventory/units', icon: 'devices' },
      { label: 'Nhập máy', href: '/backoffice/inventory/intake', icon: 'intake' },
      { label: 'Tra cứu mã', href: '/backoffice/inventory/lookup', icon: 'lookup' },
      { label: 'Tồn phụ kiện', href: '/backoffice/inventory/stock', icon: 'stock' },
      {
        label: 'Lịch sử kho',
        href: '/backoffice/inventory/stock/movements',
        icon: 'movements',
      },
      { label: 'Địa điểm', href: '/backoffice/inventory/locations', icon: 'locations' },
    ]);
  });

  it('keeps unit details and inspection details under the physical-unit destination', () => {
    const unitItems = inventoryNavigationForPath('/backoffice/inventory/units/unit-id');
    const inspectionItems = inventoryNavigationForPath(
      '/backoffice/inventory/inspections/inspection-id',
    );

    expect(unitItems.find((item) => item.href === INVENTORY_UNITS_ROOT)?.isCurrent).toBe(true);
    expect(inspectionItems.find((item) => item.href === INVENTORY_UNITS_ROOT)?.isCurrent).toBe(
      true,
    );
  });

  it('does not mark stock overview current while viewing the movement ledger', () => {
    const items = inventoryNavigationForPath(INVENTORY_STOCK_MOVEMENTS_ROOT);

    expect(items.find((item) => item.href === INVENTORY_STOCK_ROOT)?.isCurrent).toBe(false);
    expect(items.find((item) => item.href === INVENTORY_STOCK_MOVEMENTS_ROOT)?.isCurrent).toBe(
      true,
    );
  });

  it('allows employees and administrators into inventory while cost remains admin-only', () => {
    expect(canAccessInventoryWorkspace('EMPLOYEE')).toBe(true);
    expect(canAccessInventoryWorkspace('ADMIN')).toBe(true);
    expect(canAccessInventoryWorkspace('CUSTOMER')).toBe(false);
    expect(canAccessInventoryWorkspace(null)).toBe(false);
    expect(canViewInventoryCost('EMPLOYEE')).toBe(false);
    expect(canViewInventoryCost('ADMIN')).toBe(true);
  });
});
