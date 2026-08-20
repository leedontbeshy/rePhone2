# Xác thực và bảo mật

## 1. Phạm vi

Tài liệu mô tả baseline bảo mật của MVP. Đây không thay thế security review trước khi vận hành production.

## 2. Authentication

- Đăng ký/đăng nhập bằng email và mật khẩu.
- Customer đăng ký được `ACTIVE` ngay trong MVP demo; xác minh email được giữ cho P1 sau khi có domain/provider production.
- Register không tạo session/token; customer đăng nhập riêng sau khi đăng ký.
- Employee do admin tạo ở trạng thái chờ; employee accept invitation và tự đặt mật khẩu trước khi login.
- Password hash dùng Argon2id với tham số được cấu hình và có thể nâng cấp.
- Password dài 8–128 ký tự, có ít nhất một chữ và một số; không bắt buộc chữ hoa/ký tự đặc biệt. Không trim/normalize trước khi hash.
- Password reset/employee invitation token là random token một lần, database chỉ lưu hash và expiry. `VERIFY_EMAIL` là hook P1, không được phát hành trong P0.

## 3. Session/token

- Access token ngắn hạn chỉ giữ trong frontend memory và gửi bằng Authorization Bearer; không lưu Web Storage.
- Refresh token rotation; database lưu hash trong `AuthSession`, raw token chỉ ở HttpOnly cookie.
- Access JWT chứa `sessionId`; auth guard sau khi verify signature/expiry phải kiểm tra AuthSession chưa revoke/expired và User còn ACTIVE. Vì vậy logout/disable/change password có hiệu lực với access request tiếp theo, không chờ đủ 15 phút.
- Refresh cookie `Secure` ở production, `SameSite` phù hợp topology và path giới hạn cho auth endpoints.
- Logout thu hồi session hiện tại; đổi mật khẩu có thể thu hồi toàn bộ session.
- Phát hiện reuse refresh token phải thu hồi token family liên quan.
- Refresh/logout kiểm tra Origin/CORS allowlist và custom CSRF header; business mutation dùng Bearer token.

TTL P0 hiện hành: access 15 phút, refresh session absolute 7 ngày, reset password 30 phút và employee invitation 24 giờ. Verify email 24 giờ là cấu hình dự phòng P1, chưa phát hành token. Không có sliding session/Remember me trong MVP.

Guest cart dùng token riêng trong HttpOnly cookie, database chỉ lưu SHA-256 hash và hết hạn tuyệt đối sau 30 ngày. Token này không phải auth session và không cấp quyền xem order.

## 4. Authorization

- Role cố định: `ADMIN`, `EMPLOYEE`, `CUSTOMER`.
- Guard role chỉ là tầng đầu; endpoint dữ liệu cá nhân phải kiểm tra ownership.
- Policy riêng cho hành động theo trạng thái, ví dụ chỉ xác nhận payment đang chờ review.
- Giá vốn, quản lý nhân viên, voucher và settings là admin-only.
- Customer không thể truy cập order/warranty của người khác bằng cách đổi ID.

## 5. Device identifier protection

- IMEI/serial/EID normalize rồi mã hóa authenticated encryption.
- HMAC-SHA-256 phục vụ exact lookup và unique detection.
- Encryption key và HMAC secret khác nhau, nằm ngoài database.
- Một `identifierKeyVersion` trên InventoryUnit chuẩn bị cho rotation; chưa xây UI rotation trong MVP.
- DTO public chỉ có masked suffix/public inventory code.

## 6. File security

- Product media có thể public.
- Payment, refund và after-sales evidence luôn private.
- Upload kiểm tra role, owner, MIME thực, kích thước và extension cho phép.
- Mọi upload P0 đi qua NestJS multipart; frontend không nhận signed-upload URL hoặc service credential.
- Object path do backend sinh; không tin filename từ client.
- Signed URL có thời hạn ngắn và được cấp sau authorization.
- Supabase service credential chỉ dùng server-side.
- Refund bank evidence được upload trước completion transaction; backend kiểm tra object/path trước transaction và chỉ lưu bucket/objectPath, không lưu signed URL.
- Private object upload thành công nhưng chưa được record tham chiếu không có giá trị nghiệp vụ và được cleanup thủ công/P1.

## 7. API hardening

- DTO whitelist; từ chối field thừa ở endpoint nhạy cảm.
- Rate limit auth, lookup, checkout và upload.
- CORS allowlist; security headers; giới hạn body/file size.
- Không log password, token, secret, raw IMEI hoặc evidence URL private.
- Error response không rò stack trace, SQL hoặc trạng thái tồn kho nội bộ không cần thiết.

## 8. Audit

Audit tối thiểu gồm actor, action, resource type/id, request ID, thời gian, IP/user agent phù hợp và metadata đã lọc secret.

Hành động bắt buộc audit:

- Tạo/khóa/mở tài khoản; P0 không có endpoint đổi role.
- Xem/giải mã định danh thiết bị.
- Sửa giá vốn hoặc giá bán.
- Điều chỉnh/di chuyển tồn.
- Xác nhận/từ chối cọc.
- Tạo/sửa/hủy refund.
- Gia hạn reservation hoặc override phí ship.
- Thay đổi settings nghiệp vụ.

## 9. Tài liệu liên quan

- [Vai trò và phân quyền](../requirements/roles-and-permissions.md)
- [ADR-0007](../decisions/0007-authentication-guest-checkout-and-rbac.md)
- [ADR-0010](../decisions/0010-supabase-storage.md)
- [ADR-0042](../decisions/0042-refund-evidence-before-atomic-completion.md)
- [ADR-0050](../decisions/0050-memory-access-token-and-http-only-refresh-cookie.md)
- [ADR-0051](../decisions/0051-auth-token-lifetimes.md)
- [ADR-0053](../decisions/0053-defer-customer-email-verification.md)
- [ADR-0054](../decisions/0054-register-without-auto-login.md)
- [ADR-0055](../decisions/0055-pragmatic-password-policy.md)
- [ADR-0056](../decisions/0056-employee-invitation-onboarding.md)
- [ADR-0058](../decisions/0058-http-only-guest-cart-cookie.md)
- [ADR-0060](../decisions/0060-backend-mediated-file-uploads.md)
