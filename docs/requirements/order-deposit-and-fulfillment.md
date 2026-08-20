# Đặt hàng, cọc và giao nhận

## 1. Nguyên tắc chung

- Giỏ hàng không giữ tồn kho.
- Giá, voucher, phí, tồn khả dụng và tổng tiền luôn được backend tính lại tại checkout.
- Tạo đơn và reservation phải nằm trong cùng database transaction.
- Mỗi Cart chỉ tạo tối đa một Order thông qua unique `Order.sourceCartId` để ngăn tạo đơn trùng.
- Order item lưu snapshot; lịch sử đơn không phụ thuộc dữ liệu catalog hiện tại.

## 2. Nhận tại cửa hàng

1. Khách đặt đơn và chọn `PICKUP`.
2. Hệ thống tạo reservation; mặc định giữ trong 24 giờ.
3. Nhân viên chuẩn bị hàng và đánh dấu sẵn sàng nhận.
4. Khách thanh toán tại cửa hàng.
5. Nhân viên xác nhận đã giao hàng; nếu còn balance thì tạo CASH payment, sau đó xuất tồn, voucher, warranty và hoàn tất đơn trong cùng transaction.
6. Nếu hết hạn, reservation chuyển `EXPIRED`, đơn bị hủy và tồn được giải phóng.

Thời gian giữ pickup là cấu hình. Nhân viên được gia hạn khi nhập lý do; đơn lưu `expiresAt` thực tế, không đọc lại cấu hình để tính lịch sử.

## 3. Giao hàng và cọc

1. Khách đặt đơn và chọn `SHIPPING`.
2. Hệ thống giữ tồn 30 phút chờ bằng chứng cọc.
3. Khách chuyển khoản theo QR/thông tin ngân hàng và nội dung riêng của đơn.
4. Khách tải biên lai trước deadline; reservation chuyển sang chờ review và không tự hết hạn.
5. Nhân viên chấp nhận hoặc từ chối chứng từ trong SLA 24 giờ. Quá SLA chỉ đánh dấu overdue, không tự hủy đơn đã có khả năng nhận cọc.
6. Khi cọc hợp lệ, xác minh payment và xác nhận đơn diễn ra trong cùng transaction; nhân viên không cần xác nhận order lần nữa.
7. Nhân viên nhập hãng vận chuyển, mã vận đơn và URL tra cứu nếu có.
8. Tiền còn lại được thu COD trong P0; không triển khai bank-transfer balance.
9. Giao thành công thì tạo COD payment nếu còn balance; trạng thái delivered, voucher, warranty và hoàn tất đơn được commit cùng transaction. Bank transfer deposit phải verify trước.

Không nộp biên lai trong 30 phút hoặc bị từ chối thì order bị cancel, reservation và voucher được giải phóng. Khoảng 30 phút, SLA 24 giờ và mức cọc là cấu hình admin; proof deadline thực tế được snapshot trên payment/reservation.

Cọc chỉ hợp lệ khi số tiền thực nhận ít nhất bằng `depositRequired`. Thiếu cọc bị reject; thừa cọc được verify khi có note và phần thừa được phản ánh trong `paidAmount`.

`shippingDepositAmount` cấu hình phải lớn hơn 0. Tại checkout, `depositRequired = min(shippingDepositAmount, grandTotal)` đối với shipping và bằng 0 đối với pickup. Nếu nhân viên override phí ship trước khi nộp proof, snapshot cọc không tăng theo tổng mới nhưng phải giảm nếu vượt grand total mới. Chỉ edge case shipping Order có grand total bằng 0 mới không tạo payment cọc giá trị 0.

Mã đơn có dạng `RPH-YYYYMMDD-XXXXXXXX`; nội dung chuyển khoản deposit là cùng mã sau khi bỏ dấu gạch. Mã này không thay thế session hoặc guest access token khi xem đơn.

## 4. Tổng tiền

Đơn phải lưu ít nhất:

- `subtotal`
- `itemDiscountAmount` (P0 bằng 0) và `voucherDiscountAmount`
- `shippingFee`
- `grandTotal`
- `depositRequired`
- `paidAmount`
- `refundedAmount`
- `balanceDue`

Tất cả số tiền dùng VND nguyên, không dùng floating point.

## 5. Phí ship và vận chuyển

- Admin cấu hình phí ship mặc định.
- Nhân viên có thể thay đổi trên từng đơn và bắt buộc nhập lý do.
- MVP không gọi API hãng vận chuyển.
- Khách tự theo dõi bằng carrier/tracking code/URL do nhân viên cung cấp.
- P0 có một lần giao. Nếu giao thất bại và hàng quay về, nhân viên kiểm tra tồn rồi hủy/hoàn tiền; giao lại tự động thuộc P1.

## 6. Nguồn tồn kho của đơn

- Mỗi Order chỉ lấy hàng từ một InventoryLocation.
- Pickup chỉ lấy toàn bộ hàng tại STORE.
- Shipping ưu tiên WAREHOUSE; nếu không đủ toàn bộ cart thì thử STORE.
- Không cộng/split hàng giữa hai location trong một Order.
- Checkout không tự transfer; nhân viên có thể chuyển tồn bằng use case riêng trước khi khách thử lại.

## 7. Hoàn cọc/hoàn tiền

- Việc chuyển tiền diễn ra bên ngoài hệ thống.
- Nhân viên tạo refund record, nhập số tiền, thời gian, ghi chú và tải chứng từ.
- Refund chuyển khoản chỉ completed sau khi private evidence đã upload và được backend xác thực; Refund tiền mặt không bắt buộc ảnh nhưng cần note/audit.
- Không được ghi nhận hoàn vượt số tiền đã thu trừ khi có nghiệp vụ bồi thường riêng trong tương lai.
- Tác vụ tạo, xác nhận, sửa hoặc hủy refund phải được audit.
- Hủy Order đã thu tiền tạo Refund `REQUESTED` và release tồn/voucher trong cùng transaction; không chờ chuyển tiền hoàn tất mới hủy.
- Customer/guest không tự hủy khi proof đang `UNDER_REVIEW`; nhân viên phải reject hoặc verify trước.
- Không hủy Order khi fulfillment đã `IN_TRANSIT`.

## 8. Invariant tồn kho

- iPhone: một máy chỉ có tối đa một reservation `ACTIVE`.
- Phụ kiện: `quantityReserved <= quantityOnHand`.
- Reservation hết hạn phải được giải phóng idempotently.
- Máy chỉ chuyển `SOLD` khi giao/nhận thành công.
- Máy giao thất bại/hoàn về chuyển `INSPECTING` trước khi có thể bán lại.
