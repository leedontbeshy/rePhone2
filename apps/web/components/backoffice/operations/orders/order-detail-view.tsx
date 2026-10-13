'use client';

import NextLink from 'next/link';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useAuth } from '@/app/auth-provider';
import { Button, InlineAlert } from '@/components/ui';
import {
  cancelBackofficeOrder,
  completePickup,
  confirmPickupOrder,
  createShipment,
  extendPickupHold,
  fulfillmentError,
  getBackofficeOrder,
  handOverShipment,
  listActiveReturnLocations,
  markPickupReady,
  markShipmentDelivered,
  markShipmentFailed,
  markShipmentReturned,
  overrideShippingFee,
  startPreparingOrder,
  updateBackofficeOrderInternalNote,
  type BackofficeOrderDetail,
  type BackofficeOrderLocation,
  type FulfillmentAction,
} from '@/lib/fulfillment-api';
import { createRefund, createRefundIntentKeyStore, type CreateRefundInput } from '@/lib/refund-api';
import { OperationsShell } from '../operations-shell';
import {
  isPositiveMoney,
  isSafeTrackingUrl,
  moneyExceeds,
  primaryOrderAction,
} from './order-presenter';
import { OrderActionPanel } from './order-action-panel';
import { OrderDetailMain, OrderDetailSkeleton } from './order-detail-sections';
import { OrderFinancialSummary, OrderSummaryBand } from './order-detail-summary';
import styles from './orders.module.css';

type BusyAction = FulfillmentAction | 'INTERNAL_NOTE' | 'RELOAD' | null;

export function OrderDetailView({ orderId }: Readonly<{ orderId: string }>) {
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [detail, setDetail] = useState<BackofficeOrderDetail | null>(null);
  const [selectedAction, setSelectedAction] = useState<FulfillmentAction | null>(null);
  const [internalNote, setInternalNote] = useState('');
  const [holdUntil, setHoldUntil] = useState('');
  const [holdReason, setHoldReason] = useState('Khách hàng cần thêm thời gian nhận máy');
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [shippingFee, setShippingFee] = useState('');
  const [shippingFeeReason, setShippingFeeReason] = useState('Điều chỉnh theo kiện hàng thực tế');
  const [carrierName, setCarrierName] = useState('Giao hàng nội bộ');
  const [trackingCode, setTrackingCode] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [codConfirmed, setCodConfirmed] = useState(false);
  const [failureReason, setFailureReason] = useState('Không thể liên hệ người nhận');
  const [returnReason, setReturnReason] = useState('Kho đã nhận và kiểm đếm kiện hoàn');
  const [returnLocationId, setReturnLocationId] = useState('');
  const [returnLocations, setReturnLocations] = useState<BackofficeOrderLocation[]>([]);
  const [cancelReason, setCancelReason] = useState('Khách hàng xác nhận không tiếp tục đơn hàng');
  const [refundAllocations, setRefundAllocations] = useState<Record<string, string>>({});
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMethod, setRefundMethod] = useState<'BANK_TRANSFER' | 'CASH'>('BANK_TRANSFER');
  const [refundPaymentId, setRefundPaymentId] = useState('');
  const [refundReason, setRefundReason] = useState('Hoàn khoản đã thu theo đối soát đơn hàng');
  const [busy, setBusy] = useState<BusyAction>(null);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refundIntentKeys] = useState(createRefundIntentKeyStore);
  const busyRef = useRef<BusyAction>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const applyProjection = useCallback((next: BackofficeOrderDetail) => {
    setDetail(next);
    setInternalNote(next.internalNote ?? '');
    setShippingFee(next.pricing.shippingFee);
    setRefundAmount((current) => (current === '' ? next.refundableAmount : current));
    setSelectedAction((current) =>
      current !== null && next.availableActions.includes(current)
        ? current
        : primaryOrderAction(next.availableActions),
    );
  }, []);

  const loadOrder = useCallback(async () => {
    const next = await getBackofficeOrder(client, orderId);
    applyProjection(next);
    return next;
  }, [applyProjection, client, orderId]);

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (status !== 'authenticated' || !isStaff) return;
    let active = true;
    setLoading(true);
    setHasLoaded(false);
    void getBackofficeOrder(client, orderId)
      .then((next) => {
        if (!active) return;
        applyProjection(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) setError(orderError(caught, 'Không thể tải chi tiết đơn hàng.'));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setHasLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [applyProjection, client, isStaff, orderId, status, user?.role]);

  useEffect(() => {
    if (
      status !== 'authenticated' ||
      !isStaff ||
      !detail?.availableActions.includes('MARK_SHIPMENT_RETURNED')
    ) {
      return;
    }
    let active = true;
    void listActiveReturnLocations(client)
      .then((locations) => {
        if (!active) return;
        setReturnLocations(locations);
        setReturnLocationId((current) => current || locations[0]?.id || '');
      })
      .catch(() => {
        if (active) setError('Không thể tải địa điểm nhận hàng hoàn.');
      });
    return () => {
      active = false;
    };
  }, [client, detail?.availableActions, isStaff, status]);

  async function runAction(
    action: FulfillmentAction,
    operation: () => Promise<unknown>,
    success: string,
    afterSuccess?: () => void,
  ) {
    if (!claimBusy(action)) return;
    setError(null);
    setNotice(null);
    try {
      await operation();
      await loadOrder();
      afterSuccess?.();
      setNotice(success);
    } catch (caught) {
      const message = orderError(caught, 'Không thể cập nhật đơn hàng.');
      try {
        await loadOrder();
      } catch {
        // Giữ lỗi của thao tác khi không thể tải lại dữ liệu chính thức.
      }
      setError(message);
    } finally {
      releaseBusy();
    }
  }

  async function reload() {
    if (!claimBusy('RELOAD')) return;
    setError(null);
    try {
      await loadOrder();
    } catch (caught) {
      setError(orderError(caught, 'Không thể tải lại đơn hàng.'));
    } finally {
      releaseBusy();
    }
  }

  async function saveInternalNote(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!claimBusy('INTERNAL_NOTE')) return;
    setError(null);
    setNotice(null);
    try {
      const normalized = internalNote.trim();
      await updateBackofficeOrderInternalNote(
        client,
        orderId,
        normalized === '' ? null : normalized,
      );
      await loadOrder();
      setNotice(normalized === '' ? 'Đã xóa ghi chú nội bộ.' : 'Đã lưu ghi chú nội bộ.');
    } catch (caught) {
      const message = orderError(caught, 'Không thể lưu ghi chú nội bộ.');
      try {
        await loadOrder();
      } catch {
        // Giữ lỗi của thao tác khi không thể tải lại dữ liệu chính thức.
      }
      setError(message);
    } finally {
      releaseBusy();
    }
  }

  function submitAction(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (detail === null || selectedAction === null) return;
    const shipment = detail.shipments[0];
    const balanceRequired = isPositiveMoney(detail.pricing.balanceDue);

    if (selectedAction === 'CONFIRM') {
      void runAction(
        selectedAction,
        () => confirmPickupOrder(client, orderId),
        'Đã xác nhận đơn hàng.',
      );
      return;
    }
    if (selectedAction === 'START_PREPARING') {
      void runAction(
        selectedAction,
        () => startPreparingOrder(client, orderId),
        'Đã bắt đầu chuẩn bị hàng.',
      );
      return;
    }
    if (selectedAction === 'MARK_PICKUP_READY') {
      void runAction(
        selectedAction,
        () => markPickupReady(client, orderId),
        'Đã đánh dấu đơn sẵn sàng để khách đến nhận.',
      );
      return;
    }
    if (selectedAction === 'EXTEND_PICKUP_HOLD') {
      const parsed = Date.parse(holdUntil);
      const reason = holdReason.trim();
      if (Number.isNaN(parsed)) {
        showError('Hãy chọn hạn giữ hàng mới hợp lệ.');
        return;
      }
      if (parsed <= Date.now()) {
        showError('Hạn giữ hàng mới phải ở trong tương lai.');
        return;
      }
      if (detail.pickupHoldUntil !== null) {
        const currentDeadline = Date.parse(detail.pickupHoldUntil);
        if (!Number.isNaN(currentDeadline) && parsed <= currentDeadline) {
          showError('Hạn mới phải muộn hơn hạn giữ hàng hiện tại.');
          return;
        }
      }
      if (parsed > Date.now() + 7 * 24 * 60 * 60 * 1000) {
        showError('Hạn mới không được vượt quá 7 ngày kể từ hiện tại.');
        return;
      }
      if (!validReason(reason)) {
        showError('Lý do gia hạn phải có từ 5 đến 500 ký tự.');
        return;
      }
      void runAction(
        selectedAction,
        () =>
          extendPickupHold(client, orderId, { holdUntil: new Date(parsed).toISOString(), reason }),
        'Đã gia hạn thời gian giữ hàng.',
      );
      return;
    }
    if (selectedAction === 'COMPLETE_PICKUP') {
      if (balanceRequired && !cashConfirmed) {
        showError('Hãy xác nhận đã thu đủ tiền mặt trước khi hoàn tất.');
        return;
      }
      void runAction(
        selectedAction,
        () => completePickup(client, orderId, { confirmCashCollected: balanceRequired }),
        'Đã hoàn tất giao hàng tại cửa hàng.',
      );
      return;
    }
    if (selectedAction === 'OVERRIDE_SHIPPING_FEE') {
      const reason = shippingFeeReason.trim();
      if (!/^\d{1,15}$/.test(shippingFee)) {
        showError('Phí giao hàng phải là số nguyên không âm, tối đa 15 chữ số.');
        return;
      }
      if (!validReason(reason)) {
        showError('Lý do điều chỉnh phải có từ 5 đến 500 ký tự.');
        return;
      }
      void runAction(
        selectedAction,
        () => overrideShippingFee(client, orderId, { shippingFee, reason }),
        'Đã cập nhật phí giao hàng và tổng tiền.',
      );
      return;
    }
    if (selectedAction === 'CREATE_SHIPMENT') {
      const carrier = carrierName.trim();
      const tracking = trackingCode.trim();
      const url = trackingUrl.trim();
      if (carrier === '' || tracking === '') {
        showError('Đơn vị vận chuyển và mã vận đơn là bắt buộc.');
        return;
      }
      if (url !== '' && !isSafeTrackingUrl(url)) {
        showError(
          'Đường dẫn tra cứu chưa hợp lệ. Hãy dùng đường dẫn do đơn vị vận chuyển cung cấp.',
        );
        return;
      }
      void runAction(
        selectedAction,
        () =>
          createShipment(client, orderId, {
            carrierName: carrier,
            trackingCode: tracking,
            ...(url === '' ? {} : { trackingUrl: url }),
          }),
        'Đã tạo vận đơn.',
      );
      return;
    }
    if (selectedAction === 'HAND_OVER_SHIPMENT') {
      if (shipment === undefined) {
        showError('Không tìm thấy vận đơn để bàn giao.');
        return;
      }
      void runAction(
        selectedAction,
        () => handOverShipment(client, shipment.id),
        'Đã bàn giao kiện hàng cho đơn vị vận chuyển.',
      );
      return;
    }
    if (selectedAction === 'MARK_SHIPMENT_DELIVERED') {
      if (shipment === undefined) {
        showError('Không tìm thấy vận đơn cần hoàn tất.');
        return;
      }
      if (balanceRequired && !codConfirmed) {
        showError('Hãy xác nhận đã thu đủ tiền khi giao hàng.');
        return;
      }
      if (!balanceRequired && codConfirmed) {
        showError('Đơn không còn số tiền phải thu nên không cần xác nhận thu hộ.');
        return;
      }
      void runAction(
        selectedAction,
        () => markShipmentDelivered(client, shipment.id, { confirmCodCollected: balanceRequired }),
        'Đã xác nhận giao hàng thành công.',
      );
      return;
    }
    if (selectedAction === 'MARK_SHIPMENT_FAILED') {
      const reason = failureReason.trim();
      if (shipment === undefined) {
        showError('Không tìm thấy vận đơn cần cập nhật.');
        return;
      }
      if (!validReason(reason)) {
        showError('Lý do giao thất bại phải có từ 5 đến 500 ký tự.');
        return;
      }
      void runAction(
        selectedAction,
        () => markShipmentFailed(client, shipment.id, { reason }),
        'Đã ghi nhận giao hàng thất bại.',
      );
      return;
    }
    if (selectedAction === 'MARK_SHIPMENT_RETURNED') {
      const reason = returnReason.trim();
      if (shipment === undefined) {
        showError('Không tìm thấy vận đơn cần nhận hoàn.');
        return;
      }
      if (returnLocationId === '') {
        showError('Hãy chọn địa điểm thực nhận hàng hoàn.');
        return;
      }
      if (!validReason(reason)) {
        showError('Ghi chú kiểm nhận phải có từ 5 đến 500 ký tự.');
        return;
      }
      void runAction(
        selectedAction,
        () =>
          markShipmentReturned(client, shipment.id, {
            returnedToLocationId: returnLocationId,
            reason,
          }),
        'Đã ghi nhận hàng hoàn về kho.',
      );
      return;
    }
    if (selectedAction === 'CANCEL_ORDER') {
      const reason = cancelReason.trim();
      if (!validReason(reason)) {
        showError('Lý do hủy đơn phải có từ 5 đến 500 ký tự.');
        return;
      }
      void runAction(
        selectedAction,
        () => cancelBackofficeOrder(client, orderId, reason),
        'Đã hủy đơn hàng.',
      );
      return;
    }
    const amount = refundAmount.trim();
    const reason = refundReason.trim();
    if (!/^\d{1,15}$/.test(amount) || !isPositiveMoney(amount)) {
      showError('Số tiền hoàn phải là số nguyên dương, tối đa 15 chữ số.');
      return;
    }
    if (moneyExceeds(amount, detail.refundableAmount)) {
      showError('Số tiền hoàn vượt quá khoản còn có thể hoàn của đơn.');
      return;
    }
    if (!validReason(reason)) {
      showError('Lý do hoàn tiền phải có từ 5 đến 500 ký tự.');
      return;
    }
    const allocations = Object.entries(refundAllocations)
      .filter(([, value]) => /^\d+$/.test(value) && BigInt(value) > BigInt(0))
      .map<NonNullable<CreateRefundInput['allocations']>[number]>(([key, value]) => ({
        kind: key === 'SHIPPING' || key === 'OVERPAYMENT' ? key : 'ITEM',
        ...(key === 'SHIPPING' || key === 'OVERPAYMENT' ? {} : { orderItemId: key }),
        amount: value,
      }));
    if (detail.hasAffiliateCommission && !allocations.length) {
      showError('Hãy phân bổ khoản hoàn cho từng sản phẩm hoặc phí của đơn có hoa hồng.');
      return;
    }
    if (
      allocations.length &&
      allocations.reduce((sum, a) => sum + BigInt(a.amount), BigInt(0)) !== BigInt(amount)
    ) {
      showError('Tổng phân bổ phải bằng số tiền hoàn.');
      return;
    }
    const input = {
      ...(allocations.length ? { allocations } : {}),
      ...(refundPaymentId === '' ? {} : { paymentId: refundPaymentId }),
      amount,
      method: refundMethod,
      reason,
    };
    const idempotencyKey = refundIntentKeys.keyFor(orderId, input);
    void runAction(
      selectedAction,
      () => createRefund(client, orderId, input, idempotencyKey),
      'Đã tạo yêu cầu hoàn tiền.',
      () => {
        refundIntentKeys.clear();
      },
    );
  }

  function showError(message: string) {
    setNotice(null);
    setError(message);
    return undefined;
  }

  function claimBusy(next: BusyAction): boolean {
    if (next === null || busyRef.current !== null) return false;
    busyRef.current = next;
    setBusy(next);
    return true;
  }

  function releaseBusy() {
    busyRef.current = null;
    setBusy(null);
  }

  return (
    <OperationsShell
      breadcrumbs={[
        { label: 'Vận hành' },
        { href: '/backoffice/orders', label: 'Đơn hàng' },
        { label: detail?.orderNumber ?? 'Chi tiết' },
      ]}
    >
      <div className={styles.detailPage}>
        {error === null ? null : (
          <InlineAlert ref={errorRef} tabIndex={-1} title="Chưa thể hoàn tất" tone="danger">
            <div className={styles.alertContent}>
              <span>{error}</span>
              <Button
                disabled={busy !== null}
                size="compact"
                variant="secondary"
                onClick={() => void reload()}
              >
                Tải lại dữ liệu
              </Button>
            </div>
          </InlineAlert>
        )}
        {notice === null ? null : (
          <InlineAlert title="Đã cập nhật" tone="success">
            {notice}
          </InlineAlert>
        )}
        {!hasLoaded && detail === null ? <OrderDetailSkeleton /> : null}
        {hasLoaded && !loading && detail === null && error === null ? (
          <section className={styles.emptyState}>
            <h1>Không tìm thấy đơn hàng</h1>
            <p>Đơn có thể đã bị xóa khỏi phạm vi truy cập của bạn.</p>
            <NextLink href="/backoffice/orders">Về danh sách đơn hàng</NextLink>
          </section>
        ) : null}
        {detail === null ? null : (
          <>
            <OrderSummaryBand detail={detail} />
            <div className={styles.orderDetailLayout}>
              <aside className={styles.orderDetailRail}>
                <div className={styles.railStack}>
                  <OrderActionPanel
                    busy={busy}
                    detail={detail}
                    selectedAction={selectedAction}
                    returnLocations={returnLocations}
                    values={{
                      cancelReason,
                      carrierName,
                      cashConfirmed,
                      codConfirmed,
                      failureReason,
                      holdReason,
                      holdUntil,
                      refundAmount,
                      refundAllocations,
                      refundMethod,
                      refundPaymentId,
                      refundReason,
                      returnLocationId,
                      returnReason,
                      shippingFee,
                      shippingFeeReason,
                      trackingCode,
                      trackingUrl,
                    }}
                    setters={{
                      setCancelReason,
                      setCarrierName,
                      setCashConfirmed,
                      setCodConfirmed,
                      setFailureReason,
                      setHoldReason,
                      setHoldUntil,
                      setRefundAmount,
                      setRefundAllocations,
                      setRefundMethod,
                      setRefundPaymentId,
                      setRefundReason,
                      setReturnLocationId,
                      setReturnReason,
                      setShippingFee,
                      setShippingFeeReason,
                      setTrackingCode,
                      setTrackingUrl,
                    }}
                    onSelect={setSelectedAction}
                    onSubmit={submitAction}
                  />
                  <OrderFinancialSummary
                    detail={detail}
                    showCosts={status === 'authenticated' && user?.role === 'ADMIN'}
                  />
                  {detail.cancelReason === null ? null : (
                    <p className={styles.dangerBox}>
                      <strong>Lý do hủy</strong>
                      <span>{detail.cancelReason}</span>
                    </p>
                  )}
                </div>
              </aside>
              <div className={styles.orderDetailMain}>
                <OrderDetailMain
                  showCosts={status === 'authenticated' && user?.role === 'ADMIN'}
                  notePending={busy === 'INTERNAL_NOTE'}
                  writesDisabled={busy !== null}
                  detail={detail}
                  internalNote={internalNote}
                  setInternalNote={setInternalNote}
                  onSaveNote={(event) => {
                    void saveInternalNote(event);
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </OperationsShell>
  );
}

function validReason(value: string): boolean {
  return value.length >= 5 && value.length <= 500;
}

function orderError(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fulfillmentError(value, fallback);
}
