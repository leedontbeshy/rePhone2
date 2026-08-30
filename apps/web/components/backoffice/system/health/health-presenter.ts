import type { HealthProbeResult, SystemHealthSnapshot } from '@/lib/system-admin-api';

export type HealthTone = 'success' | 'warning' | 'danger' | 'neutral';
export interface HealthProbePresentation {
  readonly description: string;
  readonly label: string;
  readonly tone: HealthTone;
}
export interface HealthFreshnessPresentation {
  readonly description: string;
  readonly label: string;
  readonly tone: 'neutral' | 'warning';
}
export interface HealthGuidancePresentation {
  readonly description: string;
  readonly title: string;
}

export function healthProbePresentation(
  probe: 'api' | 'database' | 'storage' | 'mail',
  result: Pick<HealthProbeResult, 'reason' | 'state'>,
): HealthProbePresentation {
  if (result.state === 'healthy') {
    return { description: healthyDescription(probe), label: 'Ổn định', tone: 'success' };
  }
  if (result.state === 'not_configured') {
    return {
      description: 'Chức năng này chưa được cấu hình cho môi trường hiện tại.',
      label: 'Chưa cấu hình',
      tone: 'neutral',
    };
  }
  if (result.state === 'degraded') {
    return { description: reasonDescription(result.reason), label: 'Cần chú ý', tone: 'warning' };
  }
  return { description: reasonDescription(result.reason), label: 'Gián đoạn', tone: 'danger' };
}

export function healthSummary(snapshot: SystemHealthSnapshot) {
  if (snapshot.state === 'healthy') {
    return {
      description: 'API và các dịch vụ phụ thuộc đều phản hồi bình thường.',
      title: 'Hệ thống đang hoạt động ổn định',
      tone: 'success' as const,
    };
  }
  if (snapshot.state === 'degraded') {
    return {
      description: 'API còn hoạt động nhưng có dịch vụ phụ thuộc cần được kiểm tra.',
      title: 'Hệ thống đang hoạt động hạn chế',
      tone: 'warning' as const,
    };
  }
  return {
    description: 'Cơ sở dữ liệu chưa sẵn sàng để phục vụ công việc vận hành.',
    title: 'Hệ thống đang gián đoạn',
    tone: 'danger' as const,
  };
}

export function formatHealthCheckedAt(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Chưa ghi nhận';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(timestamp);
}

export function formatLatency(value: number): string {
  return Number.isFinite(value) && value >= 0
    ? `${Math.round(value).toString()} mili giây`
    : 'Chưa ghi nhận';
}

export function formatUptime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return 'Chưa ghi nhận';
  const minutes = Math.floor(value / 60);
  if (minutes < 1) return 'Dưới 1 phút';
  const hours = Math.floor(minutes / 60);
  if (hours < 1) return `${minutes.toString()} phút`;
  const days = Math.floor(hours / 24);
  return days < 1 ? `${hours.toString()} giờ` : `${days.toString()} ngày ${String(hours % 24)} giờ`;
}

export function healthFreshness(
  checkedAt: string,
  observedAt: Date = new Date(),
): HealthFreshnessPresentation {
  const checkedTimestamp = Date.parse(checkedAt);
  const observedTimestamp = observedAt.getTime();
  if (Number.isNaN(checkedTimestamp) || Number.isNaN(observedTimestamp)) {
    return {
      description: 'Không xác định được độ mới của kết quả.',
      label: 'Chưa xác định',
      tone: 'warning',
    };
  }
  const ageMinutes = Math.max(0, Math.floor((observedTimestamp - checkedTimestamp) / 60_000));
  if (ageMinutes < 1)
    return { description: 'Kết quả vừa được cập nhật.', label: 'Vừa kiểm tra', tone: 'neutral' };
  if (ageMinutes < 15)
    return {
      description: 'Kết quả vẫn còn mới.',
      label: `${String(ageMinutes)} phút trước`,
      tone: 'neutral',
    };
  if (ageMinutes < 60)
    return {
      description: 'Nên kiểm tra lại trước khi xử lý sự cố.',
      label: `${String(ageMinutes)} phút trước`,
      tone: 'warning',
    };
  const ageHours = Math.floor(ageMinutes / 60);
  return {
    description: 'Kết quả đã cũ; hãy kiểm tra lại để có trạng thái mới.',
    label: ageHours < 24 ? `${String(ageHours)} giờ trước` : 'Kết quả đã cũ',
    tone: 'warning',
  };
}

export function healthGuidance(snapshot: SystemHealthSnapshot): HealthGuidancePresentation {
  if (snapshot.state === 'healthy')
    return {
      description: 'Có thể tiếp tục các công việc vận hành như bình thường.',
      title: 'Không cần thao tác',
    };
  if (snapshot.state === 'degraded')
    return {
      description: 'Kiểm tra dịch vụ đang cảnh báo; API vẫn tiếp nhận công việc bình thường.',
      title: 'Theo dõi dịch vụ phụ thuộc',
    };
  return {
    description: 'Tạm dừng thao tác thay đổi dữ liệu và báo cho người phụ trách hệ thống.',
    title: 'Cần kiểm tra ngay',
  };
}

function healthyDescription(probe: 'api' | 'database' | 'storage' | 'mail'): string {
  if (probe === 'api') return 'API đang phản hồi yêu cầu.';
  if (probe === 'database') return 'Cơ sở dữ liệu sẵn sàng và không có bản cập nhật dở dang.';
  if (probe === 'storage') return 'Kho tệp đang phản hồi yêu cầu kiểm tra.';
  return 'Dịch vụ gửi email đang kết nối bình thường.';
}

function reasonDescription(reason: HealthProbeResult['reason']): string {
  if (reason === 'timeout') return 'Dịch vụ phản hồi quá thời gian cho phép.';
  if (reason === 'incomplete_migration') return 'Có bản cập nhật dữ liệu chưa hoàn tất.';
  if (reason === 'no_applied_migration') return 'Chưa ghi nhận bản cập nhật dữ liệu đã hoàn tất.';
  if (reason === 'not_configured') return 'Dịch vụ chưa được cấu hình.';
  return 'Dịch vụ chưa phản hồi ở lần kiểm tra gần nhất.';
}
