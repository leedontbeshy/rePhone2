interface TransportResult {
  data?: unknown;
  error?: unknown;
}
interface Transport {
  GET(path: string, options?: unknown): Promise<TransportResult>;
  POST(path: string, options?: unknown): Promise<TransportResult>;
}
export type Row = Record<string, unknown>;
export const record = (v: unknown): Row =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {};
export const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(record) : []);
export const text = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : '';
export const currency = (v: unknown): string =>
  /^\d+$/.test(text(v)) ? `${BigInt(text(v)).toLocaleString('vi-VN')} ₫` : '—';
export const date = (v: unknown): string =>
  text(v) ? new Date(text(v)).toLocaleString('vi-VN') : '—';
export const statusLabel = (v: unknown): string =>
  (
    ({
      PENDING: 'Đang chờ',
      ACTIVE: 'Hoạt động',
      SUSPENDED: 'Tạm ngừng',
      REJECTED: 'Đã từ chối',
      AVAILABLE: 'Có thể rút',
      HELD: 'Tạm giữ',
      RESERVED: 'Đã dành cho khoản rút',
      PAID: 'Đã chi trả',
      VOID: 'Không phát sinh',
      REQUESTED: 'Chờ xử lý',
      PROCESSING: 'Đang chuyển tiền',
      NEEDS_REVIEW: 'Cần đối soát',
      CANCELLED: 'Đã hủy',
    }) as Record<string, string>
  )[text(v)] ?? text(v);
export function affiliateApi(client: unknown) {
  const transport = client as Transport;
  function unwrap(result: TransportResult) {
    if (result.error || !result.data) {
      const error = record(record(result.error)['error']);
      const guidance: Record<string, string> = {
        displayName: 'Tên hiển thị cần từ 2 đến 120 ký tự.',
        phone: 'Điện thoại bắt đầu bằng 0 hoặc +84, gồm 10–11 chữ số.',
        promotionChannels: 'Mô tả kênh giới thiệu từ 5 đến 1.000 ký tự.',
        rateBps: 'Hoa hồng cần nằm trong khoảng 0% đến 5%.',
        accountNumber: 'Số tài khoản chỉ gồm 6–30 chữ số.',
        accountHolder: 'Tên chủ tài khoản cần từ 2 đến 120 ký tự.',
        bankName: 'Tên ngân hàng cần từ 2 đến 120 ký tự.',
        currentPassword: 'Nhập mật khẩu hiện tại, từ 8 đến 128 ký tự.',
        reason: 'Lý do cần từ 5 đến 500 ký tự.',
        note: 'Ghi chú cần từ 5 đến 500 ký tự.',
        transferReference: 'Mã giao dịch cần từ 3 đến 150 ký tự, không có khoảng trắng.',
        transferredAt: 'Chọn ngày và giờ chuyển tiền hợp lệ.',
      };
      const details = [
        ...new Set(
          rows(error['details'])
            .map((d) => guidance[text(d['field'])])
            .filter(Boolean),
        ),
      ];
      throw new Error(
        details.join(' ') || text(error['message']) || 'Chưa thể thực hiện. Vui lòng thử lại.',
      );
    }
    return record(result.data)['data'];
  }
  return {
    get: (path: string) => transport.GET(`/api/v1/${path}`, { cache: 'no-store' }).then(unwrap),
    post: (path: string, body?: unknown) =>
      transport.POST(`/api/v1/${path}`, { body, headers: { 'X-Rephone-CSRF': '1' } }).then(unwrap),
    upload: (path: string, body: FormData) =>
      transport
        .POST(`/api/v1/${path}`, {
          body: {},
          bodySerializer: () => body,
          headers: { 'X-Rephone-CSRF': '1' },
        })
        .then(unwrap),
  };
}
export type AffiliateApi = ReturnType<typeof affiliateApi>;
export function referralDestination(value: string | null): string {
  if (
    value === '/' ||
    value === '/products' ||
    (value && /^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/units\/[A-Za-z0-9_-]+)?$/.test(value))
  )
    return value;
  return '/products';
}
