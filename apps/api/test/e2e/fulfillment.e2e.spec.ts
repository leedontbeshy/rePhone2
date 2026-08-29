import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { AuthRateLimiter } from '../../src/modules/auth/auth-rate-limiter.service.js';
import { BackofficeRateLimiter } from '../../src/modules/auth/backoffice-rate-limiter.service.js';
import { PickupExpiryService } from '../../src/modules/fulfillment/pickup-expiry.service.js';
import { OrderRateLimiter } from '../../src/modules/orders/order-rate-limiter.service.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

describe('Slice 08 pickup fulfillment HTTP contract', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: Server;

  beforeAll(async () => {
    setTestEnvironment();
    const { createApplication } = await import('../../src/application.js');
    app = await createApplication({ enableSwagger: false });
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer() as Server;
    prisma = createTestPrisma();
  });

  beforeEach(async () => {
    app.get(AuthRateLimiter).clear();
    app.get(BackofficeRateLimiter).clear();
    app.get(OrderRateLimiter).clear();
    await resetTestDatabase(prisma);
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('enforces the role matrix on all eight routes with no-store responses', async () => {
    const missingId = '00000000-0000-4000-8000-000000000000';
    const protectedRequests = [
      (headers: Record<string, string>) =>
        request(server).get('/api/v1/backoffice/orders').set(headers),
      (headers: Record<string, string>) =>
        request(server).get(`/api/v1/backoffice/orders/${missingId}`).set(headers),
      (headers: Record<string, string>) =>
        request(server)
          .patch(`/api/v1/backoffice/orders/${missingId}/internal-note`)
          .set(headers)
          .send({ internalNote: 'Kiểm thử phân quyền' }),
      (headers: Record<string, string>) =>
        request(server).post(`/api/v1/backoffice/orders/${missingId}/confirm`).set(headers),
      (headers: Record<string, string>) =>
        request(server).post(`/api/v1/backoffice/orders/${missingId}/start-preparing`).set(headers),
      (headers: Record<string, string>) =>
        request(server)
          .post(`/api/v1/backoffice/orders/${missingId}/mark-pickup-ready`)
          .set(headers),
      (headers: Record<string, string>) =>
        request(server)
          .post(`/api/v1/backoffice/orders/${missingId}/extend-pickup-hold`)
          .set(headers)
          .send({
            holdUntil: '2026-08-24T00:00:00.000Z',
            reason: 'Kiểm thử phân quyền route',
          }),
      (headers: Record<string, string>) =>
        request(server)
          .post(`/api/v1/backoffice/orders/${missingId}/complete-pickup`)
          .set(headers)
          .send({ confirmCashCollected: true }),
    ];
    for (const buildRequest of protectedRequests) {
      const anonymous = await buildRequest({}).expect(401);
      expectNoStore(anonymous);
      expect(errorCode(anonymous)).toBe('AUTH_REQUIRED');
    }

    const customer = await login(server, 'CUSTOMER');
    for (const buildRequest of protectedRequests) {
      const forbidden = await buildRequest(bearer(customer)).expect(403);
      expectNoStore(forbidden);
      expect(errorCode(forbidden)).toBe('FORBIDDEN');
    }

    for (const role of ['EMPLOYEE', 'ADMIN'] as const) {
      const token = await login(server, role);
      const allowed = await request(server)
        .get('/api/v1/backoffice/orders')
        .set(bearer(token))
        .expect(200);
      expectNoStore(allowed);
      expect(successArray(allowed)).toEqual([]);
      expect(pagination(allowed)).toEqual({
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      });
    }
  });

  it('covers all eight operations through confirm, extend, prepare, ready and cash completion', async () => {
    const fixture = await createCustomerPickupOrder(server, prisma);
    const employee = await login(server, 'EMPLOYEE');
    const authorization = bearer(employee);

    const list = await request(server)
      .get('/api/v1/backoffice/orders')
      .set(authorization)
      .query({
        q: fixture.orderNumber,
        fulfillmentType: 'PICKUP',
        page: 1,
        pageSize: 10,
      })
      .expect(200);
    expectNoStore(list);
    expect(successArray(list)).toEqual([
      expect.objectContaining({
        id: fixture.orderId,
        orderNumber: fixture.orderNumber,
        fulfillmentType: 'PICKUP',
        status: 'PLACED',
        fulfillmentStatus: 'PENDING',
        paymentStatus: 'UNPAID',
        availableActions: ['CONFIRM', 'EXTEND_PICKUP_HOLD', 'CANCEL_ORDER'],
      }),
    ]);

    const detailResponse = await request(server)
      .get(`/api/v1/backoffice/orders/${fixture.orderId}`)
      .set(authorization)
      .expect(200);
    expectNoStore(detailResponse);
    expect(successRecord(detailResponse)).toMatchObject({
      id: fixture.orderId,
      orderNumber: fixture.orderNumber,
      internalNote: null,
      pickupReadyAt: null,
      pickedUpAt: null,
      availableActions: ['CONFIRM', 'EXTEND_PICKUP_HOLD', 'CANCEL_ORDER'],
    });

    const noted = await request(server)
      .patch(`/api/v1/backoffice/orders/${fixture.orderId}/internal-note`)
      .set(authorization)
      .send({ internalNote: '  Gọi khách trước khi đến nhận  ' })
      .expect(200);
    expectNoStore(noted);
    expect(successRecord(noted)).toMatchObject({
      internalNote: 'Gọi khách trước khi đến nhận',
    });

    const confirmed = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/confirm`)
      .set(authorization)
      .expect(200);
    expectNoStore(confirmed);
    expect(successRecord(confirmed)).toMatchObject({
      status: 'CONFIRMED',
      fulfillmentStatus: 'PENDING',
      availableActions: ['START_PREPARING', 'EXTEND_PICKUP_HOLD', 'CANCEL_ORDER'],
    });

    const extendedHold = new Date(fixture.originalHoldUntil.getTime() + 60 * 60 * 1_000);
    const extended = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/extend-pickup-hold`)
      .set(authorization)
      .send({
        holdUntil: extendedHold.toISOString(),
        reason: 'Khách đã xác nhận sẽ đến nhận muộn hơn',
      })
      .expect(200);
    expectNoStore(extended);
    expect(successRecord(extended)).toMatchObject({
      pickupHoldUntil: extendedHold.toISOString(),
    });
    expect(
      await prisma.inventoryReservation.findUniqueOrThrow({
        where: { id: fixture.reservationId },
        select: { expiresAt: true },
      }),
    ).toEqual({ expiresAt: extendedHold });

    const invalidReady = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/mark-pickup-ready`)
      .set(authorization)
      .expect(409);
    expectNoStore(invalidReady);
    expect(errorCode(invalidReady)).toBe('INVALID_STATE_TRANSITION');

    const preparing = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/start-preparing`)
      .set(authorization)
      .expect(200);
    expectNoStore(preparing);
    expect(successRecord(preparing)).toMatchObject({
      status: 'PROCESSING',
      fulfillmentStatus: 'PREPARING',
      availableActions: ['MARK_PICKUP_READY', 'EXTEND_PICKUP_HOLD', 'CANCEL_ORDER'],
    });

    const ready = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/mark-pickup-ready`)
      .set(authorization)
      .expect(200);
    expectNoStore(ready);
    expect(successRecord(ready)).toMatchObject({
      status: 'PROCESSING',
      fulfillmentStatus: 'READY',
      availableActions: ['EXTEND_PICKUP_HOLD', 'COMPLETE_PICKUP', 'CANCEL_ORDER'],
    });
    expect(stringProperty(successRecord(ready), 'pickupReadyAt')).toMatch(/Z$/);

    const unpaid = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/complete-pickup`)
      .set(authorization)
      .send({})
      .expect(422);
    expectNoStore(unpaid);
    expect(errorCode(unpaid)).toBe('ORDER_NOT_FULLY_PAID');
    expect(await prisma.payment.count({ where: { orderId: fixture.orderId } })).toBe(0);

    const completed = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/complete-pickup`)
      .set(authorization)
      .send({ confirmCashCollected: true })
      .expect(200);
    expectNoStore(completed);
    const completedOrder = successRecord(completed);
    expect(completedOrder).toMatchObject({
      status: 'COMPLETED',
      fulfillmentStatus: 'COMPLETED',
      paymentStatus: 'PAID',
      availableActions: ['CREATE_REFUND'],
      pricing: {
        grandTotal: fixture.grandTotal,
        paidAmount: fixture.grandTotal,
        balanceDue: '0',
      },
      reservations: [expect.objectContaining({ id: fixture.reservationId, status: 'CONSUMED' })],
      paymentAttempts: [
        expect.objectContaining({
          purpose: 'FULL_PAYMENT',
          method: 'CASH',
          status: 'VERIFIED',
          expectedAmount: fixture.grandTotal,
          receivedAmount: fixture.grandTotal,
        }),
      ],
    });
    expect(stringProperty(completedOrder, 'pickedUpAt')).toBe(
      stringProperty(completedOrder, 'completedAt'),
    );
    const items = arrayProperty(completedOrder, 'items');
    expect(items).toHaveLength(1);
    expect(record(items[0])['warranty']).toEqual(expect.objectContaining({ status: 'ACTIVE' }));

    const [cashPayments, saleMovements, warranties, stock, persistedOrder, auditLogs] =
      await Promise.all([
        prisma.payment.findMany({
          where: { orderId: fixture.orderId, method: 'CASH', purpose: 'FULL_PAYMENT' },
        }),
        prisma.stockMovement.findMany({
          where: {
            type: 'SALE',
            referenceType: 'INVENTORY_RESERVATION',
            referenceId: fixture.reservationId,
          },
        }),
        prisma.warranty.findMany({ where: { orderItem: { orderId: fixture.orderId } } }),
        prisma.stockLevel.findUniqueOrThrow({ where: { id: fixture.stockLevelId } }),
        prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
        prisma.auditLog.findMany({ where: { resourceId: fixture.orderId } }),
      ]);
    expect(cashPayments).toHaveLength(1);
    const cashPayment = cashPayments[0];
    if (cashPayment === undefined) throw new Error('Expected one cash payment');
    expect(cashPayment.status).toBe('VERIFIED');
    expect(cashPayment.expectedAmount.toString()).toBe(fixture.grandTotal);
    expect(cashPayment.receivedAmount?.toString()).toBe(fixture.grandTotal);
    expect(saleMovements).toHaveLength(1);
    expect(warranties).toHaveLength(1);
    expect(stock.quantityOnHand).toBe(fixture.quantityOnHandAfterCheckout - 1);
    expect(stock.quantityReserved).toBe(fixture.quantityReservedAfterCheckout - 1);
    expect(persistedOrder).toMatchObject({
      status: 'COMPLETED',
      fulfillmentStatus: 'COMPLETED',
      paymentStatus: 'PAID',
    });
    expect(persistedOrder.balanceDue.toString()).toBe('0');
    expect(auditLogs.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        'order.internal_note_updated',
        'fulfillment.pickup_confirmed',
        'fulfillment.pickup_hold_extended',
        'fulfillment.preparation_started',
        'fulfillment.pickup_ready',
        'fulfillment.pickup_completed',
      ]),
    );

    const replay = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/complete-pickup`)
      .set(authorization)
      .send({})
      .expect(200);
    expectNoStore(replay);
    expect(successRecord(replay)).toMatchObject({
      status: 'COMPLETED',
      fulfillmentStatus: 'COMPLETED',
    });
    expect(await prisma.payment.count({ where: { orderId: fixture.orderId } })).toBe(1);
    expect(
      await prisma.stockMovement.count({ where: { referenceId: fixture.reservationId } }),
    ).toBe(1);
    expect(
      await prisma.warranty.count({ where: { orderItem: { orderId: fixture.orderId } } }),
    ).toBe(1);
  });

  it('sells a serialized iPhone without creating a quantity stock movement', async () => {
    const fixture = await createCustomerIphonePickupOrder(server, prisma);
    const employee = await login(server, 'EMPLOYEE');
    const [unitBefore, reservationBefore] = await Promise.all([
      prisma.inventoryUnit.findUniqueOrThrow({ where: { id: fixture.inventoryUnitId } }),
      prisma.inventoryReservation.findUniqueOrThrow({ where: { id: fixture.reservationId } }),
    ]);
    expect(unitBefore).toMatchObject({ lifecycleStatus: 'AVAILABLE', soldAt: null });
    expect(reservationBefore).toMatchObject({
      status: 'ACTIVE',
      inventoryUnitId: fixture.inventoryUnitId,
      stockLevelId: null,
      consumedAt: null,
    });

    await advancePickupToReady(server, fixture.orderId, employee);
    const completed = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/complete-pickup`)
      .set(bearer(employee))
      .send({ confirmCashCollected: true })
      .expect(200);
    expectNoStore(completed);
    const completedOrder = successRecord(completed);
    expect(completedOrder).toMatchObject({
      status: 'COMPLETED',
      fulfillmentStatus: 'COMPLETED',
    });

    const [unitAfter, reservationAfter, saleMovementCount] = await Promise.all([
      prisma.inventoryUnit.findUniqueOrThrow({ where: { id: fixture.inventoryUnitId } }),
      prisma.inventoryReservation.findUniqueOrThrow({ where: { id: fixture.reservationId } }),
      prisma.stockMovement.count({
        where: {
          type: 'SALE',
          referenceType: 'INVENTORY_RESERVATION',
          referenceId: fixture.reservationId,
        },
      }),
    ]);
    expect(unitAfter.lifecycleStatus).toBe('SOLD');
    expect(unitAfter.soldAt?.toISOString()).toBe(stringProperty(completedOrder, 'pickedUpAt'));
    expect(reservationAfter).toMatchObject({
      status: 'CONSUMED',
      inventoryUnitId: fixture.inventoryUnitId,
      stockLevelId: null,
    });
    expect(reservationAfter.consumedAt?.toISOString()).toBe(
      stringProperty(completedOrder, 'pickedUpAt'),
    );
    expect(saleMovementCount).toBe(0);
  });

  it('consumes a reserved voucher usage when pickup completes', async () => {
    const voucher = await createActiveFixedVoucher(prisma, 'E2E-CONSUME', '1000');
    const fixture = await createCustomerPickupOrder(server, prisma, {
      voucherCode: voucher.code,
    });
    const employee = await login(server, 'EMPLOYEE');
    const usageBefore = await prisma.voucherUsage.findUniqueOrThrow({
      where: { orderId: fixture.orderId },
    });
    expect(usageBefore).toMatchObject({
      voucherId: voucher.id,
      status: 'RESERVED',
      consumedAt: null,
      releasedAt: null,
    });

    await advancePickupToReady(server, fixture.orderId, employee);
    const completed = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/complete-pickup`)
      .set(bearer(employee))
      .send({ confirmCashCollected: true })
      .expect(200);
    expectNoStore(completed);
    const completedOrder = successRecord(completed);
    const usageAfter = await prisma.voucherUsage.findUniqueOrThrow({
      where: { orderId: fixture.orderId },
    });
    expect(usageAfter).toMatchObject({
      id: usageBefore.id,
      voucherId: voucher.id,
      status: 'CONSUMED',
      releasedAt: null,
    });
    expect(usageAfter.consumedAt?.toISOString()).toBe(stringProperty(completedOrder, 'pickedUpAt'));
  });

  it('completes a zero-balance pickup without a payment and rejects cash confirmation', async () => {
    const target = await quantityPickupTarget(prisma);
    const voucher = await createActiveFixedVoucher(prisma, 'E2E-ZERO-BALANCE', target.salePrice);
    const fixture = await createCustomerPickupOrder(server, prisma, {
      target,
      voucherCode: voucher.code,
    });
    expect(fixture.grandTotal).toBe('0');
    expect(await prisma.payment.count({ where: { orderId: fixture.orderId } })).toBe(0);

    const employee = await login(server, 'EMPLOYEE');
    await advancePickupToReady(server, fixture.orderId, employee);
    const rejectedCash = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/complete-pickup`)
      .set(bearer(employee))
      .send({ confirmCashCollected: true })
      .expect(400);
    expectNoStore(rejectedCash);
    expect(errorCode(rejectedCash)).toBe('VALIDATION_FAILED');
    expect(arrayProperty(objectProperty(rejectedCash.body as unknown, 'error'), 'details')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'confirmCashCollected',
          code: 'CASH_NOT_REQUIRED',
        }),
      ]),
    );
    const [orderAfterRejection, reservationAfterRejection, usageAfterRejection] = await Promise.all(
      [
        prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
        prisma.inventoryReservation.findUniqueOrThrow({ where: { id: fixture.reservationId } }),
        prisma.voucherUsage.findUniqueOrThrow({ where: { orderId: fixture.orderId } }),
      ],
    );
    expect(orderAfterRejection).toMatchObject({
      status: 'PROCESSING',
      fulfillmentStatus: 'READY',
      paymentStatus: 'PAID',
    });
    expect(orderAfterRejection.balanceDue.toString()).toBe('0');
    expect(reservationAfterRejection.status).toBe('ACTIVE');
    expect(usageAfterRejection.status).toBe('RESERVED');
    expect(await prisma.payment.count({ where: { orderId: fixture.orderId } })).toBe(0);

    const completed = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/complete-pickup`)
      .set(bearer(employee))
      .send({})
      .expect(200);
    expectNoStore(completed);
    expect(successRecord(completed)).toMatchObject({
      status: 'COMPLETED',
      fulfillmentStatus: 'COMPLETED',
      paymentStatus: 'PAID',
      pricing: { grandTotal: '0', paidAmount: '0', balanceDue: '0' },
      paymentAttempts: [],
    });
    expect(await prisma.payment.count({ where: { orderId: fixture.orderId } })).toBe(0);
  });

  it('returns one ready projection and writes one audit under concurrent ready replay', async () => {
    const fixture = await createCustomerPickupOrder(server, prisma);
    const employee = await login(server, 'EMPLOYEE');
    const admin = await login(server, 'ADMIN');
    await advancePickupToPreparing(server, fixture.orderId, employee);
    const barrier = new Barrier(2);

    const responses = await Promise.all(
      [employee, admin].map(async (token) => {
        await barrier.arrive();
        return request(server)
          .post(`/api/v1/backoffice/orders/${fixture.orderId}/mark-pickup-ready`)
          .set(bearer(token));
      }),
    );

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    const readyInstants = responses.map((response) => {
      expectNoStore(response);
      const projection = successRecord(response);
      expect(projection).toMatchObject({
        status: 'PROCESSING',
        fulfillmentStatus: 'READY',
      });
      return stringProperty(projection, 'pickupReadyAt');
    });
    expect(new Set(readyInstants).size).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { resourceId: fixture.orderId, action: 'fulfillment.pickup_ready' },
      }),
    ).toBe(1);
    expect(
      await prisma.inventoryReservation.findUniqueOrThrow({
        where: { id: fixture.reservationId },
        select: { status: true },
      }),
    ).toEqual({ status: 'ACTIVE' });
    expect(await prisma.payment.count({ where: { orderId: fixture.orderId } })).toBe(0);
    expect(
      await prisma.stockMovement.count({ where: { referenceId: fixture.reservationId } }),
    ).toBe(0);
  });

  it('finalizes concurrent complete requests once and returns a replay projection', async () => {
    const fixture = await createCustomerPickupOrder(server, prisma);
    const employee = await login(server, 'EMPLOYEE');
    const admin = await login(server, 'ADMIN');
    await advancePickupToReady(server, fixture.orderId, employee);
    const barrier = new Barrier(2);

    const responses = await Promise.all(
      [employee, admin].map(async (token) => {
        await barrier.arrive();
        return request(server)
          .post(`/api/v1/backoffice/orders/${fixture.orderId}/complete-pickup`)
          .set(bearer(token))
          .send({ confirmCashCollected: true });
      }),
    );

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    for (const response of responses) {
      expectNoStore(response);
      expect(successRecord(response)).toMatchObject({
        status: 'COMPLETED',
        fulfillmentStatus: 'COMPLETED',
        paymentStatus: 'PAID',
        availableActions: ['CREATE_REFUND'],
      });
    }
    const [order, reservation, stock, cashCount, movementCount, warrantyCount, completionAudits] =
      await Promise.all([
        prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
        prisma.inventoryReservation.findUniqueOrThrow({
          where: { id: fixture.reservationId },
        }),
        prisma.stockLevel.findUniqueOrThrow({ where: { id: fixture.stockLevelId } }),
        prisma.payment.count({
          where: { orderId: fixture.orderId, method: 'CASH', purpose: 'FULL_PAYMENT' },
        }),
        prisma.stockMovement.count({
          where: {
            type: 'SALE',
            referenceType: 'INVENTORY_RESERVATION',
            referenceId: fixture.reservationId,
          },
        }),
        prisma.warranty.count({ where: { orderItem: { orderId: fixture.orderId } } }),
        prisma.auditLog.count({
          where: { resourceId: fixture.orderId, action: 'fulfillment.pickup_completed' },
        }),
      ]);
    expect(order).toMatchObject({
      status: 'COMPLETED',
      fulfillmentStatus: 'COMPLETED',
      paymentStatus: 'PAID',
    });
    expect(order.pickedUpAt).toEqual(order.completedAt);
    expect(reservation.status).toBe('CONSUMED');
    expect(stock.quantityOnHand).toBe(fixture.quantityOnHandAfterCheckout - 1);
    expect(stock.quantityReserved).toBe(fixture.quantityReservedAfterCheckout - 1);
    expect({ cashCount, movementCount, warrantyCount, completionAudits }).toEqual({
      cashCount: 1,
      movementCount: 1,
      warrantyCount: 1,
      completionAudits: 1,
    });
  });

  it('keeps extend and expiry mutually exclusive at the pickup deadline', async () => {
    const fixture = await createCustomerPickupOrder(server, prisma);
    const employee = await login(server, 'EMPLOYEE');
    const requestedHold = new Date(fixture.originalHoldUntil.getTime() + 60 * 60 * 1_000);
    const expiryInstant = new Date(fixture.originalHoldUntil.getTime() + 1);
    const barrier = new Barrier(2);

    const [extension, expired] = await Promise.all([
      (async () => {
        await barrier.arrive();
        return request(server)
          .post(`/api/v1/backoffice/orders/${fixture.orderId}/extend-pickup-hold`)
          .set(bearer(employee))
          .send({
            holdUntil: requestedHold.toISOString(),
            reason: 'Khách xác nhận đến muộn trong lúc job hết hạn chạy',
          });
      })(),
      (async () => {
        await barrier.arrive();
        return app
          .get(PickupExpiryService)
          .expireOrder(fixture.orderId, expiryInstant, `e2e:pickup-expiry-race:${fixture.orderId}`);
      })(),
    ]);

    expect([200, 409]).toContain(extension.status);
    expectNoStore(extension);
    const [order, reservation, stock, transitionAudits] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
      prisma.inventoryReservation.findUniqueOrThrow({
        where: { id: fixture.reservationId },
      }),
      prisma.stockLevel.findUniqueOrThrow({ where: { id: fixture.stockLevelId } }),
      prisma.auditLog.findMany({
        where: {
          resourceId: fixture.orderId,
          action: {
            in: ['fulfillment.pickup_hold_extended', 'fulfillment.pickup_expired'],
          },
        },
        select: { action: true },
      }),
    ]);
    expect(transitionAudits).toHaveLength(1);

    if (extension.status === 200) {
      expect(expired).toBe(false);
      expect(order).toMatchObject({ status: 'PLACED', fulfillmentStatus: 'PENDING' });
      expect(order.pickupHoldUntil).toEqual(requestedHold);
      expect(reservation).toMatchObject({ status: 'ACTIVE', expiresAt: requestedHold });
      expect(stock.quantityReserved).toBe(fixture.quantityReservedAfterCheckout);
      expect(transitionAudits).toEqual([{ action: 'fulfillment.pickup_hold_extended' }]);
    } else {
      expect(errorCode(extension)).toBe('INVALID_STATE_TRANSITION');
      expect(expired).toBe(true);
      expect(order).toMatchObject({ status: 'CANCELLED', fulfillmentStatus: 'CANCELLED' });
      expect(reservation.status).toBe('EXPIRED');
      expect(stock.quantityReserved).toBe(fixture.quantityReservedAfterCheckout - 1);
      expect(transitionAudits).toEqual([{ action: 'fulfillment.pickup_expired' }]);
    }
    expect(stock.quantityOnHand).toBe(fixture.quantityOnHandAfterCheckout);
    expect(await prisma.payment.count({ where: { orderId: fixture.orderId } })).toBe(0);
    expect(
      await prisma.warranty.count({ where: { orderItem: { orderId: fixture.orderId } } }),
    ).toBe(0);
  });

  it('keeps list and detail p95 below 500ms with 20 concurrent readers', async () => {
    const fixture = await createCustomerPickupOrder(server, prisma);
    const employee = await login(server, 'EMPLOYEE');
    const authorization = bearer(employee);
    await request(server)
      .get('/api/v1/backoffice/orders')
      .set(authorization)
      .query({ q: fixture.orderNumber })
      .expect(200);
    await request(server)
      .get(`/api/v1/backoffice/orders/${fixture.orderId}`)
      .set(authorization)
      .expect(200);

    const listBarrier = new Barrier(20);
    const listDurations = await Promise.all(
      Array.from({ length: 20 }, async () => {
        await listBarrier.arrive();
        const startedAt = performance.now();
        const response = await request(server)
          .get('/api/v1/backoffice/orders')
          .set(authorization)
          .query({ q: fixture.orderNumber });
        expect(response.status).toBe(200);
        expectNoStore(response);
        return performance.now() - startedAt;
      }),
    );
    const detailBarrier = new Barrier(20);
    const detailDurations = await Promise.all(
      Array.from({ length: 20 }, async () => {
        await detailBarrier.arrive();
        const startedAt = performance.now();
        const response = await request(server)
          .get(`/api/v1/backoffice/orders/${fixture.orderId}`)
          .set(authorization);
        expect(response.status).toBe(200);
        expectNoStore(response);
        return performance.now() - startedAt;
      }),
    );

    expect(percentile95(listDurations)).toBeLessThan(500);
    expect(percentile95(detailDurations)).toBeLessThan(500);
  });
});

interface PickupFixture {
  orderId: string;
  orderNumber: string;
  reservationId: string;
  stockLevelId: string;
  originalHoldUntil: Date;
  grandTotal: string;
  quantityOnHandAfterCheckout: number;
  quantityReservedAfterCheckout: number;
}

interface SerializedPickupFixture {
  orderId: string;
  reservationId: string;
  inventoryUnitId: string;
}

interface QuantityPickupTarget {
  stockLevelId: string;
  variantId: string;
  salePrice: string;
}

interface QuantityPickupOptions {
  target?: QuantityPickupTarget;
  voucherCode?: string;
}

type PickupCartItem =
  | { itemType: 'ACCESSORY'; variantId: string; quantity: number }
  | { itemType: 'IPHONE'; inventoryCode: string };

async function createCustomerPickupOrder(
  server: Server,
  prisma: PrismaClient,
  options: QuantityPickupOptions = {},
): Promise<PickupFixture> {
  const stockTarget = options.target ?? (await quantityPickupTarget(prisma));
  const { order, reservation } = await createCustomerPickupCheckout(
    server,
    prisma,
    { itemType: 'ACCESSORY', variantId: stockTarget.variantId, quantity: 1 },
    options.voucherCode,
  );
  if (
    reservation.stockLevelId !== stockTarget.stockLevelId ||
    reservation.inventoryUnitId !== null ||
    order.pickupHoldUntil === null
  ) {
    throw new Error('Expected quantity pickup reservation and deadline');
  }
  const stock = await prisma.stockLevel.findUniqueOrThrow({
    where: { id: reservation.stockLevelId },
  });

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    reservationId: reservation.id,
    stockLevelId: stock.id,
    originalHoldUntil: order.pickupHoldUntil,
    grandTotal: order.grandTotal.toString(),
    quantityOnHandAfterCheckout: stock.quantityOnHand,
    quantityReservedAfterCheckout: stock.quantityReserved,
  };
}

async function createCustomerIphonePickupOrder(
  server: Server,
  prisma: PrismaClient,
): Promise<SerializedPickupFixture> {
  const [store, seedUnit] = await Promise.all([
    prisma.inventoryLocation.findUniqueOrThrow({
      where: { code: 'HCM-STORE-01' },
      select: { id: true },
    }),
    prisma.inventoryUnit.findFirstOrThrow({
      where: {
        variant: {
          inventoryMode: 'SERIALIZED',
          status: 'ACTIVE',
          product: { type: 'IPHONE', status: 'ACTIVE' },
        },
      },
      orderBy: { id: 'asc' },
      select: { id: true, inventoryCode: true },
    }),
  ]);
  const unit = await prisma.inventoryUnit.update({
    where: { id: seedUnit.id },
    data: { locationId: store.id, lifecycleStatus: 'AVAILABLE', soldAt: null },
    select: { id: true, inventoryCode: true },
  });
  const { order, reservation } = await createCustomerPickupCheckout(server, prisma, {
    itemType: 'IPHONE',
    inventoryCode: unit.inventoryCode,
  });
  if (
    reservation.inventoryUnitId !== unit.id ||
    reservation.stockLevelId !== null ||
    order.pickupHoldUntil === null
  ) {
    throw new Error('Expected serialized pickup reservation and deadline');
  }
  return {
    orderId: order.id,
    reservationId: reservation.id,
    inventoryUnitId: unit.id,
  };
}

async function createCustomerPickupCheckout(
  server: Server,
  prisma: PrismaClient,
  cartItem: PickupCartItem,
  voucherCode?: string,
) {
  const customer = await login(server, 'CUSTOMER');
  await request(server).post('/api/v1/cart/items').set(bearer(customer)).send(cartItem).expect(201);
  const voucher = voucherCode === undefined ? {} : { voucherCode };
  const previewResponse = await request(server)
    .post('/api/v1/checkouts/preview')
    .set(bearer(customer))
    .send({ fulfillmentType: 'PICKUP', ...voucher })
    .expect(200);
  const preview = successRecord(previewResponse);
  const pricing = objectProperty(preview, 'pricing');
  const created = await request(server)
    .post('/api/v1/checkouts')
    .set(bearer(customer))
    .send({
      fulfillmentType: 'PICKUP',
      contact: {
        fullName: 'Khách Pickup Slice 08',
        email: 'pickup-slice08@example.com',
        phone: '0900000000',
      },
      expectedCartUpdatedAt: stringProperty(preview, 'cartUpdatedAt'),
      expectedGrandTotal: stringProperty(pricing, 'grandTotal'),
      expectedDepositRequired: stringProperty(pricing, 'depositRequired'),
      ...voucher,
    })
    .expect(201);
  const checkout = successRecord(created);
  const orderNumber = stringProperty(objectProperty(checkout, 'order'), 'orderNumber');
  const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber } });
  const reservation = await prisma.inventoryReservation.findFirstOrThrow({
    where: { orderId: order.id, status: 'ACTIVE' },
  });
  return { order, reservation };
}

async function quantityPickupTarget(prisma: PrismaClient): Promise<QuantityPickupTarget> {
  const target = await prisma.stockLevel.findFirstOrThrow({
    where: {
      location: { type: 'STORE', status: 'ACTIVE' },
      variant: { inventoryMode: 'QUANTITY', status: 'ACTIVE', salePrice: { not: null } },
      quantityOnHand: { gt: 0 },
    },
    orderBy: { id: 'asc' },
    select: { id: true, variantId: true, variant: { select: { salePrice: true } } },
  });
  if (target.variant.salePrice === null) throw new Error('Expected sale price');
  return {
    stockLevelId: target.id,
    variantId: target.variantId,
    salePrice: target.variant.salePrice.toString(),
  };
}

function createActiveFixedVoucher(prisma: PrismaClient, code: string, discountValue: string) {
  return prisma.voucher.create({
    data: {
      code,
      normalizedCode: code,
      name: `Voucher E2E ${code}`,
      discountType: 'FIXED',
      discountValue,
      minimumOrderAmount: '0',
      startsAt: new Date('2020-01-01T00:00:00.000Z'),
      endsAt: new Date('2100-01-01T00:00:00.000Z'),
      totalUsageLimit: 10,
      visibility: 'PUBLIC',
      scopeType: 'ORDER',
      status: 'ACTIVE',
    },
  });
}

async function advancePickupToPreparing(
  server: Server,
  orderId: string,
  token: string,
): Promise<void> {
  await request(server)
    .post(`/api/v1/backoffice/orders/${orderId}/confirm`)
    .set(bearer(token))
    .expect(200);
  await request(server)
    .post(`/api/v1/backoffice/orders/${orderId}/start-preparing`)
    .set(bearer(token))
    .expect(200);
}

async function advancePickupToReady(server: Server, orderId: string, token: string): Promise<void> {
  await advancePickupToPreparing(server, orderId, token);
  await request(server)
    .post(`/api/v1/backoffice/orders/${orderId}/mark-pickup-ready`)
    .set(bearer(token))
    .expect(200);
}

async function login(server: Server, role: 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER'): Promise<string> {
  const credentials = {
    ADMIN: ['admin@rephone.local', 'AdminDemo123'],
    EMPLOYEE: ['employee@rephone.local', 'EmployeeDemo123'],
    CUSTOMER: ['customer@rephone.local', 'CustomerDemo123'],
  } as const;
  const [email, password] = credentials[role];
  const response = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return stringProperty(successRecord(response), 'accessToken');
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function expectNoStore(response: Response): void {
  expect(response.headers['cache-control']).toBe('no-store');
}

function successRecord(response: Response): Record<string, unknown> {
  return objectProperty(response.body as unknown, 'data');
}

function successArray(response: Response): Array<Record<string, unknown>> {
  const value = record(response.body as unknown)['data'];
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error('Expected success data array');
  }
  return value;
}

function pagination(response: Response): Record<string, unknown> {
  return objectProperty(objectProperty(response.body as unknown, 'meta'), 'pagination');
}

function errorCode(response: Response): string {
  return stringProperty(objectProperty(response.body as unknown, 'error'), 'code');
}

function objectProperty(value: unknown, key: string): Record<string, unknown> {
  const property = record(value)[key];
  if (!isRecord(property)) throw new Error(`Expected ${key} to be an object`);
  return property;
}

function arrayProperty(value: unknown, key: string): unknown[] {
  const property = record(value)[key];
  if (!Array.isArray(property)) throw new Error(`Expected ${key} to be an array`);
  return property;
}

function stringProperty(value: unknown, key: string): string {
  const property = record(value)[key];
  if (typeof property !== 'string') throw new Error(`Expected ${key} to be a string`);
  return property;
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Expected an object');
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function percentile95(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
}

class Barrier {
  private arrived = 0;
  private release!: () => void;
  private readonly released = new Promise<void>((resolve) => {
    this.release = resolve;
  });

  public constructor(private readonly parties: number) {}

  public async arrive(): Promise<void> {
    this.arrived += 1;
    if (this.arrived === this.parties) this.release();
    await this.released;
  }
}
