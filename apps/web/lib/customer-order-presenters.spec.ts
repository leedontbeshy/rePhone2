import { describe, expect, it } from 'vitest';
import {
  canCreateAfterSalesRequest,
  fulfillmentStatusLabel,
  orderJourney,
  orderStatusLabel,
  selectPaymentProofAttempt,
  statusTone,
  warrantyStatusLabel,
} from './customer-order-presenters';

describe('customer order presenters', () => {
  it('describes pending fulfillment without contradicting a confirmed order', () => {
    expect(fulfillmentStatusLabel('PENDING')).toBe('Chờ chuẩn bị');
    expect(fulfillmentStatusLabel('PENDING')).not.toContain('xác nhận');
  });

  it('uses validity projections instead of treating every active warranty as valid', () => {
    expect(warrantyStatusLabel({ status: 'ACTIVE', isValid: true, isExpired: false })).toBe(
      'Còn hiệu lực',
    );
    expect(warrantyStatusLabel({ status: 'ACTIVE', isValid: false, isExpired: true })).toBe(
      'Đã hết hạn',
    );
    expect(warrantyStatusLabel({ status: 'ACTIVE', isValid: false, isExpired: false })).toBe(
      'Chưa hiệu lực',
    );
    expect(warrantyStatusLabel({ status: 'VOIDED', isValid: false, isExpired: false })).toBe(
      'Đã vô hiệu',
    );
  });

  it('uses a neutral label and non-success tone for a future order state', () => {
    expect(orderStatusLabel('FUTURE_STATE')).toBe('Đang cập nhật');
    expect(statusTone('FUTURE_STATE')).toBe('info');
  });

  it('renders cancellation as a terminal branch instead of a successful journey', () => {
    const stages = orderJourney({
      status: 'CANCELLED',
      placedAt: '2026-08-20T10:00:00.000Z',
      cancelledAt: '2026-08-20T11:00:00.000Z',
    } as Parameters<typeof orderJourney>[0]);
    expect(stages.at(-1)).toMatchObject({ id: 'cancelled', state: 'terminal', tone: 'danger' });
  });

  it('describes an unconfirmed placed order as waiting instead of already confirmed', () => {
    const stages = orderJourney({
      status: 'PLACED',
      fulfillmentType: 'PICKUP',
      fulfillmentStatus: 'PENDING',
      placedAt: '2026-08-20T10:00:00.000Z',
    } as Parameters<typeof orderJourney>[0]);
    expect(stages[0]).toMatchObject({ label: 'Đã đặt hàng', state: 'complete' });
    expect(stages.find((stage) => stage.state === 'current')).toMatchObject({
      id: 'confirmed',
      label: 'Chờ xác nhận',
      at: null,
    });
    expect(
      stages.filter((stage) => stage.at === null).every((stage) => stage.label.startsWith('Chờ')),
    ).toBe(true);
  });

  it('does not announce delivery before its recorded timestamp', () => {
    const stages = orderJourney({
      status: 'PROCESSING',
      fulfillmentType: 'SHIPPING',
      fulfillmentStatus: 'IN_TRANSIT',
      placedAt: '2026-08-20T10:00:00.000Z',
      confirmedAt: '2026-08-20T11:00:00.000Z',
      shipment: { shippedAt: '2026-08-20T12:00:00.000Z' },
    } as Parameters<typeof orderJourney>[0]);
    expect(stages.find((stage) => stage.state === 'current')).toMatchObject({
      id: 'delivered',
      label: 'Chờ giao thành công',
      at: null,
    });
    expect(stages.find((stage) => stage.id === 'confirmed')).toMatchObject({
      label: 'Đã xác nhận',
      state: 'complete',
    });
  });

  it.each([
    ['FAILED', 'failed', 'Giao hàng không thành công'],
    ['RETURNED', 'returned', 'Hàng đã hoàn về'],
  ] as const)('renders shipping %s as a terminal branch', (fulfillmentStatus, id, label) => {
    const stages = orderJourney({
      status: 'PROCESSING',
      fulfillmentType: 'SHIPPING',
      fulfillmentStatus,
      placedAt: '2026-08-20T10:00:00.000Z',
      confirmedAt: '2026-08-20T11:00:00.000Z',
      shipment: {
        status: fulfillmentStatus,
        shippedAt: '2026-08-20T12:00:00.000Z',
        failedAt: '2026-08-21T10:00:00.000Z',
        returnedAt: fulfillmentStatus === 'RETURNED' ? '2026-08-22T10:00:00.000Z' : null,
      },
    } as Parameters<typeof orderJourney>[0]);
    expect(stages.at(-1)).toMatchObject({ id, label, state: 'terminal' });
    expect(
      stages.some((stage) => stage.label === 'Đã giao hàng' && stage.state === 'current'),
    ).toBe(false);
  });

  it('selects only an unexpired deposit bank-transfer proof attempt', () => {
    const eligible = {
      id: 'eligible',
      purpose: 'DEPOSIT',
      method: 'BANK_TRANSFER',
      status: 'AWAITING_PROOF',
      expiresAt: '2026-08-29T00:00:00.000Z',
    };
    const order = {
      availableActions: ['SUBMIT_PAYMENT_PROOF'],
      paymentAttempts: [
        { ...eligible, id: 'balance', purpose: 'BALANCE' },
        { ...eligible, id: 'expired', expiresAt: '2026-08-27T00:00:00.000Z' },
        eligible,
      ],
    } as Parameters<typeof selectPaymentProofAttempt>[0];
    expect(selectPaymentProofAttempt(order, Date.parse('2026-08-28T00:00:00.000Z'))?.id).toBe(
      'eligible',
    );
  });

  it('allows post-purchase support only after the order is completed', () => {
    expect(
      canCreateAfterSalesRequest({
        status: 'COMPLETED',
        completedAt: '2026-08-28T00:00:00.000Z',
      }),
    ).toBe(true);
    expect(canCreateAfterSalesRequest({ status: 'CONFIRMED', completedAt: null })).toBe(false);
    expect(canCreateAfterSalesRequest({ status: 'CANCELLED', completedAt: null })).toBe(false);
    expect(canCreateAfterSalesRequest({ status: 'COMPLETED', completedAt: null })).toBe(false);
  });
});
