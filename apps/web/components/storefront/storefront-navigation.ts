export const STOREFRONT_NAVIGATION = [
  { href: '/', label: 'iPhone' },
  { href: '/products?productType=ACCESSORY&inStock=true', label: 'Phụ kiện' },
  { href: '/products?productType=IPHONE&inStock=true', label: 'Máy đang bán' },
  { href: '/vouchers', label: 'Voucher' },
  { href: '/store', label: 'Cửa hàng' },
] as const;
