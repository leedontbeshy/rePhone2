import type { PublicMedia } from '@/lib/catalog-api';

/** Selected model illustrations; never use for exact-unit galleries or checkout line photos. */
const MODEL_STUDIO_ART: Readonly<Record<string, PublicMedia>> = {
  'iphone-18': {
    url: '/ui-studio/model-iphone-18-studio.webp',
    width: 1536,
    height: 1024,
    altText: 'Ảnh minh họa dòng iPhone 18 Pro',
  },
  'iphone-18-pro': {
    url: '/ui-studio/model-iphone-18-studio.webp',
    width: 1536,
    height: 1024,
    altText: 'Ảnh minh họa dòng iPhone 18 Pro',
  },
  'iphone-18-pro-max': {
    url: '/ui-studio/model-iphone-18-studio.webp',
    width: 1536,
    height: 1024,
    altText: 'Ảnh minh họa dòng iPhone 18 Pro Max',
  },
  'iphone-17': {
    url: '/ui-studio/model-iphone-17-studio.webp',
    width: 1536,
    height: 1024,
    altText: 'Ảnh minh họa dòng iPhone 17',
  },
  'iphone-16': {
    url: '/ui-studio/model-iphone-16-studio.webp',
    width: 1774,
    height: 887,
    altText: 'Ảnh minh họa dòng iPhone 16',
  },
  'iphone-15': {
    url: '/ui-studio/model-iphone-15-studio.webp',
    width: 1817,
    height: 866,
    altText: 'Ảnh minh họa dòng iPhone 15',
  },
};

export function modelStudioArt(slug: string): PublicMedia | undefined {
  return Object.hasOwn(MODEL_STUDIO_ART, slug) ? MODEL_STUDIO_ART[slug] : undefined;
}

/** The panorama has its own three-device composition; the home keeps its bento artwork. */
export function modelBannerArt(slug: string): PublicMedia | undefined {
  return slug === 'iphone-17'
    ? {
        url: '/ui-studio/model-iphone-17-banner.webp',
        width: 1536,
        height: 1024,
        altText: 'Ảnh minh họa dòng iPhone 17',
      }
    : undefined;
}
