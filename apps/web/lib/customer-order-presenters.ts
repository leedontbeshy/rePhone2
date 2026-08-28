import type { components } from '@rephone/api-client';
import type { LifecycleStage, PostPurchaseTone } from '@/components/post-purchase';

type GeneratedOrder = components['schemas']['OrderDetailDto'];
type GeneratedWarranty = NonNullable<GeneratedOrder['items'][number]['warranty']>;

export type CustomerOrderWarranty = Pick<GeneratedWarranty, 'status' | 'isValid' | 'isExpired'>;

export function fulfillmentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: 'Chờ chuẩn bị',
    PREPARING: 'Đang chuẩn bị',
    READY: 'Sẵn sàng nhận hàng',
    IN_TRANSIT: 'Đang vận chuyển',
    COMPLETED: 'Đã hoàn tất',
    FAILED: 'Giao không thành công',
    RETURNED: 'Đã hoàn về',
    CANCELLED: 'Đã hủy',
  };
  return labels[status] ?? 'Đang cập nhật giao nhận';
}

export function warrantyStatusLabel(warranty: CustomerOrderWarranty): string {
  if (warranty.status === 'VOIDED') return 'Đã vô hiệu';
  if (warranty.isValid) return 'Còn hiệu lực';
  if (warranty.isExpired) return 'Đã hết hạn';
  return 'Chưa hiệu lực';
}

export function orderStatusLabel(status: string): string {
  return (
    (
      {
        PLACED: 'Đã đặt hàng',
        CONFIRMED: 'Đã xác nhận',
        PROCESSING: 'Đang xử lý',
        COMPLETED: 'Đã hoàn tất',
        CANCELLED: 'Đã hủy',
      } as Record<string, string>
    )[status] ?? 'Đang cập nhật'
  );
}

export function paymentSummaryLabel(status: string): string {
  return (
    (
      {
        UNPAID: 'Chưa thanh toán',
        PARTIALLY_PAID: 'Đã thanh toán một phần',
        PAID: 'Đã thanh toán',
        PARTIALLY_REFUNDED: 'Đã hoàn một phần',
        REFUNDED: 'Đã hoàn tiền',
      } as Record<string, string>
    )[status] ?? 'Đang cập nhật'
  );
}

export function paymentStatusLabel(status: string): string {
  return (
    (
      {
        AWAITING_PROOF: 'Chờ minh chứng',
        UNDER_REVIEW: 'Đang kiểm tra',
        VERIFIED: 'Đã xác nhận',
        REJECTED: 'Không được chấp nhận',
        EXPIRED: 'Đã hết hạn',
        CANCELLED: 'Đã hủy',
      } as Record<string, string>
    )[status] ?? 'Đang cập nhật'
  );
}

export function paymentPurposeLabel(purpose: string): string {
  return purpose === 'DEPOSIT'
    ? 'Thanh toán cọc'
    : purpose === 'BALANCE'
      ? 'Thanh toán số tiền còn lại'
      : 'Thanh toán đơn hàng';
}

export function paymentMethodLabel(method: string): string {
  return (
    (
      {
        BANK_TRANSFER: 'Chuyển khoản ngân hàng',
        CASH: 'Tiền mặt tại cửa hàng',
        COD: 'Thanh toán khi nhận hàng',
        OTHER: 'Phương thức khác',
      } as Record<string, string>
    )[method] ?? 'Đang cập nhật'
  );
}

export function shipmentStatusLabel(status: string): string {
  return (
    (
      {
        CREATED: 'Đã tạo vận đơn',
        HANDED_TO_CARRIER: 'Đã bàn giao vận chuyển',
        DELIVERED: 'Đã giao hàng',
        FAILED: 'Giao không thành công',
        RETURNED: 'Đã hoàn về',
        CANCELLED: 'Đã hủy vận chuyển',
      } as Record<string, string>
    )[status] ?? 'Đang cập nhật'
  );
}

export function refundStatusLabel(status: string): string {
  return (
    (
      {
        REQUESTED: 'Chờ xử lý',
        PROCESSING: 'Đang xử lý',
        COMPLETED: 'Đã hoàn tiền',
        REJECTED: 'Không được chấp nhận',
        CANCELLED: 'Đã hủy',
      } as Record<string, string>
    )[status] ?? 'Đang cập nhật'
  );
}

export function fulfillmentTypeLabel(type: string): string {
  return type === 'PICKUP'
    ? 'Nhận tại cửa hàng'
    : type === 'SHIPPING'
      ? 'Giao tận nơi'
      : 'Đang cập nhật';
}

export function statusTone(status: string): PostPurchaseTone {
  if (['COMPLETED', 'PAID', 'VERIFIED', 'DELIVERED'].includes(status)) return 'success';
  if (['CANCELLED', 'FAILED', 'RETURNED', 'REJECTED'].includes(status)) return 'danger';
  if (['PLACED', 'PENDING', 'UNPAID', 'AWAITING_PROOF'].includes(status)) return 'warning';
  return 'info';
}

export function formatCustomerDateTime(value: string | null | undefined): string {
  if (!value) return 'Chưa thực hiện';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return 'Đang cập nhật';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(parsed);
}

export function formatCustomerMoney(value: string): string {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat('vi-VN').format(number) : '—';
}

export function orderJourney(order: GeneratedOrder): LifecycleStage[] {
  if (order.status === 'CANCELLED') {
    return [
      {
        id: 'placed',
        label: 'Đã đặt hàng',
        icon: 'order',
        state: 'complete',
        at: formatCustomerDateTime(order.placedAt),
      },
      {
        id: 'cancelled',
        label: 'Đơn đã hủy',
        icon: 'cancelled',
        state: 'terminal',
        tone: 'danger',
        at: formatCustomerDateTime(order.cancelledAt),
      },
    ];
  }
  const shipping = order.fulfillmentType === 'SHIPPING';
  if (
    shipping &&
    (order.fulfillmentStatus === 'FAILED' || order.fulfillmentStatus === 'RETURNED')
  ) {
    const shipment = order.shipment;
    const common: LifecycleStage[] = [
      {
        id: 'placed',
        label: 'Đã đặt hàng',
        icon: 'order',
        state: 'complete',
        tone: 'success',
        at: formatCustomerDateTime(order.placedAt),
      },
      {
        id: 'confirmed',
        label: 'Đã xác nhận',
        icon: 'confirmed',
        state: order.confirmedAt ? 'complete' : 'upcoming',
        tone: order.confirmedAt ? 'success' : 'neutral',
        at: order.confirmedAt ? formatCustomerDateTime(order.confirmedAt) : null,
      },
      {
        id: 'transit',
        label: 'Đã bàn giao vận chuyển',
        icon: 'shipping',
        state: shipment?.shippedAt ? 'complete' : 'upcoming',
        tone: shipment?.shippedAt ? 'success' : 'neutral',
        at: shipment?.shippedAt ? formatCustomerDateTime(shipment.shippedAt) : null,
      },
    ];
    if (order.fulfillmentStatus === 'RETURNED') {
      return [
        ...common,
        {
          id: 'failed',
          label: 'Giao hàng không thành công',
          icon: 'failed',
          state: 'complete',
          tone: 'warning',
          at: shipment?.failedAt ? formatCustomerDateTime(shipment.failedAt) : null,
        },
        {
          id: 'returned',
          label: 'Hàng đã hoàn về',
          icon: 'package',
          state: 'terminal',
          tone: 'danger',
          at: shipment?.returnedAt ? formatCustomerDateTime(shipment.returnedAt) : null,
        },
      ];
    }
    return [
      ...common,
      {
        id: 'failed',
        label: 'Giao hàng không thành công',
        icon: 'failed',
        state: 'terminal',
        tone: 'danger',
        at: shipment?.failedAt ? formatCustomerDateTime(shipment.failedAt) : null,
      },
    ];
  }
  const points = [
    { id: 'placed', label: 'Đã đặt hàng', icon: 'order' as const, at: order.placedAt },
    { id: 'confirmed', label: 'Đã xác nhận', icon: 'confirmed' as const, at: order.confirmedAt },
    shipping
      ? {
          id: 'transit',
          label: 'Đang giao hàng',
          icon: 'shipping' as const,
          at: order.shipment?.shippedAt,
        }
      : { id: 'ready', label: 'Sẵn sàng nhận', icon: 'pickup' as const, at: order.pickupReadyAt },
    shipping
      ? {
          id: 'delivered',
          label: 'Đã giao hàng',
          icon: 'received' as const,
          at: order.shipment?.deliveredAt,
        }
      : { id: 'picked-up', label: 'Đã nhận hàng', icon: 'received' as const, at: order.pickedUpAt },
    { id: 'complete', label: 'Hoàn tất', icon: 'complete' as const, at: order.completedAt },
  ];
  const firstMissing = points.findIndex((point) => !point.at);
  return points.map((point, index) => ({
    ...point,
    at: point.at ? formatCustomerDateTime(point.at) : null,
    state: point.at ? 'complete' : index === firstMissing ? 'current' : 'upcoming',
    tone: point.at ? 'success' : index === firstMissing ? 'info' : 'neutral',
  }));
}

export function formatCustomerAddress(value: unknown): string {
  if (typeof value !== 'object' || value === null) return 'Địa chỉ đang được cập nhật.';
  const address = value as Record<string, unknown>;
  return (
    ['receiverName', 'phone', 'addressLine', 'ward', 'district', 'province', 'postalCode']
      .map((key) => address[key])
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .join(', ') || 'Địa chỉ đang được cập nhật.'
  );
}

export function selectPaymentProofAttempt(
  order: Pick<GeneratedOrder, 'availableActions' | 'paymentAttempts'>,
  now = Date.now(),
): GeneratedOrder['paymentAttempts'][number] | undefined {
  if (!order.availableActions.includes('SUBMIT_PAYMENT_PROOF')) return undefined;
  return order.paymentAttempts.find(
    (payment) =>
      payment.purpose === 'DEPOSIT' &&
      payment.method === 'BANK_TRANSFER' &&
      payment.status === 'AWAITING_PROOF' &&
      payment.expiresAt !== null &&
      payment.expiresAt !== undefined &&
      Date.parse(payment.expiresAt) > now,
  );
}

export function canCreateAfterSalesRequest(
  order: Pick<GeneratedOrder, 'status' | 'completedAt'>,
): boolean {
  return order.status === 'COMPLETED' && typeof order.completedAt === 'string';
}
