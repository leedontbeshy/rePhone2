import type { HealthProbeState, SystemHealthSnapshot } from '@/lib/system-admin-api';

export type HealthTone = 'success' | 'warning' | 'danger';

export interface HealthProbePresentation {
  readonly description: string;
  readonly label: 'Đang hoạt động' | 'Sẵn sàng' | 'Gián đoạn';
  readonly tone: HealthTone;
}

export function healthProbePresentation(
  probe: 'live' | 'ready',
  state: HealthProbeState,
): HealthProbePresentation {
  if (probe === 'live' && state === 'healthy') {
    return {
      description: 'Dịch vụ đang phản hồi ở lần kiểm tra gần nhất.',
      label: 'Đang hoạt động',
      tone: 'success',
    };
  }
  if (probe === 'ready' && state === 'healthy') {
    return {
      description: 'Hệ thống sẵn sàng tiếp nhận yêu cầu.',
      label: 'Sẵn sàng',
      tone: 'success',
    };
  }
  if (probe === 'ready' && state === 'degraded') {
    return {
      description: 'Hệ thống đang hoạt động nhưng chưa sẵn sàng tiếp nhận yêu cầu.',
      label: 'Gián đoạn',
      tone: 'warning',
    };
  }
  return {
    description: 'Chưa nhận được phản hồi ở lần kiểm tra gần nhất.',
    label: 'Gián đoạn',
    tone: 'danger',
  };
}

export function healthSummary(snapshot: SystemHealthSnapshot): {
  readonly description: string;
  readonly title: string;
  readonly tone: HealthTone;
} {
  if (snapshot.live.state === 'healthy' && snapshot.ready.state === 'healthy') {
    return {
      description: 'Cả hai kiểm tra đều hoàn tất bình thường.',
      title: 'Hệ thống đang hoạt động ổn định',
      tone: 'success',
    };
  }
  if (snapshot.live.state === 'healthy') {
    return {
      description: 'Dịch vụ còn phản hồi nhưng khả năng phục vụ đang bị gián đoạn.',
      title: 'Hệ thống cần được kiểm tra',
      tone: 'warning',
    };
  }
  return {
    description: 'Chưa thể xác nhận trạng thái hệ thống ở lần kiểm tra này.',
    title: 'Hệ thống đang gián đoạn',
    tone: 'danger',
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
