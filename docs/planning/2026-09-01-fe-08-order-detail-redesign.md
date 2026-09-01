# FE-08 — Redesign chi tiết đơn hàng vận hành

Ngày chốt: 2026-09-01

Trạng thái: Đã duyệt để triển khai

Ảnh chuẩn: `docs/assets/ui/fe-08/order-detail-refinement/reference.png`

## Hiểu biết đã khóa

- Xây lại phần trình bày của `/backoffice/orders/[id]` trong backoffice rePhone.
- Mục tiêu là giúp `EMPLOYEE` và `ADMIN` quét nhanh mã đơn, khách hàng, giá trị đơn, giao nhận, thanh toán và hành động đang được phép.
- Giữ nguyên nguồn dữ liệu, API, quyền truy cập, chuyển trạng thái và quy tắc nghiệp vụ hiện hành.
- Phương án trực quan được duyệt là ảnh mockup thứ nhất trong bộ ba ngày 2026-09-01.
- Màn hình ưu tiên desktop `>= 1024px`; viewport hẹp vẫn phải đọc được dữ liệu và hoàn tất critical command.
- Không thêm số liệu hoặc claim không có authority từ backend.
- Không mở rộng sang danh sách đơn hàng, payment detail, refund detail hoặc customer order detail.

## Giả định và yêu cầu phi chức năng

- Không thêm request mới khi mở trang; redesign phải dùng cùng projection đã tải để không làm tăng thời gian chờ.
- Không thay đổi guard hoặc đưa dữ liệu quản trị ra trước khi xác nhận quyền truy cập.
- Các thao tác vẫn đi qua mutation và xử lý lỗi hiện có; redesign không làm yếu validation, conflict handling hoặc pending state.
- Dùng component primitive, token và CSS module hiện có để giảm chi phí bảo trì.
- Hình mockup chỉ là nguồn presentation; ảnh sản phẩm và dữ liệu thực tế tiếp tục đến từ contract hiện hành.
- Kiểm thử gồm unit/component hiện có, typecheck/lint liên quan và Browser Design QA ở `1440 × 1024`.

## Thiết kế được chọn

- Dải tóm tắt đầu trang gom: mã đơn, ngày đặt, khách hàng, tổng tiền, cách nhận hàng và ba trục trạng thái.
- Cột chính bắt đầu bằng sản phẩm, sau đó là khách hàng/giao nhận, timeline, thanh toán và các hồ sơ phụ.
- Rail thao tác giữ sticky nhưng chỉ hiển thị lựa chọn hành động khi chưa được mở; form dài dùng progressive disclosure.
- Tổng quan tài chính chia rõ `Giá trị đơn` và `Dòng tiền`.
- Timeline desktop chuyển sang dạng ngang gọn; viewport hẹp trở về bố cục dọc an toàn.
- Tạo chiều sâu bằng tint nhẹ, typography, khoảng cách và phân nhóm; không thêm card lồng card hoặc shadow nặng.

## Không thuộc phạm vi

- Không đổi endpoint, DTO, schema database hoặc state machine của đơn hàng.
- Không tạo chức năng hoàn tiền mới.
- Không sửa dữ liệu demo để giống ảnh mockup.
- Không sao chép ảnh mockup thành giao diện raster.

## Decision log

1. **Chọn phương án 1 — Tóm tắt nghiệp vụ.** Hai hướng còn lại ưu tiên workflow strip hoặc dossier tab; phương án 1 giữ gần nhất với cấu trúc hiện hành và giảm rủi ro thay đổi hành vi.
2. **Giữ layout hai cột.** Rail sticky phù hợp nghiệp vụ hiện tại; chỉ giảm độ ồn và thu gọn form mặc định.
3. **Đưa sản phẩm lên trước khách hàng.** Nhân viên nhận diện ngay đơn đang xử lý trước khi đọc metadata giao nhận.
4. **Không thêm màu trang trí.** Teal chỉ dùng cho CTA/focus, xanh lá cho trạng thái hoàn tất và tint xanh xám để phân tầng.
5. **Không thêm fetch hoặc dữ liệu mới.** Hiệu năng và độ tin cậy được giữ bằng cách tái tổ chức projection hiện có.

## Xác nhận

Người dùng đã xem ba ảnh mockup và chọn ảnh số `1` ngày 2026-09-01. Lựa chọn này là xác nhận để chuyển từ thiết kế sang triển khai.
