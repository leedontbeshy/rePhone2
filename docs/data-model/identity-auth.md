# Data dictionary — Identity và Auth

## Quan hệ

```text
User 1 ── n CustomerAddress
User 1 ── n AuthSession
User 1 ── n AuthToken
```

## 1. User

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `email` | ShortText | No | Giá trị hiển thị |
| `normalizedEmail` | ShortText | No | Unique, lowercase/trimmed |
| `passwordHash` | LongText | Yes | Argon2id hash; chỉ null với employee chờ accept invitation |
| `role` | UserRole | No | ADMIN, EMPLOYEE, CUSTOMER |
| `status` | UserStatus | No | Trạng thái tài khoản |
| `fullName` | ShortText | No | Profile gộp |
| `phone` | ShortText | Yes | Normalize khi tìm kiếm |
| `employeeCode` | ShortText | Yes | Unique khi có; chỉ staff/admin |
| `hiredAt` | LocalDate | Yes | Chỉ staff/admin |
| `emailVerifiedAt` | Instant | Yes | P0 luôn null sau customer register; hook cho xác minh email P1 |
| `passwordChangedAt` | Instant | Yes | Phục vụ revoke session |
| `lastLoginAt` | Instant | Yes | Thông tin vận hành |
| `suspendedAt` | Instant | Yes | Chỉ khi CUSTOMER SUSPENDED; clear khi activate |
| `disabledAt` | Instant | Yes | Chỉ khi EMPLOYEE DISABLED; clear khi enable |
| `createdAt` | Instant | No | Default now |
| `updatedAt` | Instant | No | Auto update |

Invariant: customer không có employee code/hiredAt; admin/employee có employee code. Customer và mọi user `ACTIVE` phải có password hash; chỉ employee `PENDING_VERIFICATION` được có password hash null. Không disable active admin cuối cùng.

## 2. CustomerAddress

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `userId` | Id | No | FK User; owner phải là CUSTOMER |
| `label` | ShortText | Yes | Nhà, công ty... |
| `receiverName` | ShortText | No | Người nhận |
| `phone` | ShortText | No | Điện thoại giao hàng |
| `addressLine` | ShortText | No | Số nhà/đường |
| `ward` | ShortText | No | Snapshot string |
| `district` | ShortText | No | Snapshot string |
| `province` | ShortText | No | Snapshot string |
| `postalCode` | ShortText | Yes | Optional |
| `isDefault` | Boolean | No | Default false |
| `createdAt` | Instant | No | Default now |
| `updatedAt` | Instant | No | Auto update |
| `archivedAt` | Instant | Yes | Soft archive |

Partial unique: tối đa một address mặc định chưa archive trên mỗi user.

## 3. AuthSession

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `userId` | Id | No | FK User |
| `refreshTokenHash` | LongText | No | Unique; mỗi row giữ một generation để phát hiện reuse |
| `tokenFamilyId` | Id | No | Nhóm refresh rotation |
| `userAgent` | LongText | Yes | Có thể rút gọn |
| `ipAddress` | ShortText | Yes | Không dùng làm auth factor |
| `lastUsedAt` | Instant | Yes | Thời điểm generation được rotate/revoke lần cuối |
| `expiresAt` | Instant | No | Login + 7 ngày; rotation không gia hạn |
| `revokedAt` | Instant | Yes | Null khi active |
| `createdAt` | Instant | No | Default now |

Index `(userId, revokedAt, expiresAt)` phục vụ danh sách/revoke session.

Mỗi refresh rotation tạo một `AuthSession` successor mới cùng `tokenFamilyId` và cùng absolute `expiresAt`, đồng thời set `revokedAt/lastUsedAt` cho row hiện tại trong một transaction. Không update đè `refreshTokenHash`: nhờ giữ row cũ, token generation đã rotate vẫn lookup được; nếu token đó xuất hiện lại, service revoke mọi row active cùng family. Access JWT mới chứa ID của successor, vì auth guard kiểm tra row session tương ứng còn active.

## 4. AuthToken

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `userId` | Id | No | FK User |
| `purpose` | AuthTokenPurpose | No | VERIFY_EMAIL, RESET_PASSWORD, EMPLOYEE_INVITATION |
| `tokenHash` | LongText | No | Unique; raw token chỉ gửi client/email |
| `expiresAt` | Instant | No | Bắt buộc |
| `consumedAt` | Instant | Yes | Token một lần |
| `createdAt` | Instant | No | Default now |

Service vô hiệu hóa token cùng purpose còn hiệu lực khi phát hành token mới.

TTL P0: RESET_PASSWORD 30 phút, EMPLOYEE_INVITATION 24 giờ. `VERIFY_EMAIL` 24 giờ là cấu hình dự phòng P1 và không được phát hành trong MVP demo. Expiry được kiểm tra khi consume; cleanup record hết hạn không quyết định tính hợp lệ.

## Enum baseline

- `UserRole`: `ADMIN`, `EMPLOYEE`, `CUSTOMER`.
- `UserStatus`: `PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`, `DISABLED`.
- `AuthTokenPurpose`: `VERIFY_EMAIL`, `RESET_PASSWORD`, `EMPLOYEE_INVITATION`.

Customer register P0 tạo `User.status = ACTIVE` và `emailVerifiedAt = null`. `PENDING_VERIFICATION` được dùng cho employee chờ invitation; customer không dùng trạng thái này trong P0. `VERIFY_EMAIL` tồn tại làm hook P1 và không được phát hành trong demo.

Semantics P0: `SUSPENDED` chỉ dùng cho customer bị Admin tạm khóa và có thể activate lại; `DISABLED` dùng cho employee ngừng hoạt động. Cả hai trạng thái đều chặn login/refresh/access guard và revoke session; lịch sử Order/Audit giữ nguyên.
