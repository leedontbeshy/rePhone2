import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AuthShell } from './auth-shell';
import { BackofficeShell } from './backoffice-shell';
import { StorefrontShell } from './storefront-shell';

describe('frontend surface shell accessibility contracts', () => {
  it('renders storefront landmarks, a skip target and current navigation state', () => {
    const markup = renderToStaticMarkup(
      <StorefrontShell
        footer={<span>Thông tin cửa hàng</span>}
        headerActions={<button type="button">Tài khoản</button>}
        mobileNavigation={<button type="button">Mở menu</button>}
        navigation={[
          { href: '/products', label: 'Sản phẩm', isCurrent: true },
          { href: '/cart', label: 'Giỏ hàng', badgeCount: 2 },
        ]}
      >
        <h1>Danh mục</h1>
      </StorefrontShell>,
    );

    expect(markup).toContain('href="#main-content"');
    expect(markup).toContain('<nav');
    expect(markup).toContain('aria-label="Điều hướng chính"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('aria-label="Giỏ hàng, 2 mục"');
    expect(markup).toContain('Mở menu');
    expect(markup).toContain('<main id="main-content"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('<footer');
  });

  it('keeps the authentication title associated with its main panel', () => {
    const markup = renderToStaticMarkup(
      <AuthShell title="Đăng nhập" description="Tiếp tục với tài khoản của bạn">
        <form aria-label="Biểu mẫu đăng nhập" />
      </AuthShell>,
    );

    expect(markup).toContain('aria-labelledby="main-content-title"');
    expect(markup).toContain('<h1 id="main-content-title"');
    expect(markup).toContain('aria-label="Biểu mẫu đăng nhập"');
  });

  it('renders distinct backoffice navigation and breadcrumb landmarks', () => {
    const markup = renderToStaticMarkup(
      <BackofficeShell
        breadcrumbs={[{ href: '/backoffice/orders', label: 'Đơn hàng' }, { label: 'Chi tiết' }]}
        navigationGroups={[
          {
            label: 'Vận hành',
            items: [{ href: '/backoffice/orders', label: 'Đơn hàng', isCurrent: true }],
          },
        ]}
      >
        <h1>Chi tiết đơn hàng</h1>
      </BackofficeShell>,
    );

    expect(markup).toContain('<aside');
    expect(markup).toContain('aria-label="Điều hướng backoffice"');
    expect(markup).toContain('aria-label="Các khu vực vận hành"');
    expect(markup).toContain('aria-label="Đường dẫn"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('<main id="main-content"');
  });
});
