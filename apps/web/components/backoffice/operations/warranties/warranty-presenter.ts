import type { BackofficeWarrantyDetail, BackofficeWarrantyListItem } from '@/lib/warranty-api';
import type { OperationsTimelineItem, OperationsTone } from '../operations-primitives';

export interface WarrantyPresentation {
  label: string;
  tone: OperationsTone;
}

export function warrantyStatusPresentation(
  warranty: Pick<BackofficeWarrantyListItem, 'status'>,
): WarrantyPresentation {
  return warranty.status === 'VOIDED'
    ? { label: 'Đã vô hiệu', tone: 'danger' }
    : { label: 'Đang áp dụng', tone: 'success' };
}

export function warrantyValidityPresentation(
  warranty: Pick<BackofficeWarrantyListItem, 'isExpired' | 'isValid' | 'status'>,
): WarrantyPresentation {
  if (warranty.status === 'VOIDED') return { label: 'Không còn hiệu lực', tone: 'danger' };
  if (warranty.isValid) return { label: 'Còn hiệu lực', tone: 'success' };
  if (warranty.isExpired) return { label: 'Đã hết hạn', tone: 'neutral' };
  return { label: 'Chưa bắt đầu', tone: 'info' };
}

export function warrantyTimeline(detail: BackofficeWarrantyDetail): OperationsTimelineItem[] {
  const items: OperationsTimelineItem[] = [
    {
      at: formatWarrantyDateTime(detail.createdAt),
      description: `${String(detail.daysSnapshot)} ngày bảo hành cho ${detail.productName}.`,
      label: 'Đã cấp bảo hành',
    },
    {
      at: formatWarrantyDateTime(detail.startAt),
      label: 'Bắt đầu thời hạn bảo hành',
      state: new Date(detail.startAt).getTime() > Date.now() ? 'pending' : 'complete',
    },
  ];
  if (detail.voidedAt != null) {
    items.push({
      at: formatWarrantyDateTime(detail.voidedAt),
      description: detail.voidReason,
      label: 'Đã vô hiệu bảo hành',
      state: 'danger',
    });
  } else if (detail.isExpired) {
    items.push({ at: formatWarrantyDateTime(detail.endAt), label: 'Đã hết thời hạn' });
  } else {
    items.push({
      at: formatWarrantyDateTime(detail.endAt),
      label: 'Dự kiến hết thời hạn',
      state: 'current',
    });
  }
  return items;
}

export function formatWarrantyDateTime(value: string | Date): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(parsed);
}
