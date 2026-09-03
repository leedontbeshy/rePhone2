import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InventoryLocationsView } from './inventory-locations-view';

describe('inventory locations read-only view', () => {
  it('keeps loaded cards visible while refreshing without exposing mutation or cost controls', () => {
    const markup = renderToStaticMarkup(
      <InventoryLocationsView
        loading
        locations={[
          {
            code: 'HCM-WH-01',
            id: '0199c9aa-a258-74c8-a35f-9cd11c562a04',
            name: 'Kho TP.HCM',
            status: 'ACTIVE',
            type: 'WAREHOUSE',
          },
        ]}
      />,
    );

    expect(markup).toContain('Kho TP.HCM');
    expect(markup).toContain('Đang tải danh sách địa điểm');
    expect(markup).not.toContain('>Sửa<');
    expect(markup).not.toContain('>Xóa<');
    expect(markup).not.toContain('acquisitionCost');
    expect(markup).not.toContain('additionalCost');
  });
});
