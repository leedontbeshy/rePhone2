# Transactional notifications P0

Email là kênh hỗ trợ; database và màn hình order luôn là nguồn sự thật. P0 gửi email trực tiếp sau commit qua một `MailProvider`, không thêm outbox/retry table để giữ phạm vi phù hợp đồ án.

## 1. Delivery policy

1. Business transaction commit trước.
2. Application phát notification event in-process chỉ khi transition thực sự mới xảy ra, không phát khi idempotent replay.
3. Renderer nhận DTO snapshot tối thiểu, không query tùy tiện trong template.
4. SMTP adapter thử tối đa 2 lần cho lỗi transient, tổng timeout tối đa 3 giây.
5. Nếu vẫn lỗi: business command vẫn thành công; log `notification.failed` đã redacted và trả `notificationDelivery: FAILED` chỉ ở backoffice command cần người vận hành biết.

Không hứa exactly-once: crash giữa commit và send có thể bỏ email; SMTP retry có thể tạo email trùng. Đây là accepted limitation của P0. Người dùng kiểm tra trạng thái thật trên website.

## 2. Event/template matrix

| Event | Người nhận | Template | Bắt buộc P0 |
|---|---|---|---|
| `employee.invited` | Employee | Link accept invitation, expiry | Có; Admin có resend |
| `auth.password_reset_requested` | User | Link reset, expiry | Có; endpoint luôn trả generic response |
| `order.placed_pickup` | Customer/guest | Mã đơn, pickup address, hold deadline | Có |
| `order.placed_shipping` | Customer/guest | Mã đơn, số cọc, bank snapshot, proof deadline | Có |
| `payment.proof_submitted` | Customer/guest | Đã nhận proof, SLA review | Có |
| `payment.verified` | Customer/guest | Xác nhận cọc, balance COD | Có |
| `payment.rejected` | Customer/guest | Lý do, đơn đã cancel/refund rule | Có |
| `pickup.ready` | Customer/guest | Địa chỉ, hold deadline | Có |
| `shipment.handed_over` | Customer/guest | Carrier, tracking code/url | Có |
| `order.completed` | Customer/guest | Tóm tắt, warranty code/link | Có |
| `order.cancelled` | Customer/guest | Lý do và refund status nếu có | Có |
| `refund.completed` | Customer/guest | Amount/method, không đính evidence private | Có |
| `after_sales.updated` | Customer/guest | Request number, state/next step | Có |
| `payment.review_overdue` | Store/Admin mailbox | Danh sách/link review | Log-only P0; email P1 |

Đăng ký customer không cần verification và không gửi welcome email bắt buộc. Mọi email guest chứa opaque access link có token ngẫu nhiên hoặc yêu cầu nhập order number + access token; mã đơn riêng không cấp quyền.

## 3. Template rules

- Subject có `[rePhone]` và public code, không chứa IMEI/serial/full bank account.
- HTML đơn giản, responsive; luôn có plain-text alternative.
- Tiền format VND từ digit string; thời gian hiển thị `Asia/Ho_Chi_Minh` và ghi rõ múi giờ khi là deadline.
- Link dựng từ `WEB_PUBLIC_URL`, token đặt trong fragment nếu frontend có thể đổi fragment thành secure flow; không log URL chứa token.
- Escape toàn bộ user text; customer/internal note không chèn vào HTML trừ khi thực sự cần.
- Email payment dùng bank snapshot của Payment, không dùng settings hiện hành.

## 4. Local và test

- Local SMTP trỏ Mailpit `localhost:1025`; UI Mailpit `http://localhost:8025`.
- Unit test dùng fake provider ghi event vào memory và assert payload/template key.
- Integration test SMTP thật chỉ cần một smoke test với Mailpit; không gọi nhà cung cấp email ngoài trong CI.
- Snapshot test template tập trung subject, critical amount/deadline/link; không snapshot toàn HTML dễ vỡ.

## 5. Resend và manual recovery

- Employee invitation có endpoint resend đã định nghĩa.
- Password reset có thể request lại nhưng vẫn rate-limit và generic response.
- Order/payment email không thêm endpoint resend P0; staff có thể hướng khách xem portal bằng mã đơn/access link.
- Không tự gửi lại email khi chỉ đọc resource hoặc replay cùng source Cart/expected terminal state.

## 6. Bảo mật và privacy

- SMTP credential chỉ ở API environment.
- Event/log metadata không chứa password, token, raw identifier, evidence URL, full bank account hay address không cần thiết. Riêng nội dung email hướng dẫn cọc được phép chứa bank snapshot của cửa hàng; giá trị này không xuất hiện trong subject hoặc provider log do ứng dụng ghi.
- Guest email chỉ gửi tới `customerEmail` snapshot của Order.
- Mail failure log lưu recipient dạng masked/hash, template key, resource ID và provider error category; không log body.

## Liên kết

- [Configuration](configuration.md)
- [Background jobs](background-jobs.md)
- [Authentication và security](authentication-and-security.md)
- [Employee/settings endpoints](../api/employee-settings-audit-endpoints.md)
