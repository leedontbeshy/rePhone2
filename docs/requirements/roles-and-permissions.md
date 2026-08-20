# Vai trò và phân quyền

## 1. Nguyên tắc

- Backend là nguồn thực thi quyền; ẩn nút trên frontend không được xem là biện pháp bảo mật.
- MVP dùng ba role cố định, chưa xây permission editor.
- Mọi truy vấn dữ liệu khách hàng phải kiểm tra ownership hoặc quyền nhân viên.
- Các thao tác tài chính, định danh thiết bị và phân quyền phải được audit.

## 2. Ma trận quyền

| Nghiệp vụ | Admin | Nhân viên | Khách hàng |
|---|---|---|---|
| Xem catalog public | Có | Có | Có |
| Tạo/sửa sản phẩm và ảnh | Có | Có | Không |
| Nhập, kiểm định và chuyển tồn | Có | Có | Không |
| Xem/sửa giá vốn từng iPhone | Có | Không | Không |
| Xử lý đơn và reservation | Có | Có | Chỉ đơn của mình |
| Xác nhận/từ chối cọc | Có | Có | Chỉ gửi chứng từ |
| Hoàn tiền/hoàn cọc | Có | Có, phải ghi lý do | Không |
| Giao nhận và mã vận đơn | Có | Có | Chỉ xem |
| Bảo hành/hậu mãi | Có | Có | Tạo/xem yêu cầu của mình |
| Quản lý voucher | Có | Không | Chỉ sử dụng |
| Quản lý tài khoản nhân viên | Có | Không | Không |
| Xem khách hàng | Có | Có, projection tối thiểu | Chỉ hồ sơ của mình |
| Tạm khóa/mở khách hàng | Có | Không | Không |
| Cấu hình nghiệp vụ | Có | Không | Không |
| Xem audit log | Có | Không | Không |
| Xem IMEI/serial đầy đủ | Có | Có, có audit | Không |

Customer/guest được tự hủy Order của mình trước `IN_TRANSIT` theo cancellation policy. Không tự hủy khi deposit proof đang `UNDER_REVIEW`; staff phải review trước.

## 3. Tài khoản và phiên

- Trong MVP demo, khách đăng ký bằng email/mật khẩu và tài khoản được `ACTIVE` ngay; xác minh email được hoãn tới khi có domain/provider production.
- Đăng ký không tự động đăng nhập; khách dùng màn hình login riêng để tạo phiên.
- Admin tạo tài khoản nhân viên chờ kích hoạt; nhân viên nhận invitation và tự đặt mật khẩu, admin không cấp mật khẩu tạm.
- Tài khoản có thể ở trạng thái `PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`, `DISABLED`; P0 chỉ dùng `PENDING_VERIFICATION` cho employee đang chờ accept invitation, không dùng cho customer đăng ký.
- Phiên có thể bị thu hồi riêng lẻ hoặc thu hồi toàn bộ khi đổi mật khẩu/sự cố.

## 4. Guest checkout

- Guest cung cấp tên, email, số điện thoại và địa chỉ giao nhận nếu chọn shipping.
- Thông tin liên hệ được snapshot vào đơn.
- Tra cứu đơn bằng token ngẫu nhiên gửi qua email; không dùng ID tuần tự làm bí mật.
- Token tra cứu chỉ lưu dạng hash trong database.
- P0 không tự động liên kết đơn guest trước đó chỉ vì tài khoản có cùng email; guest tiếp tục dùng order-access token. Chính sách liên kết chỉ được thiết kế sau khi có xác minh email.

## 5. Dữ liệu nhạy cảm

- Giá vốn chỉ admin được truy cập.
- IMEI, serial và EID không xuất hiện trong DTO public.
- Chứng từ cọc, hoàn tiền và hậu mãi là private media.
- Service credential, secret HMAC và khóa mã hóa chỉ tồn tại trong biến môi trường backend.
