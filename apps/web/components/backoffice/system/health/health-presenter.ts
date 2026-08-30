import type { HealthProbeState, SystemHealthSnapshot } from '@/lib/system-admin-api';

export type HealthTone = 'success' | 'warning' | 'danger';

export interface HealthProbePresentation {
  readonly description: string;
  readonly label: 'Đang hoạt động' | 'Sẵn sàng' | 'Gián đoạn';
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
  if (ageMinutes < 1) {
    return {
      description: 'Kết quả vừa được cập nhật.',
      label: 'Vừa kiểm tra',
      tone: 'neutral',
    };
  }
  if (ageMinutes < 15) {
    return {
      description: 'Kết quả vẫn còn mới.',
      label: `${String(ageMinutes)} phút trước`,
      tone: 'neutral',
    };
  }
  if (ageMinutes < 60) {
    return {
      description: 'Nên kiểm tra lại trước khi xử lý sự cố.',
      label: `${String(ageMinutes)} phút trước`,
      tone: 'warning',
    };
  }

  const ageHours = Math.floor(ageMinutes / 60);
  return {
    description: 'Kết quả đã cũ; hãy kiểm tra lại để có trạng thái mới.',
    label: ageHours < 24 ? `${String(ageHours)} giờ trước` : 'Kết quả đã cũ',
    tone: 'warning',
  };
}

export function healthGuidance(snapshot: SystemHealthSnapshot): HealthGuidancePresentation {
  if (snapshot.live.state === 'healthy' && snapshot.ready.state === 'healthy') {
    return {
      description: 'Có thể tiếp tục các công việc vận hành như bình thường.',
      title: 'Không cần thao tác',
    };
  }
  if (snapshot.live.state === 'healthy') {
    return {
      description:
        'Thử kiểm tra lại sau ít phút. Nếu trạng thái chưa đổi, đối chiếu các hoạt động gần nhất.',
      title: 'Kiểm tra lại trước khi tiếp tục',
    };
  }
  return {
    description:
      'Thử kiểm tra lại. Nếu dịch vụ vẫn không phản hồi, báo cho nhóm phụ trách và cung cấp thời điểm kiểm tra.',
    title: 'Xác nhận lại trạng thái',
  };
}
