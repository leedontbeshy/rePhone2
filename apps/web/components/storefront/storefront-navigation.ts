export const STOREFRONT_NAVIGATION = [
  { href: '/', label: 'iPhone' },
  { href: '/products?productType=ACCESSORY&inStock=true', label: 'Phụ kiện' },
  { href: '/products?productType=IPHONE&inStock=true', label: 'Máy đang bán' },
  { href: '/vouchers', label: 'Ưu đãi' },
  { href: '/store', label: 'Cửa hàng' },
] as const;

export function isStorefrontNavigationCurrent(
  href: string,
  pathname: string,
  currentSearch = '',
): boolean {
  const queryIndex = href.indexOf('?');
  const targetPath = queryIndex === -1 ? href : href.slice(0, queryIndex);
  if (targetPath === '/') return pathname === '/';
  if (targetPath === '/products') {
    if (pathname !== targetPath || queryIndex === -1) return false;
    const targetParams = new URLSearchParams(href.slice(queryIndex + 1));
    const currentParams = new URLSearchParams(currentSearch);
    return [...targetParams.entries()].every(([key, value]) => currentParams.get(key) === value);
  }
  return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}
