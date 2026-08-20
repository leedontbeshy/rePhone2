# User management, Settings và Audit endpoints

Tài liệu này khóa các API quản trị user/system P0. Employee management, customer lifecycle, settings và audit được ghi quyền rõ theo section; employee tự sửa profile/password qua `/account`.

## 1. Employee management

Toàn bộ endpoint trong section này chỉ dành cho `ADMIN`.

| Method/path | Request | Success |
|---|---|---|
| `GET /api/v1/backoffice/employees` | Filter/pagination | `200 EmployeeListItemDto[]` |
| `POST /api/v1/backoffice/employees` | Create DTO | `201 EmployeeDetailDto` |
| `GET /api/v1/backoffice/employees/:id` | — | `200 EmployeeDetailDto` |
| `PATCH /api/v1/backoffice/employees/:id` | Mutable profile fields | `200 EmployeeDetailDto` |
| `POST /api/v1/backoffice/employees/:id/resend-invitation` | — | `200 InvitationDeliveryDto` |
| `POST /api/v1/backoffice/employees/:id/disable` | `reason` | Disabled detail |
| `POST /api/v1/backoffice/employees/:id/enable` | `reason` | Active/pending detail |

### Create/update

Create fields:

```text
email, fullName, phone?, employeeCode, hiredAt?
```

- Backend normalize email; existing customer/staff email trả `DUPLICATE_RESOURCE`. P0 không convert role.
- Create atomically tạo User role `EMPLOYEE`, status `PENDING_VERIFICATION`, `passwordHash=null`, invitation token hash TTL 24h và audit.
- Email invitation gửi sau commit. Response có `deliveryStatus = SENT | FAILED`; business create không rollback khi SMTP lỗi.
- Admin không nhập/biết password employee.
- PATCH chỉ `fullName`, `phone`, `employeeCode`, `hiredAt`; không đổi email/role/status/password.
- `employeeCode` unique; normalize uppercase/trim.

### Invitation

- Resend chỉ cho employee `PENDING_VERIFICATION` chưa có password.
- Trong transaction, consume/invalidate invitation cũ và tạo token mới; gửi email sau commit.
- Employee accept qua public auth endpoint; transaction set password, emailVerifiedAt, ACTIVE và consume token. Không auto-login.
- Token raw không xuất hiện trong backoffice response/log; local xem link ở Mailpit.

### Disable/enable

- Disable reason 5..500; transaction set DISABLED, disabledAt, revoke mọi AuthSession và invalidate AuthToken.
- Employee bị disable không login/refresh; historical actor/FK giữ nguyên.
- Enable employee có password → ACTIVE và clear `disabledAt`. Nếu password null → PENDING_VERIFICATION, clear `disabledAt` và phát invitation mới sau commit.
- P0 không xóa employee, đổi EMPLOYEE thành ADMIN hoặc quản lý admin account qua API. Admin đầu tiên được seed.
- Mọi create/update/disable/enable/invitation action ghi AuditLog; không ghi raw token.

### Query/DTO

List query:

```text
q?, status?, hiredFrom?, hiredTo?,
page=1, pageSize=20, sortBy=createdAt, sortOrder=desc
```

Search email/fullName/employeeCode/phone normalized. DTO gồm id, email, status, fullName, phone, employeeCode, hiredAt, emailVerifiedAt, lastLoginAt, disabledAt, timestamps; không có password/session/token hashes.

## 2. Customer operations

| Method/path | Actor | Request | Success |
|---|---|---|---|
| `GET /api/v1/backoffice/customers` | Employee/Admin | Filter/pagination | `200 CustomerListItemDto[]` |
| `GET /api/v1/backoffice/customers/:id` | Employee/Admin | — | `200 CustomerDetailDto` |
| `POST /api/v1/backoffice/customers/:id/suspend` | ADMIN | `reason` | SUSPENDED detail |
| `POST /api/v1/backoffice/customers/:id/activate` | ADMIN | `reason` | ACTIVE detail |

List query: `q?`, `status?`, `createdFrom/to?`, pagination, sort `createdAt|lastLoginAt`. Search email/fullName/phone normalized.

- Projection chỉ gồm account contact, status/timestamps và safe aggregate `orderCount/lastOrderAt`; không trả saved addresses, password/session/token, guest order token hoặc private evidence.
- Employee read-only. Admin suspend chỉ CUSTOMER ACTIVE, reason 5..500; transaction chuyển SUSPENDED, set `suspendedAt`, revoke mọi AuthSession/AuthToken và audit.
- Activate chỉ CUSTOMER SUSPENDED có password; clear `suspendedAt`, không auto-login và không nối guest orders theo email.
- Suspend không cancel Order/Refund/Warranty hiện có; customer không login/access portal tới khi activate. Staff vẫn vận hành Order theo snapshot.
- P0 không create customer backoffice, đổi email, reset password hộ, impersonate, hard-delete hoặc convert role.

## 3. Public store information

| Method/path | Actor | Success |
|---|---|---|
| `GET /api/v1/store` | Public | `200 PublicStoreDto` |

```text
storeName, storePhone, storeAddress
currency, timezone
pickup { locationName, address, holdMinutes }
```

- Không trả bank account/QR ở endpoint chung; thông tin chuyển khoản chỉ trả trong Payment thuộc Order đã được authorize.
- Không trả settings version, deposit config, storage path hoặc updatedBy.
- Pickup location lấy location STORE seed; địa chỉ/điện thoại lấy StoreSettings.

## 4. StoreSettings management

Toàn bộ endpoint trong section này chỉ dành cho `ADMIN`.

| Method/path | Request | Success |
|---|---|---|
| `GET /api/v1/backoffice/settings` | — | `200 StoreSettingsDto` |
| `PATCH /api/v1/backoffice/settings` | `expectedVersion` + mutable fields | `200 StoreSettingsDto` |
| `POST /api/v1/backoffice/settings/bank-qr` | Multipart `file`, `expectedVersion` | Updated settings |

### Mutable fields

```text
storeName, storePhone, storeAddress
defaultShippingFee
shippingDepositAmount
pickupHoldMinutes
depositProofWindowMinutes
depositReviewWindowMinutes
defaultWarrantyDays
defaultWarrantyTerms
bankName?, bankAccountNumber?, bankAccountHolder?
```

- `currency=VND`, `timezone=Asia/Ho_Chi_Minh` read-only trong P0.
- Shipping fee >= 0; `shippingDepositAmount > 0`; hold/proof/review minutes 1..10080; warranty days 0..3650; default warranty terms 1..10000 ký tự.
- Ba field bank luôn bắt buộc/nonblank trong P0 vì đơn shipping bắt buộc có configured deposit; QR optional.
- PATCH dùng optimistic concurrency: `expectedVersion` phải bằng row version; success tăng version 1. Lệch trả `SETTINGS_VERSION_CONFLICT` cùng current version, không auto-merge.
- Settings ảnh hưởng checkout mới. Order/Payment/Reservation/Warranty đã tạo dùng snapshot/deadline của chúng, không đọc lại để viết lại lịch sử.
- Audit changes before/after; bank account number chỉ log masked suffix.

### Bank QR

- JPEG/PNG/WebP tối đa 5 MiB, upload qua NestJS tới public store-assets path.
- Backend lưu bucket/objectPath và tăng settings version trong transaction sau upload.
- QR cũ không xóa ngay vì Payment đang chờ có thể snapshot nó; cleanup chỉ khi không còn reference, thuộc P1/manual.
- API settings DTO trả `bankQrUrl?`, không trả raw storage credential.

## 5. Payment bank snapshot

Khi checkout tạo shipping deposit Payment, transaction snapshot:

```text
bankNameSnapshot
bankAccountNumberSnapshot
bankAccountHolderSnapshot
bankQrBucketSnapshot?, bankQrObjectPathSnapshot?
reviewWindowMinutesSnapshot
```

- Payment public projection trả bank name/account/account holder/QR URL/transfer content/expected amount cho đúng owner.
- Thay StoreSettings không đổi Payment cũ.
- `reviewSlaDueAt = submittedAt + reviewWindowMinutesSnapshot`; mặc định 1440 phút, không đọc settings hiện hành.
- Bank snapshot chỉ có ở BANK_TRANSFER; không trả trong generic public store endpoint.

## 6. AuditLog query

Toàn bộ endpoint trong section này chỉ dành cho `ADMIN`.

| Method/path | Request | Success |
|---|---|---|
| `GET /api/v1/backoffice/audit-logs` | Filter/pagination | `200 AuditLogListItemDto[]` |
| `GET /api/v1/backoffice/audit-logs/:id` | — | `200 AuditLogDetailDto` |

Query:

```text
actorUserId?, actorType?, action?, resourceType?, resourceId?,
requestId?, createdFrom?, createdTo?,
page=1, pageSize=20, sortBy=createdAt, sortOrder=desc
```

- `action` exact/prefix namespaced, không arbitrary full-text over JSON.
- DTO trả safe actor/resource/request/timestamp và `changes/metadata` đã redacted.
- Không có create/update/delete/export public API; domain services ghi audit trong owning transaction.
- P0 giữ audit vô thời hạn trong database demo; retention/export production cần policy sau.
- Audit endpoint tự ghi security access log nhưng không tạo AuditLog cho mỗi GET để tránh recursion/noise.

## 7. Error contract

- `FORBIDDEN`: non-admin gọi management/settings/audit.
- `DUPLICATE_RESOURCE`: email/employeeCode trùng.
- `ONE_TIME_TOKEN_INVALID`: public accept invitation token invalid/expired/consumed.
- `INVALID_STATE_TRANSITION`: resend/enable/disable sai state.
- `SETTINGS_VERSION_CONFLICT`: expectedVersion stale.
- `STORAGE_UNAVAILABLE`, `FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE`: bank QR upload.
- `RESOURCE_NOT_FOUND`: employee/audit record không tồn tại.
- Customer query/lifecycle cũng dùng `RESOURCE_NOT_FOUND`, `INVALID_STATE_TRANSITION`, `FORBIDDEN` theo cùng catalog.

## 8. Acceptance test tối thiểu

- Employee không gọi được admin routes hoặc nhận audit/settings data.
- Create employee không có password hash, invitation hash-only và SMTP fail không rollback user.
- Accept/resend race chỉ một token hợp lệ; disable revoke session/token atomically.
- Employee chỉ đọc customer safe projection; Admin suspend/activate revoke access, không đổi historical order/guest ownership.
- Settings version cạnh tranh chỉ một update thắng; snapshot Order/Payment cũ không đổi.
- Deposit > 0 thiếu bank fields bị từ chối.
- Bank QR upload/storage/DB failure xử lý orphan đúng policy; object cũ đang referenced không bị xóa.
- Public store không lộ bank/settings internals; owner Payment nhận đúng bank snapshot.
- Audit list/detail không lộ password/token/raw identifier/evidence URL.

## Liên kết

- [Auth và Account endpoints](auth-and-account-endpoints.md)
- [Identity/Auth data dictionary](../data-model/identity-auth.md)
- [Settings/Audit data dictionary](../data-model/system.md)
- [File upload pipeline](../architecture/file-upload-pipeline.md)
- [Payment proof và review](payment-proof-and-review-endpoints.md)
