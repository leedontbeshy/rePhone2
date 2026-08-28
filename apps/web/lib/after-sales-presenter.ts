import type { components } from '@rephone/api-client';
import type { LifecycleStage, PostPurchaseTone } from '@/components/post-purchase';

export type AfterSalesStatus = components['schemas']['AfterSalesDetailDto']['status'];
export type AfterSalesType = components['schemas']['AfterSalesDetailDto']['type'];

export function afterSalesTypeLabel(type: AfterSalesType): string {
  if (type === 'WARRANTY') return 'Yêu cầu bảo hành';
  if (type === 'RETURN') return 'Yêu cầu trả sản phẩm';
  return 'Yêu cầu đổi sản phẩm';
}

export function afterSalesStatus(status: AfterSalesStatus): {
  label: string;
  tone: PostPurchaseTone;
} {
  const values: Record<AfterSalesStatus, { label: string; tone: PostPurchaseTone }> = {
    REQUESTED: { label: 'Đã gửi yêu cầu', tone: 'info' },
    RECEIVED: { label: 'Đã tiếp nhận', tone: 'info' },
    INSPECTING: { label: 'Đang kiểm tra', tone: 'warning' },
    APPROVED: { label: 'Đã chấp nhận', tone: 'success' },
    REJECTED: { label: 'Không thể hỗ trợ', tone: 'danger' },
    RESOLVED: { label: 'Đã hoàn tất', tone: 'success' },
    CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
  };
  return values[status];
}

export function afterSalesJourney(
  detail: components['schemas']['AfterSalesDetailDto'],
): readonly LifecycleStage[] {
  const timeline = detail.timeline;
  const requested: LifecycleStage = stage(
    'requested',
    'Đã gửi yêu cầu',
    'support',
    timeline.requestedAt,
    detail.status === 'REQUESTED' ? 'current' : 'complete',
  );
  if (detail.status === 'CANCELLED') {
    return [
      requested,
      stage('cancelled', 'Đã hủy', 'cancelled', timeline.cancelledAt, 'terminal', 'neutral'),
    ];
  }

  const received = stage(
    'received',
    'Đã tiếp nhận',
    'received',
    timeline.receivedAt,
    stateFor(detail.status, ['RECEIVED']),
  );
  const inspection = stage(
    'inspection',
    'Kiểm tra sản phẩm',
    'inspection',
    timeline.inspectedAt,
    stateFor(detail.status, ['INSPECTING']),
  );

  if (detail.status === 'REJECTED') {
    return [
      requested,
      completeIfDated(received),
      completeIfDated(inspection),
      stage('rejected', 'Không thể hỗ trợ', 'failed', timeline.decidedAt, 'terminal', 'danger'),
    ];
  }

  const decision = stage(
    'decision',
    'Đã có kết quả',
    'decision',
    timeline.decidedAt,
    stateFor(detail.status, ['APPROVED']),
  );
  const resolved = stage(
    'resolved',
    'Đã hoàn tất',
    'complete',
    timeline.resolvedAt,
    detail.status === 'RESOLVED' ? 'current' : 'upcoming',
    'success',
  );
  return [
    requested,
    completeIfDated(received),
    completeIfDated(inspection),
    completeIfDated(decision),
    resolved,
  ];
}

export function afterSalesNextStep(status: AfterSalesStatus): string {
  if (status === 'REQUESTED') return 'rePhone sẽ tiếp nhận và kiểm tra thông tin bạn đã gửi.';
  if (status === 'RECEIVED') return 'Sản phẩm sẽ được kiểm tra để xác định phương án phù hợp.';
  if (status === 'INSPECTING') return 'rePhone sẽ cập nhật khi có kết quả kiểm tra.';
  if (status === 'APPROVED') return 'rePhone đang thực hiện phương án hỗ trợ đã thống nhất.';
  if (status === 'REJECTED') return 'Bạn có thể xem lý do trong kết quả kiểm tra bên dưới.';
  if (status === 'CANCELLED') return 'Yêu cầu này đã kết thúc và không còn thao tác nào.';
  return 'Yêu cầu đã hoàn tất. Thông tin xử lý vẫn được lưu để bạn xem lại.';
}

export function attachmentTypeLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'Tài liệu PDF';
  if (mimeType === 'image/jpeg') return 'Ảnh JPEG';
  if (mimeType === 'image/png') return 'Ảnh PNG';
  if (mimeType === 'image/webp') return 'Ảnh WebP';
  return 'Ảnh hoặc tài liệu';
}

export function afterSalesWarrantyLabel(
  warranty: components['schemas']['AfterSalesWarrantySummaryDto'],
  now = Date.now(),
): string {
  if (warranty.status === 'ACTIVE' && Date.parse(warranty.startAt) > now) return 'Chưa có hiệu lực';
  return warranty.isValid ? 'Còn hiệu lực' : 'Không còn hiệu lực';
}

export function formatCustomerDate(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? value
    : new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(timestamp);
}

export function formatFileSize(value: number): string {
  if (value < 1024) return `${String(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function stage(
  id: string,
  label: string,
  icon: LifecycleStage['icon'],
  at: string | null | undefined,
  state: LifecycleStage['state'],
  tone: LifecycleStage['tone'] = 'info',
): LifecycleStage {
  return { id, label, icon, at: at ? formatCustomerDate(at) : null, state, tone };
}

function stateFor(
  status: AfterSalesStatus,
  current: readonly AfterSalesStatus[],
): LifecycleStage['state'] {
  return current.includes(status) ? 'current' : 'upcoming';
}

function completeIfDated(value: LifecycleStage): LifecycleStage {
  if (value.state === 'current' || value.state === 'terminal') return value;
  return value.at ? { ...value, state: 'complete' } : value;
}
