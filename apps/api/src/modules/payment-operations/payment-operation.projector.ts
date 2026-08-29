import type { AppConfig } from '../../config/app-config.js';
import type {
  BackofficePaymentDetailDto,
  BackofficePaymentListItemDto,
  PaymentPublicDto,
  PaymentReviewOrderProjectionDto,
} from './payment-operation-response.dto.js';
import { availablePaymentReviewActions } from './payment-review-policy.js';

export interface PaymentProjectionRecord {
  id: string;
  purpose: string;
  method: string;
  status: string;
  expectedAmount: { toString(): string };
  receivedAmount: { toString(): string } | null;
  transferContent: string | null;
  bankNameSnapshot: string | null;
  bankAccountNumberSnapshot: string | null;
  bankAccountHolderSnapshot: string | null;
  bankQrBucketSnapshot: string | null;
  bankQrObjectPathSnapshot: string | null;
  reviewWindowMinutesSnapshot: number | null;
  evidenceBucket: string | null;
  evidenceObjectPath: string | null;
  expiresAt: Date | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  note: string | null;
  createdAt: Date;
  reviewedBy: {
    id: string;
    fullName: string;
    employeeCode: string | null;
  } | null;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    fulfillmentStatus: string;
    paymentStatus: string;
    fulfillmentType: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    shippingAddressSnapshot: unknown;
    grandTotal: { toString(): string };
    depositRequired: { toString(): string };
    paidAmount: { toString(): string };
    refundedAmount: { toString(): string };
    balanceDue: { toString(): string };
    placedAt: Date;
    confirmedAt: Date | null;
    cancelledAt: Date | null;
    items: Array<{
      id: string;
      productNameSnapshot: string;
      variantNameSnapshot: string;
      inventoryCodeSnapshot: string | null;
      quantity: number;
      lineTotal: { toString(): string };
    }>;
  };
}

export function projectPaymentPublic(
  payment: PaymentProjectionRecord,
  config: AppConfig,
  now: Date,
): PaymentPublicDto {
  const reviewSlaDueAt = calculateReviewSlaDueAt(payment);
  const bankTransferInstructions =
    payment.method === 'BANK_TRANSFER' &&
    payment.bankNameSnapshot !== null &&
    payment.bankAccountNumberSnapshot !== null &&
    payment.bankAccountHolderSnapshot !== null &&
    payment.transferContent !== null
      ? {
          bankName: payment.bankNameSnapshot,
          accountNumber: payment.bankAccountNumberSnapshot,
          accountHolder: payment.bankAccountHolderSnapshot,
          qrUrl: publicStorageUrl(
            config,
            payment.bankQrBucketSnapshot,
            payment.bankQrObjectPathSnapshot,
          ),
          transferContent: payment.transferContent,
        }
      : null;
  return {
    id: payment.id,
    orderNumber: payment.order.orderNumber,
    purpose: payment.purpose,
    method: payment.method,
    status: payment.status,
    expectedAmount: payment.expectedAmount.toString(),
    receivedAmount: payment.receivedAmount?.toString() ?? null,
    transferContent: payment.transferContent,
    bankTransferInstructions,
    expiresAt: payment.expiresAt?.toISOString() ?? null,
    submittedAt: payment.submittedAt?.toISOString() ?? null,
    reviewSlaDueAt: reviewSlaDueAt?.toISOString() ?? null,
    reviewOverdue:
      payment.status === 'UNDER_REVIEW' && reviewSlaDueAt !== null && reviewSlaDueAt <= now,
    rejectionReason: payment.status === 'REJECTED' ? payment.rejectionReason : null,
  };
}

export function projectBackofficePaymentListItem(
  payment: PaymentProjectionRecord,
  config: AppConfig,
  now: Date,
): BackofficePaymentListItemDto {
  const projected = projectPaymentPublic(payment, config, now);
  return {
    id: projected.id,
    orderNumber: projected.orderNumber,
    purpose: projected.purpose,
    method: projected.method,
    status: projected.status,
    expectedAmount: projected.expectedAmount,
    receivedAmount: projected.receivedAmount,
    transferContent: projected.transferContent,
    bankTransferInstructions: projected.bankTransferInstructions,
    expiresAt: projected.expiresAt,
    submittedAt: projected.submittedAt,
    reviewSlaDueAt: projected.reviewSlaDueAt,
    reviewOverdue: projected.reviewOverdue,
    rejectionReason: projected.rejectionReason,
    customerName: payment.order.customerName,
    customerEmail: payment.order.customerEmail,
    fulfillmentType: payment.order.fulfillmentType,
    createdAt: payment.createdAt.toISOString(),
  };
}

export function projectBackofficePaymentDetail(
  payment: PaymentProjectionRecord,
  config: AppConfig,
  now: Date,
): BackofficePaymentDetailDto {
  return {
    payment: projectPaymentPublic(payment, config, now),
    evidenceAvailable: payment.evidenceBucket !== null && payment.evidenceObjectPath !== null,
    availableActions: availablePaymentReviewActions(payment),
    order: {
      id: payment.order.id,
      orderNumber: payment.order.orderNumber,
      status: payment.order.status,
      fulfillmentStatus: payment.order.fulfillmentStatus,
      paymentStatus: payment.order.paymentStatus,
      customerName: payment.order.customerName,
      customerEmail: payment.order.customerEmail,
      customerPhone: payment.order.customerPhone,
      shippingAddress: payment.order.shippingAddressSnapshot,
      items: payment.order.items.map((item) => ({
        id: item.id,
        productName: item.productNameSnapshot,
        variantName: item.variantNameSnapshot,
        inventoryCode: item.inventoryCodeSnapshot,
        quantity: item.quantity,
        lineTotal: item.lineTotal.toString(),
      })),
      grandTotal: payment.order.grandTotal.toString(),
      depositRequired: payment.order.depositRequired.toString(),
      paidAmount: payment.order.paidAmount.toString(),
      refundedAmount: payment.order.refundedAmount.toString(),
      balanceDue: payment.order.balanceDue.toString(),
      placedAt: payment.order.placedAt.toISOString(),
      confirmedAt: payment.order.confirmedAt?.toISOString() ?? null,
      cancelledAt: payment.order.cancelledAt?.toISOString() ?? null,
    },
    reviewer:
      payment.reviewedBy === null
        ? null
        : {
            id: payment.reviewedBy.id,
            fullName: payment.reviewedBy.fullName,
            employeeCode: payment.reviewedBy.employeeCode,
          },
    reviewNote: payment.note,
    reviewedAt: payment.reviewedAt?.toISOString() ?? null,
  };
}

export function projectReviewOrder(
  payment: PaymentProjectionRecord,
): PaymentReviewOrderProjectionDto {
  return {
    orderNumber: payment.order.orderNumber,
    status: payment.order.status,
    fulfillmentStatus: payment.order.fulfillmentStatus,
    paymentStatus: payment.order.paymentStatus,
    paidAmount: payment.order.paidAmount.toString(),
    refundedAmount: payment.order.refundedAmount.toString(),
    balanceDue: payment.order.balanceDue.toString(),
  };
}

export function calculateReviewSlaDueAt(
  payment: Pick<PaymentProjectionRecord, 'submittedAt' | 'reviewWindowMinutesSnapshot'>,
): Date | null {
  if (payment.submittedAt === null || payment.reviewWindowMinutesSnapshot === null) return null;
  return new Date(payment.submittedAt.getTime() + payment.reviewWindowMinutesSnapshot * 60_000);
}

function publicStorageUrl(
  config: AppConfig,
  bucket: string | null,
  objectPath: string | null,
): string | null {
  if (bucket === null || objectPath === null || !isSafeStoragePath(objectPath)) return null;
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  return `${config.storage.url.replace(/\/$/, '')}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
}

function isSafeStoragePath(value: string): boolean {
  if (value.length === 0 || value.startsWith('/') || value.endsWith('/') || value.includes('\\')) {
    return false;
  }
  return value
    .split('/')
    .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}
