# Hủy Order và khởi tạo Refund

Tài liệu này mô tả command hủy Order trước fulfillment `IN_TRANSIT` và cách ghi nhận nghĩa vụ hoàn tiền thủ công. Việc chuyển tiền hoàn thực tế nằm ngoài database transaction.

## 1. Quyền và guard

- Customer/guest chỉ thao tác Order thuộc ownership của mình.
- Staff/admin có thể hủy Order khi xử lý vận hành và phải nhập lý do.
- Không hủy Order `COMPLETED`, `CANCELLED` hoặc fulfillment đã `IN_TRANSIT/COMPLETED`.
- Customer/guest không tự hủy khi deposit Payment đang `UNDER_REVIEW`; nhân viên phải reject hoặc verify proof trước.
- Order còn `AWAITING_PROOF`, Order pickup chưa giao hoặc Order có verified payment nhưng chưa in-transit có thể đi qua cancellation policy tương ứng.

## 2. Serializable transaction

Command chạy trong một Serializable transaction và thực hiện:

1. Load Order cùng payment, refund, fulfillment, reservation và voucher usage; kiểm tra ownership/permission và expected state.
2. Tính số phải hoàn còn lại:

   `refundable = verifiedPaymentTotal - completedRefundTotal - activeRefundRequestTotal`

   `activeRefundRequestTotal` tính Refund `REQUESTED/PROCESSING` để command lặp lại không tạo nghĩa vụ trùng.
3. Conditional update Order và fulfillment sang `CANCELLED`, lưu `cancelReason/cancelledAt`.
4. Shipment còn `CREATED` chuyển `CANCELLED`; shipment đã handover chặn cancellation cho tới flow `FAILED → RETURNED` hoàn tất.
5. Terminalize Payment `AWAITING_PROOF` thành `CANCELLED`; Payment `VERIFIED` giữ nguyên làm lịch sử tiền đã thu.
6. Release mọi InventoryReservation `ACTIVE` đúng một lần; quantity reservation giảm counter tương ứng.
7. Release VoucherUsage `RESERVED`; usage đã terminal không bị tác động lặp.
8. Nếu `refundable > 0`, tạo Refund `REQUESTED` với amount đó. Không tự chuyển thành `COMPLETED`.
9. Ghi AuditLog đã redacted với actor, reason và refund ID nếu có.

Bất kỳ bước nào thất bại làm rollback toàn bộ cancellation, release và Refund request.

## 3. Sau commit

- Hàng được bán lại ngay khi reservation đã release; không chờ chuyển tiền hoàn tất.
- Order hiển thị `CANCELLED`; nếu có Refund `REQUESTED/PROCESSING`, UI hiển thị đang chờ hoàn.
- `paymentStatus` chỉ phản ánh refund sau khi Refund `COMPLETED`; Refund request không giả vờ rằng tiền đã được chuyển.
- Nhân viên hoàn tiền ngoài hệ thống, tải evidence rồi chạy transition Refund `PROCESSING → COMPLETED`.
- Email hủy đơn/thông báo hoàn tiền chạy sau commit.

## 4. Idempotency và concurrency

- Request lặp trên Order đã cancel trả trạng thái hiện có và không tạo Refund thứ hai.
- Hai actor hủy đồng thời: conditional Order transition bảo đảm một command thắng.
- Refund amount luôn tính lại từ Payment/Refund records trong transaction, không lấy từ client.
- Release reservation/voucher là terminal command idempotent.
- Không retry lỗi state/permission; chỉ retry serialization conflict theo ADR-0031.

## 5. Acceptance test tối thiểu

- Hủy Order chưa trả tiền: release tồn/voucher, không tạo Refund.
- Hủy Order đã verify cọc: tạo đúng một Refund `REQUESTED` bằng số còn phải hoàn.
- Hủy lặp hoặc hai request đồng thời: không double release/double refund.
- Customer/guest không hủy được Order của người khác hoặc Payment `UNDER_REVIEW`.
- Không hủy được Order đã in-transit/completed.
- Lỗi khi tạo Refund rollback cả Order cancellation và release inventory.
- Hoàn tiền thực tế chỉ làm payment projection đổi sau Refund `COMPLETED`.

## Liên kết

- [State machines](state-machines.md)
- [Transaction và concurrency](transaction-and-concurrency.md)
- [ADR-0040](../decisions/0040-atomic-order-cancellation-and-refund-request.md)
