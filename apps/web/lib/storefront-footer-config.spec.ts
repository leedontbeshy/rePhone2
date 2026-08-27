import { describe, expect, it } from 'vitest';
import { getStorefrontFooterConfig } from './storefront-footer-config';

describe('storefront footer public configuration', () => {
  it('normalizes the public email and allowlisted HTTPS social profiles', () => {
    expect(
      getStorefrontFooterConfig({
        NEXT_PUBLIC_STORE_EMAIL: ' Hello@rePhone.vn ',
        NEXT_PUBLIC_SOCIAL_FACEBOOK_URL: 'https://www.facebook.com/rephone.vn',
        NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL: 'https://instagram.com/rephone.vn',
        NEXT_PUBLIC_SOCIAL_TIKTOK_URL: 'https://www.tiktok.com/@rephone.vn',
      }),
    ).toEqual({
      email: 'hello@rephone.vn',
      socialLinks: [
        {
          href: 'https://www.facebook.com/rephone.vn',
          label: 'Facebook',
          platform: 'FACEBOOK',
        },
        {
          href: 'https://instagram.com/rephone.vn',
          label: 'Instagram',
          platform: 'INSTAGRAM',
        },
        {
          href: 'https://www.tiktok.com/@rephone.vn',
          label: 'TikTok',
          platform: 'TIKTOK',
        },
      ],
    });
  });

  it('omits malformed, credentialed, non-HTTPS and mismatched social URLs', () => {
    expect(
      getStorefrontFooterConfig({
        NEXT_PUBLIC_STORE_EMAIL: 'not-an-email',
        NEXT_PUBLIC_SOCIAL_FACEBOOK_URL: 'http://facebook.com/rephone',
        NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL: 'https://user:secret@instagram.com/rephone',
        NEXT_PUBLIC_SOCIAL_TIKTOK_URL: 'https://example.com/@rephone',
      }),
    ).toEqual({ email: null, socialLinks: [] });
  });

  it('uses demo profiles only in development and never as a production fallback', () => {
    expect(getStorefrontFooterConfig({ NODE_ENV: 'development' })).toMatchObject({
      email: 'hello@rephone.vn',
      socialLinks: [{ platform: 'FACEBOOK' }, { platform: 'INSTAGRAM' }, { platform: 'TIKTOK' }],
    });
    expect(getStorefrontFooterConfig({ NODE_ENV: 'production' })).toEqual({
      email: null,
      socialLinks: [],
    });
  });
});
