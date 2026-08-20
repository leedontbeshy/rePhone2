# Checkout transaction

Tài liệu này là đặc tả P0 cho use case chuyển một Cart thành Order. `Orders` module là application orchestrator; các module Cart, Inventory, Vouchers và Payments cung cấp policy/query được gọi bằng cùng Prisma transaction client.

## 1. Input nghiệp vụ

Checkout nhận tối thiểu:

- Identity của cart hiện hành: customer session hoặc guest cart token.
- Thông tin liên hệ snapshot.
- `fulfillmentType` và dữ liệu shipping/pickup tương ứng.
- Voucher code nếu khách áp dụng.
- `expectedGrandTotal`; shipping có thêm `expectedDepositRequired`.
- Customer note tùy chọn.

Frontend không gửi giá bán authoritative, discount authoritative, trạng thái order hoặc inventory counter.

## 2. Fast idempotency check

Trước khi mở transaction, backend có thể tìm Order theo `sourceCartId` để trả nhanh request lặp lại. Kết quả chỉ được trả sau khi kiểm tra customer/guest ownership. Việc kiểm tra này là tối ưu; transaction vẫn bắt buộc kiểm tra lại để tránh race condition.

## 3. Transaction boundary

Toàn bộ bước 1–10 dưới đây chạy trong một Prisma interactive transaction với isolation `Serializable` và bounded retry theo ADR-0031.

1. **Recheck idempotency:** tìm Order theo `sourceCartId`; nếu đã tồn tại và ownership hợp lệ, trả kết quả replay mà không tạo side effect.
2. **Load Cart:** yêu cầu Cart `ACTIVE`, đúng identity, chưa hết hạn và có ít nhất một CartItem.
3. **Validate request:** validate contact; shipping address cho `SHIPPING`; pickup location cho `PICKUP`; từ chối field không phù hợp fulfillment type.
4. **Load authoritative data:** đọc Product, ProductVariant, InventoryUnit/StockLevel, Voucher và StoreSettings cần thiết.
5. **Allocate và validate eligibility:** catalog active; inventory target đúng mode; unit `AVAILABLE`; số lượng dương; voucher đúng hiệu lực/scope/quota. Chọn đúng một `fulfillmentLocationId`: pickup dùng STORE; shipping thử WAREHOUSE rồi STORE và location phải cấp được toàn bộ cart.
6. **Calculate pricing:** lấy giá unit hiện hành, tính subtotal, discount, shipping fee, grand total và OrderItem allocation/snapshot. Pickup có deposit bằng 0; shipping dùng `min(shippingDepositAmount, grandTotal)`.
7. **Reconfirm pricing:** so sánh expected amounts. Nếu lệch, dừng trước mọi write bằng `CHECKOUT_REVIEW_REQUIRED` và trả pricing summary mới.
8. **Create Order graph:** sinh `RPH-YYYYMMDD-XXXXXXXX`, tạo Order `PLACED` và OrderItem snapshot. Ngày dùng business timezone, suffix dùng secure random alphabet đã chốt.
9. **Reserve scarce resources:**
   - Mọi target phải thuộc `Order.fulfillmentLocationId`; checkout không tự transfer hoặc split location.
   - Serialized iPhone: insert `InventoryReservation(ACTIVE)` cho unit; partial unique index ngăn giữ trùng.
   - Quantity accessory: conditional update StockLevel tại location đã chọn, chỉ thành công khi available quantity đủ; sau đó insert reservation.
   - Voucher: tạo `VoucherUsage(RESERVED)` sau khi kiểm tra quota tính cả `RESERVED` và `CONSUMED`.
10. **Initialize next state và close Cart:**
    - Pickup: reservation `holdReason = PICKUP`, `expiresAt = now + pickupHoldMinutes`; không tạo Payment tại checkout.
    - Shipping có deposit dương: require bank settings hợp lệ; reservation `holdReason = DEPOSIT`, deadline theo `depositProofWindowMinutes`; tạo Payment `DEPOSIT/BANK_TRANSFER/AWAITING_PROOF` với `expectedAmount`, transfer content, bank/QR snapshot, `reviewWindowMinutesSnapshot` và cùng proof deadline.
    - Shipping có deposit bằng 0 (chỉ khi grand total bằng 0): không tạo Payment giá trị 0; Order được xác nhận, payment summary là `PAID` và reservation chuyển sang `FULFILLMENT`.
    - Chuyển Cart sang `CONVERTED` bằng conditional update từ `ACTIVE`.

Mọi write thuộc một commit. Bất kỳ lỗi nào làm rollback Order, OrderItem, counter, reservation, voucher usage, payment và Cart status.

## 4. Sau commit

- Trả Order DTO đã redacted; guest first success nhận raw order access token, database chỉ lưu hash. Replay qua converted cart không thể trả lại raw token cũ.
- Gửi email xác nhận/ hướng dẫn chuyển cọc theo cơ chế best-effort hiện tại.
- Email, Supabase Storage và dịch vụ ngoài không nằm trong transaction.
- Nếu response bị mất sau commit, request lặp lại tìm thấy cùng Order qua `sourceCartId`.

## 5. Retry và conflict

- Chỉ retry toàn bộ transaction khi lỗi được phân loại là serialization/write conflict.
- Tối đa 3 lần thực thi với backoff ngắn có jitter.
- Unique `sourceCartId` conflict được xử lý bằng cách đọc lại Order chiến thắng sau khi xác thực ownership.
- Unique conflict đúng trên `orderNumber` được retry với suffix crypto-random mới; các unique conflict khác phải được phân loại theo domain.
- Inventory/voucher không còn khả dụng là domain conflict, không retry mù.
- Sau giới hạn concurrency retry, trả `409 Conflict`; stable error code thuộc error catalog.

## 6. Invariant sau commit

- Một Cart có tối đa một Order.
- Mỗi OrderItem có đúng inventory target theo inventory mode.
- Một InventoryUnit có tối đa một reservation active.
- `quantityReserved` không vượt `quantityOnHand`.
- Voucher quota tính cả usage reserved và consumed không bị vượt.
- Tất cả reservation của Order thuộc một `fulfillmentLocationId`.
- Order/OrderItem totals và snapshot cùng xuất phát từ một lần tính authoritative.
- Cart converted không còn được sửa.
- Shipping Order có `depositRequired > 0` luôn có deposit Payment ban đầu; pickup và shipping tổng 0 không có Payment tự sinh ở checkout.
- `orderNumber` và `Payment.transferContent` đúng format, unique theo Order và bất biến sau commit.

## 7. Acceptance test tối thiểu

- Checkout pickup thành công với một iPhone và phụ kiện.
- Checkout shipping tạo payment/deadline đúng snapshot settings.
- Guest và account chỉ checkout cart thuộc ownership của mình.
- Price/deposit mismatch không tạo write.
- Hai request cùng Cart nhận cùng một Order.
- Hai cart tranh một iPhone: đúng một cart thành công.
- Hai cart lấy phần accessory cuối: tổng reserved không vượt tồn.
- Hai cart tranh lượt voucher cuối: quota không bị vượt.
- Pickup từ warehouse hoặc cart không thể cấp trọn từ một location bị từ chối mà không tạo write.
- Lỗi ở bước cuối rollback toàn bộ write và counter.
- Order number collision giả lập sinh lại mã mà không tạo graph trùng.

## 8. API contract

DTO, HTTP response và stable error đã được chốt tại [Checkout và customer Order endpoints](../api/checkout-and-customer-order-endpoints.md).

## Liên kết

- [Transaction và concurrency](transaction-and-concurrency.md)
- [Ranh giới module backend](backend-modules.md)
- [State machines](state-machines.md)
- [ADR-0036](../decisions/0036-atomic-checkout-transaction.md)
- [ADR-0037](../decisions/0037-shipping-deposit-cap.md)
- [ADR-0038](../decisions/0038-single-location-order-allocation.md)
- [ADR-0039](../decisions/0039-public-order-number-and-transfer-content.md)
- [ADR-0059](../decisions/0059-stateless-checkout-preview-and-create.md)
