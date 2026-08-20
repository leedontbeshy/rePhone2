# Data dictionary — Settings và Audit

## 1. StoreSettings

Singleton typed configuration cho nghiệp vụ hiện tại.

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK; chỉ một active row |
| `key` | ShortText | No | Unique và fixed `STORE`; khóa singleton |
| `storeName` | ShortText | No | Default rePhone |
| `storePhone` | ShortText | No | Liên hệ/pickup public |
| `storeAddress` | LongText | No | Địa chỉ một cửa hàng/pickup public |
| `currency` | ShortText | No | VND trong MVP |
| `timezone` | ShortText | No | Asia/Ho_Chi_Minh |
| `defaultShippingFee` | Money | No | >= 0 |
| `shippingDepositAmount` | Money | No | > 0; checkout cap bằng grand total |
| `pickupHoldMinutes` | Int | No | > 0 |
| `depositProofWindowMinutes` | Int | No | > 0 |
| `depositReviewWindowMinutes` | Int | No | > 0 |
| `defaultWarrantyDays` | Int | No | >= 0 |
| `defaultWarrantyTerms` | LongText | No | Fallback điều khoản; 1..10000 ký tự |
| `bankName` | ShortText | No | Bắt buộc cho shipping deposit |
| `bankAccountNumber` | ShortText | No | Bắt buộc; admin-only edit |
| `bankAccountHolder` | ShortText | No | Bắt buộc; hiển thị khi cọc |
| `bankQrBucket`, `bankQrObjectPath` | Text | Yes | Không lưu signed URL |
| `version` | Int | No | Optimistic concurrency, default 1 |
| `updatedById` | Id | Yes | FK User; null ở seed |
| `createdAt` | Instant | No | Default now |
| `updatedAt` | Instant | No | Auto update |

Giá trị settings được snapshot sang order/payment/reservation/warranty tương ứng. Secret provider không nằm trong bảng này.

`currency/timezone` không sửa qua API P0. Default baseline: pickup 1440 phút, proof 30 phút, review 1440 phút; shipping fee/deposit/warranty days/terms lấy seed demo. Vì shipping deposit config luôn > 0, bank name/account/holder luôn bắt buộc; bank QR optional.

## 2. AuditLog

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `actorType` | AuditActorType | No | USER, GUEST, SYSTEM |
| `actorUserId` | Id | Yes | FK User; required khi USER, null khi GUEST/SYSTEM |
| `action` | ShortText | No | Namespaced string, ví dụ payment.verify |
| `resourceType` | ShortText | No | ORDER, INVENTORY_UNIT... |
| `resourceId` | Id | Yes | Nullable cho system/global action |
| `requestId` | ShortText | Yes | Correlation |
| `ipAddress` | ShortText | Yes | Privacy-aware |
| `userAgent` | LongText | Yes | Optional/rút gọn |
| `changes` | JsonObject | Yes | Before/after đã redacted |
| `metadata` | JsonObject | Yes | Reason/context, không secret |
| `createdAt` | Instant | No | Append-only |

Index `(resourceType, resourceId, createdAt)`, `(actorUserId, createdAt)` và `createdAt`. Không cung cấp update/delete API.

## Audit action tối thiểu

- Auth/account: login security event, employee disable/enable và customer suspend/activate; P0 không có role-change endpoint.
- Inventory: identifier reveal, inspection complete, movement, adjustment, lifecycle change.
- Order: status, cancellation, shipping fee override, reservation extension.
- Finance: payment review, refund state change.
- After-sales: approve/reject/resolve/replacement.
- Settings: mọi thay đổi kèm before/after.

Không ghi raw password/token, raw identifier, encryption/HMAC secret, provider credential hoặc nội dung file evidence.

## Enum baseline

- `AuditActorType`: USER, GUEST, SYSTEM.
