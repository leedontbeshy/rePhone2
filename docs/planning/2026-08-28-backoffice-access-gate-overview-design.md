# Cổng phân quyền backoffice và trang Tổng quan

> Ngày chốt: 2026-08-28  
> Trạng thái: Thiết kế đã duyệt, sẵn sàng triển khai  
> Nhánh dự kiến: `feat/fe-6-inventory-stock`

## 1. Tóm tắt phạm vi

- Bảo vệ tập trung toàn bộ `/backoffice` và `/backoffice/*` cho hai vai trò `EMPLOYEE` và `ADMIN`.
- Không render hoặc mount nội dung trang quản trị trước khi xác nhận quyền; vì vậy trang con không được phép khởi tạo yêu cầu dữ liệu trong trạng thái đang kiểm tra, khách vãng lai hoặc khách hàng.
- Khách vãng lai ở nguyên URL đã mở, thấy màn hình “Không có quyền truy cập” cùng lối đăng nhập và quay về cửa hàng.
- Tài khoản `CUSTOMER` ở nguyên URL đã mở, thấy màn hình từ chối cùng lối về cửa hàng và quản lý tài khoản.
- Chuyển nút “Quản trị” trên desktop, mobile và điểm đến mặc định sau đăng nhập nhân viên về `/backoffice`.
- Tạo `/backoffice` làm trang Tổng quan tạm thời bằng skeleton, chưa hiển thị số liệu giả hoặc gọi dashboard API chưa tồn tại.
- Bật mục “Tổng quan” trong điều hướng Vận hành và đánh dấu hiện tại chỉ khi pathname bằng chính xác `/backoffice`.

## 2. Mục tiêu và giới hạn

### Mục tiêu

- Người không đủ quyền không thấy dù chỉ thoáng qua tiêu đề, thanh điều hướng, form hoặc dữ liệu quản trị.
- Mọi trang backoffice hiện tại và được thêm trong tương lai cùng kế thừa một cổng phân quyền.
- Trạng thái từ chối dễ hiểu, thuần Việt và đưa người dùng tới hành động phù hợp.
- Nhân viên mở khu vận hành từ cửa hàng hoặc sau đăng nhập sẽ bắt đầu tại Tổng quan.

### Không thuộc phạm vi

- Không thay đổi API, phiên đăng nhập, cookie hoặc ma trận quyền phía máy chủ.
- Không thay thế `SessionGuard`, `RolesGuard` hoặc kiểm tra quyền riêng của các trang chỉ dành cho `ADMIN`.
- Không triển khai số liệu dashboard thật trong lượt này.
- Không thêm route `/admin` hoặc `/employee`; toàn bộ khu nội bộ tiếp tục dùng namespace `/backoffice`.

## 3. Giả định phi chức năng

- Bảo mật phía máy chủ vẫn là nguồn sự thật; cổng giao diện là lớp chặn sớm để tránh rò UI và yêu cầu dữ liệu không cần thiết.
- `AuthProvider` cần hoàn thành phục hồi phiên bằng cookie trước khi biết vai trò. Trong khoảng này chỉ được render màn kiểm tra quyền trung tính, tuyệt đối không render `children`.
- Không lưu vai trò vào `localStorage` hoặc thêm cookie đọc được từ JavaScript chỉ để rút ngắn màn kiểm tra quyền.
- Cổng đặt ở layout gốc của backoffice để chi phí bảo trì không tăng theo số lượng trang.
- Trạng thái mất mạng hoặc không xác định được phiên mặc định đóng: không render nội dung quản trị.
- Giao diện phải hoạt động ở desktop và mobile, dùng token và primitive sẵn có, hỗ trợ bàn phím và trình đọc màn hình.

## 4. Kiến trúc và luồng hiển thị

Tạo một client component `BackofficeAccessGate` và mount duy nhất tại `app/backoffice/layout.tsx`.

Luồng quyết định:

1. `status === loading`: chỉ render màn “Đang kiểm tra quyền truy cập” trung tính.
2. `status === anonymous`: chỉ render màn “Không có quyền truy cập”, nút “Đăng nhập” và “Về cửa hàng”.
3. `status === authenticated` với `CUSTOMER`: chỉ render màn từ chối, nút “Về cửa hàng” và “Quản lý tài khoản”.
4. `status === authenticated` với `EMPLOYEE` hoặc `ADMIN`: mới render `children`.
5. Lỗi kiểm tra phiên hoặc kết nối không rõ trạng thái: giữ nguyên nguyên tắc đóng, hiện “Chưa thể kiểm tra quyền truy cập” và hành động thử lại.

Layout chỉ làm nhiệm vụ guard, không bọc thêm `BackofficeShell`, nhằm tránh lồng hai shell vào các trang FE-05/FE-06 và trang cũ. Trang `/backoffice` tự dùng shell hiện có để render Tổng quan skeleton.

## 5. Giao diện

### Kiểm tra quyền

- Nền sáng trung tính, logo rePhone và skeleton nhỏ ở giữa.
- Không có sidebar, topbar, breadcrumb hoặc nhãn “Vận hành”.
- Có nhãn trạng thái hỗ trợ công nghệ trợ năng nhưng không tạo nhiễu thị giác.

### Từ chối truy cập

- Biểu tượng khóa, tiêu đề chính xác “Không có quyền truy cập”.
- Nội dung thuần Việt, không lộ mã lỗi, tên guard, token hoặc chi tiết hệ thống.
- Nút phù hợp theo trạng thái phiên; focus rõ ràng và thứ tự bàn phím hợp lý.
- Không render ẩn nội dung quản trị bằng CSS; nội dung đó không được tồn tại trong DOM.

### Tổng quan skeleton

- Dùng `BackofficeShell` và điều hướng Vận hành hiện có.
- Tiêu đề “Tổng quan vận hành”.
- Bốn thẻ chỉ số skeleton và hai khối nội dung skeleton responsive.
- Không có con số, xu hướng hoặc nhãn dữ liệu giả có thể bị hiểu là dữ liệu thật.

## 6. Điều hướng

- Desktop “Quản trị”: `/backoffice`.
- Mobile “Mở trang quản trị”: `/backoffice`.
- Điểm đến mặc định sau đăng nhập của `EMPLOYEE`/`ADMIN`: `/backoffice`.
- Các `returnTo` backoffice hợp lệ vẫn được ưu tiên như hiện tại.
- Mục sidebar “Tổng quan” đổi từ vô hiệu hóa sang `/backoffice`; chỉ active ở route gốc.
- Những liên kết nghiệp vụ chủ động tới `/backoffice/orders` vẫn giữ nguyên.

## 7. Kiểm thử và debug

Chủ dự án cho phép kiểm thử và debug sâu trước khi bàn giao.

- Unit test cổng quyền cho `loading`, `anonymous`, `CUSTOMER`, `EMPLOYEE`, `ADMIN` và trạng thái kiểm tra phiên thất bại.
- Ở ba trạng thái không được phép, assert nội dung bí mật không tồn tại trong DOM thay vì chỉ bị ẩn.
- Browser test mở route gốc và route con khi là khách vãng lai/khách hàng; ghi nhận số request và assert không có request `/api/v1/backoffice/**` từ trang con.
- Browser test nhân viên/quản trị được render nội dung và nút Quản trị dẫn về Tổng quan.
- Kiểm tra không nháy UI bằng cách trì hoãn response phục hồi phiên có kiểm soát và quan sát DOM/screenshot trong khoảng chờ.
- Kiểm tra desktop và mobile cho loading, forbidden và overview; không tràn ngang, không lỗi console, focus và thao tác bàn phím đúng.
- Chạy toàn bộ test web liên quan, lint, typecheck, production build và các browser suite bị ảnh hưởng.
- Debug mọi lỗi phát hiện trong phạm vi thay đổi; không bàn giao khi còn lỗi căn chỉnh, request trái quyền hoặc nội dung quản trị xuất hiện trước gate.

## 8. Decision log

| Quyết định | Phương án đã cân nhắc | Lý do chọn |
| --- | --- | --- |
| Guard tập trung tại layout `/backoffice` | Guard từng trang; middleware kiểm tra vai trò | Bao phủ route hiện tại/tương lai, không mount trang con và phù hợp cơ chế phiên hiện tại |
| Loading trung tính trước khi biết vai trò | Render shell rồi thay nội dung; lưu role phía client | Không nháy UI quản trị và không tạo nguồn quyền thứ hai thiếu an toàn |
| Giữ khách vãng lai tại URL | Tự chuyển sang đăng nhập | Người dùng hiểu rõ lý do bị chặn và có quyền chọn hành động tiếp theo |
| Không render `children` khi bị chặn | Render rồi ẩn bằng CSS | Ngăn rò DOM, effect và request dữ liệu trang con |
| `/backoffice` là Tổng quan skeleton | Tiếp tục dùng Đơn hàng làm trang đầu; dựng dashboard giả | Tạo điểm vào đúng ngữ nghĩa mà không bịa dữ liệu chưa có |
| Giữ kiểm tra admin-only hiện tại | Dồn toàn bộ ma trận quyền vào root gate | Root gate chỉ phân biệt khách và nhân sự; quyền nghiệp vụ chi tiết vẫn ở đúng phạm vi |
| Kiểm thử chậm phục hồi phiên | Chỉ test trạng thái ổn định | Bắt được chính xác lỗi nháy UI mà yêu cầu muốn ngăn |

## 9. Tiêu chí hoàn tất

- Không có nội dung backoffice trong DOM trước khi xác nhận vai trò nhân sự.
- Khách vãng lai và `CUSTOMER` thấy màn từ chối thống nhất ở mọi `/backoffice/**`.
- Không có request dữ liệu trang con khi người dùng không đủ quyền.
- `EMPLOYEE` và `ADMIN` truy cập bình thường; quyền admin-only không bị nới lỏng.
- Tất cả điểm vào “Quản trị” mặc định về `/backoffice`.
- Tổng quan skeleton và điều hướng responsive, không lỗi console hoặc accessibility nghiêm trọng.
- Test, lint, typecheck và production build đạt trước khi commit/push.
