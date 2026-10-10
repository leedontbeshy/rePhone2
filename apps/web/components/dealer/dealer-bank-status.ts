import { dealerDate, dealerText, type DealerRecord } from '@/lib/dealer-api';

export function bankIsEffective(bank: DealerRecord) {
  return (
    !bank['disabledAt'] &&
    Boolean(bank['emailConfirmedAt']) &&
    Boolean(bank['verifiedAt']) &&
    new Date(dealerText(bank['effectiveAt'])).getTime() <= Date.now()
  );
}

export function bankStatus(bank: DealerRecord) {
  if (bank['disabledAt']) return 'Đã ngừng sử dụng';
  if (bankIsEffective(bank)) return 'Đã xác minh · Có hiệu lực';
  if (bank['verifiedAt']) return `Chờ hiệu lực từ ${dealerDate(bank['effectiveAt'])}`;
  if (bank['emailConfirmedAt']) return 'Chờ admin xác minh';
  return 'Chờ chủ đại lý xác nhận email';
}

export function bankDeliveryNotice(value: DealerRecord): {
  tone: 'success' | 'warning' | 'info';
  message: string;
} {
  switch (value['emailDelivery']) {
    case 'SENT':
      return {
        tone: 'success',
        message:
          'Đã lưu tài khoản và gửi email xác nhận tới email đăng nhập. Liên kết có hiệu lực 30 phút.',
      };
    case 'FAILED':
      return {
        tone: 'warning',
        message:
          'Đã lưu tài khoản, nhưng chưa gửi được email xác nhận. Không cần nhập lại. Vui lòng đợi một phút rồi chọn “Gửi lại email xác nhận” bên dưới.',
      };
    case 'NOT_REQUIRED':
      return {
        tone: 'info',
        message: 'Tài khoản này đã có trong hồ sơ và đã xác nhận email. Không tạo thêm bản trùng.',
      };
    default:
      return {
        tone: 'info',
        message:
          'Tài khoản này đã có trong hồ sơ. Kiểm tra email đăng nhập hoặc chọn “Gửi lại email xác nhận” bên dưới.',
      };
  }
}
