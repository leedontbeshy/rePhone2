import { Input, Select, Textarea, formatVnd } from '@/components/ui';
import type {
  BackofficeOrderDetail,
  BackofficeOrderLocation,
  FulfillmentAction,
} from '@/lib/fulfillment-api';
import { isPositiveMoney, paymentMethodLabel, paymentPurposeLabel } from './order-presenter';
import styles from './orders.module.css';

export interface OrderActionValues {
  cancelReason: string;
  carrierName: string;
  cashConfirmed: boolean;
  codConfirmed: boolean;
  failureReason: string;
  holdReason: string;
  holdUntil: string;
  refundAllocations?: Record<string, string>;
  refundAmount: string;
  refundMethod: 'BANK_TRANSFER' | 'CASH';
  refundPaymentId: string;
  refundReason: string;
  returnLocationId: string;
  returnReason: string;
  shippingFee: string;
  shippingFeeReason: string;
  trackingCode: string;
  trackingUrl: string;
}

export interface OrderActionSetters {
  setCancelReason(value: string): void;
  setCarrierName(value: string): void;
  setCashConfirmed(value: boolean): void;
  setCodConfirmed(value: boolean): void;
  setFailureReason(value: string): void;
  setHoldReason(value: string): void;
  setHoldUntil(value: string): void;
  setRefundAllocations?(value: Record<string, string>): void;
  setRefundAmount(value: string): void;
  setRefundMethod(value: 'BANK_TRANSFER' | 'CASH'): void;
  setRefundPaymentId(value: string): void;
  setRefundReason(value: string): void;
  setReturnLocationId(value: string): void;
  setReturnReason(value: string): void;
  setShippingFee(value: string): void;
  setShippingFeeReason(value: string): void;
  setTrackingCode(value: string): void;
  setTrackingUrl(value: string): void;
}

export function ActionFields({
  action,
  detail,
  returnLocations,
  setters,
  values,
}: Readonly<{
  action: FulfillmentAction;
  detail: BackofficeOrderDetail;
  returnLocations: readonly BackofficeOrderLocation[];
  setters: OrderActionSetters;
  values: OrderActionValues;
}>) {
  const balanceRequired = isPositiveMoney(detail.pricing.balanceDue);
  if (action === 'EXTEND_PICKUP_HOLD') {
    return (
      <div className={styles.actionFields}>
        <Input
          id="pickup-hold-until"
          label="Hạn giữ hàng mới"
          required
          type="datetime-local"
          value={values.holdUntil}
          onChange={(event) => {
            setters.setHoldUntil(event.target.value);
          }}
        />
        <Textarea
          id="pickup-hold-reason"
          label="Lý do gia hạn"
          maxLength={500}
          minLength={5}
          required
          rows={3}
          value={values.holdReason}
          onChange={(event) => {
            setters.setHoldReason(event.target.value);
          }}
        />
      </div>
    );
  }
  if (action === 'COMPLETE_PICKUP') {
    return balanceRequired ? (
      <label className={styles.checkboxRow}>
        <input
          checked={values.cashConfirmed}
          type="checkbox"
          onChange={(event) => {
            setters.setCashConfirmed(event.target.checked);
          }}
        />
        <span>
          Đã thu đủ <strong>{formatVnd(detail.pricing.balanceDue)}</strong> tiền mặt.
        </span>
      </label>
    ) : (
      <p className={styles.actionHint}>Đơn không còn số tiền phải thu.</p>
    );
  }
  if (action === 'OVERRIDE_SHIPPING_FEE') {
    return (
      <div className={styles.actionFields}>
        <Input
          id="shipping-fee"
          inputMode="numeric"
          label="Phí giao mới (đồng)"
          maxLength={15}
          pattern="[0-9]+"
          required
          value={values.shippingFee}
          onChange={(event) => {
            setters.setShippingFee(event.target.value.replace(/\D/g, ''));
          }}
        />
        <Textarea
          id="shipping-fee-reason"
          label="Lý do điều chỉnh"
          maxLength={500}
          minLength={5}
          required
          rows={3}
          value={values.shippingFeeReason}
          onChange={(event) => {
            setters.setShippingFeeReason(event.target.value);
          }}
        />
      </div>
    );
  }
  if (action === 'CREATE_SHIPMENT') {
    return (
      <div className={styles.actionFields}>
        <Input
          id="carrier-name"
          label="Đơn vị vận chuyển"
          maxLength={255}
          required
          value={values.carrierName}
          onChange={(event) => {
            setters.setCarrierName(event.target.value);
          }}
        />
        <Input
          id="tracking-code"
          label="Mã vận đơn"
          maxLength={255}
          required
          value={values.trackingCode}
          onChange={(event) => {
            setters.setTrackingCode(event.target.value);
          }}
        />
        <Input
          id="tracking-url"
          inputMode="url"
          label="Đường dẫn tra cứu (không bắt buộc)"
          maxLength={2048}
          placeholder="https://..."
          type="url"
          value={values.trackingUrl}
          onChange={(event) => {
            setters.setTrackingUrl(event.target.value);
          }}
        />
      </div>
    );
  }
  if (action === 'MARK_SHIPMENT_DELIVERED') {
    return balanceRequired ? (
      <label className={styles.checkboxRow}>
        <input
          checked={values.codConfirmed}
          type="checkbox"
          onChange={(event) => {
            setters.setCodConfirmed(event.target.checked);
          }}
        />
        <span>
          Đơn vị giao hàng đã thu đủ <strong>{formatVnd(detail.pricing.balanceDue)}</strong>.
        </span>
      </label>
    ) : (
      <p className={styles.actionHint}>
        Đơn đã thanh toán đủ; hệ thống không ghi nhận thêm khoản thu hộ.
      </p>
    );
  }
  if (action === 'MARK_SHIPMENT_FAILED') {
    return (
      <Textarea
        id="shipment-failure-reason"
        label="Lý do giao thất bại"
        maxLength={500}
        minLength={5}
        required
        rows={3}
        value={values.failureReason}
        onChange={(event) => {
          setters.setFailureReason(event.target.value);
        }}
      />
    );
  }
  if (action === 'MARK_SHIPMENT_RETURNED') {
    return (
      <div className={styles.actionFields}>
        <Select
          id="return-location"
          label="Địa điểm nhận hàng hoàn"
          required
          value={values.returnLocationId}
          onChange={(event) => {
            setters.setReturnLocationId(event.target.value);
          }}
        >
          <option value="">Chọn địa điểm</option>
          {returnLocations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.code} · {location.name}
            </option>
          ))}
        </Select>
        <Textarea
          id="shipment-return-reason"
          label="Ghi chú kiểm nhận"
          maxLength={500}
          minLength={5}
          required
          rows={3}
          value={values.returnReason}
          onChange={(event) => {
            setters.setReturnReason(event.target.value);
          }}
        />
      </div>
    );
  }
  if (action === 'CANCEL_ORDER') {
    return (
      <div className={styles.actionFields}>
        <p className={styles.dangerBox}>
          Thao tác này sẽ kết thúc đơn và giải phóng phần hàng đang giữ.
        </p>
        <Textarea
          id="cancel-reason"
          label="Lý do hủy đơn"
          maxLength={500}
          minLength={5}
          required
          rows={3}
          value={values.cancelReason}
          onChange={(event) => {
            setters.setCancelReason(event.target.value);
          }}
        />
      </div>
    );
  }
  if (action === 'CREATE_REFUND') {
    return (
      <div className={styles.actionFields}>
        <p className={styles.actionHint}>
          Còn có thể hoàn: <strong>{formatVnd(detail.refundableAmount)}</strong>
        </p>
        <Input
          id="refund-amount"
          inputMode="numeric"
          label="Số tiền hoàn (đồng)"
          maxLength={15}
          pattern="[0-9]+"
          required
          value={values.refundAmount}
          onChange={(event) => {
            setters.setRefundAmount(event.target.value.replace(/\D/g, ''));
          }}
        />
        <Select
          id="refund-method"
          label="Phương thức hoàn"
          value={values.refundMethod}
          onChange={(event) => {
            setters.setRefundMethod(event.target.value as 'BANK_TRANSFER' | 'CASH');
          }}
        >
          <option value="BANK_TRANSFER">Chuyển khoản</option>
          <option value="CASH">Tiền mặt</option>
        </Select>
        <Select
          id="refund-payment-source"
          label="Khoản thanh toán đối chiếu (không bắt buộc)"
          value={values.refundPaymentId}
          onChange={(event) => {
            setters.setRefundPaymentId(event.target.value);
          }}
        >
          <option value="">Đối chiếu toàn bộ đơn hàng</option>
          {detail.paymentAttempts
            .filter((payment) => payment.status === 'VERIFIED')
            .map((payment) => (
              <option key={payment.id} value={payment.id}>
                {paymentPurposeLabel(payment.purpose)} · {paymentMethodLabel(payment.method)} ·{' '}
                {formatVnd(payment.receivedAmount ?? payment.expectedAmount)}
              </option>
            ))}
        </Select>
        <details open={detail.hasAffiliateCommission}>
          <summary>Phân bổ tiền hoàn theo sản phẩm và phí</summary>
          <p className={styles.actionHint}>
            Bắt buộc với đơn có hoa hồng cộng tác viên. Nhập đúng khoản hoàn từng sản phẩm; tổng
            phải bằng số tiền hoàn. Bỏ trống khoản không hoàn.
          </p>
          {detail.items.map((item) => (
            <Input
              key={item.id}
              id={`refund-allocation-${item.id}`}
              label={`${item.productName} (tối đa ${formatVnd(item.lineTotal)})`}
              inputMode="numeric"
              value={values.refundAllocations?.[item.id] ?? ''}
              onChange={(event) =>
                setters.setRefundAllocations?.({
                  ...values.refundAllocations,
                  [item.id]: event.target.value.replace(/\D/g, ''),
                })
              }
            />
          ))}
          {(['SHIPPING', 'OVERPAYMENT'] as const).map((kind) => (
            <Input
              key={kind}
              id={`refund-allocation-${kind}`}
              label={kind === 'SHIPPING' ? 'Phí giao hàng (đ)' : 'Tiền khách chuyển thừa (đ)'}
              inputMode="numeric"
              value={values.refundAllocations?.[kind] ?? ''}
              onChange={(event) =>
                setters.setRefundAllocations?.({
                  ...values.refundAllocations,
                  [kind]: event.target.value.replace(/\D/g, ''),
                })
              }
            />
          ))}
        </details>
        <Textarea
          id="refund-reason"
          label="Lý do hoàn tiền"
          maxLength={500}
          minLength={5}
          required
          rows={3}
          value={values.refundReason}
          onChange={(event) => {
            setters.setRefundReason(event.target.value);
          }}
        />
      </div>
    );
  }
  if (action === 'HAND_OVER_SHIPMENT') {
    return (
      <p className={styles.warningBox}>Chỉ xác nhận sau khi kiện hàng đã được bàn giao thực tế.</p>
    );
  }
  return null;
}
