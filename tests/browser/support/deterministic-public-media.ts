import { readFile } from 'node:fs/promises';
import type { BrowserContext, Page, Route } from '@playwright/test';

const PUBLIC_MEDIA_GLOB = 'https://example.supabase.co/storage/v1/object/public/**';

const demoAssets = {
  'cap-usb-c-to-lightning.png': new URL(
    '../../../apps/api/prisma/demo-assets/catalog/cap-usb-c-to-lightning.png',
    import.meta.url,
  ),
  'cu-sac-usb-c-20w.png': new URL(
    '../../../apps/api/prisma/demo-assets/catalog/cu-sac-usb-c-20w.png',
    import.meta.url,
  ),
  'iphone-13.png': new URL(
    '../../../apps/api/prisma/demo-assets/catalog/iphone-13.png',
    import.meta.url,
  ),
  'iphone-14-pro.png': new URL(
    '../../../apps/api/prisma/demo-assets/catalog/iphone-14-pro.png',
    import.meta.url,
  ),
  'iphone-15-pro-max.png': new URL(
    '../../../apps/api/prisma/demo-assets/catalog/iphone-15-pro-max.png',
    import.meta.url,
  ),
  'op-lung-magsafe.png': new URL(
    '../../../apps/api/prisma/demo-assets/catalog/op-lung-magsafe.png',
    import.meta.url,
  ),
} as const;

type DemoAssetName = keyof typeof demoAssets;
type RouteOwner = Pick<Page, 'route'> | Pick<BrowserContext, 'route'>;

export async function installDeterministicPublicMedia(owner: RouteOwner): Promise<void> {
  await owner.route(PUBLIC_MEDIA_GLOB, fulfillDemoMedia);
}

async function fulfillDemoMedia(route: Route): Promise<void> {
  const assetName = assetForPublicObject(route.request().url());
  await route.fulfill({
    status: 200,
    contentType: 'image/png',
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    body: await readFile(demoAssets[assetName]),
  });
}

function assetForPublicObject(rawUrl: string): DemoAssetName {
  const path = decodeURIComponent(new URL(rawUrl).pathname).toLowerCase();

  if (path.includes('iphone-15-pro-max') || path.includes('ip15pm-')) {
    return 'iphone-15-pro-max.png';
  }
  if (path.includes('iphone-14-pro') || path.includes('ip14p-')) {
    return 'iphone-14-pro.png';
  }
  if (path.includes('iphone-13') || path.includes('ip13-')) {
    return 'iphone-13.png';
  }
  if (path.includes('cap-usb-c-to-lightning') || path.includes('acc-cable-usbc-ltg')) {
    return 'cap-usb-c-to-lightning.png';
  }
  if (path.includes('cu-sac-usb-c-20w') || path.includes('acc-charger-usbc-20w')) {
    return 'cu-sac-usb-c-20w.png';
  }
  if (path.includes('op-lung-magsafe') || path.includes('acc-case-magsafe')) {
    return 'op-lung-magsafe.png';
  }

  throw new Error(`No deterministic demo asset mapped for public media URL ${rawUrl}`);
}
