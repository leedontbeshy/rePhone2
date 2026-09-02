'use client';

import type { components } from '@rephone/api-client';
import {
  ArrowLeftIcon,
  MapPinIcon,
  ShieldCheckIcon,
  StorefrontIcon,
  TagIcon,
  TruckIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { useCommerce, type Cart, type CartItem } from '@/app/commerce-provider';
import { PublicMediaImage } from '@/components/catalog/public-media';
import { Button, Input, Select, Textarea } from '@/components/ui';
import {
  checkoutWarningMessage,
  classifyCheckoutCreateFailure,
  createCheckoutRequestEpoch,
  type CheckoutPreview,
  type CheckoutRequestEpoch,
} from '@/lib/checkout-api';
import { customerApiError } from '@/lib/order-access';
import styles from './checkout-experience.module.css';

type Address = components['schemas']['AddressDto'];
type CheckoutCreateRequest = components['schemas']['CreateCheckoutRequestDto'];
type Fulfillment = 'PICKUP' | 'SHIPPING';
type PendingAction = 'preview' | 'create' | 'recover' | null;

export interface CheckoutFormData {
  fullName: string;
  email: string;
  phone: string;
  receiverName: string;
  receiverPhone: string;
  addressLine: string;
  ward: string;
  district: string;
  province: string;
  postalCode: string;
  customerNote: string;
}

type FormField = keyof CheckoutFormData;
export type CheckoutFormErrors = Partial<Record<FormField, string>>;

const EMPTY_FORM: CheckoutFormData = {
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
};
const FIELD_ORDER: readonly FormField[] = [
  'fullName',
  'email',
  'phone',
  'receiverName',
  'receiverPhone',
  'addressLine',
  'ward',
  'district',
  'province',
  'postalCode',
  'customerNote',
];
const CSRF_HEADER = { 'X-Rephone-CSRF': '1' } as const;

export function validateCheckoutForm(
  form: CheckoutFormData,
  fulfillmentType: Fulfillment,
): CheckoutFormErrors {
  const errors: CheckoutFormErrors = {};
  if (form.fullName.trim().length < 2) errors.fullName = 'Vui lòng nhập họ và tên.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'Vui lòng nhập email hợp lệ.';
  }
  if (!isPhone(form.phone)) errors.phone = 'Vui lòng nhập số điện thoại hợp lệ.';
  if (fulfillmentType === 'SHIPPING') {
    if (form.receiverName.trim().length < 2) errors.receiverName = 'Vui lòng nhập tên người nhận.';
    if (!isPhone(form.receiverPhone)) {
      errors.receiverPhone = 'Vui lòng nhập số điện thoại người nhận hợp lệ.';
    }
    if (form.addressLine.trim().length < 4) errors.addressLine = 'Vui lòng nhập địa chỉ giao hàng.';
    if (form.ward.trim().length < 2) errors.ward = 'Vui lòng nhập phường hoặc xã.';
    if (form.district.trim().length < 2) errors.district = 'Vui lòng nhập quận hoặc huyện.';
    if (form.province.trim().length < 2) errors.province = 'Vui lòng nhập tỉnh hoặc thành phố.';
  }
  return errors;
}

export function CheckoutExperience() {
  const { status, user } = useAuth();
  const sessionKey = `${status}:${user?.role ?? 'NONE'}:${user?.id ?? 'NONE'}`;
  return <CheckoutSession key={sessionKey} />;
}

function CheckoutSession() {
  const { client, status, user } = useAuth();
  const { cart, cartLoading, cartError, mergeError, refreshCart, retryMerge } = useCommerce();
  const [fulfillmentType, setFulfillmentType] = useState<Fulfillment>('SHIPPING');
  const [voucherDraft, setVoucherDraft] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState('');
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<CheckoutFormErrors>({});
  const [reviewRequired, setReviewRequired] = useState(false);
  const [uncertainRequest, setUncertainRequest] = useState<CheckoutCreateRequest | null>(null);
  const [form, setForm] = useState<CheckoutFormData>(EMPTY_FORM);
  const reviewRef = useRef<HTMLDivElement>(null);
  const pageErrorRef = useRef<HTMLParagraphElement>(null);
  const previewRequests = useRef<CheckoutRequestEpoch | null>(null);
  const createRequests = useRef<CheckoutRequestEpoch | null>(null);
  const actionLock = useRef<PendingAction>(null);
  const previousCartFingerprint = useRef<string | null>(null);
  const populatedSession = useRef<string | null>(null);
  if (previewRequests.current === null) previewRequests.current = createCheckoutRequestEpoch();
  if (createRequests.current === null) createRequests.current = createCheckoutRequestEpoch();

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  useEffect(
    () => () => {
      previewRequests.current?.invalidate();
      createRequests.current?.invalidate();
      actionLock.current = null;
    },
    [],
  );

  const invalidatePreview = useCallback(() => {
    previewRequests.current?.invalidate();
    if (actionLock.current === 'preview') actionLock.current = null;
    setPendingAction((current) => (current === 'preview' ? null : current));
    setPreview(null);
    setReviewRequired(false);
  }, []);

  const cartFingerprint = useMemo(() => fingerprintCart(cart), [cart]);
  useEffect(() => {
    if (previousCartFingerprint.current === null) {
      previousCartFingerprint.current = cartFingerprint;
      return;
    }
    if (previousCartFingerprint.current !== cartFingerprint) {
      previousCartFingerprint.current = cartFingerprint;
      invalidatePreview();
    }
  }, [cartFingerprint, invalidatePreview]);

  useEffect(() => {
    const sessionKey = status === 'authenticated' && user ? `${user.id}:${user.role}` : status;
    let cancelled = false;

    if (populatedSession.current !== sessionKey) {
      populatedSession.current = sessionKey;
      setAddresses([]);
      setAddressError(null);
      if (status === 'authenticated' && user?.role === 'CUSTOMER') {
        setForm({
          ...EMPTY_FORM,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone ?? '',
        });
      } else if (status === 'anonymous') {
        setForm(EMPTY_FORM);
      }
      invalidatePreview();
    }

    if (status !== 'authenticated' || user?.role !== 'CUSTOMER') {
      setAddressesLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setAddressesLoading(true);
    void client
      .GET('/api/v1/account/addresses')
      .then((result) => {
        if (cancelled) return;
        if (result.data === undefined) {
          setAddressError(customerApiError(result.error, 'Không thể tải địa chỉ đã lưu.'));
          return;
        }
        setAddresses(result.data.data);
        setAddressError(null);
      })
      .catch(() => {
        if (!cancelled) setAddressError('Không thể tải địa chỉ đã lưu.');
      })
      .finally(() => {
        if (!cancelled) setAddressesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    client,
    invalidatePreview,
    status,
    user?.email,
    user?.fullName,
    user?.id,
    user?.phone,
    user?.role,
  ]);

  const focusFirstError = (errors: CheckoutFormErrors) => {
    const first = FIELD_ORDER.find((field) => errors[field] !== undefined);
    if (first !== undefined) {
      requestAnimationFrame(() => document.getElementById(`checkout-${first}`)?.focus());
    }
  };

  const focusPageError = () => {
    requestAnimationFrame(() => pageErrorRef.current?.focus());
  };

  const validate = () => {
    const errors = validateCheckoutForm(form, fulfillmentType);
    setFieldErrors(errors);
    focusFirstError(errors);
    return Object.keys(errors).length === 0;
  };

  const requestPreview = async () => {
    if (
      uncertainRequest !== null ||
      !validate() ||
      cart === null ||
      cart.items.length === 0 ||
      actionLock.current !== null
    )
      return;
    const requestEpoch = previewRequests.current;
    if (requestEpoch === null) return;
    const requestId = requestEpoch.begin();
    actionLock.current = 'preview';
    setPendingAction('preview');
    setPageError(null);
    try {
      const result = await client.POST('/api/v1/checkouts/preview', {
        params: { header: CSRF_HEADER },
        body: {
          fulfillmentType,
          ...(appliedVoucher === '' ? {} : { voucherCode: appliedVoucher }),
        },
      });
      if (!requestEpoch.isCurrent(requestId)) return;
      if (result.data === undefined) {
        throw new Error(customerApiError(result.error, 'Chưa thể kiểm tra đơn hàng.'));
      }
      setPreview(result.data.data);
      setReviewRequired(false);
    } catch (caught) {
      if (requestEpoch.isCurrent(requestId)) {
        setPageError(caught instanceof Error ? caught.message : 'Chưa thể kiểm tra đơn hàng.');
      }
    } finally {
      if (requestEpoch.isCurrent(requestId)) {
        actionLock.current = null;
        setPendingAction(null);
      }
    }
  };

  const submitCheckoutRequest = async (
    request: CheckoutCreateRequest,
    action: 'create' | 'recover',
  ) => {
    if (actionLock.current !== null) return;
    const requestEpoch = createRequests.current;
    if (requestEpoch === null) return;
    actionLock.current = action;
    setPendingAction(action);
    setPageError(null);
    const requestId = requestEpoch.begin();
    try {
      let result;
      try {
        result = await client.POST('/api/v1/checkouts', {
          params: { header: CSRF_HEADER },
          body: request,
        });
      } catch {
        if (!requestEpoch.isCurrent(requestId)) return;
        setUncertainRequest(request);
        if (action === 'recover') {
          setPageError('Chưa thể kiểm tra trạng thái đơn hàng. Vui lòng thử lại.');
          focusPageError();
        }
        return;
      }
      if (!requestEpoch.isCurrent(requestId)) return;
      if (result.data === undefined) {
        const failure = classifyCheckoutCreateFailure(
          result.response.status,
          result.error,
          action === 'recover',
        );
        if (failure.kind === 'review') {
          setUncertainRequest(null);
          setPreview(failure.preview);
          setReviewRequired(true);
          requestAnimationFrame(() => reviewRef.current?.focus());
        } else if (failure.kind === 'conflict') {
          setUncertainRequest(null);
          setPreview(null);
          setReviewRequired(false);
          setPageError(failure.message);
          focusPageError();
        } else if (failure.kind === 'uncertain') {
          setUncertainRequest(request);
          if (action === 'recover') {
            setPageError('Chưa thể kiểm tra trạng thái đơn hàng. Vui lòng thử lại.');
            focusPageError();
          }
        } else {
          setUncertainRequest(null);
          setPageError(failure.message);
          focusPageError();
        }
        return;
      }
      setUncertainRequest(null);
      const order = result.data.data.order;
      const token = result.data.data.guestAccessToken;
      if (!requestEpoch.isCurrent(requestId)) return;
      window.location.assign(
        token === undefined
          ? `/orders/${order.orderNumber}`
          : `/orders/${order.orderNumber}#token=${encodeURIComponent(token)}`,
      );
    } catch {
      if (requestEpoch.isCurrent(requestId)) {
        setUncertainRequest(request);
        if (action === 'recover') {
          setPageError('Chưa thể kiểm tra trạng thái đơn hàng. Vui lòng thử lại.');
          focusPageError();
        }
      }
    } finally {
      if (requestEpoch.isCurrent(requestId)) {
        actionLock.current = null;
        setPendingAction(null);
      }
    }
  };

  const createOrder = async () => {
    if (
      preview === null ||
      reviewRequired ||
      uncertainRequest !== null ||
      actionLock.current !== null ||
      !validate()
    )
      return;
    const shippingAddress =
      fulfillmentType === 'SHIPPING'
        ? {
            receiverName: form.receiverName.trim(),
            phone: form.receiverPhone.trim(),
            addressLine: form.addressLine.trim(),
            ward: form.ward.trim(),
            district: form.district.trim(),
            province: form.province.trim(),
            ...(form.postalCode.trim() === '' ? {} : { postalCode: form.postalCode.trim() }),
          }
        : undefined;
    await submitCheckoutRequest(
      {
        fulfillmentType,
        contact: {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
        },
        ...(shippingAddress === undefined ? {} : { shippingAddress }),
        ...(appliedVoucher === '' ? {} : { voucherCode: appliedVoucher }),
        ...(form.customerNote.trim() === '' ? {} : { customerNote: form.customerNote.trim() }),
        expectedPreviewFingerprint: preview.previewFingerprint,
        expectedCartUpdatedAt: preview.cartUpdatedAt,
        expectedGrandTotal: preview.pricing.grandTotal,
        expectedDepositRequired: preview.pricing.depositRequired,
      },
      'create',
    );
  };

  const recoverOrder = async () => {
    if (uncertainRequest === null) return;
    await submitCheckoutRequest(uncertainRequest, 'recover');
  };

  const setField = (field: FormField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => withoutFields(current, [field]));
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
    setFieldErrors((current) =>
      withoutFields(current, [
        'receiverName',
        'receiverPhone',
        'addressLine',
        'ward',
        'district',
        'province',
        'postalCode',
      ]),
    );
  };

  const applyVoucher = () => {
    const next = voucherDraft.trim().toUpperCase();
    setVoucherDraft(next);
    if (next !== appliedVoucher) {
      setAppliedVoucher(next);
      invalidatePreview();
    }
  };

  const formLocked =
    pendingAction === 'create' || pendingAction === 'recover' || uncertainRequest !== null;

  if (cartLoading) return <CheckoutLoading />;
  if (cartError !== null) {
    return (
      <CheckoutState title="Chưa thể tải giỏ hàng" description={cartError}>
        <Button onClick={() => void refreshCart()}>Thử lại</Button>
      </CheckoutState>
    );
  }
  if (mergeError !== null) {
    return (
      <CheckoutState title="Giỏ hàng chưa sẵn sàng" description={mergeError}>
        <Button onClick={() => void retryMerge().catch(() => undefined)}>Thử lại</Button>
      </CheckoutState>
    );
  }
  if (cart === null || cart.items.length === 0) {
    return (
      <CheckoutState
        title="Giỏ hàng đang trống"
        description="Hãy chọn sản phẩm trước khi đặt hàng."
      >
        <Link className={styles.primaryLink} href="/products">
          Chọn sản phẩm
        </Link>
      </CheckoutState>
    );
  }
  if (status === 'authenticated' && user?.role !== 'CUSTOMER') {
    return (
      <CheckoutState
        title="Trang đặt hàng dành cho khách mua hàng"
        description="Hãy dùng tài khoản khách hàng hoặc tiếp tục mua sắm tại cửa hàng."
      >
        <Link className={styles.primaryLink} href="/products">
          Xem sản phẩm
        </Link>
      </CheckoutState>
    );
  }
  if (hasBlockingCartIssue(cart)) {
    return (
      <CheckoutState
        title="Giỏ hàng cần được điều chỉnh"
        description="Một sản phẩm hiện không còn sẵn hoặc số lượng chưa phù hợp. Hãy kiểm tra lại giỏ hàng trước khi đặt hàng."
      >
        <Link className={styles.primaryLink} href="/cart">
          Kiểm tra giỏ hàng
        </Link>
      </CheckoutState>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <form
          className={styles.formColumn}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (preview === null) void requestPreview();
            else void createOrder();
          }}
        >
          <nav aria-label="Đường dẫn" className={styles.breadcrumbs}>
            <Link href="/cart">Giỏ hàng</Link>
            <span aria-hidden="true">/</span>
            <span>Đặt hàng</span>
          </nav>
          <header className={styles.introduction}>
            <h1>Hoàn tất đơn hàng</h1>
            <p>Chỉ còn một bước nữa để nhận sản phẩm. Hãy kiểm tra thông tin trước khi đặt hàng.</p>
          </header>

          <fieldset className={styles.fulfillmentGroup}>
            <legend className={styles.visuallyHidden}>Cách nhận hàng</legend>
            <FulfillmentCard
              checked={fulfillmentType === 'SHIPPING'}
              description="Giao hàng đến địa chỉ của bạn"
              icon={<TruckIcon aria-hidden="true" size={30} weight="regular" />}
              id="checkout-shipping"
              label="Giao tận nơi"
              disabled={formLocked}
              onChange={() => {
                setFulfillmentType('SHIPPING');
                invalidatePreview();
              }}
            />
            <FulfillmentCard
              checked={fulfillmentType === 'PICKUP'}
              description="Nhận hàng và thanh toán tại cửa hàng"
              icon={<StorefrontIcon aria-hidden="true" size={30} weight="regular" />}
              id="checkout-pickup"
              label="Nhận tại cửa hàng"
              disabled={formLocked}
              onChange={() => {
                setFulfillmentType('PICKUP');
                invalidatePreview();
              }}
            />
          </fieldset>

          <FormSection title="Thông tin liên hệ">
            <div className={styles.fieldsGrid}>
              <Input
                autoComplete="name"
                containerClassName={styles.field ?? ''}
                error={fieldErrors.fullName}
                id="checkout-fullName"
                label="Họ và tên"
                maxLength={120}
                required
                disabled={formLocked}
                value={form.fullName}
                onChange={(event) => {
                  setField('fullName', event.target.value);
                }}
              />
              <Input
                autoComplete="tel"
                containerClassName={styles.field ?? ''}
                error={fieldErrors.phone}
                id="checkout-phone"
                inputMode="tel"
                label="Điện thoại"
                maxLength={20}
                required
                disabled={formLocked}
                value={form.phone}
                onChange={(event) => {
                  setField('phone', event.target.value);
                }}
              />
              <Input
                autoComplete="email"
                containerClassName={styles.field ?? ''}
                error={fieldErrors.email}
                id="checkout-email"
                inputMode="email"
                label="Email"
                maxLength={254}
                required
                disabled={formLocked}
                type="email"
                value={form.email}
                onChange={(event) => {
                  setField('email', event.target.value);
                }}
              />
            </div>
          </FormSection>

          {fulfillmentType === 'SHIPPING' ? (
            <FormSection title="Địa chỉ giao hàng">
              {status === 'authenticated' && user?.role === 'CUSTOMER' ? (
                <div className={styles.savedAddress}>
                  {addressesLoading ? <p>Đang tải địa chỉ đã lưu…</p> : null}
                  {addressError !== null ? <p role="alert">{addressError}</p> : null}
                  {!addressesLoading && addresses.length > 0 ? (
                    <Select
                      id="checkout-saved-address"
                      label="Chọn địa chỉ đã lưu"
                      disabled={formLocked}
                      value=""
                      onChange={(event) => {
                        chooseAddress(event.target.value);
                      }}
                    >
                      <option value="">Chọn để điền nhanh</option>
                      {addresses.map((address) => (
                        <option key={address.id} value={address.id}>
                          {address.label ?? address.addressLine}, {address.ward}, {address.province}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                </div>
              ) : null}
              <div className={styles.fieldsGrid}>
                <Input
                  autoComplete="shipping name"
                  error={fieldErrors.receiverName}
                  id="checkout-receiverName"
                  label="Tên người nhận"
                  maxLength={120}
                  required
                  disabled={formLocked}
                  value={form.receiverName}
                  onChange={(event) => {
                    setField('receiverName', event.target.value);
                  }}
                />
                <Input
                  autoComplete="shipping tel"
                  error={fieldErrors.receiverPhone}
                  id="checkout-receiverPhone"
                  inputMode="tel"
                  label="Điện thoại người nhận"
                  maxLength={20}
                  required
                  disabled={formLocked}
                  value={form.receiverPhone}
                  onChange={(event) => {
                    setField('receiverPhone', event.target.value);
                  }}
                />
                <Input
                  autoComplete="shipping street-address"
                  containerClassName={styles.fieldWide ?? ''}
                  error={fieldErrors.addressLine}
                  id="checkout-addressLine"
                  label="Địa chỉ"
                  maxLength={255}
                  required
                  disabled={formLocked}
                  value={form.addressLine}
                  onChange={(event) => {
                    setField('addressLine', event.target.value);
                  }}
                />
                <Input
                  autoComplete="shipping address-level3"
                  error={fieldErrors.ward}
                  id="checkout-ward"
                  label="Phường / Xã"
                  maxLength={120}
                  required
                  disabled={formLocked}
                  value={form.ward}
                  onChange={(event) => {
                    setField('ward', event.target.value);
                  }}
                />
                <Input
                  autoComplete="shipping address-level2"
                  error={fieldErrors.district}
                  id="checkout-district"
                  label="Quận / Huyện"
                  maxLength={120}
                  required
                  disabled={formLocked}
                  value={form.district}
                  onChange={(event) => {
                    setField('district', event.target.value);
                  }}
                />
                <Input
                  autoComplete="shipping address-level1"
                  error={fieldErrors.province}
                  id="checkout-province"
                  label="Tỉnh / Thành phố"
                  maxLength={120}
                  required
                  disabled={formLocked}
                  value={form.province}
                  onChange={(event) => {
                    setField('province', event.target.value);
                  }}
                />
                <Input
                  autoComplete="shipping postal-code"
                  error={fieldErrors.postalCode}
                  id="checkout-postalCode"
                  inputMode="numeric"
                  label="Mã bưu chính (nếu có)"
                  disabled={formLocked}
                  maxLength={20}
                  value={form.postalCode}
                  onChange={(event) => {
                    setField('postalCode', event.target.value);
                  }}
                />
              </div>
            </FormSection>
          ) : null}

          <FormSection title="Ưu đãi và ghi chú">
            <div className={styles.voucherRow}>
              <Input
                id="checkout-voucher"
                label="Mã giảm giá (nếu có)"
                disabled={formLocked}
                maxLength={50}
                placeholder="Nhập mã giảm giá"
                value={voucherDraft}
                onChange={(event) => {
                  setVoucherDraft(event.target.value.toUpperCase());
                }}
              />
              <Button
                className={styles.applyButton}
                disabled={formLocked}
                type="button"
                variant="secondary"
                onClick={applyVoucher}
              >
                Áp dụng
              </Button>
            </div>
            {appliedVoucher !== '' ? (
              <p className={styles.appliedVoucher} aria-live="polite">
                <TagIcon aria-hidden="true" size={18} /> Mã {appliedVoucher} sẽ được kiểm tra cùng
                đơn hàng.
              </p>
            ) : null}
            <Textarea
              id="checkout-customerNote"
              label="Ghi chú (nếu có)"
              disabled={formLocked}
              maxLength={500}
              value={form.customerNote}
              onChange={(event) => {
                setField('customerNote', event.target.value);
              }}
            />
          </FormSection>
        </form>

        <OrderSummary
          cart={cart}
          error={pageError}
          pendingAction={pendingAction}
          preview={preview}
          pageErrorRef={pageErrorRef}
          reviewRef={reviewRef}
          reviewRequired={reviewRequired}
          uncertain={uncertainRequest !== null}
          onAcknowledgeReview={() => {
            setReviewRequired(false);
          }}
          onCreate={() => void createOrder()}
          onPreview={() => void requestPreview()}
          onRecover={() => void recoverOrder()}
        />
      </div>
    </div>
  );
}

function FulfillmentCard({
  checked,
  description,
  icon,
  id,
  label,
  disabled,
  onChange,
}: Readonly<{
  checked: boolean;
  description: string;
  icon: React.ReactNode;
  id: string;
  label: string;
  disabled: boolean;
  onChange: () => void;
}>) {
  return (
    <label className={styles.fulfillmentCard}>
      <input
        checked={checked}
        disabled={disabled}
        id={id}
        name="fulfillment"
        type="radio"
        onChange={onChange}
      />
      <span className={styles.fulfillmentIcon}>{icon}</span>
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
    </label>
  );
}

function FormSection({ children, title }: Readonly<{ children: React.ReactNode; title: string }>) {
  return (
    <section className={styles.formSection}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function OrderSummary({
  cart,
  error,
  pageErrorRef,
  pendingAction,
  preview,
  reviewRef,
  reviewRequired,
  uncertain,
  onAcknowledgeReview,
  onCreate,
  onPreview,
  onRecover,
}: Readonly<{
  cart: Cart;
  error: string | null;
  pageErrorRef: React.RefObject<HTMLParagraphElement | null>;
  pendingAction: PendingAction;
  preview: CheckoutPreview | null;
  reviewRef: React.RefObject<HTMLDivElement | null>;
  reviewRequired: boolean;
  uncertain: boolean;
  onAcknowledgeReview: () => void;
  onCreate: () => void;
  onPreview: () => void;
  onRecover: () => void;
}>) {
  return (
    <aside className={styles.summary} aria-label="Đơn hàng của bạn">
      <h2>Đơn hàng của bạn</h2>
      <div className={styles.summaryItems}>
        {(preview?.items ?? cart.items).map((source) => {
          const cartItem =
            'cartItemId' in source
              ? cart.items.find((item) => item.id === source.cartItemId)
              : source;
          return (
            <SummaryItem
              key={'cartItemId' in source ? source.cartItemId : source.id}
              cartItem={cartItem}
              source={source}
            />
          );
        })}
      </div>

      {reviewRequired ? (
        <div ref={reviewRef} className={styles.reviewAlert} role="alert" tabIndex={-1}>
          <strong>Đơn hàng vừa có thay đổi</strong>
          <span>Hãy xem lại sản phẩm và số tiền mới trước khi tiếp tục.</span>
        </div>
      ) : null}
      {error !== null ? (
        <p ref={pageErrorRef} className={styles.pageError} role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}

      {preview === null ? null : <PreviewPricing preview={preview} />}

      <div className={styles.assurance}>
        <ShieldCheckIcon aria-hidden="true" size={22} weight="fill" />
        <span>
          {preview === null
            ? 'Giá và tình trạng sản phẩm sẽ được kiểm tra trước khi đặt hàng'
            : 'Giá và tình trạng sản phẩm đã được kiểm tra'}
        </span>
      </div>

      {uncertain ? (
        <div className={styles.uncertainNotice} role="alert">
          <strong>Chưa nhận được xác nhận đơn hàng</strong>
          <span>
            Yêu cầu có thể đã được ghi nhận. Hãy chủ động kiểm tra trạng thái để tiếp tục mà không
            tạo trùng đơn.
          </span>
          <Button
            className={styles.summaryButton}
            loading={pendingAction === 'recover'}
            loadingLabel="Đang kiểm tra trạng thái đơn hàng"
            onClick={onRecover}
          >
            Kiểm tra trạng thái đơn hàng
          </Button>
        </div>
      ) : reviewRequired ? (
        <Button className={styles.summaryButton} onClick={onAcknowledgeReview}>
          Tôi đã xem thay đổi
        </Button>
      ) : preview === null ? (
        <Button
          className={styles.summaryButton}
          loading={pendingAction === 'preview'}
          loadingLabel="Đang kiểm tra đơn hàng"
          onClick={onPreview}
        >
          Kiểm tra đơn hàng
        </Button>
      ) : (
        <Button
          className={styles.summaryButton}
          loading={pendingAction === 'create'}
          loadingLabel="Đang đặt hàng"
          onClick={onCreate}
        >
          Đặt hàng
        </Button>
      )}
      <Link className={styles.backLink} href="/cart">
        <ArrowLeftIcon aria-hidden="true" size={18} /> Quay lại giỏ hàng
      </Link>
    </aside>
  );
}

function SummaryItem({
  cartItem,
  source,
}: Readonly<{
  cartItem: CartItem | undefined;
  source: CartItem | CheckoutPreview['items'][number];
}>) {
  const quantity = source.quantity;
  const target = source.target;
  const price =
    'lineTotal' in source
      ? source.lineTotal
      : (source.estimatedLineTotal ?? source.priceAtAddition);
  return (
    <article className={styles.summaryItem}>
      <PublicMediaImage
        className={styles.summaryImage}
        fallbackLabel={`Ảnh ${target.productName}`}
        media={cartItem?.media ?? undefined}
      />
      <div className={styles.summaryItemCopy}>
        <strong>{target.productName}</strong>
        <span>{target.variantName}</span>
        {target.inventoryCode ? <span>Mã máy: {target.inventoryCode}</span> : null}
        <div>
          <span>Số lượng: {quantity}</span>
          <b>{money(price)} ₫</b>
        </div>
      </div>
    </article>
  );
}

function PreviewPricing({ preview }: Readonly<{ preview: CheckoutPreview }>) {
  const pricing = preview.pricing;
  return (
    <div className={styles.pricing}>
      {preview.warnings.length > 0 ? (
        <div className={styles.previewWarnings} role="status">
          {preview.warnings.map((warning, index) => (
            <p key={`${warning}-${String(index)}`}>{checkoutWarningMessage(warning)}</p>
          ))}
        </div>
      ) : null}
      {preview.voucher ? (
        <p className={styles.voucherSuccess}>
          <TagIcon aria-hidden="true" size={18} /> {preview.voucher.name} ({preview.voucher.code})
        </p>
      ) : null}
      <PriceLine label="Tạm tính" value={pricing.subtotal} />
      {moneyIsPositive(pricing.itemDiscountAmount) ? (
        <PriceLine discount label="Giảm theo sản phẩm" value={pricing.itemDiscountAmount} />
      ) : null}
      {moneyIsPositive(pricing.voucherDiscountAmount) ? (
        <PriceLine discount label="Giảm giá" value={pricing.voucherDiscountAmount} />
      ) : null}
      <PriceLine label="Phí giao hàng" value={pricing.shippingFee} />
      <PriceLine label="Đặt cọc" value={pricing.depositRequired} />
      <div className={styles.grandTotal}>
        <span>Tổng thanh toán</span>
        <strong>{money(pricing.grandTotal)} ₫</strong>
      </div>
      <PriceLine label="Số tiền còn lại" value={pricing.balanceDue} />
      {preview.fulfillmentSummary.pickupStore ? (
        <p className={styles.pickupStore}>
          <MapPinIcon aria-hidden="true" size={18} /> Nhận tại{' '}
          {preview.fulfillmentSummary.pickupStore.name}
        </p>
      ) : null}
    </div>
  );
}

function PriceLine({
  discount = false,
  label,
  value,
}: Readonly<{ discount?: boolean; label: string; value: string }>) {
  return (
    <div className={styles.priceLine}>
      <span>{label}</span>
      <strong className={discount ? styles.discount : undefined}>
        {discount ? '−' : ''}
        {money(value)} ₫
      </strong>
    </div>
  );
}

function CheckoutLoading() {
  return (
    <div className={styles.loading} aria-busy="true" aria-label="Đang tải thông tin đặt hàng">
      <div />
      <div />
    </div>
  );
}

function CheckoutState({
  children,
  description,
  title,
}: Readonly<{ children: React.ReactNode; description: string; title: string }>) {
  return (
    <section className={styles.state}>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </section>
  );
}

function fingerprintCart(cart: Cart | null): string {
  if (cart === null) return 'empty';
  return JSON.stringify({
    estimatedSubtotal: cart.estimatedSubtotal,
    status: cart.status,
    warnings: cart.warnings,
    items: cart.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      currentUnitPrice: item.currentUnitPrice,
      availabilityStatus: item.availabilityStatus,
      warnings: item.warnings,
    })),
  });
}

function isPhone(value: string): boolean {
  const compact = value.replace(/[\s().-]/g, '');
  return /^\+?[0-9]{8,15}$/.test(compact);
}

function hasBlockingCartIssue(cart: Cart): boolean {
  const blockingWarnings = new Set(['ITEM_UNAVAILABLE', 'QUANTITY_NOT_AVAILABLE']);
  return (
    cart.warnings.some((warning) => blockingWarnings.has(warning)) ||
    cart.items.some(
      (item) =>
        item.availabilityStatus !== 'AVAILABLE' ||
        item.warnings.some((warning) => blockingWarnings.has(warning)),
    )
  );
}

function money(value: string): string {
  try {
    return new Intl.NumberFormat('vi-VN').format(BigInt(value));
  } catch {
    return value;
  }
}

function moneyIsPositive(value: string): boolean {
  try {
    return BigInt(value) > BigInt(0);
  } catch {
    return false;
  }
}

function withoutFields(
  errors: CheckoutFormErrors,
  fields: readonly FormField[],
): CheckoutFormErrors {
  const next: CheckoutFormErrors = {};
  for (const field of FIELD_ORDER) {
    const message = errors[field];
    if (!fields.includes(field) && message !== undefined) next[field] = message;
  }
  return next;
}
