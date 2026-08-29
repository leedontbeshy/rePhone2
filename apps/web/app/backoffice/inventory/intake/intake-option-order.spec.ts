import { describe, expect, it } from 'vitest';
import { orderIphoneProducts, orderIphoneVariants } from './intake-option-order';

describe('inventory intake option ordering', () => {
  it('shows newer releases first and applies the agreed family order', () => {
    const products = [
      { id: '15', name: 'iPhone 15', releaseYear: 2023 },
      { id: '16-mini', name: 'iPhone 16 mini', releaseYear: 2024 },
      { id: '16', name: 'iPhone 16', releaseYear: 2024 },
      { id: '16e', name: 'iPhone 16e', releaseYear: 2024 },
      { id: '16-plus', name: 'iPhone 16 Plus', releaseYear: 2024 },
      { id: '16-pro', name: 'iPhone 16 Pro', releaseYear: 2024 },
      { id: '16-pro-max', name: 'iPhone 16 Pro Max', releaseYear: 2024 },
      { id: 'se', name: 'iPhone SE', releaseYear: 2022 },
    ];

    expect(orderIphoneProducts(products).map(({ id }) => id)).toEqual([
      '16-pro-max',
      '16-pro',
      '16-plus',
      '16',
      '16e',
      '16-mini',
      '15',
      'se',
    ]);
    expect(products[0]?.id).toBe('15');
  });

  it('falls back to the model generation when release years are absent', () => {
    expect(
      orderIphoneProducts([
        { name: 'iPhone 15' },
        { name: 'iPhone X' },
        { name: 'iPhone 17 Pro' },
      ]).map(({ name }) => name),
    ).toEqual(['iPhone 17 Pro', 'iPhone 15', 'iPhone X']);
  });

  it('orders configurations by storage and then by color without mutating the source', () => {
    const variants = [
      {
        id: 'no-storage',
        displayName: 'Cấu hình đặc biệt',
        sku: 'SPECIAL',
        colorName: 'Đen',
        storageCapacityGb: null,
      },
      {
        id: '256-blue',
        displayName: '256 GB · Xanh',
        sku: '256-BLUE',
        colorName: 'Xanh',
        storageCapacityGb: 256,
      },
      {
        id: '128-white',
        displayName: '128 GB · Trắng',
        sku: '128-WHITE',
        colorName: 'Trắng',
        storageCapacityGb: 128,
      },
      {
        id: '128-black',
        displayName: '128 GB · Đen',
        sku: '128-BLACK',
        colorName: 'Đen',
        storageCapacityGb: 128,
      },
      {
        id: '1tb',
        displayName: '1 TB · Titan',
        sku: '1TB-TITAN',
        colorName: 'Titan',
        storageCapacityGb: null,
      },
    ];

    expect(orderIphoneVariants(variants).map(({ id }) => id)).toEqual([
      '128-black',
      '128-white',
      '256-blue',
      '1tb',
      'no-storage',
    ]);
    expect(variants[0]?.id).toBe('no-storage');
  });
});
