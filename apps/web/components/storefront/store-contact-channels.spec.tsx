import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StorePage from '@/app/(storefront)/store/page';
import { getPublicStore } from '@/lib/public-store-api';
import { getStorefrontFooterConfig } from '@/lib/storefront-footer-config';
import { StoreContactChannels } from './store-contact-channels';

vi.mock('@/lib/public-store-api', () => ({ getPublicStore: vi.fn() }));

describe('configured store contact channels', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it('renders normalized configured email and allowlisted HTTPS social links safely', () => {
    const config = getStorefrontFooterConfig({
      NODE_ENV: 'production',
      NEXT_PUBLIC_STORE_EMAIL: ' Support@rePhone.vn ',
      NEXT_PUBLIC_SOCIAL_FACEBOOK_URL: 'https://www.facebook.com/rephone.vn',
      NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL: 'https://www.instagram.com/rephone.vn',
    });
    const markup = renderToStaticMarkup(<StoreContactChannels config={config} />);
    expect(markup).toContain('href="mailto:support@rephone.vn"');
    expect(markup).toContain('href="https://www.facebook.com/rephone.vn"');
    expect(markup).toContain('href="https://www.instagram.com/rephone.vn"');
    expect(markup.match(/target="_blank" rel="noopener noreferrer"/g)).toHaveLength(2);
    expect(markup).not.toContain('TikTok');
  });

  it('omits the panel when production config is empty or unsafe', () => {
    const config = getStorefrontFooterConfig({
      NODE_ENV: 'production',
      NEXT_PUBLIC_STORE_EMAIL: 'invalid',
      NEXT_PUBLIC_SOCIAL_FACEBOOK_URL: 'http://facebook.com/rephone',
      NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL: 'https://user:secret@instagram.com/rephone',
      NEXT_PUBLIC_SOCIAL_TIKTOK_URL: 'https://example.com/@rephone',
    });
    expect(renderToStaticMarkup(<StoreContactChannels config={config} />)).toBe('');
    expect(
      renderToStaticMarkup(
        <StoreContactChannels config={getStorefrontFooterConfig({ NODE_ENV: 'production' })} />,
      ),
    ).toBe('');
  });

  it('keeps configured contact channels available when the store provider fails', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_STORE_EMAIL', 'support@rephone.vn');
    vi.stubEnv('NEXT_PUBLIC_SOCIAL_FACEBOOK_URL', 'https://facebook.com/rephone.vn');
    vi.mocked(getPublicStore).mockRejectedValue(new Error('Store temporarily unavailable'));
    const markup = renderToStaticMarkup(await StorePage());
    expect(markup).toContain('href="mailto:support@rephone.vn"');
    expect(markup).toContain('href="https://facebook.com/rephone.vn"');
    expect(markup).toContain('Thông tin cửa hàng');
    expect(markup).not.toContain('Store temporarily unavailable');
  });
});
