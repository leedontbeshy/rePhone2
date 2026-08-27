import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PublicStore } from '@/lib/public-store-api';
import { StoreSummary, StoreUnavailable } from './store-summary';

const store = {
  currency: 'VND',
  pickup: {
    address: 'Kho pickup, TP.HCM',
    holdMinutes: 90,
    locationName: 'Điểm nhận Quận 1',
  },
  storeAddress: '123 Nguyễn Văn A, TP.HCM',
  storeName: 'rePhone',
  storePhone: '(028) 1234 5678',
  timezone: 'Asia/Ho_Chi_Minh',
} satisfies PublicStore;

describe('public store summary', () => {
  it('renders only the public contact and pickup projection', () => {
    const markup = renderToStaticMarkup(<StoreSummary store={store} />);

    expect(markup).toContain('<h2>rePhone</h2>');
    expect(markup).toContain('href="tel:02812345678"');
    expect(markup).toContain('Điểm nhận Quận 1');
    expect(markup).toContain('90 phút');
    expect(markup).not.toContain('bank');
    expect(markup).not.toContain('version');
  });

  it('uses a subordinate heading in the compact home variant', () => {
    const markup = renderToStaticMarkup(<StoreSummary store={store} compact />);
    expect(markup).toContain('<h3>rePhone</h3>');
    expect(markup).toContain('Xem thông tin cửa hàng');
  });

  it('provides recovery actions without leaking provider details', () => {
    const markup = renderToStaticMarkup(<StoreUnavailable />);
    expect(markup).toContain('Cửa hàng đang tạm không khả dụng');
    expect(markup).toContain('href="/store"');
    expect(markup).toContain('href="/products"');
  });
});
