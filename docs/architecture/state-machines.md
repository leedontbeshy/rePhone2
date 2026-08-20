# State machines

Tài liệu này là nguồn transition/guard hiện hành của P0. Controller không nhận yêu cầu “set status” tổng quát; mỗi transition phải là một use case có tên và guard rõ.

## 1. Order

```text
PLACED → CONFIRMED → PROCESSING → COMPLETED
   └───────────────→ CANCELLED
```

- PLACED cần order items và reservation tạo thành công.
- Shipping confirm cần deposit verified; pickup confirm cần staff accept.
- PROCESSING bắt đầu khi chuẩn bị hàng.
- COMPLETED cần fulfillment COMPLETED và payment summary PAID.
- Không cancel khi fulfillment IN_TRANSIT.
- PLACED/CONFIRMED/PROCESSING có thể → CANCELLED khi fulfillment chưa handover; PROCESSING sau RETURNED cũng có thể cancel.
- Cancel cần reason; COMPLETED/CANCELLED là terminal.
- Customer/guest không tự cancel khi deposit proof `UNDER_REVIEW`; staff phải reject hoặc verify trước.
- Cancel khi đã có verified payment tạo Refund `REQUESTED` cho số còn phải hoàn trong cùng transaction; không chờ refund completed để release inventory.

## 2. Fulfillment

Pickup:

```text
PENDING → PREPARING → READY → COMPLETED
     └──────────────→ CANCELLED
```

Shipping:

```text
PENDING → PREPARING → IN_TRANSIT → COMPLETED
                          └──────→ FAILED → RETURNED
                                               └→ CANCELLED
```

- P0 không redelivery sau RETURNED; staff kiểm tra hàng rồi cancel/refund. Shipment attempt sau thuộc P1.
- Pickup completed consume reservation và xuất tồn.
- Pickup fulfillment PENDING/PREPARING/READY có thể → CANCELLED qua owning Order cancellation command.
- Carrier handover consume reservation đúng một lần; unit chuyển IN_TRANSIT.
- Delivered chuyển unit SOLD.
- Returned unit chuyển INSPECTING; accessory chưa tự nhập lại tồn bán được.
- Complete pickup có thể create+verify CASH payment cho balance; shipping delivered có thể create+verify COD payment cho balance trong cùng transaction.
- Fulfillment completion luôn yêu cầu payment summary PAID. P0 đạt trạng thái này bằng CASH khi pickup hoặc COD khi shipping; không tạo bank-transfer balance attempt. Nếu balance bằng 0 thì không tạo Payment.
- Shipping fulfillment PENDING/PREPARING có thể → CANCELLED trước handover; RETURNED chỉ → CANCELLED sau khi hàng đã về và được ghi nhận.
- Voucher consume và Warranty phát hành khi Order completed.

## 3. Shipment attempt

```text
CREATED → HANDED_TO_CARRIER → DELIVERED
    │               └──────→ FAILED → RETURNED
    └→ CANCELLED
```

P0 unique `orderId`, đồng thời unique `(orderId, attemptNumber)` và `attemptNumber=1`. Nếu P1 bỏ giới hạn một attempt, attempt mới vẫn không được consume tồn lần thứ hai.

## 4. Payment

Bank transfer attempt:

```text
AWAITING_PROOF → UNDER_REVIEW → VERIFIED
       │              └──────→ REJECTED
       ├─────────────────────→ EXPIRED
       └─────────────────────→ CANCELLED
```

- Rejected attempt không sửa lại. Payment không phải shipping deposit có thể tạo attempt mới nếu use case còn cho phép; shipping deposit bị reject thì cancel order theo quy tắc bên dưới.
- Cash/COD được tạo và verified atomically bởi staff.
- Review dùng conditional update; terminal attempt immutable.
- Received amount khác expected amount cần note.
- Shipping deposit có 30 phút để submit proof. Submit đúng hạn chuyển reservation sang `REVIEW` không expiry; 24 giờ là SLA review, không phải auto-cancel deadline.
- Deposit hết hạn chưa có proof hoặc bị reject làm cancel order/fulfillment và release reservation/voucher trong cùng transaction.
- Verify shipping deposit hợp lệ đồng thời chuyển Payment sang `VERIFIED`, cập nhật payment projection, chuyển Order `PLACED → CONFIRMED` và reservation sang `FULFILLMENT`.
- Shipping deposit chỉ verify khi `receivedAmount >= depositRequired`; amount khác expected cần note.

Order payment summary:

- Grand total bằng 0: PAID dù không có Payment row.
- Grand total lớn hơn 0 và không có verified payment: UNPAID.
- Đã thu nhỏ hơn grand total: PARTIALLY_PAID.
- Đã thu đủ/lớn hơn grand total: PAID.
- Completed refund nhỏ hơn tổng đã thu: PARTIALLY_REFUNDED.
- Completed refund bằng tổng đã thu: REFUNDED.

## 5. Refund

```text
REQUESTED → PROCESSING → COMPLETED
     ├───────────────→ REJECTED
     └───────────────→ CANCELLED
```

- Amount dương; tổng completed refund không vượt verified payment.
- Tổng Refund `REQUESTED/PROCESSING/COMPLETED` không được tạo nghĩa vụ vượt verified payment chưa được hoàn.
- Bank refund cần evidence trước completed.
- Terminal refund immutable; sửa sai bằng record mới và audit.
- Supabase evidence được upload/kiểm tra trước database transaction; completion transaction chỉ lưu metadata và cập nhật Order projection.

## 6. InventoryUnit

```text
RECEIVED → INSPECTING → AVAILABLE
                 ├────→ REPAIRING → INSPECTING
                 ├────→ QUARANTINED → INSPECTING
                 └────→ WRITTEN_OFF

AVAILABLE → IN_TRANSIT → SOLD
AVAILABLE ─────────────→ SOLD
AVAILABLE ─────────────→ INSPECTING  (reinspection, không active reservation)
RECEIVED/INSPECTING/AVAILABLE/REPAIRING/QUARANTINED ─→ WRITTEN_OFF
QUARANTINED ─→ REPAIRING
REPAIRING ───→ QUARANTINED
RECEIVED ────→ QUARANTINED
IN_TRANSIT/SOLD ───────→ INSPECTING
INSPECTING ────────────→ SOLD  (trả lại thiết bị cho khách trong after-sales)
```

- AVAILABLE cần current inspection đạt, giá/identifier hợp lệ và không có active reservation.
- Staff có thể rút unit AVAILABLE khỏi bán bằng cách tạo PRE_SALE inspection; command yêu cầu không active reservation và atomically chuyển AVAILABLE→INSPECTING.
- Failed shipping vẫn IN_TRANSIT tới khi hàng thực nhận về.
- WRITTEN_OFF terminal và chỉ cho unit không có active reservation; return/after-sales cung cấp context cho SOLD → INSPECTING.
- INSPECTING → SOLD chỉ khi thiết bị được trả lại cho khách: case bị REJECTED sau kiểm định hoặc resolution REPAIRED/RETURNED_UNCHANGED; không tạo sale/movement mới.

## 7. Inspection, Reservation và VoucherUsage

```text
Inspection: DRAFT → COMPLETED
Reservation: ACTIVE → RELEASED | EXPIRED | CONSUMED
VoucherUsage: RESERVED → CONSUMED | RELEASED
```

- Completed inspection immutable; đổi current inspection trong một transaction.
- Reservation terminal command idempotent; quantity counter cập nhật atomic.
- Gia hạn active reservation cần reason/audit.
- Voucher reserve cùng tạo order, release cùng cancel/expire, consume khi complete.
- Reservation shipping chờ proof có `expiresAt`; khi proof sang `UNDER_REVIEW`, `expiresAt` được bỏ và `holdReason` chuyển `REVIEW`.

## 8. Warranty

```text
ACTIVE → VOIDED
```

- Expiry được tính động: `now >= endAt`; không lưu EXPIRED.
- Warranty valid khi ACTIVE và `startAt <= now < endAt`.
- Void chỉ admin, cần reason/audit.

## 9. After-sales

```text
REQUESTED → RECEIVED → INSPECTING
                         ├→ APPROVED → RESOLVED
                         └→ REJECTED
REQUESTED → CANCELLED
```

- Warranty request cần warranty valid; P0 không có override warranty hết hạn/void.
- APPROVED cần inspection context.
- REPLACED cần unit khác và allocation; REFUNDED cần completed refund.
- RESOLVED, REJECTED, CANCELLED terminal.

## 10. User account

```text
Customer: ACTIVE ↔ SUSPENDED
Employee: PENDING_VERIFICATION → ACTIVE
          PENDING_VERIFICATION/ACTIVE → DISABLED
          DISABLED → ACTIVE | PENDING_VERIFICATION
Admin: ACTIVE
```

- Customer register tạo ACTIVE ngay; suspend/activate chỉ Admin, revoke session/token và không cancel Order/AfterSales lịch sử.
- Employee accept invitation chuyển PENDING_VERIFICATION → ACTIVE. Enable từ DISABLED về ACTIVE khi đã có password, nếu chưa có password thì về PENDING_VERIFICATION và phát invitation mới.
- P0 không suspend employee, disable customer, quản lý Admin account hoặc đổi role qua API.
- Chỉ User ACTIVE vượt auth guard; transition khóa tài khoản có hiệu lực với access request kế tiếp.

## 11. Quy tắc chung

- Command lặp lại với cùng idempotency context không tạo side effect lặp.
- Invalid transition trả domain conflict, không sửa một phần dữ liệu.
- Transition quan trọng ghi AuditLog với actor, request ID và reason nếu cần.
- State machine P0 đã bao phủ account, order, payment, refund, fulfillment, inventory, inspection, reservation, voucher, warranty và after-sales.
