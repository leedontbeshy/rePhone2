import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { validateCheckoutForm, type CheckoutFormData } from './checkout-experience';

const validForm: CheckoutFormData = {
  fullName: 'Nguyễn Minh Anh',
  email: 'minh.anh@example.com',
  phone: '090 123 4567',
  receiverName: 'Nguyễn Minh Anh',
  receiverPhone: '090 123 4567',
  addressLine: '25 Nguyễn Huệ',
  ward: 'Phường Sài Gòn',
  district: 'Quận 1',
  province: 'TP. Hồ Chí Minh',
  postalCode: '',
  customerNote: '',
};

describe('validateCheckoutForm', () => {
  it('requires shipping fields for home delivery', () => {
    const errors = validateCheckoutForm({ ...validForm, addressLine: '' }, 'SHIPPING');
    expect(errors.addressLine).toBeDefined();
  });

  it('omits shipping field validation for store collection', () => {
    const errors = validateCheckoutForm(
      {
        ...validForm,
        receiverName: '',
        receiverPhone: '',
        addressLine: '',
        ward: '',
        district: '',
        province: '',
      },
      'PICKUP',
    );
    expect(errors).toEqual({});
  });

  it('rejects invalid contact details', () => {
    const errors = validateCheckoutForm({ ...validForm, email: 'invalid', phone: '123' }, 'PICKUP');
    expect(errors.email).toBeDefined();
    expect(errors.phone).toBeDefined();
  });

  it('keeps customer-facing validation copy free of implementation terms', () => {
    const markup = renderToStaticMarkup(
      <p>{Object.values(validateCheckoutForm({ ...validForm, email: '' }, 'PICKUP')).join(' ')}</p>,
    );
    expect(markup).not.toMatch(/token|cookie|localStorage|checkout|catalog|session/i);
  });
});
