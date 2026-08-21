'use client';

import type { components } from '@rephone/api-client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth-provider';
import { CatalogHeader, formatMoney } from '../catalog-ui';
import { useCommerce } from '../commerce-provider';
import { apiError, checkoutChangedPreview } from '../../lib/order-access';

type Preview = components['schemas']['CheckoutPreviewDto'];
type Address = components['schemas']['AddressDto'];
type Fulfillment = 'PICKUP' | 'SHIPPING';
const CSRF_HEADER = { 'X-Rephone-CSRF': '1' } as const;

export default function CheckoutPage() {
  const { client, status, user } = useAuth();
  const { cart, cartLoading, refreshCart } = useCommerce();
  const [fulfillmentType, setFulfillmentType] = useState<Fulfillment>('SHIPPING');
  const [voucherCode, setVoucherCode] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewRequired, setReviewRequired] = useState(false);
  const warningRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    receiverName: '',
    receiverPhone: '',
    addressLine: '',
    ward: '',
    district: '',
    province: '',
    postalCode: '',
    customerNote: '',
  });

  useEffect(() => {
    if (user?.role !== 'CUSTOMER') return;
    setForm((current) => ({
      ...current,
      fullName: current.fullName || user.fullName,
      email: current.email || user.email,
      phone: current.phone || user.phone || '',
    }));
    void client.GET('/api/v1/account/addresses').then((result) => {
      if (result.data !== undefined) setAddresses(result.data.data);
    });
  }, [client, user]);

  const invalidatePreview = () => {
    setPreview(null);
    setReviewRequired(false);
  };

  const requestPreview = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await client.POST('/api/v1/checkouts/preview', {
        params: { header: CSRF_HEADER },
        body: {
          fulfillmentType,
          ...(voucherCode.trim() === '' ? {} : { voucherCode: voucherCode.trim() }),
        },
      });
      if (result.data === undefined) {
        throw new Error(apiError(result.error, 'Không thể tính lại checkout.'));
      }
      setPreview(result.data.data);
      setReviewRequired(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể tính lại checkout.');
    } finally {
      setPending(false);
    }
  };

  const createOrder = async () => {
    if (preview === null) return;
    setPending(true);
    setError(null);
    setReviewRequired(false);
    try {
      const shippingAddress =
        fulfillmentType === 'SHIPPING'
          ? {
              receiverName: form.receiverName,
              phone: form.receiverPhone,
              addressLine: form.addressLine,
              ward: form.ward,
              district: form.district,
              province: form.province,
              ...(form.postalCode.trim() === '' ? {} : { postalCode: form.postalCode }),
            }
          : undefined;
      const result = await client.POST('/api/v1/checkouts', {
        params: { header: CSRF_HEADER },
        body: {
          fulfillmentType,
          contact: { fullName: form.fullName, email: form.email, phone: form.phone },
          ...(shippingAddress === undefined ? {} : { shippingAddress }),
          ...(voucherCode.trim() === '' ? {} : { voucherCode: voucherCode.trim() }),
          ...(form.customerNote.trim() === '' ? {} : { customerNote: form.customerNote }),
          expectedCartUpdatedAt: preview.cartUpdatedAt,
          expectedGrandTotal: preview.pricing.grandTotal,
          expectedDepositRequired: preview.pricing.depositRequired,
        },
      });
      if (result.data === undefined) {
        const current = checkoutChangedPreview(result.error) as Preview | undefined;
        if (current !== undefined) {
          setPreview(current);
          setReviewRequired(true);
          requestAnimationFrame(() => warningRef.current?.focus());
          return;
        }
        throw new Error(apiError(result.error, 'Không thể tạo đơn hàng.'));
      }
      await refreshCart();
      const order = result.data.data.order;
      const token = result.data.data.guestAccessToken;
      window.location.assign(
        token === undefined
          ? `/orders/${order.orderNumber}`
          : `/orders/${order.orderNumber}#token=${encodeURIComponent(token)}`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể tạo đơn hàng.');
    } finally {
      setPending(false);
    }
  };

  const chooseAddress = (id: string) => {
    const address = addresses.find((item) => item.id === id);
    if (address === undefined) return;
    setForm((current) => ({
      ...current,
      receiverName: address.receiverName,
      receiverPhone: address.phone,
      addressLine: address.addressLine,
      ward: address.ward,
      district: address.district,
      province: address.province,
      postalCode: address.postalCode ?? '',
    }));
  };

  const setField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const noCart = !cartLoading && (cart === null || cart.items.length === 0);
  return (
    <>
      <CatalogHeader />
      <main className="catalog-shell commerce-shell">
        <div className="commerce-heading">
          <p className="eyebrow">Xác nhận giá và tồn</p>
          <h1>Checkout</h1>
          <p>Preview không giữ hàng. Đơn và reservation chỉ được tạo sau lần xác nhận cuối.</p>
        </div>
        {noCart ? (
          <section className="empty-state">
            <h2>Giỏ hàng đang trống</h2>
            <Link className="button primary" href="/products">
              Chọn sản phẩm
            </Link>
          </section>
        ) : (
          <div className="checkout-layout">
            <section className="checkout-form" aria-label="Thông tin checkout">
              <fieldset>
                <legend>Phương thức nhận hàng</legend>
                <label>
                  <input
                    type="radio"
                    name="fulfillment"
                    checked={fulfillmentType === 'SHIPPING'}
                    onChange={() => {
                      setFulfillmentType('SHIPPING');
                      invalidatePreview();
                    }}
                  />{' '}
                  Giao hàng
                </label>
                <label>
                  <input
                    type="radio"
                    name="fulfillment"
                    checked={fulfillmentType === 'PICKUP'}
                    onChange={() => {
                      setFulfillmentType('PICKUP');
                      invalidatePreview();
                    }}
                  />{' '}
                  Nhận tại cửa hàng
                </label>
              </fieldset>
              <div className="checkout-fields">
                <label>
                  Họ tên
                  <input
                    value={form.fullName}
                    onChange={(event) => {
                      setField('fullName', event.target.value);
                    }}
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => {
                      setField('email', event.target.value);
                    }}
                  />
                </label>
                <label>
                  Điện thoại
                  <input
                    value={form.phone}
                    onChange={(event) => {
                      setField('phone', event.target.value);
                    }}
                  />
                </label>
              </div>
              {fulfillmentType === 'SHIPPING' ? (
                <div className="checkout-fields">
                  {status === 'authenticated' && addresses.length > 0 ? (
                    <label className="field-wide">
                      Địa chỉ đã lưu
                      <select
                        defaultValue=""
                        onChange={(event) => {
                          chooseAddress(event.target.value);
                        }}
                      >
                        <option value="" disabled>
                          Chọn để sao chép vào form
                        </option>
                        {addresses.map((address) => (
                          <option key={address.id} value={address.id}>
                            {address.label ?? address.addressLine}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label>
                    Người nhận
                    <input
                      value={form.receiverName}
                      onChange={(event) => {
                        setField('receiverName', event.target.value);
                      }}
                    />
                  </label>
                  <label>
                    SĐT người nhận
                    <input
                      value={form.receiverPhone}
                      onChange={(event) => {
                        setField('receiverPhone', event.target.value);
                      }}
                    />
                  </label>
                  <label className="field-wide">
                    Địa chỉ
                    <input
                      value={form.addressLine}
                      onChange={(event) => {
                        setField('addressLine', event.target.value);
                      }}
                    />
                  </label>
                  <label>
                    Phường/xã
                    <input
                      value={form.ward}
                      onChange={(event) => {
                        setField('ward', event.target.value);
                      }}
                    />
                  </label>
                  <label>
                    Quận/huyện
                    <input
                      value={form.district}
                      onChange={(event) => {
                        setField('district', event.target.value);
                      }}
                    />
                  </label>
                  <label>
                    Tỉnh/thành
                    <input
                      value={form.province}
                      onChange={(event) => {
                        setField('province', event.target.value);
                      }}
                    />
                  </label>
                  <label>
                    Mã bưu chính
                    <input
                      value={form.postalCode}
                      onChange={(event) => {
                        setField('postalCode', event.target.value);
                      }}
                    />
                  </label>
                </div>
              ) : null}
              <div className="checkout-fields">
                <label>
                  Voucher
                  <input
                    value={voucherCode}
                    onChange={(event) => {
                      setVoucherCode(event.target.value.toUpperCase());
                      invalidatePreview();
                    }}
                  />
                </label>
                <label className="field-wide">
                  Ghi chú
                  <textarea
                    maxLength={500}
                    value={form.customerNote}
                    onChange={(event) => {
                      setField('customerNote', event.target.value);
                    }}
                  />
                </label>
              </div>
            </section>
            <aside className="cart-summary checkout-summary">
              {reviewRequired ? (
                <div ref={warningRef} tabIndex={-1} className="commerce-alert error" role="alert">
                  Giỏ hàng hoặc tổng tiền đã đổi. Hãy kiểm tra và xác nhận lại.
                </div>
              ) : null}
              {error === null ? null : (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              {preview === null ? (
                <p>Nhấn “Tính lại” để kiểm tra một location có thể cấp toàn bộ giỏ.</p>
              ) : (
                <PreviewSummary preview={preview} />
              )}
              <button
                className="button"
                type="button"
                disabled={pending || noCart}
                onClick={() => void requestPreview()}
              >
                {pending ? 'Đang xử lý…' : 'Tính lại'}
              </button>
              <button
                className="button primary"
                type="button"
                disabled={pending || preview === null || reviewRequired}
                onClick={() => void createOrder()}
              >
                Xác nhận đặt hàng
              </button>
            </aside>
          </div>
        )}
      </main>
    </>
  );
}

function PreviewSummary({ preview }: { preview: Preview }) {
  return (
    <div className="pricing-lines">
      {preview.items.map((item) => (
        <div key={item.cartItemId}>
          <span>
            {item.target.productName} × {item.quantity}
          </span>
          <strong>{formatMoney(item.lineTotal)} ₫</strong>
        </div>
      ))}
      <div>
        <span>Tạm tính</span>
        <strong>{formatMoney(preview.pricing.subtotal)} ₫</strong>
      </div>
      <div>
        <span>Voucher</span>
        <strong>−{formatMoney(preview.pricing.voucherDiscountAmount)} ₫</strong>
      </div>
      <div>
        <span>Phí giao</span>
        <strong>{formatMoney(preview.pricing.shippingFee)} ₫</strong>
      </div>
      <div className="pricing-total">
        <span>Tổng</span>
        <strong>{formatMoney(preview.pricing.grandTotal)} ₫</strong>
      </div>
      <div>
        <span>Cọc cần chuyển</span>
        <strong>{formatMoney(preview.pricing.depositRequired)} ₫</strong>
      </div>
      {preview.fulfillmentSummary.pickupStore === undefined ? null : (
        <p>Nhận tại {preview.fulfillmentSummary.pickupStore.name}</p>
      )}
    </div>
  );
}
