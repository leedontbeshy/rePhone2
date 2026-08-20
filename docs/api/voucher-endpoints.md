# Voucher endpoints

Voucher P0 hỗ trợ một mã mỗi Order, discount cố định hoặc phần trăm, scope đơn giản và quota được reserve cùng checkout. Không có coupon claim, stacking, flash sale hoặc campaign engine.

## 1. Public/customer endpoints

| Method/path | Actor | Query | Success |
|---|---|---|---|
| `GET /api/v1/vouchers` | Public/CUSTOMER | `visibility?`, pagination | `200 PublicVoucherDto[]` |

- Guest chỉ thấy Voucher `PUBLIC`; customer thấy `PUBLIC` và `ACCOUNT_ONLY`.
- Chỉ trả Voucher `ACTIVE`, `startsAt <= now < endsAt` và quota tổng chưa chắc chắn hết theo projection hiện hành.
- List chỉ mang tính discovery; checkout preview/create luôn validate lại rule/quota atomically.
- Apply/preview voucher đi qua `POST /checkouts/preview`, không có endpoint mutate cart/voucher riêng.

`PublicVoucherDto`:

```text
code, name, description?
discountType, discountValue
maxDiscountAmount?, minimumOrderAmount
startsAt, endsAt
visibility
scopeSummary
```

Không trả total/per-customer usage count chính xác, internal IDs trong scope hoặc Audit metadata.

## 2. Backoffice endpoints

| Method/path | Actor | Request | Success |
|---|---|---|---|
| `GET /api/v1/backoffice/vouchers` | ADMIN | Filter/pagination | `200 BackofficeVoucherListItemDto[]` |
| `POST /api/v1/backoffice/vouchers` | ADMIN | Create DTO | `201 BackofficeVoucherDetailDto` DRAFT |
| `GET /api/v1/backoffice/vouchers/:id` | ADMIN | — | `200 BackofficeVoucherDetailDto` |
| `PATCH /api/v1/backoffice/vouchers/:id` | ADMIN | Mutable fields | `200 BackofficeVoucherDetailDto` |
| `POST /api/v1/backoffice/vouchers/:id/activate` | ADMIN | — | ACTIVE |
| `POST /api/v1/backoffice/vouchers/:id/pause` | ADMIN | `reason` | PAUSED |
| `POST /api/v1/backoffice/vouchers/:id/archive` | ADMIN | `reason` | ARCHIVED |
| `GET /api/v1/backoffice/vouchers/:id/usages` | ADMIN | status/order/customer + pagination | `200 VoucherUsageDto[]` |

Employee nhận 403 cho toàn bộ backoffice voucher route.

## 3. Create/update DTO

```text
code, name, description?
discountType, discountValue, maxDiscountAmount?
minimumOrderAmount
startsAt, endsAt
totalUsageLimit?, perCustomerLimit?
visibility
scopeType, scopeConfig?
```

### Discount

- `FIXED`: `discountValue` là Money string > 0; `maxDiscountAmount = null`.
- `PERCENT`: P0 chỉ nhận integer percent 1..100; `maxDiscountAmount` optional Money > 0.
- Discount thực tế không làm item/order total âm.
- `minimumOrderAmount` áp dụng trên subtotal eligible trước voucher, không gồm shipping fee.
- FIXED discount = `min(discountValue, eligibleSubtotal)`. PERCENT discount = `floor(eligibleSubtotal * discountValue / 100)`, sau đó cap bởi `maxDiscountAmount` khi có và bởi eligibleSubtotal.

### Visibility/quota

- `PUBLIC`: guest/customer dùng; `perCustomerLimit` phải null vì guest không có account identity.
- `ACCOUNT_ONLY`: chỉ authenticated CUSTOMER; `perCustomerLimit` optional > 0.
- `totalUsageLimit` optional > 0 cho cả hai.
- Quota tính `VoucherUsage` RESERVED + CONSUMED; RELEASED không tính.

### Scope JSON schema

| `scopeType` | `scopeConfig` |
|---|---|
| `ORDER` | `null` |
| `PRODUCT_TYPE` | `{ "productType": "IPHONE" | "ACCESSORY" }` |
| `PRODUCTS` | `{ "productIds": [uuid...] }`, 1..100 unique IDs |
| `VARIANTS` | `{ "variantIds": [uuid...] }`, 1..100 unique IDs |

- Reject unknown key, empty/duplicate list và archived/nonexistent target khi create/update.
- Eligible subtotal chỉ gồm OrderItem thuộc scope; fixed/percent discount cap ở eligible subtotal.
- P0 phân bổ voucher discount tỷ lệ theo eligible `lineSubtotal`, phần dư VND deterministic theo source `CartItem.id` để preview/create cho cùng cart khớp và tổng phân bổ chính xác.

## 4. Lifecycle/mutability

- Create luôn `DRAFT`; code normalize uppercase/trim và unique, bất biến sau create.
- DRAFT được sửa rule đầy đủ.
- ACTIVE phải pause trước khi sửa financial/time/scope/quota fields.
- Khi đã có bất kỳ VoucherUsage, discount type/value, visibility và scope trở thành bất biến; muốn rule mới phải clone/tạo Voucher mới. Name/description và kéo dài `endsAt` vẫn sửa được khi PAUSED.
- Activate validate toàn bộ schema, time window và target; có thể activate trước startsAt.
- Pause/archive chặn checkout mới nhưng không hủy Usage RESERVED đã gắn Order. Usage đó vẫn consume khi Order complete hoặc release khi cancel.
- ARCHIVED terminal trong P0; không restore/hard-delete.
- Mọi lifecycle/rule update ghi AuditLog before/after đã redacted.

## 5. Checkout/concurrency

- Preview đọc rule hiện hành nhưng không tạo Usage.
- Create checkout trong Serializable transaction recheck thời gian, scope, minimum, visibility, quota và tạo VoucherUsage RESERVED.
- Hai checkout tranh lượt cuối không vượt limit.
- Cancel/expire Order chuyển RESERVED → RELEASED; Order complete chuyển RESERVED → CONSUMED.
- Retry checkout theo sourceCart không tạo Usage thứ hai.

## 6. Error contract

- `VOUCHER_NOT_APPLICABLE`: code không active/đúng time/visibility/scope/minimum.
- `VOUCHER_USAGE_LIMIT_REACHED`: quota tổng/customer không còn.
- `DUPLICATE_RESOURCE`: normalized code đã tồn tại.
- `INVALID_STATE_TRANSITION`: lifecycle/mutability không cho command.
- `VALIDATION_FAILED`: schema/range/time không hợp lệ.
- `FORBIDDEN`: non-admin quản lý voucher.

Public error không phân biệt chi tiết voucher bí mật/account-only ngoài thông tin cần hiển thị; backoffice detail có validation cụ thể.

## 7. Acceptance test tối thiểu

- Guest không thấy/dùng ACCOUNT_ONLY; customer đúng limit dùng được.
- Fixed/percent/max/minimum/scope phân bổ VND chính xác.
- Unknown scope JSON/target archived bị từ chối.
- Active rule không sửa trực tiếp; rule có usage bị freeze đúng field.
- Pause/archive không phá Usage đang RESERVED.
- Concurrent quota cuối chỉ một checkout thắng; cancel release và complete consume đúng một lần.
- Public DTO không lộ internal target/usage/customer data.

## Liên kết

- [Commerce data dictionary](../data-model/commerce.md)
- [Checkout transaction](../architecture/checkout-transaction.md)
- [Checkout endpoints](checkout-and-customer-order-endpoints.md)
- [API error catalog](error-catalog.md)
