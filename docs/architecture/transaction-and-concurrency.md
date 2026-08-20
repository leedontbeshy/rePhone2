# Transaction và concurrency

Tài liệu này mô tả chiến lược giữ tính đúng đắn dữ liệu cho backend rePhone. Mục tiêu là ngăn bán trùng một iPhone, giữ phụ kiện vượt tồn, vượt quota voucher hoặc cập nhật sai tổng thanh toán khi có nhiều request đồng thời, nhưng vẫn giữ implementation phù hợp với đồ án một tháng.

## 1. Chiến lược đã chốt

- PostgreSQL là nguồn sự thật duy nhất cho concurrency.
- Các command thay đổi nhiều bảng hoặc bảo vệ invariant tranh chấp dùng Prisma interactive transaction với isolation level `Serializable`.
- Khi gặp lỗi xung đột có thể retry (`P2034` từ Prisma hoặc serialization failure tương đương), backend chạy lại toàn bộ transaction tối đa 3 lần thực thi.
- Giữa các lần thử dùng backoff ngắn có jitter. Không retry validation error, constraint error không liên quan concurrency hoặc lỗi nghiệp vụ.
- Sau lần thứ ba vẫn xung đột, request trả `409 CONCURRENT_MODIFICATION` theo error catalog.
- CRUD đơn giản và read-only query không mặc định dùng `Serializable`.

## 2. Command cần transaction nghiêm ngặt

| Nhóm command | Invariant phải giữ |
|---|---|
| Checkout/tạo order | Snapshot giá nhất quán; một máy không có hai reservation active; phụ kiện không reserve vượt tồn; voucher không vượt quota |
| Release/expire/consume reservation | Mỗi reservation chỉ tạo một tác động lên counter hoặc tồn kho |
| Hoàn tất pickup/handover carrier | Reservation, stock movement, inventory state và fulfillment state đổi cùng nhau |
| Review payment/hoàn tiền | Payment/refund và các projection `paidAmount`, `refundedAmount`, `balanceDue`, `paymentStatus` nhất quán |
| Tạo/hoàn tất inspection | Tạo draft có thể đưa unit về INSPECTING; khi complete, inspection cũ mất `isCurrent`, inspection mới thành current trong một transaction; complete không tự make AVAILABLE |
| Voucher release/consume | `VoucherUsage` và trạng thái order/reservation liên quan không lệch nhau |

Danh sách trên là baseline. Một command chỉ đọc hoặc chỉ sửa một record độc lập không cần được nâng isolation level chỉ vì thuộc cùng module.

## 3. Idempotency của checkout

- `Order.sourceCartId` là foreign key unique tới Cart.
- Checkout đầu tiên khóa ý định mua của cart; khi commit, Cart chuyển `CONVERTED`.
- Request lặp lại cho cùng cart trả order đã tạo sau khi kiểm tra ownership, không chạy lại side effect.
- Nếu transaction đầu tiên rollback, không có order và cart vẫn `ACTIVE`.
- Khi hai request cùng đến, unique constraint và Serializable transaction bảo đảm tối đa một order; request còn lại đọc lại order chiến thắng.

## 4. Xác nhận pricing khi checkout

- Backend luôn tính lại giá, discount, shipping fee, grand total và deposit từ database trong transaction.
- Client gửi `expectedGrandTotal`; shipping gửi thêm `expectedDepositRequired` để chứng minh các amount khách vừa xác nhận.
- Expected amount không được dùng trong phép tính và không được lưu thay cho kết quả của backend.
- Nếu một expected value khác kết quả hiện hành, checkout dừng trước mọi write và trả `409 CHECKOUT_REVIEW_REQUIRED` cùng pricing summary mới.
- `CartItem.priceAtAddition` chỉ giúp giao diện cảnh báo thay đổi giá.

## 5. Defense in depth tại database

`Serializable` không thay thế constraint. Database vẫn phải từ chối trạng thái không hợp lệ bằng:

- Partial unique index: tối đa một `InventoryReservation` trạng thái `ACTIVE` cho mỗi `inventoryUnitId`.
- Check constraint: `0 <= StockLevel.quantityReserved <= StockLevel.quantityOnHand`.
- Unique constraint: một `VoucherUsage` cho mỗi order; các public code và business key theo data dictionary.
- Conditional update: transition chỉ thành công khi record vẫn ở expected status.
- Append-only record cho `StockMovement` và các attempt payment đã terminal.

Khi constraint hoặc conditional update thất bại, application map lỗi sang domain conflict phù hợp; không tiếp tục phần còn lại của command.

## 6. Reservation khi chờ cọc shipping

- Checkout tạo payment `AWAITING_PROOF` và reservation có deadline 30 phút.
- Submit proof đúng hạn đổi payment sang `UNDER_REVIEW`, reservation sang `holdReason = REVIEW` và bỏ `expiresAt` trong cùng transaction.
- SLA review 24 giờ được tính từ `Payment.submittedAt`; quá SLA không tự release hàng.
- Expire khi chưa có proof hoặc reject proof phải cancel order/fulfillment, terminalize payment, release reservation và release voucher usage nguyên tử, idempotent.
- Verify proof giữ reservation tới khi fulfillment consume hoặc một command hợp lệ release.

## 7. Xác minh shipping deposit

- Staff/admin verify payment `UNDER_REVIEW` bằng conditional transition trong Serializable transaction.
- Transaction tính lại tổng verified payment/refund từ database, cập nhật `paidAmount`, `refundedAmount`, `balanceDue`, `paymentStatus` và chuyển Order `PLACED → CONFIRMED`.
- Reservation đổi từ `REVIEW` sang `FULFILLMENT`; fulfillment vẫn `PENDING` cho tới command chuẩn bị hàng.
- `receivedAmount >= depositRequired`; thiếu cọc bị reject, amount khác expected cần note.
- AuditLog nằm trong transaction; email xác nhận chạy sau commit.

## 8. Quy ước transaction trong NestJS/Prisma

- Application service/use case sở hữu transaction boundary; controller chỉ validate input và gọi use case.
- Mọi repository/helper tham gia cùng command phải nhận cùng một Prisma transaction client.
- Không mở transaction độc lập lồng bên trong một command đang chạy.
- Retry bao quanh toàn bộ transaction callback, không chỉ chạy lại câu lệnh cuối bị lỗi.
- Transaction phải ngắn: chỉ gồm đọc/ghi database cần thiết để bảo vệ invariant.
- Không gửi email, upload file, gọi Supabase Storage, SePay hoặc dịch vụ vận chuyển bên trong transaction.
- Dữ liệu trả ra ngoài chỉ được xem là thành công sau khi commit.

## 9. Side effect ngoài database

Đối với P0, email và các side effect ngoài database chạy sau commit. Nếu side effect thất bại, không rollback nghiệp vụ đã commit; API/log ghi nhận lỗi để xử lý lại thủ công. Email thử tối đa hai lần trong adapter, không có transactional outbox/durable retry; policy đầy đủ nằm tại [Notifications](notifications.md).

## 10. Tiêu chí kiểm thử concurrency tối thiểu

- Hai checkout đồng thời cùng một `InventoryUnit`: đúng một request tạo reservation/order thành công.
- Hai checkout phụ kiện sát giới hạn tồn: tổng `quantityReserved` không vượt `quantityOnHand`.
- Hai checkout dùng lượt voucher cuối: không vượt `totalUsageLimit` hoặc `perCustomerLimit`.
- Hai nhân viên review cùng payment: chỉ transition đầu tiên tạo tác động lên projection của order.
- Retry không tạo trùng order, reservation, voucher usage, stock movement hoặc refund side effect.
- Hai request checkout cùng Cart: cùng quan sát một order sau khi request thành công đã commit.
- Pricing thay đổi sau khi khách xem checkout: không có write và trả pricing summary mới để xác nhận lại.
- Proof đúng/sát deadline cạnh tranh với expiry command: chỉ một transition thắng và reservation không bị release sai.
- Payment `UNDER_REVIEW` quá SLA không bị expiry command giải phóng.
- Hai nhân viên verify cùng deposit: chỉ một transition thắng và projection/order chỉ được cập nhật một lần.

## 11. Thông số implementation

- Transaction timeout 5 giây; max wait lấy connection 2 giây cho interactive transaction P0.
- Retry tối đa 3 lần thực thi, backoff theo attempt `25 ms`, `75 ms`, cộng jitter ngẫu nhiên `0..25 ms`.
- Log mỗi retry ở mức warn với request ID/use case/attempt/error category; không log input nhạy cảm. Hết retry map `CONCURRENT_MODIFICATION`.
- Có thể điều chỉnh bằng code constant sau benchmark nhưng mọi thay đổi phải giữ bounded retry và cập nhật test/tài liệu.

## Liên kết

- [State machines](state-machines.md)
- [Quy ước data model](../data-model/conventions.md)
- [ADR-0031](../decisions/0031-serializable-transactions-and-bounded-retry.md)
- [ADR-0032](../decisions/0032-cart-based-checkout-idempotency.md)
- [ADR-0033](../decisions/0033-checkout-price-reconfirmation.md)
- [ADR-0034](../decisions/0034-shipping-deposit-reservation-lifetime.md)
- [ADR-0035](../decisions/0035-atomic-deposit-verification-and-order-confirmation.md)
- [Checkout transaction](checkout-transaction.md)
- [ADR-0036](../decisions/0036-atomic-checkout-transaction.md)
- [Hủy Order và khởi tạo Refund](order-cancellation-and-refund.md)
- [ADR-0040](../decisions/0040-atomic-order-cancellation-and-refund-request.md)
- [Fulfillment transactions](fulfillment-transactions.md)
- [ADR-0041](../decisions/0041-atomic-fulfillment-finalization-and-cash-cod-payment.md)
- [Refund processing và evidence](refund-processing.md)
- [ADR-0042](../decisions/0042-refund-evidence-before-atomic-completion.md)
- [API error catalog](../api/error-catalog.md)

## Tham khảo kỹ thuật

- [Prisma — Transactions and batch queries](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)
- [PostgreSQL — Transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [PostgreSQL — Serialization failure handling](https://www.postgresql.org/docs/current/mvcc-serialization-failure-handling.html)
