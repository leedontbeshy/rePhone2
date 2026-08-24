# Data dictionary — Order, Payment và Fulfillment

## Quan hệ

```text
User 0..1 ── n Order
Cart 1 ── 0..1 Order
Order 1 ── n OrderItem
Order 1 ── n Payment
Order 1 ── n Refund
Order 1 ── n Shipment
InventoryLocation 1 ── n Order
```

## 1. Order

| Nhóm | Field chính | Quy tắc |
|---|---|---|
| Identity | `id`, `orderNumber`, `sourceCartId`, `customerId`, `guestAccessTokenHash` | `sourceCartId` FK Cart và unique; orderNumber unique format `RPH-YYYYMMDD-XXXXXXXX`; token hash cho guest |
| Contact snapshot | `customerName`, `customerEmail`, `customerPhone` | Bắt buộc |
| Fulfillment | `fulfillmentType`, `fulfillmentStatus`, `fulfillmentLocationId` | PICKUP hoặc SHIPPING; source location FK bắt buộc và bất biến |
| Shipping | `shippingAddressSnapshot` | JSONB bắt buộc với SHIPPING |
| Pickup | `pickupLocationId`, `pickupHoldUntil`, `pickupReadyAt`, `pickedUpAt` | Chỉ PICKUP |
| State | `status`, `paymentStatus` | Summary state |
| Price | `subtotal`, `itemDiscountAmount`, `voucherDiscountAmount` | Money >= 0; itemDiscountAmount = 0 trong P0 |
| Shipping fee | `shippingFeeOriginal`, `shippingFee`, `shippingFeeOverrideReason`, `shippingFeeOverriddenById`, `shippingFeeOverriddenAt` | Override cần reason |
| Total | `grandTotal`, `depositRequired`, `paidAmount`, `refundedAmount`, `balanceDue` | Money >= 0; pickup deposit = 0; shipping checkout deposit = min(configured amount, grandTotal), sau override chỉ giảm khi cần và không tăng |
| Voucher | `voucherCodeSnapshot` | Nullable |
| Notes | `customerNote`, `internalNote`, `cancelReason` | Internal note không public |
| Time | `placedAt`, `confirmedAt`, `completedAt`, `cancelledAt`, `createdAt`, `updatedAt` | Theo state |

XOR customer/guest access trong checkout. `sourceCartId` bắt buộc với customer/guest checkout; request lặp lại trả order đã liên kết. Address/customer fields là snapshot. Mọi reservation của Order thuộc `fulfillmentLocationId`; pickup yêu cầu field này bằng `pickupLocationId`. `paid/refunded/balance` là projection cần transaction test.

## 2. OrderItem

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `orderId` | Id | No | FK Order |
| `productId` | Id | No | FK Product |
| `variantId` | Id | No | FK ProductVariant |
| `inventoryUnitId` | Id | Yes | Serialized item |
| `productTypeSnapshot` | ProductType | No | Lịch sử |
| `productNameSnapshot` | ShortText | No | Lịch sử |
| `variantNameSnapshot` | ShortText | No | Lịch sử |
| `skuSnapshot` | ShortText | No | Lịch sử |
| `inventoryCodeSnapshot` | ShortText | Yes | Máy cụ thể |
| `configurationSnapshot` | JsonObject | Yes | Pin, grade, màu, dung lượng... |
| `quantity` | Int | No | > 0; serialized = 1 |
| `unitPrice` | Money | No | Giá trước discount |
| `lineSubtotal` | Money | No | unitPrice * quantity |
| `discountAmount` | Money | No | Phần voucher phân bổ cho cả line trong P0 |
| `lineTotal` | Money | No | lineSubtotal - discountAmount, >= 0 |
| `warrantyDaysSnapshot` | Int | No | >= 0 |
| `warrantyTermsSnapshot` | LongText | Yes | Chính sách lịch sử; bắt buộc khi warrantyDaysSnapshot > 0 |
| `createdAt` | Instant | No | Default now |

P0 chưa có promotion/item-level discount: `Order.itemDiscountAmount = 0`. Tổng `OrderItem.discountAmount` phải bằng `Order.voucherDiscountAmount`. Backend phân bổ voucher trên các line eligible theo tỷ lệ `lineSubtotal`, floor theo VND; line eligible cuối theo thứ tự `cartItemId` nhận remainder để tổng khớp tuyệt đối. Không dùng `finalUnitPrice` vì discount line có thể không chia hết cho quantity.

## 3. Payment

Mỗi lần thanh toán/gửi biên lai là một attempt mới; record bị reject không bị ghi đè.

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `orderId` | Id | No | FK Order |
| `purpose` | PaymentPurpose | No | DEPOSIT, BALANCE, FULL_PAYMENT |
| `method` | PaymentMethod | No | BANK_TRANSFER, CASH, COD, OTHER |
| `expectedAmount` | Money | No | >= 0 |
| `receivedAmount` | Money | Yes | Khi verify |
| `status` | PaymentStatus | No | Lifecycle attempt |
| `transferContent` | ShortText | Yes | Deposit dùng orderNumber bỏ dấu gạch; snapshot immutable sau khi hiển thị |
| `bankNameSnapshot`, `bankAccountNumberSnapshot`, `bankAccountHolderSnapshot` | Text | Yes | Bắt buộc với BANK_TRANSFER deposit |
| `bankQrBucketSnapshot`, `bankQrObjectPathSnapshot` | Text | Yes | QR public optional; không lưu URL cố định |
| `reviewWindowMinutesSnapshot` | Int | Yes | Bắt buộc với bank deposit; settings tại checkout |
| `evidenceBucket`, `evidenceObjectPath` | Text | Yes | Private; bank proof |
| `customerDeclaredAt` | Instant | Yes | Thời gian khách khai báo |
| `expiresAt` | Instant | Yes | Deadline nộp proof; không phải review deadline |
| `submittedAt` | Instant | Yes | Proof submitted |
| `reviewedById` | Id | Yes | FK User staff/admin |
| `reviewedAt` | Instant | Yes | Review time |
| `rejectionReason` | LongText | Yes | Bắt buộc khi rejected |
| `note` | LongText | Yes | Sai lệch amount cần reason |
| `createdAt`, `updatedAt` | Instant | No | Timestamps |

Với shipping deposit, SLA review được tính từ `submittedAt + reviewWindowMinutesSnapshot`; không cần lưu `reviewDueAt`. Default 1440 phút. Payment `UNDER_REVIEW` quá SLA chỉ bị đánh dấu overdue khi query. Verify yêu cầu `receivedAmount >= Order.depositRequired` và đồng thời cập nhật projection payment, xác nhận Order và chuyển reservation sang `FULFILLMENT`.

CASH/COD Payment được tạo và `VERIFIED` atomically bởi staff trong fulfillment finalization khi balance authoritative lớn hơn 0. Balance bằng 0 không tạo Payment; Order grand total bằng 0 có payment summary `PAID`. P0 chỉ dùng BANK_TRANSFER cho shipping deposit; số dư pickup/shipping lần lượt thu CASH/COD.

## 4. Refund

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `orderId` | Id | No | FK Order |
| `paymentId` | Id | Yes | Optional Payment nguồn; nếu có phải thuộc cùng `orderId` và đã VERIFIED |
| `amount` | Money | No | > 0 |
| `method` | RefundMethod | No | BANK_TRANSFER, CASH; OTHER chỉ để đọc/terminalize dữ liệu legacy |
| `status` | RefundStatus | No | REQUESTED, PROCESSING, COMPLETED, REJECTED, CANCELLED |
| `reason` | LongText | No | Bắt buộc |
| `terminalReason` | LongText | Yes | Bắt buộc khi REJECTED/CANCELLED; tách khỏi business reason ban đầu |
| `terminalById` | Id | Yes | FK User; bắt buộc khi REJECTED/CANCELLED |
| `terminalAt` | Instant | Yes | Bắt buộc khi REJECTED/CANCELLED |
| `evidenceBucket`, `evidenceObjectPath` | Text | Yes | Private; bắt buộc khi BANK_TRANSFER completed, path thuộc `refunds/{refundId}/` |
| `evidenceMimeType` | Text | Yes | MIME authoritative JPEG/PNG/WebP/PDF; đi cùng toàn bộ evidence fields |
| `evidenceFileSize` | BigInt | Yes | Byte size `1..10 MiB`; đi cùng toàn bộ evidence fields |
| `evidenceSha256` | Text | Yes | Lowercase SHA-256 hex 64 ký tự; exact replay key |
| `requestedByType` | RefundRequesterType | No | CUSTOMER, STAFF, SYSTEM |
| `requestedById` | Id | Yes | FK User; null cho guest/system, required với STAFF/account customer |
| `processedById` | Id | Yes | FK User |
| `processingAt` | Instant | Yes | Bắt buộc từ PROCESSING |
| `completedAt` | Instant | Yes | Theo status |
| `note` | LongText | Yes | Optional khi start; completion note bắt buộc và thay start note |
| `createdAt`, `updatedAt` | Instant | No | Timestamps |

Lifecycle shape:

- REQUESTED không có processor/completion/terminal/evidence fields.
- PROCESSING có `processedById/processingAt`, chưa có completion/terminal/evidence fields.
- COMPLETED có processor, processing/completion time và không có terminal fields. BANK_TRANSFER bắt buộc đủ evidence metadata; CASH bắt buộc mọi evidence field null.
- REJECTED/CANCELLED có `terminalReason/terminalById/terminalAt`, không có processing/completion/evidence fields.
- Timestamp theo `createdAt <= processingAt <= completedAt|terminalAt` khi các field tương ứng tồn tại.

Manual Refund chỉ được tạo cho Order CANCELLED hoặc COMPLETED. P0 create/start/complete chỉ hỗ trợ BANK_TRANSFER/CASH. `RefundMethod.OTHER` là compatibility enum cho legacy record; OTHER/REQUESTED chỉ reject/cancel được.

Tổng Refund REQUESTED/PROCESSING/COMPLETED không vượt verified Payment total của Order. Tổng COMPLETED quyết định `Order.refundedAmount` và payment status partial/full refund. REJECTED/CANCELLED không giữ refundable quota. Cross-row aggregate được khóa/recheck trong Serializable transaction.

Khi cancellation tạo Refund, amount bằng verified payment chưa được REQUESTED/PROCESSING/COMPLETED Refund cover. Guest request dùng `requestedByType = CUSTOMER`, `requestedById = null`; ownership được xác định từ Order và request authentication context. STAFF requester bắt buộc user ID, SYSTEM không có user ID.

Bank evidence được validate và upload private trước completion transaction; completed record, path và digest immutable. Same SHA-256 + normalized note là exact replay; khác digest/note không được overwrite. CASH completion không có evidence.

`reason` mô tả vì sao cần hoàn tiền và bất biến từ khi tạo. `terminalReason/terminalById/terminalAt` chỉ ghi quyết định từ chối/hủy obligation, không overwrite `reason`. Completion note là operational note cuối cùng và thay optional start note. Refund completion recompute `refundedAmount/paymentStatus` nhưng không đổi Order status hoặc mở lại `balanceDue`.

## 5. Shipment

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `orderId` | Id | No | FK shipping Order |
| `attemptNumber` | Int | No | > 0; unique/order |
| `carrierName` | ShortText | No | Nhập thủ công |
| `trackingCode` | ShortText | No | Tracking public |
| `trackingUrl` | LongText | Yes | Validate URL |
| `status` | ShipmentStatus | No | Lifecycle attempt |
| `shippedAt` | Instant | Yes | Handover carrier |
| `deliveredAt` | Instant | Yes | Giao thành công |
| `failedAt` | Instant | Yes | Giao thất bại |
| `returnedAt` | Instant | Yes | Hàng thực về |
| `failureReason` | LongText | Yes | Bắt buộc khi failed |
| `returnedToLocationId` | Id | Yes | FK InventoryLocation; bắt buộc khi RETURNED |
| `returnNote` | LongText | Yes | Bắt buộc khi RETURNED |
| `createdById` | Id | No | FK staff/admin |
| `createdAt`, `updatedAt` | Instant | No | Timestamps |

Schema giữ `attemptNumber` cho khả năng mở rộng nhưng P0 chỉ tạo attempt 1; delivery RETURNED được cancel/refund thay vì redelivery. Shipment attempt tương lai không được consume tồn lần thứ hai.

## Enum baseline

- `OrderStatus`: PLACED, CONFIRMED, PROCESSING, COMPLETED, CANCELLED.
- `FulfillmentType`: PICKUP, SHIPPING.
- `FulfillmentStatus`: PENDING, PREPARING, READY, IN_TRANSIT, COMPLETED, FAILED, RETURNED, CANCELLED.
- `OrderPaymentStatus`: UNPAID, PARTIALLY_PAID, PAID, PARTIALLY_REFUNDED, REFUNDED.
- `PaymentPurpose`: DEPOSIT, BALANCE, FULL_PAYMENT.
- `PaymentMethod`: BANK_TRANSFER, CASH, COD, OTHER.
- `PaymentStatus`: AWAITING_PROOF, UNDER_REVIEW, VERIFIED, REJECTED, EXPIRED, CANCELLED.
- `RefundMethod`: BANK_TRANSFER, CASH, OTHER.
- `RefundStatus`: REQUESTED, PROCESSING, COMPLETED, REJECTED, CANCELLED.
- `RefundRequesterType`: CUSTOMER, STAFF, SYSTEM.
- `ShipmentStatus`: CREATED, HANDED_TO_CARRIER, DELIVERED, FAILED, RETURNED, CANCELLED.
