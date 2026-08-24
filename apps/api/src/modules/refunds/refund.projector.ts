import type { RefundOperationsRecord } from './refund-operations.repository.js';
import type {
  RefundAction,
  RefundDetailDto,
  RefundListItemDto,
} from './refund-response.dto.js';

export function projectRefundListItem(refund: RefundOperationsRecord): RefundListItemDto {
  return {
    id: refund.id,
    orderNumber: refund.order.orderNumber,
    amount: refund.amount.toString(),
    method: refund.method,
    status: refund.status,
    requestedByType: refund.requestedByType,
    requester: actor(refund.requestedBy),
    evidenceAvailable: hasCompleteEvidence(refund),
    processingAt: refund.processingAt?.toISOString() ?? null,
    completedAt: refund.completedAt?.toISOString() ?? null,
    terminalAt: refund.terminalAt?.toISOString() ?? null,
    createdAt: refund.createdAt.toISOString(),
  };
}

export function projectRefundDetail(refund: RefundOperationsRecord): RefundDetailDto {
  const listItem = projectRefundListItem(refund);
  return {
    id: listItem.id,
    orderNumber: listItem.orderNumber,
    amount: listItem.amount,
    method: listItem.method,
    status: listItem.status,
    requestedByType: listItem.requestedByType,
    requester: listItem.requester,
    evidenceAvailable: listItem.evidenceAvailable,
    processingAt: listItem.processingAt,
    completedAt: listItem.completedAt,
    terminalAt: listItem.terminalAt,
    createdAt: listItem.createdAt,
    order: {
      id: refund.order.id,
      orderNumber: refund.order.orderNumber,
      status: refund.order.status,
      fulfillmentStatus: refund.order.fulfillmentStatus,
      paymentStatus: refund.order.paymentStatus,
      customerName: refund.order.customerName,
      customerEmail: refund.order.customerEmail,
      grandTotal: refund.order.grandTotal.toString(),
      paidAmount: refund.order.paidAmount.toString(),
      refundedAmount: refund.order.refundedAmount.toString(),
      balanceDue: refund.order.balanceDue.toString(),
    },
    payment:
      refund.payment === null
        ? null
        : {
            id: refund.payment.id,
            purpose: refund.payment.purpose,
            method: refund.payment.method,
            status: refund.payment.status,
            expectedAmount: refund.payment.expectedAmount.toString(),
            receivedAmount: refund.payment.receivedAmount?.toString() ?? null,
          },
    reason: refund.reason,
    note: refund.note,
    processor: actor(refund.processedBy),
    terminalActor: actor(refund.terminalBy),
    terminalReason: refund.terminalReason,
    availableActions: availableRefundActions(refund),
  };
}

export function availableRefundActions(
  refund: Pick<
    RefundOperationsRecord,
    | 'status'
    | 'method'
    | 'evidenceBucket'
    | 'evidenceObjectPath'
    | 'evidenceMimeType'
    | 'evidenceFileSize'
    | 'evidenceSha256'
  >,
): RefundAction[] {
  if (refund.status === 'REQUESTED') {
    return refund.method === 'OTHER'
      ? ['REJECT', 'CANCEL']
      : ['START_PROCESSING', 'REJECT', 'CANCEL'];
  }
  if (refund.status === 'PROCESSING') {
    if (refund.method === 'BANK_TRANSFER') return ['COMPLETE_BANK_TRANSFER'];
    if (refund.method === 'CASH') return ['COMPLETE_CASH'];
    return [];
  }
  if (
    refund.status === 'COMPLETED' &&
    refund.method === 'BANK_TRANSFER' &&
    hasCompleteEvidence(refund)
  ) {
    return ['VIEW_EVIDENCE'];
  }
  return [];
}

function hasCompleteEvidence(
  refund: Pick<
    RefundOperationsRecord,
    | 'evidenceBucket'
    | 'evidenceObjectPath'
    | 'evidenceMimeType'
    | 'evidenceFileSize'
    | 'evidenceSha256'
  >,
): boolean {
  return (
    refund.evidenceBucket !== null &&
    refund.evidenceObjectPath !== null &&
    refund.evidenceMimeType !== null &&
    refund.evidenceFileSize !== null &&
    refund.evidenceSha256 !== null
  );
}

function actor(
  value: { id: string; fullName: string; employeeCode: string | null } | null,
) {
  return value === null
    ? null
    : { id: value.id, fullName: value.fullName, employeeCode: value.employeeCode };
}
