import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { Input, RadioCard, RadioGroup } from './field';
import { ErrorSummary } from './feedback';
import { Link } from './link';

describe('frontend primitive accessibility contracts', () => {
  it('announces loading buttons without exposing duplicate spinner content', () => {
    const markup = renderToStaticMarkup(<Button loading>Đặt hàng</Button>);

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('aria-label="Đang xử lý"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('merges caller, hint and error descriptions on form controls', () => {
    const markup = renderToStaticMarkup(
      <Input
        aria-describedby="contact-context"
        error="Email chưa hợp lệ"
        hint="Dùng email nhận thông báo"
        id="email"
        label="Email"
        required
      />,
    );

    expect(markup).toContain('aria-describedby="contact-context email-hint email-error"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('required=""');
    expect(markup).toContain('(bắt buộc)');
  });

  it('groups radio options with a required legend and descriptive error', () => {
    const markup = renderToStaticMarkup(
      <RadioGroup error="Chọn cách nhận hàng" id="fulfillment" legend="Cách nhận hàng" required>
        <RadioCard id="pickup" label="Nhận tại cửa hàng" name="fulfillment" value="PICKUP" />
      </RadioGroup>,
    );

    expect(markup).toContain('<fieldset');
    expect(markup).toContain('<legend');
    expect(markup).toContain('aria-describedby="fulfillment-error"');
    expect(markup).toContain('aria-invalid="true"');
  });

  it('keeps error summaries programmatically focusable and links to fields', () => {
    const markup = renderToStaticMarkup(
      <ErrorSummary errors={[{ href: '#email', message: 'Kiểm tra email' }]} id="form-errors" />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('href="#email"');
  });

  it('supports standalone links with a full control-height target', () => {
    const markup = renderToStaticMarkup(
      <Link href="/products" standalone>
        Xem sản phẩm
      </Link>,
    );

    expect(markup).toContain('href="/products"');
    expect(markup).toContain('linkStandalone');
  });
});
