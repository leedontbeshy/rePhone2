import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/auth-provider', () => ({
  useAuth: () => ({
    client: { GET: vi.fn() },
    status: 'loading',
    user: null,
  }),
}));

import type { PublicVoucherListResponse } from '@/lib/public-voucher-api';
import {
  canRetryVouchersInPlace,
  VoucherDiscovery,
  voucherAccountNote,
  voucherDiscoveryView,
  voucherErrorForPage,
  voucherResponseForSession,
} from './voucher-discovery';

const publicResponse = {
  data: [],
  meta: { pagination: { page: 1, pageSize: 12, total: 0, totalPages: 0 } },
} as unknown as PublicVoucherListResponse;

const accountResponse = {
  data: [{ code: 'ACCOUNT-ONLY' }],
  meta: { pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 } },
} as unknown as PublicVoucherListResponse;

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
    expect(voucherDiscoveryView({ error: false, hasResponse: true, loading: true })).toBe('ready');
  });

  it('drops account-scoped data immediately when the customer changes or logs out', () => {
    const state = { ownerId: 'customer-a', page: 1, response: accountResponse };

    expect(
      voucherResponseForSession(state, {
        customerId: 'customer-a',
        initialResponse: publicResponse,
        page: 1,
      }),
    ).toBe(accountResponse);
    expect(
      voucherResponseForSession(state, {
        customerId: 'customer-b',
        initialResponse: publicResponse,
        page: 1,
      }),
    ).toBe(publicResponse);
    expect(
      voucherResponseForSession(state, {
        customerId: null,
        initialResponse: publicResponse,
        page: 1,
      }),
    ).toBe(publicResponse);
  });

  it('uses the matching server response immediately when pagination changes', () => {
    const nextPageResponse = {
      ...publicResponse,
      meta: { pagination: { page: 2, pageSize: 12, total: 0, totalPages: 2 } },
    } as unknown as PublicVoucherListResponse;

    expect(
      voucherResponseForSession(
        { ownerId: null, page: 1, response: publicResponse },
        { customerId: null, initialResponse: nextPageResponse, page: 2 },
      ),
    ).toBe(nextPageResponse);
  });

  it('leaves the reload href active until an in-place retry can start', () => {
    expect(canRetryVouchersInPlace('loading')).toBe(false);
    expect(canRetryVouchersInPlace('anonymous')).toBe(true);
    expect(canRetryVouchersInPlace('authenticated')).toBe(true);
  });

  it('does not flash an empty state when a newly selected page failed on the server', () => {
    expect(
      voucherErrorForPage({
        error: false,
        initialResponse: null,
        page: 2,
        responsePage: 1,
      }),
    ).toBe(true);
  });

  it('only confirms account offers after an account-scoped response is ready', () => {
    expect(voucherAccountNote({ accountResponseReady: false, error: false })).toContain(
      'Đang kiểm tra',
    );
    expect(voucherAccountNote({ accountResponseReady: false, error: true })).toContain(
      'Chưa kiểm tra được',
    );
    expect(voucherAccountNote({ accountResponseReady: true, error: false })).toContain('nếu có');
  });
});
