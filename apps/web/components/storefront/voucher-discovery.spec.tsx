import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/auth-provider', () => ({
  useAuth: () => ({
    client: { GET: vi.fn() },
    status: 'loading',
    user: null,
  }),
}));

import { VoucherDiscovery, voucherDiscoveryView } from './voucher-discovery';

describe('storefront voucher discovery states', () => {
  it('server-renders a real reload link when the initial provider request fails', () => {
    const markup = renderToStaticMarkup(<VoucherDiscovery initialResponse={null} page={2} />);

    expect(markup).toContain('Chưa tải được ưu đãi');
    expect(markup).toContain('href="/vouchers?page=2"');
    expect(markup).toContain('>Tải lại</a>');
    expect(markup).not.toContain('Đang tải ưu đãi');
    expect(markup).not.toContain('<button');
  });

  it('keeps loading, error, and preserved-content states mutually exclusive', () => {
    expect(voucherDiscoveryView({ error: true, hasResponse: false, loading: false })).toBe('error');
    expect(voucherDiscoveryView({ error: false, hasResponse: false, loading: true })).toBe(
      'loading',
    );
    expect(voucherDiscoveryView({ error: false, hasResponse: true, loading: true })).toBe(
      'ready',
    );
  });
});
