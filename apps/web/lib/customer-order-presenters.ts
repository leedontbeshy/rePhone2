import type { components } from '@rephone/api-client';

type GeneratedOrder = components['schemas']['OrderDetailDto'];
type GeneratedWarranty = NonNullable<GeneratedOrder['items'][number]['warranty']>;

export type CustomerOrderWarranty = Pick<GeneratedWarranty, 'status' | 'isValid' | 'isExpired'>;

export function fulfillmentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: 'Chờ chuẩn bị',
    PREPARING: 'Đang chuẩn bị',
    READY: 'Sẵn sàng nhận hàng',
    IN_TRANSIT: 'Đang vận chuyển',
    COMPLETED: 'Đã hoàn tất',
    FAILED: 'Giao không thành công',
    RETURNED: 'Đã hoàn về',
    CANCELLED: 'Đã hủy',
  };
  return labels[status] ?? 'Đang cập nhật giao nhận';
}

export function warrantyStatusLabel(warranty: CustomerOrderWarranty): string {
  if (warranty.status === 'VOIDED') return 'Đã vô hiệu';
  if (warranty.isValid) return 'Còn hiệu lực';
  if (warranty.isExpired) return 'Đã hết hạn';
  return 'Chưa hiệu lực';
}
