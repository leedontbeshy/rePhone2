# Data dictionary — Cart, Wishlist và Voucher

## Quan hệ

```text
User/Guest 1 ── 1 active Cart ── n CartItem
Cart 1 ── 0..1 Order
User 1 ── n WishlistItem
Voucher 1 ── n VoucherUsage ── 1 Order
```

## 1. Cart

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `customerId` | Id | Yes | FK User CUSTOMER |
| `guestTokenHash` | LongText | Yes | Guest identity secret hash |
| `status` | CartStatus | No | ACTIVE, CONVERTED, ABANDONED, EXPIRED |
| `expiresAt` | Instant | Yes | Guest cart = createdAt + 30 ngày; customer cart null |
| `createdAt` | Instant | No | Default now |
| `updatedAt` | Instant | No | Auto update |

XOR customer/guest token. Partial unique bảo đảm tối đa một active cart mỗi identity.
Cart chỉ chuyển `CONVERTED` trong cùng transaction tạo order; cart converted không nhận thêm/sửa/xóa item.
Guest raw token chỉ nằm trong HttpOnly cookie; database lưu SHA-256 hash. Cart hợp lệ khi `now < expiresAt`; tại `now >= expiresAt` bị xem là hết hạn ngay khi đọc/mutation, không phụ thuộc cleanup job.

## 2. CartItem

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `cartId` | Id | No | FK Cart |
| `variantId` | Id | No | FK ProductVariant |
| `inventoryUnitId` | Id | Yes | Bắt buộc với serialized item |
| `quantity` | Int | No | > 0; serialized = 1 |
| `priceAtAddition` | Money | No | Chỉ để cảnh báo thay đổi giá |
| `createdAt` | Instant | No | Default now |
| `updatedAt` | Instant | No | Auto update |

Không có reservation. Checkout phải tính lại giá/tồn. Unique trong cart theo variant/unit target.

## 3. WishlistItem

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `customerId` | Id | No | FK User CUSTOMER |
| `variantId` | Id | No | FK variant |
| `inventoryUnitId` | Id | Yes | Máy cụ thể hoặc null cho phụ kiện |
| `createdAt` | Instant | No | Default now |

Unique theo customer + target. Máy sold vẫn giữ record để hiển thị không còn khả dụng.

## 4. Voucher

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `code` | ShortText | No | Giá trị hiển thị |
| `normalizedCode` | ShortText | No | Unique, uppercase/trimmed |
| `name` | ShortText | No | Tên nội bộ/hiển thị |
| `description` | LongText | Yes | Điều kiện ngắn |
| `discountType` | DiscountType | No | FIXED, PERCENT |
| `discountValue` | Decimal(15,0) | No | FIXED Money > 0; PERCENT integer 1..100 trong P0 |
| `maxDiscountAmount` | Money | Yes | Dùng với percent |
| `minimumOrderAmount` | Money | No | Default 0 |
| `startsAt` | Instant | No | Hiệu lực |
| `endsAt` | Instant | No | > startsAt |
| `totalUsageLimit` | Int | Yes | > 0 khi có |
| `perCustomerLimit` | Int | Yes | Chỉ voucher account |
| `visibility` | VoucherVisibility | No | PUBLIC, ACCOUNT_ONLY |
| `scopeType` | VoucherScopeType | No | ORDER, PRODUCT_TYPE, PRODUCTS, VARIANTS |
| `scopeConfig` | JsonObject | Yes | IDs/type theo scope; validate schema |
| `status` | VoucherStatus | No | DRAFT, ACTIVE, PAUSED, ARCHIVED |
| `createdAt` | Instant | No | Default now |
| `updatedAt` | Instant | No | Auto update |

Một voucher/order, không stacking. Không lưu trạng thái EXPIRED; tính từ thời gian.

`scopeConfig` dùng schema cố định theo scope: null cho ORDER, một productType cho PRODUCT_TYPE, hoặc mảng 1..100 UUID unique cho PRODUCTS/VARIANTS. PUBLIC không có perCustomerLimit; ACCOUNT_ONLY mới được cấu hình giới hạn theo customer.

## 5. VoucherUsage

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `voucherId` | Id | No | FK Voucher |
| `orderId` | Id | No | FK Order, unique |
| `customerId` | Id | Yes | Null cho guest public voucher |
| `status` | VoucherUsageStatus | No | RESERVED, CONSUMED, RELEASED |
| `createdAt` | Instant | No | Reserve time |
| `consumedAt` | Instant | Yes | Theo status |
| `releasedAt` | Instant | Yes | Theo status |

Reserve cùng transaction tạo order; release khi cancel/expire; quota tính cả RESERVED và CONSUMED.

## Enum baseline

- `CartStatus`: ACTIVE, CONVERTED, ABANDONED, EXPIRED.
- `DiscountType`: FIXED, PERCENT.
- `VoucherVisibility`: PUBLIC, ACCOUNT_ONLY.
- `VoucherScopeType`: ORDER, PRODUCT_TYPE, PRODUCTS, VARIANTS.
- `VoucherStatus`: DRAFT, ACTIVE, PAUSED, ARCHIVED.
- `VoucherUsageStatus`: RESERVED, CONSUMED, RELEASED.
