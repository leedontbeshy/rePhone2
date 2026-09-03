import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { Checkbox, FilePicker, Input, RadioCard, RadioGroup, Select, Textarea } from './field';
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

  it('describes select validation without losing caller context', () => {
    const markup = renderToStaticMarkup(
      <Select
        aria-describedby="stock-context"
        error="Chọn địa điểm nhận"
        hint="Chỉ hiện địa điểm đang hoạt động"
        id="stock-location"
        label="Địa điểm nhận"
        required
      >
        <option value="">Chọn địa điểm</option>
      </Select>,
    );

    expect(markup).toContain(
      'aria-describedby="stock-context stock-location-hint stock-location-error"',
    );
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('<select');
    expect(markup).toContain('required=""');
  });

  it('describes textarea validation and keeps the entered value', () => {
    const markup = renderToStaticMarkup(
      <Textarea
        aria-describedby="reason-context"
        error="Ghi chú cần ít nhất 5 ký tự"
        hint="Mô tả ngắn gọn tình trạng"
        id="support-reason"
        label="Ghi chú"
        required
        value="Máy lỗi"
        readOnly
      />,
    );

    expect(markup).toContain(
      'aria-describedby="reason-context support-reason-hint support-reason-error"',
    );
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('>Máy lỗi</textarea>');
  });

  it('associates checkbox description and validation with its native control', () => {
    const markup = renderToStaticMarkup(
      <Checkbox
        aria-describedby="policy-context"
        description="Xác nhận đã kiểm tra thông tin"
        error="Cần xác nhận trước khi tiếp tục"
        id="policy-confirmation"
        label="Tôi xác nhận"
        required
      />,
    );

    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain(
      'aria-describedby="policy-context policy-confirmation-hint policy-confirmation-error"',
    );
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('required=""');
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

  it('gives custom file pickers a native focus target and descriptive state', () => {
    const markup = renderToStaticMarkup(
      <FilePicker
        accept="image/jpeg,image/png"
        aria-describedby="upload-context"
        error="Ảnh không hợp lệ"
        errorRole="alert"
        hint="Dùng ảnh JPG hoặc PNG"
        id="product-image"
        label="Ảnh sản phẩm"
        required
        selectedFileName="iphone-15-mat-truoc.png"
      />,
    );

    expect(markup).toContain('type="file"');
    expect(markup).toContain('data-rp-file-picker-control="true"');
    expect(markup).toContain('accept="image/jpeg,image/png"');
    expect(markup).toContain(
      'aria-describedby="upload-context product-image-hint product-image-error"',
    );
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('required=""');
    expect(markup).toContain('iphone-15-mat-truoc.png');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('role="alert"');
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
