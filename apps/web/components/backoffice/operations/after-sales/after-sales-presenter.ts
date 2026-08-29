import type {
  AfterSalesAction,
  AfterSalesDetail,
  AfterSalesListItem,
  AfterSalesStatus,
  AfterSalesType,
} from '@/lib/after-sales-backoffice-api';
import type { OperationsTimelineItem, OperationsTone } from '../operations-primitives';

const TYPE_LABELS: Record<AfterSalesType, string> = {
  EXCHANGE: 'Đổi sản phẩm',
  RETURN: 'Trả sản phẩm',
  WARRANTY: 'Bảo hành',
};

const STATUS_PRESENTATIONS: Record<AfterSalesStatus, { label: string; tone: OperationsTone }> = {
  APPROVED: { label: 'Đã chấp thuận', tone: 'success' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
  INSPECTING: { label: 'Đang kiểm tra', tone: 'info' },
  RECEIVED: { label: 'Đã tiếp nhận', tone: 'info' },
  REJECTED: { label: 'Không chấp thuận', tone: 'danger' },
  REQUESTED: { label: 'Chờ tiếp nhận', tone: 'warning' },
  RESOLVED: { label: 'Đã hoàn tất', tone: 'success' },
};

const RESOLUTION_LABELS = {
  OTHER: 'Phương án khác',
  REFUNDED: 'Hoàn tiền',
  REPAIRED: 'Đã sửa chữa',
  REPLACED: 'Đã đổi máy',
  RETURNED_UNCHANGED: 'Trả lại nguyên trạng',
} as const;

export type AfterSalesPrimaryStep =
  | 'APPROVE'
  | 'INSPECTION'
  | 'INSPECTION_SUMMARY'
  | 'RECEIVE'
  | 'RESOLVE'
  | 'START_INSPECTION'
  | 'TERMINAL'
  | 'WAITING';

export function afterSalesTypeLabel(type: AfterSalesType): string {
  return TYPE_LABELS[type];
}

export function afterSalesStatusPresentation(status: AfterSalesStatus) {
  return STATUS_PRESENTATIONS[status];
}

export function afterSalesResolutionLabel(value: AfterSalesDetail['resolutionType']): string {
  if (value === null || value === undefined) return 'Chưa có';
  return RESOLUTION_LABELS[value];
}

export function afterSalesPrimaryStep(
  detail: Pick<AfterSalesDetail, 'availableActions' | 'inspection' | 'status'>,
): AfterSalesPrimaryStep {
  if (detail.availableActions.includes('RECEIVE')) return 'RECEIVE';
  if (detail.availableActions.includes('START_INSPECTION')) return 'START_INSPECTION';
  if (detail.status === 'INSPECTING' && detail.inspection?.status === 'DRAFT') return 'INSPECTION';
  if (detail.availableActions.includes('APPROVE')) return 'APPROVE';
  if (detail.availableActions.includes('RECORD_INSPECTION_SUMMARY')) {
    return 'INSPECTION_SUMMARY';
  }
  if (hasResolutionAction(detail.availableActions)) return 'RESOLVE';
  if (isAfterSalesTerminal(detail.status)) return 'TERMINAL';
  return 'WAITING';
}

export function isAfterSalesTerminal(status: AfterSalesStatus): boolean {
  return status === 'CANCELLED' || status === 'REJECTED' || status === 'RESOLVED';
}

export function afterSalesTimeline(detail: AfterSalesDetail): OperationsTimelineItem[] {
  const items: OperationsTimelineItem[] = [
    {
      at: formatAfterSalesDateTime(detail.timeline.requestedAt),
      description: `Khách hàng gửi yêu cầu ${afterSalesTypeLabel(detail.type).toLocaleLowerCase('vi-VN')}.`,
      label: 'Đã ghi nhận yêu cầu',
    },
  ];

  pushTimeline(items, 'Đã tiếp nhận sản phẩm', detail.timeline.receivedAt, detail.receiveNote);
  pushTimeline(
    items,
    'Đã hoàn tất kiểm tra',
    detail.timeline.inspectedAt,
    detail.inspectionSummary,
  );

  if (detail.timeline.decidedAt != null) {
    items.push({
      at: formatAfterSalesDateTime(detail.timeline.decidedAt),
      description: detail.decisionNote,
      label: detail.status === 'REJECTED' ? 'Yêu cầu không được chấp thuận' : 'Đã chấp thuận xử lý',
      state: detail.status === 'REJECTED' ? 'danger' : 'complete',
    });
  }

  if (detail.timeline.resolvedAt != null) {
    items.push({
      at: formatAfterSalesDateTime(detail.timeline.resolvedAt),
      description: detail.resolutionNote,
      label: `Đã hoàn tất · ${afterSalesResolutionLabel(detail.resolutionType)}`,
    });
  }

  if (detail.timeline.returnedAt != null) {
    items.push({
      at: formatAfterSalesDateTime(detail.timeline.returnedAt),
      description: detail.returnNote,
      label: 'Đã trả sản phẩm cho khách',
    });
  }

  if (detail.timeline.cancelledAt != null) {
    items.push({
      at: formatAfterSalesDateTime(detail.timeline.cancelledAt),
      description: detail.cancelReason,
      label: 'Yêu cầu đã hủy',
      state: 'danger',
    });
  }

  if (!isAfterSalesTerminal(detail.status)) {
    items.push({ label: currentStepLabel(afterSalesPrimaryStep(detail)), state: 'current' });
  }
  return items;
}

export function formatAfterSalesDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed);
}

export function afterSalesAssigneeLabel(item: AfterSalesListItem): string {
  return item.assignedTo?.fullName ?? 'Chưa phân công';
}

function currentStepLabel(step: AfterSalesPrimaryStep): string {
  if (step === 'RECEIVE') return 'Chờ tiếp nhận sản phẩm';
  if (step === 'START_INSPECTION') return 'Chờ bắt đầu kiểm tra';
  if (step === 'INSPECTION' || step === 'INSPECTION_SUMMARY') return 'Đang kiểm tra sản phẩm';
  if (step === 'APPROVE') return 'Chờ quyết định';
  if (step === 'RESOLVE') return 'Chờ hoàn tất phương án xử lý';
  return 'Đang chờ cập nhật';
}

function hasResolutionAction(actions: readonly AfterSalesAction[]): boolean {
  return actions.some((action) => action.startsWith('RESOLVE_'));
}

function pushTimeline(
  items: OperationsTimelineItem[],
  label: string,
  at: string | null | undefined,
  description: string | null | undefined,
) {
  if (at == null) return;
  items.push({ at: formatAfterSalesDateTime(at), description, label });
}
