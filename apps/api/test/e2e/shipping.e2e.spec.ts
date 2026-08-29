import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request, { type Response } from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import { InMemoryStorageProvider } from '../../src/common/providers/in-memory-storage.provider.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { AuthRateLimiter } from '../../src/modules/auth/auth-rate-limiter.service.js';
import { BackofficeRateLimiter } from '../../src/modules/auth/backoffice-rate-limiter.service.js';
import { FulfillmentClock } from '../../src/modules/fulfillment/fulfillment-clock.service.js';
import { OrderRateLimiter } from '../../src/modules/orders/order-rate-limiter.service.js';
import { DepositExpiryService } from '../../src/modules/payment-operations/deposit-expiry.service.js';
import { PaymentRateLimiter } from '../../src/modules/payment-operations/payment-rate-limiter.service.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

const PROOF = readFileSync(
  new URL('../../prisma/demo-assets/catalog/iphone-13.png', import.meta.url),
);
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const SHIPMENT_INPUT = {
  carrierName: 'VNPost E2E',
  trackingCode: 'RPH-SLICE09-TRACK',
  trackingUrl: 'https://tracking.example.test/RPH-SLICE09-TRACK',
};

describe('Slice 09 shipping fulfillment HTTP contract', () => {
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
    app.get(PaymentRateLimiter).clear();
    app.get(InMemoryStorageProvider).clear();
    await resetTestDatabase(prisma);
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enforces staff roles and no-store on all six shipping routes', async () => {
    const protectedRequests = [
      (headers: Record<string, string>) =>
        request(server)
          .post(`/api/v1/backoffice/orders/${MISSING_ID}/override-shipping-fee`)
          .set(headers)
          .send({ shippingFee: '25000', reason: 'Kiểm thử phân quyền phí giao hàng' }),
      (headers: Record<string, string>) =>
        request(server)
          .post(`/api/v1/backoffice/orders/${MISSING_ID}/shipment`)
          .set(headers)
          .send(SHIPMENT_INPUT),
      (headers: Record<string, string>) =>
        request(server).post(`/api/v1/backoffice/shipments/${MISSING_ID}/hand-over`).set(headers),
      (headers: Record<string, string>) =>
        request(server)
          .post(`/api/v1/backoffice/shipments/${MISSING_ID}/mark-delivered`)
          .set(headers)
          .send({ confirmCodCollected: true }),
      (headers: Record<string, string>) =>
        request(server)
          .post(`/api/v1/backoffice/shipments/${MISSING_ID}/mark-failed`)
          .set(headers)
          .send({ reason: 'Kiểm thử phân quyền giao thất bại' }),
      (headers: Record<string, string>) =>
        request(server)
          .post(`/api/v1/backoffice/shipments/${MISSING_ID}/mark-returned`)
          .set(headers)
          .send({
            returnedToLocationId: MISSING_ID,
            reason: 'Kiểm thử phân quyền hàng hoàn về',
          }),
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
      for (const buildRequest of protectedRequests) {
        const missing = await buildRequest(bearer(token)).expect(404);
        expectNoStore(missing);
        expect(errorCode(missing)).toBe('RESOURCE_NOT_FOUND');
      }
    }
  });

  it('runs customer checkout through proof, handover, COD delivery and replay safely', async () => {
    const fixture = await createAccessoryShippingOrder(server, prisma);
    const employee = await login(server, 'EMPLOYEE');
    const originalOrder = await prisma.order.findUniqueOrThrow({
      where: { id: fixture.orderId },
    });
    const originalShippingFee = BigInt(originalOrder.shippingFee.toString());
    const overriddenShippingFee = (
      originalShippingFee > 0n ? originalShippingFee - 1n : originalShippingFee
    ).toString();

    const overridden = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/override-shipping-fee`)
      .set(bearer(employee))
      .send({
        shippingFee: overriddenShippingFee,
        reason: 'Điều chỉnh một đồng để khóa contract E2E',
      })
      .expect(200);
    expectNoStore(overridden);
    expect(objectProperty(successRecord(overridden), 'pricing')).toMatchObject({
      shippingFee: overriddenShippingFee,
      depositRequired: fixture.depositExpectedAmount,
    });

    await submitAndVerifyDeposit(server, fixture, employee);
    const prepared = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/start-preparing`)
      .set(bearer(employee))
      .expect(200);
    expectNoStore(prepared);
    expect(successRecord(prepared)).toMatchObject({
      status: 'PROCESSING',
      fulfillmentStatus: 'PREPARING',
    });

    const created = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/shipment`)
      .set(bearer(employee))
      .send(SHIPMENT_INPUT)
      .expect(201);
    expectNoStore(created);
    const shipment = successRecord(created);
    expect(shipment).toMatchObject({
      orderId: fixture.orderId,
      attemptNumber: 1,
      status: 'CREATED',
      ...SHIPMENT_INPUT,
    });
    const shipmentId = stringProperty(shipment, 'id');

    const handed = await request(server)
      .post(`/api/v1/backoffice/shipments/${shipmentId}/hand-over`)
      .set(bearer(employee))
      .expect(200);
    expectNoStore(handed);
    expect(successRecord(handed)).toMatchObject({
      status: 'PROCESSING',
      fulfillmentStatus: 'IN_TRANSIT',
      shipments: [expect.objectContaining({ id: shipmentId, status: 'HANDED_TO_CARRIER' })],
      reservations: [expect.objectContaining({ id: fixture.reservationId, status: 'CONSUMED' })],
    });
    const orderBeforeDelivery = await prisma.order.findUniqueOrThrow({
      where: { id: fixture.orderId },
    });
    const codAmount = orderBeforeDelivery.balanceDue.toString();
    expect(BigInt(codAmount)).toBeGreaterThan(0n);

    const delivered = await request(server)
      .post(`/api/v1/backoffice/shipments/${shipmentId}/mark-delivered`)
      .set(bearer(employee))
      .send({ confirmCodCollected: true })
      .expect(200);
    expectNoStore(delivered);
    const completed = successRecord(delivered);
    expect(completed).toMatchObject({
      status: 'COMPLETED',
      fulfillmentStatus: 'COMPLETED',
      paymentStatus: 'PAID',
      pricing: { balanceDue: '0' },
      shipments: [expect.objectContaining({ id: shipmentId, status: 'DELIVERED' })],
    });
    expect(arrayProperty(completed, 'paymentAttempts')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          purpose: 'BALANCE',
          method: 'COD',
          status: 'VERIFIED',
          expectedAmount: codAmount,
          receivedAmount: codAmount,
        }),
      ]),
    );

    const replay = await request(server)
      .post(`/api/v1/backoffice/shipments/${shipmentId}/mark-delivered`)
      .set(bearer(employee))
      .send({})
      .expect(200);
    expectNoStore(replay);
    expect(successRecord(replay)).toMatchObject({
      status: 'COMPLETED',
      fulfillmentStatus: 'COMPLETED',
    });

    const [codPayments, movements, warranties, reservation, stock, audits] = await Promise.all([
      prisma.payment.findMany({
        where: { orderId: fixture.orderId, purpose: 'BALANCE', method: 'COD' },
      }),
      prisma.stockMovement.findMany({
        where: {
          type: 'SALE',
          referenceType: 'INVENTORY_RESERVATION',
          referenceId: fixture.reservationId,
        },
      }),
      prisma.warranty.findMany({ where: { orderItem: { orderId: fixture.orderId } } }),
      prisma.inventoryReservation.findUniqueOrThrow({ where: { id: fixture.reservationId } }),
      prisma.stockLevel.findUniqueOrThrow({ where: { id: fixture.stockLevelId } }),
      prisma.auditLog.findMany({
        where: {
          OR: [{ resourceId: fixture.orderId }, { resourceId: shipmentId }],
        },
      }),
    ]);
    expect(codPayments).toHaveLength(1);
    expect(codPayments[0]?.expectedAmount.toString()).toBe(codAmount);
    expect(codPayments[0]?.receivedAmount?.toString()).toBe(codAmount);
    expect(movements).toHaveLength(1);
    expect(warranties).toHaveLength(1);
    expect(reservation.status).toBe('CONSUMED');
    expect(stock.quantityOnHand).toBe(fixture.quantityOnHandAfterCheckout - 1);
    expect(stock.quantityReserved).toBe(fixture.quantityReservedAfterCheckout - 1);
    expect(audits.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        'order.shipping_fee_overridden',
        'fulfillment.preparation_started',
        'shipment.created',
        'shipment.handed_over',
        'shipment.delivered',
      ]),
    );
    expect(audits.filter(({ action }) => action === 'shipment.delivered')).toHaveLength(1);

    const list = await request(server)
      .get('/api/v1/orders')
      .set(bearer(fixture.customerToken))
      .expect(200);
    expectNoStore(list);
    const listItem = arrayProperty(list.body as unknown, 'data').find(
      (candidate) => record(candidate)['orderNumber'] === fixture.orderNumber,
    );
    expect(record(listItem)['shipment']).toEqual(
      expect.objectContaining({
        carrierName: SHIPMENT_INPUT.carrierName,
        trackingCode: SHIPMENT_INPUT.trackingCode,
        trackingUrl: SHIPMENT_INPUT.trackingUrl,
        status: 'DELIVERED',
      }),
    );

    const customerDetail = await request(server)
      .get(`/api/v1/orders/${fixture.orderNumber}`)
      .set(bearer(fixture.customerToken))
      .expect(200);
    expectNoStore(customerDetail);
    expect(successRecord(customerDetail)).toMatchObject({
      status: 'COMPLETED',
      fulfillmentStatus: 'COMPLETED',
      shipment: {
        carrierName: SHIPMENT_INPUT.carrierName,
        trackingCode: SHIPMENT_INPUT.trackingCode,
        trackingUrl: SHIPMENT_INPUT.trackingUrl,
        status: 'DELIVERED',
      },
    });
    expect(JSON.stringify(customerDetail.body)).not.toMatch(
      /failureReason|returnNote|returnedToLocation|createdBy|attemptNumber|internalNote/,
    );
  });

  it('moves a failed serialized shipment to returned and exposes only safe tracking', async () => {
    const fixture = await createIphoneShippingOrder(server, prisma);
    const employee = await login(server, 'EMPLOYEE');
    await submitAndVerifyDeposit(server, fixture, employee);
    const shipmentId = await prepareAndCreateShipment(server, fixture.orderId, employee, {
      ...SHIPMENT_INPUT,
      trackingCode: 'RPH-SLICE09-RETURN',
      trackingUrl: 'https://tracking.example.test/RPH-SLICE09-RETURN',
    });
    await request(server)
      .post(`/api/v1/backoffice/shipments/${shipmentId}/hand-over`)
      .set(bearer(employee))
      .expect(200);

    const failed = await request(server)
      .post(`/api/v1/backoffice/shipments/${shipmentId}/mark-failed`)
      .set(bearer(employee))
      .send({ reason: 'Khách không có mặt tại địa chỉ nhận hàng' })
      .expect(200);
    expectNoStore(failed);
    expect(successRecord(failed)).toMatchObject({
      status: 'PROCESSING',
      fulfillmentStatus: 'FAILED',
      shipments: [expect.objectContaining({ status: 'FAILED' })],
    });
    expect(
      await prisma.inventoryUnit.findUniqueOrThrow({ where: { id: fixture.inventoryUnitId } }),
    ).toMatchObject({ lifecycleStatus: 'IN_TRANSIT', soldAt: null });

    const returnLocation = await prisma.inventoryLocation.findUniqueOrThrow({
      where: { code: 'HCM-WH-01' },
      select: { id: true },
    });
    const returned = await request(server)
      .post(`/api/v1/backoffice/shipments/${shipmentId}/mark-returned`)
      .set(bearer(employee))
      .send({
        returnedToLocationId: returnLocation.id,
        reason: 'Kho đã nhận hàng và chuyển sang chờ kiểm tra',
      })
      .expect(200);
    expectNoStore(returned);
    expect(successRecord(returned)).toMatchObject({
      status: 'PROCESSING',
      fulfillmentStatus: 'RETURNED',
    });
    const returnedShipment = record(arrayProperty(successRecord(returned), 'shipments')[0]);
    expect(returnedShipment).toMatchObject({
      status: 'RETURNED',
      returnNote: 'Kho đã nhận hàng và chuyển sang chờ kiểm tra',
    });
    expect(objectProperty(returnedShipment, 'returnedToLocation')).toMatchObject({
      id: returnLocation.id,
    });

    const [unit, reservation, shipment] = await Promise.all([
      prisma.inventoryUnit.findUniqueOrThrow({ where: { id: fixture.inventoryUnitId } }),
      prisma.inventoryReservation.findUniqueOrThrow({ where: { id: fixture.reservationId } }),
      prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } }),
    ]);
    expect(unit).toMatchObject({
      lifecycleStatus: 'INSPECTING',
      locationId: returnLocation.id,
      soldAt: null,
    });
    expect(reservation.status).toBe('CONSUMED');
    expect(shipment).toMatchObject({
      status: 'RETURNED',
      returnedToLocationId: returnLocation.id,
    });
    expect(shipment.failedAt).not.toBeNull();
    expect(shipment.returnedAt).not.toBeNull();

    const customerDetail = await request(server)
      .get(`/api/v1/orders/${fixture.orderNumber}`)
      .set(bearer(fixture.customerToken))
      .expect(200);
    expectNoStore(customerDetail);
    expect(successRecord(customerDetail)).toMatchObject({
      status: 'PROCESSING',
      fulfillmentStatus: 'RETURNED',
    });
    expect(objectProperty(successRecord(customerDetail), 'shipment')).toMatchObject({
      status: 'RETURNED',
    });
    expect(JSON.stringify(customerDetail.body)).not.toMatch(
      /failureReason|returnNote|returnedToLocation|createdBy|attemptNumber|internalNote/,
    );
  });

  it('serializes two exact Shipment creates into one create and one replay', async () => {
    const fixture = await createAccessoryShippingOrder(server, prisma);
    const employee = await login(server, 'EMPLOYEE');
    const admin = await login(server, 'ADMIN');
    await submitAndVerifyDeposit(server, fixture, employee);
    await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/start-preparing`)
      .set(bearer(employee))
      .expect(200);
    const barrier = new Barrier(2);

    const responses = await Promise.all(
      [employee, admin].map(async (token) => {
        await barrier.arrive();
        return request(server)
          .post(`/api/v1/backoffice/orders/${fixture.orderId}/shipment`)
          .set(bearer(token))
          .send({ ...SHIPMENT_INPUT, trackingCode: 'RPH-SLICE09-CREATE-RACE' });
      }),
    );

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 201]);
    for (const response of responses) expectNoStore(response);
    const shipmentIds = responses.map((response) => stringProperty(successRecord(response), 'id'));
    expect(new Set(shipmentIds).size).toBe(1);
    const createdShipmentId = shipmentIds[0];
    if (createdShipmentId === undefined) throw new Error('Expected a Shipment replay result');
    expect(await prisma.shipment.count({ where: { orderId: fixture.orderId } })).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { action: 'shipment.created', resourceId: createdShipmentId },
      }),
    ).toBe(1);
    expect(
      await prisma.inventoryReservation.findUniqueOrThrow({
        where: { id: fixture.reservationId },
        select: { status: true, holdReason: true },
      }),
    ).toEqual({ status: 'ACTIVE', holdReason: 'FULFILLMENT' });
  });

  it('replays two concurrent handovers with one inventory consumption', async () => {
    const fixture = await createAccessoryShippingOrder(server, prisma);
    const employee = await login(server, 'EMPLOYEE');
    const admin = await login(server, 'ADMIN');
    await submitAndVerifyDeposit(server, fixture, employee);
    const shipmentId = await prepareAndCreateShipment(server, fixture.orderId, employee, {
      ...SHIPMENT_INPUT,
      trackingCode: 'RPH-SLICE09-HANDOVER-RACE',
    });
    const barrier = new Barrier(2);

    const responses = await Promise.all(
      [employee, admin].map(async (token) => {
        await barrier.arrive();
        return request(server)
          .post(`/api/v1/backoffice/shipments/${shipmentId}/hand-over`)
          .set(bearer(token));
      }),
    );

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    for (const response of responses) {
      expectNoStore(response);
      expect(successRecord(response)).toMatchObject({
        status: 'PROCESSING',
        fulfillmentStatus: 'IN_TRANSIT',
      });
    }
    const [shipment, order, reservation, stock, movementCount, handoverAudits] = await Promise.all([
      prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } }),
      prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
      prisma.inventoryReservation.findUniqueOrThrow({ where: { id: fixture.reservationId } }),
      prisma.stockLevel.findUniqueOrThrow({ where: { id: fixture.stockLevelId } }),
      prisma.stockMovement.count({
        where: {
          type: 'SALE',
          referenceType: 'INVENTORY_RESERVATION',
          referenceId: fixture.reservationId,
        },
      }),
      prisma.auditLog.count({
        where: { resourceId: shipmentId, action: 'shipment.handed_over' },
      }),
    ]);
    expect(shipment).toMatchObject({ status: 'HANDED_TO_CARRIER' });
    expect(shipment.shippedAt).not.toBeNull();
    expect(order).toMatchObject({ status: 'PROCESSING', fulfillmentStatus: 'IN_TRANSIT' });
    expect(reservation).toMatchObject({ status: 'CONSUMED', releasedAt: null });
    expect(reservation.consumedAt).toEqual(shipment.shippedAt);
    expect(stock.quantityOnHand).toBe(fixture.quantityOnHandAfterCheckout - 1);
    expect(stock.quantityReserved).toBe(fixture.quantityReservedAfterCheckout - 1);
    expect({ movementCount, handoverAudits }).toEqual({ movementCount: 1, handoverAudits: 1 });
  });

  it('replays two concurrent deliveries with one COD and one warranty set', async () => {
    const fixture = await createAccessoryShippingOrder(server, prisma);
    const employee = await login(server, 'EMPLOYEE');
    const admin = await login(server, 'ADMIN');
    await submitAndVerifyDeposit(server, fixture, employee);
    const shipmentId = await prepareAndCreateShipment(server, fixture.orderId, employee, {
      ...SHIPMENT_INPUT,
      trackingCode: 'RPH-SLICE09-DELIVERY-RACE',
    });
    await request(server)
      .post(`/api/v1/backoffice/shipments/${shipmentId}/hand-over`)
      .set(bearer(employee))
      .expect(200);
    const barrier = new Barrier(2);

    const responses = await Promise.all(
      [employee, admin].map(async (token) => {
        await barrier.arrive();
        return request(server)
          .post(`/api/v1/backoffice/shipments/${shipmentId}/mark-delivered`)
          .set(bearer(token))
          .send({ confirmCodCollected: true });
      }),
    );

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    for (const response of responses) {
      expectNoStore(response);
      expect(successRecord(response)).toMatchObject({
        status: 'COMPLETED',
        fulfillmentStatus: 'COMPLETED',
        paymentStatus: 'PAID',
      });
    }
    const [shipment, order, codCount, warrantyCount, movementCount, deliveredAudits] =
      await Promise.all([
        prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } }),
        prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
        prisma.payment.count({
          where: { orderId: fixture.orderId, purpose: 'BALANCE', method: 'COD' },
        }),
        prisma.warranty.count({ where: { orderItem: { orderId: fixture.orderId } } }),
        prisma.stockMovement.count({
          where: {
            type: 'SALE',
            referenceType: 'INVENTORY_RESERVATION',
            referenceId: fixture.reservationId,
          },
        }),
        prisma.auditLog.count({
          where: { resourceId: shipmentId, action: 'shipment.delivered' },
        }),
      ]);
    expect(shipment.status).toBe('DELIVERED');
    expect(shipment.deliveredAt).toEqual(order.completedAt);
    expect(order).toMatchObject({
      status: 'COMPLETED',
      fulfillmentStatus: 'COMPLETED',
      paymentStatus: 'PAID',
    });
    expect(order.balanceDue.toString()).toBe('0');
    expect({ codCount, warrantyCount, movementCount, deliveredAudits }).toEqual({
      codCount: 1,
      warrantyCount: 1,
      movementCount: 1,
      deliveredAudits: 1,
    });
  });

  it('lets payment expiry beat a fee override exactly at the proof deadline', async () => {
    const fixture = await createAccessoryShippingOrder(server, prisma);
    const employee = await login(server, 'EMPLOYEE');
    const paymentBefore = await prisma.payment.findUniqueOrThrow({
      where: { id: fixture.paymentId },
    });
    if (paymentBefore.expiresAt === null) throw new Error('Expected a deposit proof deadline');
    const deadline = paymentBefore.expiresAt;
    vi.spyOn(app.get(FulfillmentClock), 'now').mockReturnValue(deadline);
    const orderBefore = await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } });
    const requestedFee = (BigInt(orderBefore.shippingFee.toString()) + 1n).toString();
    const barrier = new Barrier(2);

    const [override, expiry] = await Promise.all([
      (async () => {
        await barrier.arrive();
        return request(server)
          .post(`/api/v1/backoffice/orders/${fixture.orderId}/override-shipping-fee`)
          .set(bearer(employee))
          .send({
            shippingFee: requestedFee,
            reason: 'Override cạnh tranh đúng deadline nộp proof',
          });
      })(),
      (async () => {
        await barrier.arrive();
        return app.get(DepositExpiryService).expireDue(deadline);
      })(),
    ]);

    expect(override.status).toBe(409);
    expectNoStore(override);
    expect(errorCode(override)).toBe('INVALID_STATE_TRANSITION');
    expect(expiry).toMatchObject({ expired: 1, failed: 0, skippedOverlap: false });
    const [order, payment, reservation, stock, expiryAudits, overrideAudits] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
      prisma.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }),
      prisma.inventoryReservation.findUniqueOrThrow({ where: { id: fixture.reservationId } }),
      prisma.stockLevel.findUniqueOrThrow({ where: { id: fixture.stockLevelId } }),
      prisma.auditLog.count({
        where: { resourceId: fixture.paymentId, action: 'payment.expired' },
      }),
      prisma.auditLog.count({
        where: { resourceId: fixture.orderId, action: 'order.shipping_fee_overridden' },
      }),
    ]);
    expect(order).toMatchObject({
      status: 'CANCELLED',
      fulfillmentStatus: 'CANCELLED',
      shippingFeeOverrideReason: null,
      shippingFeeOverriddenById: null,
      shippingFeeOverriddenAt: null,
    });
    expect(order.shippingFee.toString()).toBe(orderBefore.shippingFee.toString());
    expect(payment.status).toBe('EXPIRED');
    expect(reservation).toMatchObject({ status: 'EXPIRED', consumedAt: null });
    expect(stock.quantityOnHand).toBe(fixture.quantityOnHandAfterCheckout);
    expect(stock.quantityReserved).toBe(fixture.quantityReservedAfterCheckout - 1);
    expect({ expiryAudits, overrideAudits }).toEqual({ expiryAudits: 1, overrideAudits: 0 });
    expect(await prisma.shipment.count({ where: { orderId: fixture.orderId } })).toBe(0);
  });

  it('keeps handover and customer cancellation mutually exclusive', async () => {
    const fixture = await createAccessoryShippingOrder(server, prisma);
    const employee = await login(server, 'EMPLOYEE');
    await submitAndVerifyDeposit(server, fixture, employee);
    const shipmentId = await prepareAndCreateShipment(server, fixture.orderId, employee, {
      ...SHIPMENT_INPUT,
      trackingCode: 'RPH-SLICE09-CANCEL-RACE',
    });
    const barrier = new Barrier(2);

    const [handover, cancellation] = await Promise.all([
      (async () => {
        await barrier.arrive();
        return request(server)
          .post(`/api/v1/backoffice/shipments/${shipmentId}/hand-over`)
          .set(bearer(employee));
      })(),
      (async () => {
        await barrier.arrive();
        return request(server)
          .post(`/api/v1/orders/${fixture.orderNumber}/cancel`)
          .set(bearer(fixture.customerToken))
          .send({ reason: 'Khách hủy đúng lúc nhân viên bàn giao carrier' });
      })(),
    ]);

    expect([handover.status, cancellation.status].sort()).toEqual([200, 409]);
    expectNoStore(handover);
    expectNoStore(cancellation);
    const [shipment, order, reservation, stock, movementCount, refundCount, transitionAudits] =
      await Promise.all([
        prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } }),
        prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
        prisma.inventoryReservation.findUniqueOrThrow({ where: { id: fixture.reservationId } }),
        prisma.stockLevel.findUniqueOrThrow({ where: { id: fixture.stockLevelId } }),
        prisma.stockMovement.count({
          where: {
            type: 'SALE',
            referenceType: 'INVENTORY_RESERVATION',
            referenceId: fixture.reservationId,
          },
        }),
        prisma.refund.count({ where: { orderId: fixture.orderId } }),
        prisma.auditLog.count({
          where: {
            OR: [
              { resourceId: shipmentId, action: 'shipment.handed_over' },
              { resourceId: fixture.orderId, action: 'order.cancelled' },
            ],
          },
        }),
      ]);
    expect(transitionAudits).toBe(1);
    expect(stock.quantityReserved).toBe(fixture.quantityReservedAfterCheckout - 1);
    expect(
      await prisma.warranty.count({ where: { orderItem: { orderId: fixture.orderId } } }),
    ).toBe(0);
    expect(
      await prisma.payment.count({
        where: { orderId: fixture.orderId, purpose: 'BALANCE', method: 'COD' },
      }),
    ).toBe(0);

    if (shipment.status === 'HANDED_TO_CARRIER') {
      expect(handover.status).toBe(200);
      expect(cancellation.status).toBe(409);
      expect(errorCode(cancellation)).toBe('INVALID_STATE_TRANSITION');
      expect(order).toMatchObject({ status: 'PROCESSING', fulfillmentStatus: 'IN_TRANSIT' });
      expect(reservation).toMatchObject({ status: 'CONSUMED', releasedAt: null });
      expect(reservation.consumedAt).toEqual(shipment.shippedAt);
      expect(stock.quantityOnHand).toBe(fixture.quantityOnHandAfterCheckout - 1);
      expect(movementCount).toBe(1);
      expect(refundCount).toBe(0);
    } else {
      expect(shipment.status).toBe('CANCELLED');
      expect(cancellation.status).toBe(200);
      expect(handover.status).toBe(409);
      expect(errorCode(handover)).toBe('INVALID_STATE_TRANSITION');
      expect(order).toMatchObject({ status: 'CANCELLED', fulfillmentStatus: 'CANCELLED' });
      expect(reservation).toMatchObject({ status: 'RELEASED', consumedAt: null });
      expect(stock.quantityOnHand).toBe(fixture.quantityOnHandAfterCheckout);
      expect(movementCount).toBe(0);
      expect(refundCount).toBe(1);
    }
  });

  it('commits exactly one delivered or failed outcome under a barrier race', async () => {
    const fixture = await createAccessoryShippingOrder(server, prisma);
    const employee = await login(server, 'EMPLOYEE');
    const admin = await login(server, 'ADMIN');
    await submitAndVerifyDeposit(server, fixture, employee);
    const shipmentId = await prepareAndCreateShipment(server, fixture.orderId, employee, {
      ...SHIPMENT_INPUT,
      trackingCode: 'RPH-SLICE09-FINAL-RACE',
    });
    await request(server)
      .post(`/api/v1/backoffice/shipments/${shipmentId}/hand-over`)
      .set(bearer(employee))
      .expect(200);
    const barrier = new Barrier(2);

    const [delivered, failed] = await Promise.all([
      (async () => {
        await barrier.arrive();
        return request(server)
          .post(`/api/v1/backoffice/shipments/${shipmentId}/mark-delivered`)
          .set(bearer(employee))
          .send({ confirmCodCollected: true });
      })(),
      (async () => {
        await barrier.arrive();
        return request(server)
          .post(`/api/v1/backoffice/shipments/${shipmentId}/mark-failed`)
          .set(bearer(admin))
          .send({ reason: 'Carrier xác nhận không giao được trong race' });
      })(),
    ]);

    expect([delivered.status, failed.status].sort()).toEqual([200, 409]);
    expectNoStore(delivered);
    expectNoStore(failed);
    const [shipment, order, codCount, warrantyCount, movementCount, terminalAudits] =
      await Promise.all([
        prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } }),
        prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
        prisma.payment.count({
          where: { orderId: fixture.orderId, purpose: 'BALANCE', method: 'COD' },
        }),
        prisma.warranty.count({ where: { orderItem: { orderId: fixture.orderId } } }),
        prisma.stockMovement.count({
          where: {
            type: 'SALE',
            referenceType: 'INVENTORY_RESERVATION',
            referenceId: fixture.reservationId,
          },
        }),
        prisma.auditLog.count({
          where: {
            resourceId: shipmentId,
            action: { in: ['shipment.delivered', 'shipment.failed'] },
          },
        }),
      ]);

    expect(movementCount).toBe(1);
    expect(terminalAudits).toBe(1);
    if (shipment.status === 'DELIVERED') {
      expect(delivered.status).toBe(200);
      expect(order).toMatchObject({
        status: 'COMPLETED',
        fulfillmentStatus: 'COMPLETED',
        paymentStatus: 'PAID',
      });
      expect(order.balanceDue.toString()).toBe('0');
      expect(codCount).toBe(1);
      expect(warrantyCount).toBe(1);
    } else {
      expect(shipment.status).toBe('FAILED');
      expect(failed.status).toBe(200);
      expect(order).toMatchObject({ status: 'PROCESSING', fulfillmentStatus: 'FAILED' });
      expect(codCount).toBe(0);
      expect(warrantyCount).toBe(0);
    }
  });
});

type ShippingFixture = {
  customerToken: string;
  orderId: string;
  orderNumber: string;
  paymentId: string;
  depositExpectedAmount: string;
  reservationId: string;
};

type AccessoryShippingFixture = ShippingFixture & {
  stockLevelId: string;
  quantityOnHandAfterCheckout: number;
  quantityReservedAfterCheckout: number;
};

type IphoneShippingFixture = ShippingFixture & {
  inventoryUnitId: string;
};

type ShippingCartItem =
  | { itemType: 'ACCESSORY'; variantId: string; quantity: number }
  | { itemType: 'IPHONE'; inventoryCode: string };

async function createAccessoryShippingOrder(
  server: Server,
  prisma: PrismaClient,
): Promise<AccessoryShippingFixture> {
  const stock = await prisma.stockLevel.findFirstOrThrow({
    where: {
      location: { type: 'WAREHOUSE', status: 'ACTIVE' },
      variant: { inventoryMode: 'QUANTITY', status: 'ACTIVE', salePrice: { not: null } },
      quantityOnHand: { gt: 0 },
    },
    orderBy: { variant: { salePrice: 'desc' } },
    select: { id: true, variantId: true },
  });
  const fixture = await createCustomerShippingCheckout(server, prisma, {
    itemType: 'ACCESSORY',
    variantId: stock.variantId,
    quantity: 1,
  });
  const persistedStock = await prisma.stockLevel.findUniqueOrThrow({ where: { id: stock.id } });
  return {
    ...fixture,
    stockLevelId: stock.id,
    quantityOnHandAfterCheckout: persistedStock.quantityOnHand,
    quantityReservedAfterCheckout: persistedStock.quantityReserved,
  };
}

async function createIphoneShippingOrder(
  server: Server,
  prisma: PrismaClient,
): Promise<IphoneShippingFixture> {
  const unit = await prisma.inventoryUnit.findFirstOrThrow({
    where: {
      location: { type: 'WAREHOUSE', status: 'ACTIVE' },
      lifecycleStatus: 'AVAILABLE',
      variant: {
        inventoryMode: 'SERIALIZED',
        status: 'ACTIVE',
        product: { type: 'IPHONE', status: 'ACTIVE' },
      },
    },
    orderBy: { id: 'asc' },
    select: { id: true, inventoryCode: true },
  });
  const fixture = await createCustomerShippingCheckout(server, prisma, {
    itemType: 'IPHONE',
    inventoryCode: unit.inventoryCode,
  });
  return { ...fixture, inventoryUnitId: unit.id };
}

async function createCustomerShippingCheckout(
  server: Server,
  prisma: PrismaClient,
  cartItem: ShippingCartItem,
): Promise<ShippingFixture> {
  const customerToken = await login(server, 'CUSTOMER');
  await request(server)
    .post('/api/v1/cart/items')
    .set(bearer(customerToken))
    .send(cartItem)
    .expect(201);
  const previewResponse = await request(server)
    .post('/api/v1/checkouts/preview')
    .set(bearer(customerToken))
    .send({ fulfillmentType: 'SHIPPING' })
    .expect(200);
  const preview = successRecord(previewResponse);
  const pricing = objectProperty(preview, 'pricing');
  const created = await request(server)
    .post('/api/v1/checkouts')
    .set(bearer(customerToken))
    .send({
      fulfillmentType: 'SHIPPING',
      contact: {
        fullName: 'Khách Shipping Slice 09',
        email: 'shipping-slice09@example.com',
        phone: '0900000000',
      },
      shippingAddress: {
        receiverName: 'Khách Shipping Slice 09',
        phone: '0900000000',
        addressLine: '1 Nguyễn Huệ',
        ward: 'Bến Nghé',
        district: 'Quận 1',
        province: 'TP.HCM',
      },
      expectedCartUpdatedAt: stringProperty(preview, 'cartUpdatedAt'),
      expectedGrandTotal: stringProperty(pricing, 'grandTotal'),
      expectedDepositRequired: stringProperty(pricing, 'depositRequired'),
    })
    .expect(201);
  const checkout = successRecord(created);
  const orderNumber = stringProperty(objectProperty(checkout, 'order'), 'orderNumber');
  const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber } });
  const [payment, reservation] = await Promise.all([
    prisma.payment.findFirstOrThrow({
      where: { orderId: order.id, purpose: 'DEPOSIT', method: 'BANK_TRANSFER' },
    }),
    prisma.inventoryReservation.findFirstOrThrow({
      where: { orderId: order.id, status: 'ACTIVE' },
    }),
  ]);
  return {
    customerToken,
    orderId: order.id,
    orderNumber,
    paymentId: payment.id,
    depositExpectedAmount: payment.expectedAmount.toString(),
    reservationId: reservation.id,
  };
}

async function submitAndVerifyDeposit(
  server: Server,
  fixture: ShippingFixture,
  staffToken: string,
): Promise<void> {
  const submitted = await request(server)
    .post(`/api/v1/payments/${fixture.paymentId}/submit-proof`)
    .set(bearer(fixture.customerToken))
    .attach('file', PROOF, { filename: 'shipping-deposit.png', contentType: 'image/png' })
    .expect(200);
  expectNoStore(submitted);
  expect(successRecord(submitted)).toMatchObject({ status: 'UNDER_REVIEW' });

  const verified = await request(server)
    .post(`/api/v1/backoffice/payments/${fixture.paymentId}/verify`)
    .set(bearer(staffToken))
    .send({ receivedAmount: fixture.depositExpectedAmount })
    .expect(200);
  expectNoStore(verified);
  expect(successRecord(verified)).toMatchObject({
    payment: { status: 'VERIFIED', receivedAmount: fixture.depositExpectedAmount },
    order: { status: 'CONFIRMED' },
  });
}

async function prepareAndCreateShipment(
  server: Server,
  orderId: string,
  staffToken: string,
  shipmentInput: typeof SHIPMENT_INPUT,
): Promise<string> {
  await request(server)
    .post(`/api/v1/backoffice/orders/${orderId}/start-preparing`)
    .set(bearer(staffToken))
    .expect(200);
  const created = await request(server)
    .post(`/api/v1/backoffice/orders/${orderId}/shipment`)
    .set(bearer(staffToken))
    .send(shipmentInput)
    .expect(201);
  expectNoStore(created);
  return stringProperty(successRecord(created), 'id');
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

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function expectNoStore(response: Response): void {
  expect(response.headers['cache-control']).toBe('no-store');
}

function successRecord(response: Response): Record<string, unknown> {
  return objectProperty(response.body as unknown, 'data');
}

function errorCode(response: Response): string {
  return stringProperty(objectProperty(response.body as unknown, 'error'), 'code');
}

function objectProperty(value: unknown, key: string): Record<string, unknown> {
  const property = record(value)[key];
  if (typeof property !== 'object' || property === null || Array.isArray(property)) {
    throw new Error(`Expected ${key} to be an object`);
  }
  return property as Record<string, unknown>;
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
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected an object');
  }
  return value as Record<string, unknown>;
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
