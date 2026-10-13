import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UnitColorOptions } from './unit-color-options';

describe('exact-unit color context', () => {
  it('keeps the purchased unit color authoritative when no related offer represents it', () => {
    const markup = renderToStaticMarkup(
      <UnitColorOptions
        currentVariantId="current"
        currentColorName="Space Black"
        offers={[]}
        productSlug="iphone-14-pro"
      />,
    );
    expect(markup).toContain('Space Black');
    expect(markup).not.toContain('Theo máy');
    expect(markup).not.toContain('<select');
    expect(markup).not.toContain('role="radio"');
  });
});
