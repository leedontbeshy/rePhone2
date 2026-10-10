import { validateRefundEvidenceFile } from './refund-api';

interface Result {
  data?: unknown;
  error?: unknown;
  response?: Response;
}
interface Transport {
  GET(path: string, options?: unknown): Promise<Result>;
  POST(path: string, options?: unknown): Promise<Result>;
}
export type DealerRecord = Record<string, unknown>;
export class DealerApiError extends Error {
  public constructor(
    message: string,
    public readonly code: string,
    public readonly details: ReadonlyArray<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'DealerApiError';
  }
}
export function dealerRecord(value: unknown): DealerRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as DealerRecord)
    : {};
}
export function dealerRows(value: unknown): DealerRecord[] {
  return Array.isArray(value) ? value.map(dealerRecord) : [];
}
export function dealerText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
export function dealerMoney(value: unknown): string {
  const text = dealerText(value);
  return /^\d+$/.test(text) ? `${BigInt(text).toLocaleString('vi-VN')} ₫` : '—';
}
export function dealerDate(value: unknown): string {
  const text = dealerText(value);
  const date = new Date(text);
  return !text || Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN');
}
export function dealerStatus(value: unknown): string {
  const status = dealerText(value);
  return (
    (
      {
        ACTIVE: 'Hoạt động',
        PENDING: 'Chờ duyệt',
        REJECTED: 'Đã từ chối',
        BUSINESS_SUSPENDED: 'Tạm ngừng kinh doanh',
        SECURITY_LOCKED: 'Khóa bảo mật',
        NORMAL: 'Bình thường',
        CLOSED: 'Đã ngừng hoạt động',
        PLACED: 'Chờ thanh toán',
        CONFIRMED: 'Đã xác nhận',
        PROCESSING: 'Đang xử lý',
        COMPLETED: 'Hoàn tất',
        CANCELLED: 'Đã hủy',
        UNPAID: 'Chưa thanh toán',
        PARTIALLY_PAID: 'Chưa đủ tiền',
        PAID: 'Đã đủ tiền',
        REQUESTED: 'Chờ xử lý',
        UNDER_REVIEW: 'Đang duyệt',
        ACCEPTED: 'Đã đối chiếu',
        OPEN: 'Cần thanh toán',
        SATISFIED: 'Đã thanh toán',
        SUPERSEDED: 'Đã chuyển sang bổ sung',
        EXPIRED: 'Hết hạn',
        PREPARING: 'Đang chuẩn bị',
        IN_TRANSIT: 'Đang giao',
        RETURNED: 'Đã nhận hoàn',
        FAILED: 'Thất bại',
        DELIVERED: 'Đã giao',
        SUPPRESSED: 'Tạm dừng gửi',
        PARTIALLY_REFUNDED: 'Đã hoàn một phần',
        REFUNDED: 'Đã hoàn tiền',
      } as Record<string, string>
    )[status] ?? status
  );
}
export function dealerApi(client: unknown) {
  const transport = client as Transport;
  const pendingCommands = new Map<string, string>();
  function unwrap(result: Result): unknown {
    if (result.error !== undefined || result.data === undefined) {
      const error = dealerRecord(dealerRecord(result.error)['error']);
      throw new DealerApiError(
        dealerText(error['message']) || 'Không thể thực hiện thao tác. Vui lòng thử lại.',
        dealerText(error['code']),
        dealerRows(error['details'])
          .filter((detail) => dealerText(detail['field']) && dealerText(detail['message']))
          .map((detail) => ({
            field: dealerText(detail['field']),
            message: dealerText(detail['message']),
          })),
      );
    }
    return dealerRecord(result.data)['data'];
  }
  return {
    get: (path: string) => transport.GET(`/api/v1/${path}`, { cache: 'no-store' }).then(unwrap),
    post: async (path: string, body?: unknown, key?: string) => {
      const command =
        key === undefined && /(?:\/refunds|\/after-sales|\/backup-intake)$/.test(path)
          ? `${path}:${JSON.stringify(body)}`
          : undefined;
      if (command !== undefined) {
        key = pendingCommands.get(command) ?? crypto.randomUUID();
        pendingCommands.set(command, key);
      }
      const result = await transport
        .POST(`/api/v1/${path}`, {
          body,
          headers: { 'X-Rephone-CSRF': '1', ...(key ? { 'Idempotency-Key': key } : {}) },
        })
        .then(unwrap);
      if (command !== undefined) pendingCommands.delete(command);
      return result;
    },
    upload: async (path: string, file: File) => {
      const issue = validateRefundEvidenceFile(file);
      if (issue !== null) throw new Error(issue);
      const form = new FormData();
      form.set('file', file);
      return unwrap(
        await transport.POST(`/api/v1/${path}`, {
          body: { file },
          bodySerializer: () => form,
          headers: { 'X-Rephone-CSRF': '1' },
        }),
      );
    },
  };
}
export type DealerApi = ReturnType<typeof dealerApi>;
