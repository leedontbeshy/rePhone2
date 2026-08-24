import { describe, expect, it } from 'vitest';
import type { MailMessage, MailProvider } from '../../common/providers/mail-provider.js';
import type { AppConfig } from '../../config/app-config.js';
import type { OrderDetailDto } from '../orders/order-response.dto.js';
import { OrderNotificationService } from './order-notification.service.js';

class RecordingMailProvider implements MailProvider {
  public readonly messages: MailMessage[] = [];

  public send(message: MailMessage): Promise<void> {
    this.messages.push(message);
    return Promise.resolve();
  }
}

describe('OrderNotificationService', () => {
  it('renders a guest link with token in the fragment and keeps it out of the subject', async () => {
    const mail = new RecordingMailProvider();
    const service = new OrderNotificationService(mail, config());
    const token = 'A'.repeat(43);
    await service.sendPlaced(orderFixture(), token);
    expect(mail.messages).toHaveLength(1);
    expect(mail.messages[0]?.subject).toBe('[rePhone] Đã nhận đơn RPH-20260821-23456789');
    expect(mail.messages[0]?.subject).not.toContain(token);
    expect(mail.messages[0]?.text).toContain(`/orders/RPH-20260821-23456789#token=${token}`);
  });

  it('includes a pending refund amount in cancellation mail', async () => {
    const mail = new RecordingMailProvider();
    const service = new OrderNotificationService(mail, config());
    const order = orderFixture();
    order.status = 'CANCELLED';
    order.cancelReason = 'Khách thay đổi nhu cầu';
    order.refunds = [
      {
        id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6999',
        amount: '500000',
        method: 'BANK_TRANSFER',
        status: 'REQUESTED',
        reason: order.cancelReason,
        terminalReason: null,
        processingAt: null,
        completedAt: null,
        terminalAt: null,
        createdAt: '2026-08-21T00:00:00.000Z',
      },
    ];
    await service.sendCancelled(order);
    expect(mail.messages[0]?.text).toContain('500.000 ₫');
    expect(mail.messages[0]?.text).toContain('đang chờ xử lý');
  });

  it('renders pickup ready instructions with the store and strict hold deadline', async () => {
    const mail = new RecordingMailProvider();
    const service = new OrderNotificationService(mail, config());
    await service.sendPickupReady({
      id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6998',
      orderNumber: 'RPH-20260821-23456789',
      contact: { email: 'customer@example.com' },
      location: { name: 'rePhone Quận 1' },
      pickupHoldUntil: '2026-08-24T03:00:00.000Z',
      storeAddress: '123 Nguyễn Huệ, Quận 1',
    });

    expect(mail.messages).toHaveLength(1);
    expect(mail.messages[0]?.text).toContain('rePhone Quận 1');
    expect(mail.messages[0]?.text).toContain('123 Nguyễn Huệ, Quận 1');
    expect(mail.messages[0]?.text).toContain('/orders/RPH-20260821-23456789');
    expect(mail.messages[0]?.text).not.toContain('#token=');
  });

  it('renders the authoritative paid totals and issued warranty codes on completion', async () => {
    const mail = new RecordingMailProvider();
    const service = new OrderNotificationService(mail, config());
    await service.sendCompleted({
      id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6998',
      orderNumber: 'RPH-20260821-23456789',
      contact: { email: 'customer@example.com' },
      pricing: { paidAmount: '1030000', refundedAmount: '0' },
      items: [{ warranty: { warrantyCode: 'RPH-W-20260821-23456789' } }, { warranty: null }],
    });

    expect(mail.messages[0]?.text).toContain('1.030.000 ₫');
    expect(mail.messages[0]?.text).toContain('RPH-W-20260821-23456789');
  });

  it('falls back to the order portal when tracking contains authority credentials', async () => {
    const mail = new RecordingMailProvider();
    const service = new OrderNotificationService(mail, config());

    await service.sendShipmentHandedOver({
      id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6998',
      orderNumber: 'RPH-20260821-23456789',
      contact: { email: 'customer@example.com' },
      shipments: [
        {
          status: 'HANDED_TO_CARRIER',
          carrierName: 'Carrier test',
          trackingCode: 'TRACK-09',
          trackingUrl: 'https://carrier-user:carrier-password@tracking.example/TRACK-09',
        },
      ],
    });

    expect(mail.messages[0]?.text).toContain('/orders/RPH-20260821-23456789');
    expect(mail.messages[0]?.text).not.toContain('carrier-password');
    expect(mail.messages[0]?.html).not.toContain('carrier-password');
  });
});

function config(): AppConfig {
  return { api: { webPublicUrl: 'http://localhost:3001' } } as AppConfig;
}

function orderFixture(): OrderDetailDto {
  return {
    id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6998',
    orderNumber: 'RPH-20260821-23456789',
    status: 'PLACED',
    fulfillmentStatus: 'PENDING',
    paymentStatus: 'UNPAID',
    fulfillmentType: 'SHIPPING',
    contact: { fullName: 'Khách', email: 'customer@example.com', phone: '0900000000' },
    shippingAddress: null,
    items: [],
    pricing: {
      subtotal: '1000000',
      itemDiscountAmount: '0',
      voucherDiscountAmount: '0',
      shippingFee: '30000',
      grandTotal: '1030000',
      depositRequired: '500000',
      paidAmount: '0',
      refundedAmount: '0',
      balanceDue: '1030000',
    },
    voucherCode: null,
    paymentAttempts: [
      {
        id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6997',
        purpose: 'DEPOSIT',
        method: 'BANK_TRANSFER',
        status: 'AWAITING_PROOF',
        expectedAmount: '500000',
        receivedAmount: null,
        transferContent: 'RPH2026082123456789',
        bankName: 'Demo Bank',
        bankAccountNumber: '123456',
        bankAccountHolder: 'REPHONE',
        bankQrUrl: null,
        bankTransferInstructions: {
          bankName: 'Demo Bank',
          accountNumber: '123456',
          accountHolder: 'REPHONE',
          qrUrl: null,
          transferContent: 'RPH2026082123456789',
        },
        expiresAt: '2026-08-21T00:30:00.000Z',
        submittedAt: null,
        reviewSlaDueAt: null,
        reviewOverdue: false,
        rejectionReason: null,
      },
    ],
    refunds: [],
    shipment: null,
    customerNote: null,
    placedAt: '2026-08-21T00:00:00.000Z',
    confirmedAt: null,
    pickupHoldUntil: null,
    pickupReadyAt: null,
    pickedUpAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelReason: null,
    availableActions: ['CANCEL'],
  };
}
