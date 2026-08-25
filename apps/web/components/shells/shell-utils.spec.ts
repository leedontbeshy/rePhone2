import { describe, expect, it } from 'vitest';
import { joinClassNames, navigationAccessibleLabel } from './shell-utils';

describe('shell utilities', () => {
  it('keeps optional CSS module classes out of rendered class names', () => {
    expect(joinClassNames('shell', undefined, '', 'content')).toBe('shell content');
  });

  it('gives a navigation badge an explicit Vietnamese accessible label', () => {
    expect(navigationAccessibleLabel({ href: '/cart', label: 'Giỏ hàng', badgeCount: 2 })).toBe(
      'Giỏ hàng, 2 mục',
    );
  });

  it('lets an unbadged navigation link use its visible label', () => {
    expect(navigationAccessibleLabel({ href: '/products', label: 'Sản phẩm' })).toBeUndefined();
  });
});
