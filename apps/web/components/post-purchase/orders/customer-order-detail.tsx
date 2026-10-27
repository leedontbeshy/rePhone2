'use client';

import { demoMode } from '@/lib/demo';

import { DeviceMobileIcon, PackageIcon, UploadSimpleIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { Button, InlineAlert, Skeleton } from '@/components/ui';
import {
  ConfirmationDialog,
  DetailGrid,
  DetailPanel,
  ErrorState,
  LifecycleJourney,
  PostPurchasePageHeader,
  ProductTextSummary,
  SafeNotFoundState,
  StatusPill,
} from '@/components/post-purchase';
import {
  cancelCustomerOrder,
  CustomerOrderApiError,
  getCustomerOrder,
  type CustomerOrder,
} from '@/lib/customer-orders-api';
import {
  canCreateAfterSalesRequest,
  formatCustomerAddress,
  formatCustomerDateTime,
  formatCustomerMoney,
  fulfillmentStatusLabel,
  orderJourney,
  orderStatusLabel,
  paymentMethodLabel,
  paymentPurposeLabel,
  paymentStatusLabel,
  paymentSummaryLabel,
  refundStatusLabel,
  selectPaymentProofAttempt,
  shipmentStatusLabel,
  statusTone,
  warrantyStatusLabel,
} from '@/lib/customer-order-presenters';
import {
  orderUrlWithoutFragment,
  removeGuestOrderToken,
  resolveGuestOrderToken,
} from '@/lib/order-access';
import {
  CustomerPaymentError,
  submitPaymentProof,
  validateCustomerPaymentProof,
} from '@/lib/payment-api';
import { safeHttpsUrl } from '@/lib/safe-https-url';
import styles from './orders.module.css';
import { paymentProofSelectionLabel } from './orders-ui';

export function CustomerOrderDetail({ orderNumber }: Readonly<{ orderNumber: string }>) {
  const { client, status, user } = useAuth();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [access, setAccess] = useState<{ key: string; credential?: string } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const requestGeneration = useRef(0);
  const accessKeyRef = useRef<string | null>(null);
  const operationRef = useRef<string | null>(null);

  useEffect(() => {
    requestGeneration.current += 1;
    accessKeyRef.current = null;
    operationRef.current = null;
    setAccess(null);
    setOrder(null);
    setError(null);
    setNotFound(false);
    setLoading(true);
    setPending(false);
    if (status === 'loading') return;
    const hash = window.location.hash;
    if (hash) {
      window.history.replaceState(
        null,
        '',
        orderUrlWithoutFragment(window.location.pathname, window.location.search),
      );
    }
    if (status === 'authenticated') {
      const key = `${orderNumber}:authenticated:${user?.id ?? ''}`;
      accessKeyRef.current = key;
      setAccess({ key });
      return;
    }
    const credential = resolveGuestOrderToken(status, orderNumber, hash, sessionStorage);
    const key = `${orderNumber}:anonymous:${credential ?? 'cookie'}`;
    accessKeyRef.current = key;
    setAccess(credential === undefined ? { key } : { key, credential });
  }, [orderNumber, status, user?.id]);

  const load = useCallback(async () => {
    if (access === null) return;
    if (accessKeyRef.current !== access.key) return;
    const accessKey = access.key;
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const next = await getCustomerOrder(client, orderNumber, access.credential);
      if (requestGeneration.current !== generation || accessKeyRef.current !== accessKey) return;
      setOrder(next);
    } catch (caught) {
      if (requestGeneration.current !== generation || accessKeyRef.current !== accessKey) return;
      if (caught instanceof CustomerOrderApiError && caught.notFound) {
        setNotFound(true);
        if (status !== 'authenticated') removeGuestOrderToken(orderNumber, sessionStorage);
      } else setError(caught instanceof Error ? caught.message : 'Không thể mở đơn hàng này.');
    } finally {
      if (requestGeneration.current === generation && accessKeyRef.current === accessKey)
        setLoading(false);
    }
  }, [access, client, orderNumber, status]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const confirmCancel = async () => {
    const reason = cancelReason.trim();
    if (reason.length < 5 || reason.length > 500) {
      setCancelError('Lý do cần từ 5 đến 500 ký tự.');
      return;
    }
    if (access === null || operationRef.current !== null) return;
    const actionAccessKey = access.key;
    const operation = `${actionAccessKey}:cancel`;
    operationRef.current = operation;
    setPending(true);
    setCancelError(null);
    setError(null);
    try {
      await cancelCustomerOrder(client, orderNumber, reason, access.credential);
      if (accessKeyRef.current !== actionAccessKey) return;
      await load();
      if (accessKeyRef.current !== actionAccessKey) return;
      setCancelOpen(false);
      setCancelReason('');
      setNotice('Đơn hàng đã được hủy.');
    } catch (caught) {
      if (accessKeyRef.current !== actionAccessKey) return;
      if (caught instanceof CustomerOrderApiError && caught.conflict) {
        await load();
        if (accessKeyRef.current !== actionAccessKey) return;
        setCancelOpen(false);
        setNotice('Đơn hàng vừa được cập nhật. Bạn hãy xem trạng thái mới nhất.');
      } else setCancelError(caught instanceof Error ? caught.message : 'Không thể hủy đơn hàng.');
    } finally {
      if (operationRef.current === operation) {
        operationRef.current = null;
        if (accessKeyRef.current === actionAccessKey) setPending(false);
      }
    }
  };

  const proofPayment = order ? selectPaymentProofAttempt(order) : undefined;
  const accessMatchesContext =
    status === 'authenticated'
      ? access?.key === `${orderNumber}:authenticated:${user?.id ?? ''}`
      : status === 'anonymous'
        ? access?.key.startsWith(`${orderNumber}:anonymous:`) === true
        : false;

  const uploadProof = async () => {
    if (!proofPayment || !proofFile) {
      setError('Hãy chọn tệp minh chứng thanh toán.');
      return;
    }
    const validation = validateCustomerPaymentProof(proofFile);
    if (validation) {
      setError(validation);
      return;
    }
    if (access === null || operationRef.current !== null) return;
    const actionAccessKey = access.key;
    const operation = `${actionAccessKey}:proof`;
    operationRef.current = operation;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await submitPaymentProof(client, proofPayment.id, proofFile, access.credential);
      if (accessKeyRef.current !== actionAccessKey) return;
      setProofFile(null);
      if (proofInputRef.current) proofInputRef.current.value = '';
      await load();
      if (accessKeyRef.current !== actionAccessKey) return;
      setNotice('Đã gửi minh chứng. Thanh toán đang được kiểm tra.');
    } catch (caught) {
      if (accessKeyRef.current !== actionAccessKey) return;
      const message =
        caught instanceof Error ? caught.message : 'Không thể gửi minh chứng thanh toán.';
      if (caught instanceof CustomerPaymentError && caught.requiresOrderRefetch) {
        await load();
        if (accessKeyRef.current !== actionAccessKey) return;
        setNotice('Thanh toán vừa được cập nhật. Bạn hãy xem trạng thái mới nhất.');
      } else setError(message);
    } finally {
      if (operationRef.current === operation) {
        operationRef.current = null;
        if (accessKeyRef.current === actionAccessKey) setPending(false);
      }
    }
  };

  if (status === 'loading' || (!notFound && !accessMatchesContext) || (loading && order === null))
    return <CustomerOrderDetailSkeleton />;
  if (notFound)
    return (
      <section className={styles.page}>
        <PostPurchasePageHeader title="Chi tiết đơn hàng" />
        <SafeNotFoundState title="Không mở được đơn hàng" />
      </section>
    );

  return (
    <section className={styles.page}>
      {!order ? (
        <PostPurchasePageHeader
          title="Chi tiết đơn hàng"
          description="Kiểm tra trạng thái mới nhất của đơn hàng."
        />
      ) : null}
      {error ? (
        <div className={styles.notice} ref={errorRef} tabIndex={-1}>
          <ErrorState message={error} onRetry={() => void load()} />
        </div>
      ) : null}
      {notice ? (
        <div className={styles.notice}>
          <InlineAlert tone="success" title="Đã cập nhật">
            <p>{notice}</p>
          </InlineAlert>
        </div>
      ) : null}
      {order ? (
        <>
          <PostPurchasePageHeader
            title={order.orderNumber}
            description={`Đặt lúc ${formatCustomerDateTime(order.placedAt)}`}
            action={
              proofPayment ? (
                <Link className={styles.paymentJump} href="#order-payment">
                  Xem thanh toán
                </Link>
              ) : undefined
            }
            status={
              <StatusPill tone={statusTone(order.status)}>
                {orderStatusLabel(order.status)}
              </StatusPill>
            }
          />
          {loading ? (
            <p className={styles.refreshStatus} role="status">
              Đang cập nhật thông tin đơn hàng…
            </p>
          ) : null}
          <LifecycleJourney
            title="Hành trình đơn hàng"
            ariaLabel="Tiến độ đơn hàng"
            currentSummary={`${fulfillmentStatusLabel(order.fulfillmentStatus)} · ${paymentSummaryLabel(order.paymentStatus)}`}
            stages={orderJourney(order)}
          />
          <DetailGrid>
            <div className={styles.stack}>
              <DetailPanel title="Sản phẩm">
                <div className={styles.panelRows}>
                  {order.items.map((item) => (
                    <article className={styles.item} key={item.id}>
                      <div className={styles.split}>
                        <ProductTextSummary
                          icon={
                            item.productType === 'IPHONE' ? (
                              <DeviceMobileIcon size={27} />
                            ) : (
                              <PackageIcon size={27} />
                            )
                          }
                          name={item.productName}
                          secondary={`${item.variantName} · ${String(item.quantity)} sản phẩm`}
                        />
                        <strong>{formatCustomerMoney(item.lineTotal)} ₫</strong>
                      </div>
                      {item.warranty ? (
                        <div>
                          <span>
                            {item.warranty.warrantyCode} · {warrantyStatusLabel(item.warranty)}
                          </span>{' '}
                          <Link
                            className={styles.textLink}
                            href={`/warranties/${encodeURIComponent(item.warranty.warrantyCode)}?orderNumber=${encodeURIComponent(order.orderNumber)}`}
                          >
                            Xem bảo hành
                          </Link>
                        </div>
                      ) : null}
                      {canCreateAfterSalesRequest(order) ? (
                        <Link
                          className={styles.textLink}
                          href={`/after-sales/new?orderNumber=${encodeURIComponent(order.orderNumber)}&orderItemId=${encodeURIComponent(item.id)}`}
                        >
                          Xem các lựa chọn hỗ trợ
                        </Link>
                      ) : null}
                    </article>
                  ))}
                </div>
              </DetailPanel>
              <DetailPanel title="Nhận hàng">
                <dl className={styles.facts}>
                  <div>
                    <dt>Hình thức</dt>
                    <dd>
                      {order.fulfillmentType === 'PICKUP' ? 'Nhận tại cửa hàng' : 'Giao tận nơi'}
                    </dd>
                  </div>
                  <div>
                    <dt>Trạng thái</dt>
                    <dd>{fulfillmentStatusLabel(order.fulfillmentStatus)}</dd>
                  </div>
                  {order.pickupStore ? (
                    <div>
                      <dt>Cửa hàng</dt>
                      <dd>{order.pickupStore.name}</dd>
                    </div>
                  ) : (
                    <div>
                      <dt>Địa chỉ</dt>
                      <dd>{formatCustomerAddress(order.shippingAddress)}</dd>
                    </div>
                  )}
                  {order.shipment ? (
                    <>
                      <div>
                        <dt>Đơn vị vận chuyển</dt>
                        <dd>{order.shipment.carrierName}</dd>
                      </div>
                      <div>
                        <dt>Mã vận đơn</dt>
                        <dd>{order.shipment.trackingCode}</dd>
                      </div>
                      <div>
                        <dt>Vận chuyển</dt>
                        <dd>{shipmentStatusLabel(order.shipment.status)}</dd>
                      </div>
                      {safeHttpsUrl(order.shipment.trackingUrl ?? null) ? (
                        <div>
                          <dt>Tra cứu</dt>
                          <dd>
                            <a
                              className={styles.textLink}
                              href={safeHttpsUrl(order.shipment.trackingUrl ?? null) ?? undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Tra cứu vận đơn
                            </a>
                          </dd>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </dl>
              </DetailPanel>
              {order.paymentAttempts.length ? (
                <DetailPanel
                  title="Thanh toán"
                  className={styles.paymentPanel}
                  id="order-payment"
                  tabIndex={-1}
                >
                  <div className={styles.panelRows}>
                    {order.paymentAttempts.map((payment) => (
                      <article className={styles.payment} key={payment.id}>
                        <div className={styles.split}>
                          <strong>{paymentPurposeLabel(payment.purpose)}</strong>
                          <StatusPill tone={statusTone(payment.status)}>
                            {paymentStatusLabel(payment.status)}
                          </StatusPill>
                        </div>
                        <dl className={styles.facts}>
                          <div>
                            <dt>Số tiền</dt>
                            <dd>{formatCustomerMoney(payment.expectedAmount)} ₫</dd>
                          </div>
                          <div>
                            <dt>Phương thức</dt>
                            <dd>{paymentMethodLabel(payment.method)}</dd>
                          </div>
                          {payment.expiresAt ? (
                            <div>
                              <dt>Thời hạn</dt>
                              <dd>{formatCustomerDateTime(payment.expiresAt)}</dd>
                            </div>
                          ) : null}
                          {payment.submittedAt ? (
                            <div>
                              <dt>Đã gửi minh chứng</dt>
                              <dd>{formatCustomerDateTime(payment.submittedAt)}</dd>
                            </div>
                          ) : null}
                          {!demoMode && payment.bankTransferInstructions ? (
                            <>
                              <div>
                                <dt>Ngân hàng</dt>
                                <dd>{payment.bankTransferInstructions.bankName}</dd>
                              </div>
                              <div>
                                <dt>Số tài khoản</dt>
                                <dd>{payment.bankTransferInstructions.accountNumber}</dd>
                              </div>
                              <div>
                                <dt>Chủ tài khoản</dt>
                                <dd>{payment.bankTransferInstructions.accountHolder}</dd>
                              </div>
                              <div>
                                <dt>Nội dung chuyển khoản</dt>
                                <dd>{payment.bankTransferInstructions.transferContent}</dd>
                              </div>
                            </>
                          ) : null}
                        </dl>
                        {proofPayment?.id === payment.id ? (
                          <form
                            className={styles.proof}
                            onSubmit={(event) => {
                              event.preventDefault();
                              void uploadProof();
                            }}
                          >
                            <span className={styles.proofLabel}>Minh chứng thanh toán</span>
                            <label
                              className={styles.filePicker}
                              htmlFor={`payment-proof-${payment.id}`}
                            >
                              <input
                                className={styles.fileInput}
                                id={`payment-proof-${payment.id}`}
                                ref={proofInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp,application/pdf"
                                aria-label="Chọn minh chứng thanh toán"
                                aria-describedby={`payment-proof-help-${payment.id}`}
                                onChange={(event) => {
                                  setProofFile(event.target.files?.[0] ?? null);
                                  setError(null);
                                }}
                              />
                              <span className={styles.filePickerButton} aria-hidden="true">
                                <UploadSimpleIcon size={20} />
                                Chọn tệp
                              </span>
                              <span className={styles.fileName}>
                                {paymentProofSelectionLabel(proofFile)}
                              </span>
                            </label>
                            <small id={`payment-proof-help-${payment.id}`}>
                              Một tệp JPEG, PNG, WebP hoặc PDF, tối đa 10 MB.
                            </small>
                            <Button type="submit" loading={pending} disabled={!proofFile}>
                              Gửi minh chứng
                            </Button>
                          </form>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </DetailPanel>
              ) : null}
              {order.refunds.length ? (
                <DetailPanel title="Hoàn tiền">
                  <div className={styles.panelRows}>
                    {order.refunds.map((refund) => (
                      <article className={styles.refund} key={refund.id}>
                        <div className={styles.split}>
                          <strong>{formatCustomerMoney(refund.amount)} ₫</strong>
                          <StatusPill tone={statusTone(refund.status)}>
                            {refundStatusLabel(refund.status)}
                          </StatusPill>
                        </div>
                        <p>{refund.reason}</p>
                      </article>
                    ))}
                  </div>
                </DetailPanel>
              ) : null}
            </div>
            <aside className={styles.actions}>
              <DetailPanel className={styles.receipt} title="Tổng thanh toán">
                <dl className={styles.facts}>
                  <div>
                    <dt>Tạm tính</dt>
                    <dd>{formatCustomerMoney(order.pricing.subtotal)} ₫</dd>
                  </div>
                  <div>
                    <dt>Ưu đãi</dt>
                    <dd>−{formatCustomerMoney(order.pricing.voucherDiscountAmount)} ₫</dd>
                  </div>
                  <div>
                    <dt>Phí giao hàng</dt>
                    <dd>{formatCustomerMoney(order.pricing.shippingFee)} ₫</dd>
                  </div>
                  <div className={styles.total}>
                    <dt>Tổng cộng</dt>
                    <dd>{formatCustomerMoney(order.pricing.grandTotal)} ₫</dd>
                  </div>
                  <div>
                    <dt>Đã thanh toán</dt>
                    <dd>{formatCustomerMoney(order.pricing.paidAmount)} ₫</dd>
                  </div>
                  <div>
                    <dt>Còn lại</dt>
                    <dd>{formatCustomerMoney(order.pricing.balanceDue)} ₫</dd>
                  </div>
                </dl>
              </DetailPanel>
              <DetailPanel title="Thông tin liên hệ">
                <p>
                  {order.contact.fullName}
                  <br />
                  {order.contact.phone}
                  <br />
                  {order.contact.email}
                </p>
              </DetailPanel>
              {order.availableActions.includes('CANCEL') ? (
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => {
                    setCancelOpen(true);
                  }}
                >
                  Hủy đơn hàng
                </Button>
              ) : null}
              {order.cancelReason ? (
                <DetailPanel title="Lý do hủy">
                  <p>{order.cancelReason}</p>
                </DetailPanel>
              ) : null}
            </aside>
          </DetailGrid>
          <ConfirmationDialog
            open={cancelOpen}
            title="Hủy đơn hàng?"
            description="Sau khi hủy, đơn hàng sẽ không tiếp tục được chuẩn bị hoặc giao đi."
            confirmLabel="Xác nhận hủy đơn"
            reason={cancelReason}
            reasonLabel="Lý do hủy"
            onReasonChange={(value) => {
              setCancelReason(value);
              setCancelError(null);
            }}
            error={cancelError}
            pending={pending}
            onClose={() => {
              setCancelOpen(false);
              setCancelError(null);
            }}
            onConfirm={() => void confirmCancel()}
          />
        </>
      ) : null}
    </section>
  );
}

export function CustomerOrderDetailSkeleton() {
  return (
    <section
      className={[styles.page, styles.detailLoading].join(' ')}
      aria-busy="true"
      aria-label="Đang tải chi tiết đơn hàng"
      role="status"
    >
      <PostPurchasePageHeader
        title="Chi tiết đơn hàng"
        description="Đang tải thông tin mới nhất…"
        status={<Skeleton height="var(--control-height)" width="7.5rem" />}
      />
      <DetailPanel className={styles.loadingJourney}>
        <Skeleton height="1.75rem" width="11rem" />
        <div className={styles.loadingJourneySummary} aria-hidden="true">
          <Skeleton className={styles.loadingJourneyMarker ?? ''} height="4rem" width="4rem" />
          <div>
            <Skeleton height="1.25rem" width="9rem" />
            <Skeleton height="1rem" width="min(100%, 15rem)" />
          </div>
        </div>
        <div className={styles.loadingJourneyStages} aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <div className={styles.loadingJourneyStage} key={index}>
              <Skeleton className={styles.loadingJourneyStageMarker ?? ''} />
              <Skeleton className={styles.loadingJourneyLabel ?? ''} height="1rem" width="5rem" />
            </div>
          ))}
        </div>
      </DetailPanel>
      <DetailGrid>
        <div className={styles.loadingStack}>
          <DetailPanel>
            <div className={styles.loadingPanelRows}>
              <Skeleton height="1.75rem" width="8rem" />
              <Skeleton height="3.25rem" width="100%" />
              <Skeleton height="1rem" width="72%" />
              <Skeleton height="1rem" width="58%" />
            </div>
          </DetailPanel>
          <DetailPanel>
            <div className={styles.loadingPanelRows}>
              <Skeleton height="1.75rem" width="7rem" />
              <Skeleton height="1rem" width="100%" />
              <Skeleton height="1rem" width="84%" />
              <Skeleton height="1rem" width="92%" />
            </div>
          </DetailPanel>
        </div>
        <aside className={styles.loadingActions} aria-hidden="true">
          <DetailPanel>
            <div className={styles.loadingPanelRows}>
              <Skeleton height="1.75rem" width="10rem" />
              <Skeleton height="1rem" width="100%" />
              <Skeleton height="1rem" width="88%" />
              <Skeleton height="1rem" width="96%" />
              <Skeleton height="1.25rem" width="75%" />
            </div>
          </DetailPanel>
        </aside>
      </DetailGrid>
      <span className="rp-visually-hidden">Đang tải chi tiết đơn hàng…</span>
    </section>
  );
}
