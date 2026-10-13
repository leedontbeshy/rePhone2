import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StorefrontFooter } from './storefront-footer';
import { STOREFRONT_NAVIGATION } from './storefront-navigation';

describe('storefront footer v2', () => {
  it('keeps the five public destinations in a compact server-rendered footer', () => {
    const markup = renderToStaticMarkup(<StorefrontFooter />);
    expect(markup).toContain('aria-label="Điều hướng chân trang"');
    for (const item of STOREFRONT_NAVIGATION) {
      expect(markup).toContain(`>${item.label}</a>`);
      expect(markup).toContain(`href="${item.href.replaceAll('&', '&amp;')}"`);
    }
    expect(markup).toContain('rePhone');
    expect(markup).toContain('Tất cả quyền được bảo lưu.');
    expect(markup).not.toContain('footer-contact-heading');
    expect(markup).not.toContain('bankAccountNumber');
    expect(markup).not.toContain('objectPath');
  });

  it('keeps public contact reachable without a contact provider or session', () => {
    const markup = renderToStaticMarkup(<StorefrontFooter />);
    expect(markup).toContain('href="/store"');
    expect(markup).toContain('>Liên hệ</a>');
    expect(markup).toContain('href="/vouchers"');
    expect(markup).not.toContain('mailto:');
    expect(markup).not.toContain('tel:');
  });
});
