# Auth và account endpoints

- Trạng thái route set: Accepted tại ADR-0052.
- DTO field baseline: Accepted theo data model hiện hành; customer được tạo `ACTIVE` ngay, register không tự tạo session/token và password policy đã Accepted tại ADR-0055.

## 1. Auth endpoints

| Method/path | Auth | Request chính | Success | Lỗi chính |
|---|---|---|---|---|
| `POST /api/v1/auth/register` | Public | `email`, `password`, `fullName`, `phone?` | `201 RegisteredAccountDto`; tạo CUSTOMER `ACTIVE`, không tạo session/token/cookie | `VALIDATION_FAILED`, `DUPLICATE_RESOURCE`, `RATE_LIMITED` |
| `POST /api/v1/auth/login` | Public | `email`, `password` | `200`; access token/user, set refresh cookie | `VALIDATION_FAILED`, `INVALID_CREDENTIALS`, `ACCOUNT_UNAVAILABLE`, `RATE_LIMITED` |
| `POST /api/v1/auth/refresh` | Refresh cookie | Không body | `200`; rotate refresh, trả access token/user | `AUTH_REQUIRED`, `SESSION_REVOKED`, `CSRF_VALIDATION_FAILED` |
| `POST /api/v1/auth/logout` | Refresh cookie | Không body | `204`; revoke current session, clear cookie | `CSRF_VALIDATION_FAILED`; idempotent khi cookie không còn hợp lệ |
| `POST /api/v1/auth/forgot-password` | Public | `email` | `202`; response chung | `VALIDATION_FAILED`, `RATE_LIMITED` |
| `POST /api/v1/auth/reset-password` | Public | `token`, `newPassword` | `204`; consume token, đổi password, revoke sessions | `VALIDATION_FAILED`, `ONE_TIME_TOKEN_INVALID`, `RATE_LIMITED` |
| `POST /api/v1/auth/accept-employee-invitation` | Public | `token`, `password` | `204`; atomically set password/verified time, consume invitation, activate employee; không auto-login | `VALIDATION_FAILED`, `ONE_TIME_TOKEN_INVALID`, `RATE_LIMITED` |

### Anti-enumeration

- Forgot-password trả cùng `202`/message dù email không tồn tại hoặc không đủ điều kiện.
- Timing nên được giữ tương đối đồng đều; không trả field nói email có tồn tại.
- Login có thể trả credential error chung cho sai email/password.
- Log/audit nội bộ vẫn ghi outcome đã redacted và requestId.

### Transaction/side effect

- Register atomically tạo customer; response chỉ gồm `id`, `email`, `fullName`, `status`. Client chuyển sang login riêng.
- Register/reset/invitation thay đổi database bằng transaction phù hợp.
- Reset password consume one-time token, đổi password/passwordChangedAt và revoke mọi AuthSession atomically.
- Accept invitation consume token, activate employee và hoàn tất password atomically.
- Email reset password/invitation gửi sau commit; lỗi gửi không rollback user/token state đã commit. Retry/recovery cụ thể thuộc notification policy.

## 2. Self-service account

| Method/path | Actor | Request chính | Success | Ghi chú |
|---|---|---|---|---|
| `GET /api/v1/account` | Authenticated user | — | `200 AccountDto` | Safe self projection |
| `PATCH /api/v1/account` | Authenticated user | `fullName?`, `phone?` | `200 AccountDto` | Không đổi role/status/email/password |
| `POST /api/v1/account/change-password` | Authenticated user | `currentPassword`, `newPassword` | `204` | Có thể trả `CURRENT_PASSWORD_INCORRECT`; thành công revoke all sessions, clear refresh cookie và yêu cầu login lại |

`AccountDto` baseline: `id`, `email`, `role`, `status`, `fullName`, `phone`, `emailVerifiedAt`; với ADMIN/EMPLOYEE thêm `staffProfile { employeeCode, hiredAt? }`. Không trả cost, session/token hoặc permission nội bộ.

## 3. Customer address

| Method/path | Actor | Request/response |
|---|---|---|
| `GET /api/v1/account/addresses` | CUSTOMER | List active `AddressDto` |
| `POST /api/v1/account/addresses` | CUSTOMER | Create từ `label?`, `receiverName`, `phone`, `addressLine`, `ward`, `district`, `province`, `postalCode?`, `isDefault?` |
| `PATCH /api/v1/account/addresses/:id` | Owner CUSTOMER | Partial mutable fields, trả AddressDto |
| `DELETE /api/v1/account/addresses/:id` | Owner CUSTOMER | `204`, soft archive |

- Account/non-owner address đều đi qua ownership policy; caller khác nhận not found như catalog lỗi.
- Khi create/update `isDefault=true`, bỏ default address cũ trong cùng transaction.
- Archive default address không tự chọn address khác; customer phải đặt default mới hoặc chọn rõ ở checkout.
- Order dùng shipping snapshot, nên sửa/archive address không đổi order cũ.

## 4. Không thuộc P0

- List/revoke từng login device/session.
- Logout-all endpoint riêng; change/reset password đã revoke toàn bộ session.
- Đổi email.
- Social login, phone OTP, MFA/passkey.
- Verify/resend verification email customer; dự kiến P1 sau khi có domain/provider production.
- Customer tự xóa account.
- Dynamic roles/permission editor.

## 5. OpenAPI và security

- Refresh/logout nhận cookie và custom CSRF header; các authenticated endpoint khác dùng Bearer access token.
- Password/newPassword dài 8–128 ký tự, có ít nhất một chữ và một số, không có whitespace đầu/cuối; backend không nhận `confirmPassword`.
- Password/token/cookie không xuất hiện trong response DTO, log hoặc OpenAPI example thật.
- Auth endpoint có rate-limit profile riêng.
- Response/error envelope tuân API conventions.
- Cookie name/path/flags, CSRF header và rate-limit numbers đã chốt tại [Configuration](../architecture/configuration.md) và [Security threat model](../architecture/security-threat-model.md).

## 6. Trạng thái contract

Không còn quyết định Auth/Account P0 đang mở. Email verification/session-management UI/MFA được ghi rõ ngoài P0 ở trên.

## Liên kết

- [Auth token transport](auth-token-transport.md)
- [API error catalog](error-catalog.md)
- [Identity/Auth data dictionary](../data-model/identity-auth.md)
- [ADR-0052](../decisions/0052-lean-auth-and-account-endpoint-set.md)
- [ADR-0053](../decisions/0053-defer-customer-email-verification.md)
- [ADR-0054](../decisions/0054-register-without-auto-login.md)
- [ADR-0055](../decisions/0055-pragmatic-password-policy.md)
- [ADR-0056](../decisions/0056-employee-invitation-onboarding.md)
