# Fulfillment transactions

Tài liệu này mô tả transaction boundary cho happy path pickup và shipping. Các command dùng conditional transition; command thay đổi inventory/payment/order cùng lúc chạy ở isolation `Serializable`.

## 1. Bắt đầu chuẩn bị hàng

- Order phải `CONFIRMED`, fulfillment `PENDING` và mọi reservation còn `ACTIVE` với `holdReason = FULFILLMENT` hoặc pickup hold hợp lệ.
- Command chuyển Order `CONFIRMED → PROCESSING` và fulfillment `PENDING → PREPARING`.
- Chưa consume reservation hoặc trừ `quantityOnHand`.
- Với pickup, command tiếp theo `markPickupReady` chuyển `PREPARING → READY` và ghi `pickupReadyAt`; inventory vẫn được giữ bằng reservation.

## 2. Hoàn tất pickup

Một Serializable transaction thực hiện:

1. Require Order `PROCESSING`, fulfillment `READY`, đúng pickup location và reservation `ACTIVE`.
2. Tính lại payment/refund projection từ database.
3. Nếu còn `balanceDue > 0`, request phải xác nhận đã thu cash; command chỉ được tạo và verify một Payment `FULL_PAYMENT/CASH` đúng bằng balance còn lại. Tiền khách đưa và tiền thối lại không được theo dõi trong MVP.
4. P0 không có bank-transfer balance cho pickup.
5. Require payment summary `PAID` sau bước payment.
6. Consume inventory đúng một lần:
   - iPhone: reservation `CONSUMED`, InventoryUnit `AVAILABLE → SOLD`, ghi `soldAt`.
   - Phụ kiện: giảm đồng thời `quantityOnHand` và `quantityReserved`, tạo StockMovement `SALE`, reservation `CONSUMED`.
7. Chuyển VoucherUsage `RESERVED → CONSUMED`.
8. Tạo Warranty cho OrderItem có `warrantyDaysSnapshot > 0`, `startAt` bằng completion time.
9. Chuyển fulfillment `READY → COMPLETED`, ghi `pickedUpAt`; Order `PROCESSING → COMPLETED`, ghi `completedAt`.
10. Ghi AuditLog; email chạy sau commit.

## 3. Bàn giao shipping cho carrier

Một Serializable transaction thực hiện:

1. Require Order `PROCESSING`, fulfillment `PREPARING`, Shipment `CREATED`, tracking data hợp lệ và reservation `ACTIVE`.
2. Consume reservation/inventory đúng một lần:
   - iPhone: reservation `CONSUMED`, InventoryUnit `AVAILABLE → IN_TRANSIT`.
   - Phụ kiện: giảm `quantityOnHand` và `quantityReserved`, tạo StockMovement `SALE`, reservation `CONSUMED`.
3. Chuyển Shipment `CREATED → HANDED_TO_CARRIER`, ghi `shippedAt`; fulfillment `PREPARING → IN_TRANSIT`.
4. Không phát hành Warranty và không complete Order ở bước này.

Shipment attempt sau không được consume tồn lần thứ hai.

## 4. Xác nhận shipping delivered

Một Serializable transaction thực hiện:

1. Require Order `PROCESSING`, fulfillment `IN_TRANSIT`, Shipment hiện hành `HANDED_TO_CARRIER`.
2. Tính lại payment/refund projection.
3. Nếu còn `balanceDue > 0`, request phải xác nhận đã thu COD; command chỉ được tạo và verify Payment `BALANCE/COD` đúng bằng balance còn lại.
4. P0 không có bank-transfer balance cho shipping.
5. Require payment summary `PAID`.
6. Chuyển Shipment `HANDED_TO_CARRIER → DELIVERED`, ghi `deliveredAt`; fulfillment `IN_TRANSIT → COMPLETED`.
7. Chuyển iPhone `IN_TRANSIT → SOLD`, ghi `soldAt`. Không trừ phụ kiện lần hai vì đã xuất tồn lúc carrier handoff.
8. Consume VoucherUsage và tạo Warranty như pickup.
9. Chuyển Order `PROCESSING → COMPLETED`, ghi `completedAt`; ghi AuditLog. Email chạy sau commit.

## 5. Giao thất bại và hàng hoàn về

- Mark delivery failed chỉ chuyển Shipment `HANDED_TO_CARRIER → FAILED` và fulfillment `IN_TRANSIT → FAILED`; không nhập tồn lại.
- Khi cửa hàng/kho thực nhận hàng, Shipment chuyển `FAILED → RETURNED`, fulfillment sang `RETURNED`; iPhone `IN_TRANSIT → INSPECTING`.
- Phụ kiện hoàn về không tự tăng tồn bán được. Staff phải kiểm tra rồi chạy stock return/adjustment riêng.
- Từ `RETURNED`, P0 chỉ cho staff cancel; cancel có tiền đi qua cancellation/refund policy. Redelivery/multi-attempt thuộc P1.

## 6. Idempotency và invariant

- Command lặp trên trạng thái đã đạt không tạo Payment, movement, Warranty hoặc counter effect thứ hai.
- CASH/COD payment chỉ do staff/admin tạo và verify atomically trong finalization command.
- Payment amount trong finalization bằng balance authoritative, không lấy số tùy ý từ client.
- Warranty unique theo OrderItem bảo vệ double issuance.
- Order chỉ `COMPLETED` khi fulfillment `COMPLETED` và payment summary `PAID`.
- Mọi inventory target thuộc `Order.fulfillmentLocationId`.

## 7. Acceptance test tối thiểu

- Pickup cash hoàn tất atomically và xuất tồn đúng một lần.
- Pickup bank transfer chưa verify không thể completed.
- Carrier handoff consume tồn; delivered không trừ phụ kiện lần hai.
- Shipping COD tạo đúng một Payment balance và complete Order.
- Hai nhân viên finalize đồng thời không double payment/movement/warranty.
- Delivery failed không đưa hàng về AVAILABLE; returned iPhone đi INSPECTING.
- Lỗi tạo Warranty rollback toàn bộ finalization.

## Liên kết

- [State machines](state-machines.md)
- [Transaction và concurrency](transaction-and-concurrency.md)
- [Hủy Order và khởi tạo Refund](order-cancellation-and-refund.md)
- [ADR-0041](../decisions/0041-atomic-fulfillment-finalization-and-cash-cod-payment.md)
