import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StorefrontFooter } from './storefront-footer';

const config = {
  email: 'hello@rephone.vn',
  socialLinks: [
    {
      href: 'https://www.facebook.com/rephone.vn',
      label: 'Facebook',
      platform: 'FACEBOOK',
    },
    {
      href: 'https://www.instagram.com/rephone.vn',
      label: 'Instagram',
      platform: 'INSTAGRAM',
    },
  ],
} as const;

const store = {
  storeAddress: '123 Nguyễn Văn A, TP. Hồ Chí Minh',
  storeName: 'rePhone Quận 1',
  storePhone: '(028) 1234 5678',
} as const;

describe('storefront footer', () => {
  it('renders generation discovery, public contact and safe external links', () => {
    const markup = renderToStaticMarkup(<StorefrontFooter config={config} store={store} />);

    for (const generation of ['X', '11', '12', '13', '14', '15', '16', '17']) {
      expect(markup).toContain(`q=iPhone+${generation}`);
      expect(markup).toContain(`>iPhone ${generation}</a>`);
    }
    expect(markup.match(/q=iPhone\+(?:X|1[1-7])/g)).toHaveLength(8);
    expect(markup).toContain('href="tel:02812345678"');
    expect(markup).toContain('href="mailto:hello@rephone.vn"');
    expect(markup).toContain('query=123+Nguy%E1%BB%85n+V%C4%83n+A%2C+TP.+H%E1%BB%93+Ch%C3%AD+Minh');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).not.toContain('objectPath');
    expect(markup).not.toContain('bankAccountNumber');
  });

  it('keeps core navigation and a store fallback when contact providers are unavailable', () => {
    const markup = renderToStaticMarkup(
      <StorefrontFooter config={{ email: null, socialLinks: [] }} store={null} />,
    );

    expect(markup).toContain('Dòng iPhone');
    expect(markup).toContain('Máy đang bán');
    expect(markup).toContain('href="/store"');
    expect(markup).toContain('Xem địa chỉ cửa hàng');
    expect(markup).not.toContain('mailto:');
  });
});
