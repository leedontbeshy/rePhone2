export interface DemoCatalogAsset {
  fileName: string;
  mimeType: 'image/png';
  width: number;
  height: number;
  fileSize: number;
}

export const DEMO_CATALOG_ASSETS = {
  'iphone-13': pngAsset('iphone-13.png', 1_421_042),
  'iphone-14-pro': pngAsset('iphone-14-pro.png', 1_109_472),
  'iphone-15-pro-max': pngAsset('iphone-15-pro-max.png', 1_611_610),
  'cap-usb-c-to-lightning': pngAsset('cap-usb-c-to-lightning.png', 995_625),
  'op-lung-magsafe': pngAsset('op-lung-magsafe.png', 963_647),
  'cu-sac-usb-c-20w': pngAsset('cu-sac-usb-c-20w.png', 1_052_281),
} satisfies Record<string, DemoCatalogAsset>;

export type DemoCatalogAssetKey = keyof typeof DEMO_CATALOG_ASSETS;

export interface DemoCatalogUpload {
  objectPath: string;
  assetKey: DemoCatalogAssetKey;
}

export const DEMO_CATALOG_UPLOADS: readonly DemoCatalogUpload[] = [
  ...Object.keys(DEMO_CATALOG_ASSETS).map((assetKey) => ({
    objectPath: `demo/catalog/products/${assetKey}.png`,
    assetKey: assetKey as DemoCatalogAssetKey,
  })),
  {
    objectPath: 'demo/catalog/variants/acc-cable-usbc-ltg-1m.png',
    assetKey: 'cap-usb-c-to-lightning',
  },
  {
    objectPath: 'demo/catalog/variants/acc-case-magsafe-clr.png',
    assetKey: 'op-lung-magsafe',
  },
  {
    objectPath: 'demo/catalog/variants/acc-charger-usbc-20w.png',
    assetKey: 'cu-sac-usb-c-20w',
  },
  {
    objectPath: 'demo/catalog/units/ip13-mid-001.png',
    assetKey: 'iphone-13',
  },
  {
    objectPath: 'demo/catalog/units/ip13-blu-001.png',
    assetKey: 'iphone-13',
  },
  {
    objectPath: 'demo/catalog/units/ip14p-128-001.png',
    assetKey: 'iphone-14-pro',
  },
  {
    objectPath: 'demo/catalog/units/ip14p-256-001.png',
    assetKey: 'iphone-14-pro',
  },
  {
    objectPath: 'demo/catalog/units/ip15pm-256-001.png',
    assetKey: 'iphone-15-pro-max',
  },
];

export const LEGACY_DEMO_CATALOG_OBJECT_PATHS = DEMO_CATALOG_UPLOADS.map(({ objectPath }) =>
  objectPath.replace(/\.png$/, '.svg'),
);

function pngAsset(fileName: string, fileSize: number): DemoCatalogAsset {
  return {
    fileName,
    mimeType: 'image/png',
    width: 1254,
    height: 1254,
    fileSize,
  };
}
