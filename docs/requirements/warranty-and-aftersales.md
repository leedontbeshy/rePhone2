# Bảo hành và hậu mãi

## 1. Phạm vi MVP

MVP quản lý chính sách, phát hành bảo hành và theo dõi yêu cầu hậu mãi. Không quản lý kỹ thuật viên, kho linh kiện hoặc quy trình sửa chữa chi tiết.

## 2. Phát hành bảo hành

- Warranty được sinh khi order item được giao/nhận thành công.
- `startAt` là thời điểm hoàn tất fulfillment, không phải lúc đặt đơn hoặc cọc.
- Chính sách mặc định có thể được override theo máy/variant.
- Số ngày và điều khoản được snapshot vào order item và warranty.
- Mỗi warranty có mã duy nhất và gắn với order item; với iPhone phải gắn đúng inventory unit.
- Thời hạn dùng interval `[startAt, endAt)`, endAt bằng startAt cộng số ngày snapshot theo 24 giờ.

## 3. Yêu cầu hậu mãi

Loại yêu cầu:

- `WARRANTY`
- `RETURN`
- `EXCHANGE`

Vòng đời:

```text
REQUESTED → RECEIVED → INSPECTING → APPROVED → RESOLVED
                               └──→ REJECTED
```

Chỉ `REQUESTED` có thể bị khách `CANCELLED`; `REJECTED`, `RESOLVED`, `CANCELLED` là terminal. Mọi chuyển trạng thái phải kiểm tra transition hợp lệ và ghi người thực hiện.

## 4. Kết quả xử lý

- `REPAIRED`
- `REPLACED`
- `REFUNDED`
- `RETURNED_UNCHANGED`
- `OTHER`

MVP chỉ lưu kết quả, ghi chú và attachment; chưa bóc tách part replacement thành module sửa chữa.

## 5. Ảnh hưởng tồn kho

- iPhone được nhận lại chuyển `INSPECTING`.
- Nếu case bị từ chối sau kiểm định, thao tác reject đồng thời xác nhận trả máy cho khách và chuyển máy `INSPECTING → SOLD`; reason/return note được audit.
- Muốn bán lại phải có inspection mới đạt yêu cầu và thao tác đưa về `AVAILABLE`.
- Đổi máy phải liên kết máy cũ và máy thay thế trong case.
- P0 chỉ đổi trực tiếp iPhone; đổi phụ kiện dùng hoàn tiền và tạo đơn mới.
- Phụ kiện hoàn về chỉ tăng tồn bán được sau khi nhân viên xác nhận tình trạng và tạo stock movement.

## 6. Chứng từ và audit

- Attachment hậu mãi nằm trong bucket private.
- Duyệt/từ chối, đổi máy, hoàn tiền và đưa hàng trở lại bán đều cần ghi chú.
- Quyền xem hồ sơ thuộc khách sở hữu hoặc nhân viên/admin có quyền.
