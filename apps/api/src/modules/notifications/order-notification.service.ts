import { Inject, Injectable } from '@nestjs/common';
import { safeHttpsUrl } from '../../common/security/safe-https-url.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import type { OrderDetailDto } from '../orders/order-response.dto.js';
import { NotificationDeliveryService } from './notification-delivery.service.js';

@Injectable()
export class OrderNotificationService {
  public constructor(
    @Inject(NotificationDeliveryService)
    private readonly delivery: NotificationDeliveryService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public sendPlaced(order: OrderDetailDto, guestAccessToken?: string): Promise<void> {
    const link = this.orderLink(order.orderNumber, guestAccessToken);
    const pickup = order.fulfillmentType === 'PICKUP';
    const instructions = pickup
      ? `Địa điểm nhận: ${order.pickupStore?.name ?? 'rePhone'}.`
      : order.paymentAttempts[0] === undefined
        ? 'Đơn không yêu cầu cọc.'
        : `Số tiền cọc: ${formatVnd(order.paymentAttempts[0].expectedAmount)}. Nội dung: ${order.paymentAttempts[0].transferContent ?? order.orderNumber}.`;
    return this.deliver(pickup ? 'order.placed_pickup' : 'order.placed_shipping', order.id, {
      to: order.contact.email,
      subject: `[rePhone] Đã nhận đơn ${order.orderNumber}`,
      text: `rePhone đã nhận đơn ${order.orderNumber}. ${instructions} Xem đơn: ${link}`,
      html: `<p>rePhone đã nhận đơn <strong>${escapeHtml(order.orderNumber)}</strong>.</p><p>${escapeHtml(instructions)}</p><p><a href="${escapeHtml(link)}">Xem đơn hàng</a></p>`,
    });
  }

  public sendCancelled(order: {
    id: string;
    orderNumber: string;
    contact: { email: string };
    cancelReason: string | null;
    refunds: Array<{ status: string; amount: string }>;
  }): Promise<void> {
    const refund = order.refunds.find(({ status }) => ['REQUESTED', 'PROCESSING'].includes(status));
    const refundText =
      refund === undefined
        ? ''
        : ` Nghĩa vụ hoàn tiền: ${formatVnd(refund.amount)} đang chờ xử lý.`;
    return this.deliver('order.cancelled', order.id, {
      to: order.contact.email,
      subject: `[rePhone] Đơn ${order.orderNumber} đã hủy`,
      text: `Đơn ${order.orderNumber} đã được hủy. Lý do: ${order.cancelReason ?? 'Theo yêu cầu khách hàng'}.${refundText}`,
      html: `<p>Đơn <strong>${escapeHtml(order.orderNumber)}</strong> đã được hủy.</p><p>Lý do: ${escapeHtml(order.cancelReason ?? 'Theo yêu cầu khách hàng')}.</p>${refund === undefined ? '' : `<p>${escapeHtml(refundText.trim())}</p>`}`,
    });
  }

  public sendPickupReady(order: {
    id: string;
    orderNumber: string;
    contact: { email: string };
    location: { name: string };
    pickupHoldUntil: string | null;
    storeAddress: string;
  }): Promise<void> {
    const deadline =
      order.pickupHoldUntil === null
        ? 'theo xác nhận của cửa hàng'
        : formatDateTime(order.pickupHoldUntil);
    const link = this.orderLink(order.orderNumber);
    return this.deliver('pickup.ready', order.id, {
      to: order.contact.email,
      subject: `[rePhone] Đơn ${order.orderNumber} đã sẵn sàng nhận`,
      text: `Đơn ${order.orderNumber} đã sẵn sàng tại ${order.location.name}, ${order.storeAddress}. Vui lòng nhận trước ${deadline}. Xem đơn: ${link}`,
      html: `<p>Đơn <strong>${escapeHtml(order.orderNumber)}</strong> đã sẵn sàng nhận.</p><p>${escapeHtml(order.location.name)}, ${escapeHtml(order.storeAddress)}.</p><p>Vui lòng nhận trước ${escapeHtml(deadline)}.</p><p><a href="${escapeHtml(link)}">Xem đơn hàng</a></p>`,
    });
  }

  public sendCompleted(order: {
    id: string;
    orderNumber: string;
    contact: { email: string };
    pricing: { paidAmount: string; refundedAmount: string };
    items: Array<{ warranty: { warrantyCode: string } | null }>;
  }): Promise<void> {
    const warrantyCodes = order.items.flatMap(({ warranty }) =>
      warranty === null ? [] : [warranty.warrantyCode],
    );
    const warrantyText =
      warrantyCodes.length === 0
        ? 'Đơn không phát sinh bảo hành.'
        : `Mã bảo hành: ${warrantyCodes.join(', ')}.`;
    const link = this.orderLink(order.orderNumber);
    return this.deliver('order.completed', order.id, {
      to: order.contact.email,
      subject: `[rePhone] Đơn ${order.orderNumber} đã hoàn tất`,
      text: `Đơn ${order.orderNumber} đã hoàn tất. Đã thanh toán: ${formatVnd(order.pricing.paidAmount)}. Đã hoàn: ${formatVnd(order.pricing.refundedAmount)}. ${warrantyText} Xem đơn: ${link}`,
      html: `<p>Đơn <strong>${escapeHtml(order.orderNumber)}</strong> đã hoàn tất.</p><p>Đã thanh toán: ${escapeHtml(formatVnd(order.pricing.paidAmount))}. Đã hoàn: ${escapeHtml(formatVnd(order.pricing.refundedAmount))}.</p><p>${escapeHtml(warrantyText)}</p><p><a href="${escapeHtml(link)}">Xem đơn hàng</a></p>`,
    });
  }

  public sendShippingFeeUpdated(order: {
    id: string;
    orderNumber: string;
    contact: { email: string };
    pricing: { shippingFee: string; grandTotal: string; depositRequired: string };
  }): Promise<void> {
    const link = this.orderLink(order.orderNumber);
    return this.deliver('order.shipping_fee_updated', order.id, {
      to: order.contact.email,
      subject: `[rePhone] Phí giao đơn ${order.orderNumber} đã cập nhật`,
      text: `Phí giao mới của đơn ${order.orderNumber}: ${formatVnd(order.pricing.shippingFee)}. Tổng đơn: ${formatVnd(order.pricing.grandTotal)}. Cọc cần thanh toán: ${formatVnd(order.pricing.depositRequired)}. Xem đơn: ${link}`,
      html: `<p>Phí giao của đơn <strong>${escapeHtml(order.orderNumber)}</strong> đã cập nhật thành ${escapeHtml(formatVnd(order.pricing.shippingFee))}.</p><p>Tổng đơn: ${escapeHtml(formatVnd(order.pricing.grandTotal))}. Cọc cần thanh toán: ${escapeHtml(formatVnd(order.pricing.depositRequired))}.</p><p><a href="${escapeHtml(link)}">Xem đơn hàng</a></p>`,
    });
  }

  public sendShipmentHandedOver(order: {
    id: string;
    orderNumber: string;
    contact: { email: string };
    shipments: Array<{
      status: string;
      carrierName: string;
      trackingCode: string;
      trackingUrl: string | null;
    }>;
  }): Promise<void> {
    const shipment = order.shipments.find(({ status }) => status === 'HANDED_TO_CARRIER');
    if (shipment === undefined) return Promise.resolve();
    const link = safeHttpsUrl(shipment.trackingUrl) ?? this.orderLink(order.orderNumber);
    return this.deliver('shipment.handed_over', order.id, {
      to: order.contact.email,
      subject: `[rePhone] Đơn ${order.orderNumber} đã bàn giao vận chuyển`,
      text: `Đơn ${order.orderNumber} đã bàn giao cho ${shipment.carrierName}. Mã vận đơn: ${shipment.trackingCode}. Theo dõi: ${link}`,
      html: `<p>Đơn <strong>${escapeHtml(order.orderNumber)}</strong> đã bàn giao cho ${escapeHtml(shipment.carrierName)}.</p><p>Mã vận đơn: <strong>${escapeHtml(shipment.trackingCode)}</strong>.</p><p><a href="${escapeHtml(link)}">Theo dõi đơn hàng</a></p>`,
    });
  }

  private orderLink(orderNumber: string, token?: string): string {
    const base = `${this.config.api.webPublicUrl}/orders/${encodeURIComponent(orderNumber)}`;
    return token === undefined ? base : `${base}#token=${encodeURIComponent(token)}`;
  }

  private async deliver(
    template: string,
    resourceId: string,
    message: { to: string; subject: string; text: string; html: string },
  ): Promise<void> {
    await this.delivery.deliver({ template, resourceId, message });
  }
}

function formatVnd(value: string): string {
  return `${BigInt(value).toLocaleString('vi-VN')} ₫`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
