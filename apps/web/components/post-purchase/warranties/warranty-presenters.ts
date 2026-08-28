import type { LifecycleStage, PostPurchaseTone } from '@/components/post-purchase';
import type { WarrantyDetail, WarrantyListItem } from '@/lib/warranty-api';

export type WarrantyValidity = 'active' | 'expired' | 'not-started' | 'voided';

export interface WarrantyPresentation {
  readonly code: string;
  readonly endLabel: string;
  readonly href: string;
  readonly inventoryLabel: string;
  readonly orderNumber: string;
  readonly productName: string;
  readonly startLabel: string;
  readonly statusLabel: string;
  readonly tone: PostPurchaseTone;
  readonly validity: WarrantyValidity;
  readonly variantName: string;
}

export function presentWarranty(item: WarrantyListItem): WarrantyPresentation {
  const validity = warrantyValidity(item);
  return {
    code: item.warrantyCode,
    endLabel: formatWarrantyDate(item.endAt),
    href: `/warranties/${encodeURIComponent(item.warrantyCode)}`,
    inventoryLabel: item.inventoryCode ?? 'Theo đơn hàng',
    orderNumber: item.orderNumber,
    productName: item.productName,
    startLabel: formatWarrantyDate(item.startAt),
    statusLabel: warrantyStatusLabel(validity),
    tone: warrantyTone(validity),
    validity,
    variantName: item.variantName,
  };
}

export function warrantyValidity(
  item: Pick<WarrantyListItem, 'isExpired' | 'isValid' | 'status'>,
): WarrantyValidity {
  if (item.status === 'VOIDED') return 'voided';
  if (item.isValid) return 'active';
  return item.isExpired ? 'expired' : 'not-started';
}

export function warrantyStatusLabel(validity: WarrantyValidity): string {
  if (validity === 'active') return 'Còn hiệu lực';
  if (validity === 'expired') return 'Đã hết hạn';
  if (validity === 'voided') return 'Đã vô hiệu';
  return 'Chưa hiệu lực';
}

export function warrantyTone(validity: WarrantyValidity): PostPurchaseTone {
  if (validity === 'active') return 'success';
  if (validity === 'not-started') return 'info';
  if (validity === 'expired') return 'warning';
  return 'danger';
}

export function warrantyJourney(detail: WarrantyDetail, now = new Date()): LifecycleStage[] {
  const validity = warrantyValidity(detail);
  const start = formatWarrantyDate(detail.startAt);
  const end = formatWarrantyDate(detail.endAt);
  const today = formatWarrantyDate(now.toISOString());

  if (validity === 'not-started') {
    return [
      { id: 'current', icon: 'calendar', label: 'Hiện tại', at: today, state: 'current' },
      { id: 'start', icon: 'warranty', label: 'Bắt đầu bảo hành', at: start, state: 'upcoming' },
      { id: 'end', icon: 'calendar', label: 'Kết thúc bảo hành', at: end, state: 'upcoming' },
    ];
  }
  if (validity === 'expired') {
    return [
      { id: 'start', icon: 'warranty', label: 'Bắt đầu bảo hành', at: start, state: 'complete' },
      { id: 'end', icon: 'calendar', label: 'Kết thúc bảo hành', at: end, state: 'complete' },
      {
        id: 'current',
        icon: 'failed',
        label: 'Bảo hành đã hết hạn',
        at: today,
        state: 'terminal',
        tone: 'warning',
      },
    ];
  }
  if (validity === 'voided') {
    return [
      { id: 'start', icon: 'warranty', label: 'Bắt đầu bảo hành', at: start, state: 'complete' },
      {
        id: 'voided',
        icon: 'cancelled',
        label: 'Bảo hành đã vô hiệu',
        state: 'terminal',
        tone: 'danger',
      },
      { id: 'end', icon: 'calendar', label: 'Mốc kết thúc đã ghi', at: end, state: 'upcoming' },
    ];
  }
  return [
    { id: 'start', icon: 'warranty', label: 'Bắt đầu bảo hành', at: start, state: 'complete' },
    {
      id: 'current',
      icon: 'complete',
      label: 'Đang trong thời hạn',
      at: today,
      state: 'current',
      tone: 'success',
    },
    { id: 'end', icon: 'calendar', label: 'Kết thúc bảo hành', at: end, state: 'upcoming' },
  ];
}

export function formatWarrantyDate(value: string | Date): string {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (Number.isNaN(timestamp)) return String(value);
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(timestamp);
}

export function maskedWarrantyIdentifier(value: string | null | undefined): string {
  return value === null || value === undefined ? 'Không áp dụng' : `•••• ${value}`;
}

export function parseWarrantyPage(value: string | null | undefined): number {
  return value !== undefined && value !== null && /^[1-9]\d*$/.test(value) ? Number(value) : 1;
}

export function warrantyPageHref(page: number): string {
  return page <= 1 ? '/warranties' : `/warranties?page=${String(page)}`;
}
