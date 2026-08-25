import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { findSlice11PreflightViolations } from './preflight-slice11.js';
import { record } from './slice10-script-support.js';

export function afterSalesMultipart(
  token: string,
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
): RequestInit {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeType }), filename);
  return { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form };
}

export function assertAfterSalesPublicProjection(value: unknown): void {
  const forbidden = new Set([
    'bucket',
    'objectPath',
    'uploadedByType',
    'uploadedById',
    'assignedToId',
    'receivedById',
    'receivedLocationId',
    'receiveNote',
    'inventoryInspectionId',
    'decidedById',
    'resolvedById',
    'replacementInventoryUnitId',
    'refundId',
  ]);
  visit(value, forbidden);
}

export function assertSignedUrlTtl(value: Record<string, unknown>, now = Date.now()): void {
  const expiresAt = value['expiresAt'];
  const url = value['url'];
  if (typeof expiresAt !== 'string' || typeof url !== 'string') {
    throw new Error('Signed attachment response must contain url and expiresAt strings');
  }
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Signed attachment URL uses unsupported protocol ${parsed.protocol}`);
  }
  const ttlMilliseconds = Date.parse(expiresAt) - now;
  if (ttlMilliseconds <= 0 || ttlMilliseconds > 301_000) {
    throw new Error(
      `After-sales attachment signed URL TTL is outside 0..300 seconds (${ttlMilliseconds.toString()})`,
    );
  }
}

export async function assertSlice11Preflight(
  prisma: PrismaClient,
  privateBucket: string,
  stage: string,
): Promise<string[]> {
  const checks = await findSlice11PreflightViolations(prisma, privateBucket);
  const failed = checks.filter(({ count }) => count !== 0);
  if (failed.length > 0) {
    throw new Error(
      `Slice 11 ${stage} preflight failed: ${failed
        .map(({ checkName, count }) => `${checkName}=${count.toString()}`)
        .join(', ')}`,
    );
  }
  return checks.map(({ checkName }) => `${stage}-preflight:${checkName}`);
}

export async function afterSalesOperationalFingerprint(
  prisma: PrismaClient,
  requestId: string,
): Promise<string> {
  const request = await prisma.afterSalesRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: {
      orderItem: {
        select: {
          order: {
            select: {
              status: true,
              fulfillmentStatus: true,
              paymentStatus: true,
              updatedAt: true,
            },
          },
          warranty: {
            select: {
              warrantyCode: true,
              status: true,
              startAt: true,
              endAt: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  });
  const auditCount = await prisma.auditLog.count({
    where: { resourceType: 'AfterSalesRequest', resourceId: requestId },
  });
  return JSON.stringify({ request, auditCount });
}

export async function completedOrderItem(
  prisma: PrismaClient,
  orderId: string,
): Promise<{ id: string; warrantyCode: string }> {
  const item = await prisma.orderItem.findFirstOrThrow({
    where: { orderId },
    include: { warranty: true },
    orderBy: { id: 'asc' },
  });
  if (item.warranty === null || item.warranty.status !== 'ACTIVE') {
    throw new Error(`${orderId}: completed Slice 11 source item has no active Warranty`);
  }
  return { id: item.id, warrantyCode: item.warranty.warrantyCode };
}

export function afterSalesRecord(value: unknown): Record<string, unknown> {
  return record(value);
}

function visit(value: unknown, forbidden: ReadonlySet<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => {
      visit(item, forbidden);
    });
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (forbidden.has(key)) throw new Error(`Public response exposed forbidden field ${key}`);
    visit(nested, forbidden);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
