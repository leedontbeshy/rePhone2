# FE-05 — Tinh chỉnh quản trị danh mục và mã ưu đãi

> Ngày chốt: 2026-08-28  
> Trạng thái: Thiết kế đã duyệt  
> Nhánh triển khai: `codex/feat-fe-05-catalog-vouchers`

## 1. Tóm tắt phạm vi

- Tinh chỉnh toàn bộ sáu màn hình FE-05 để bám sát các mockup trong `docs/assets/ui/fe-05` và đồng nhất với hệ thống thiết kế rePhone hiện có.
- Làm thanh điều hướng quản trị rõ, rộng và dễ quét hơn; không xây thêm trang Tổng quan trong lượt này.
- Xếp danh sách sản phẩm theo năm ra mắt mới nhất, với thứ tự phụ ổn định và phụ kiện không có năm nằm sau.
- Thêm gợi ý tìm kiếm theo dòng máy và cập nhật bộ lọc ngay trong trang, không thay toàn bộ nội dung bằng trạng thái tải.
- Mở rộng form biến thể theo đúng loại sản phẩm, nhưng không đưa dữ liệu của từng máy kiểm định thuộc FE-06 vào FE-05.
- Chuẩn hóa toàn bộ lưới biểu mẫu mã ưu đãi để nhãn, ô nhập, dòng hướng dẫn và cột xem trước thẳng hàng.
- Bắt buộc kiểm tra trực quan bằng in-app browser, chụp ảnh cùng trạng thái và kích thước với mockup trước khi bàn giao.

## 2. Người dùng và mục đích

Đối tượng sử dụng là nhân viên và quản trị viên vận hành rePhone. Mục tiêu là giúp họ quét danh sách, tìm đúng dòng máy, sửa biến thể và tạo mã ưu đãi nhanh, không bị gián đoạn bởi tải lại toàn trang hoặc các biểu mẫu lệch hàng. Phân quyền hiện có tiếp tục được giữ nguyên: nhân viên và quản trị viên dùng danh mục; chỉ quản trị viên dùng mã ưu đãi.

## 3. Giả định và giới hạn

- Danh sách có thể tăng đến vài nghìn sản phẩm hoặc mã ưu đãi; tiếp tục phân trang và truy vấn phía máy chủ.
- Khoảng 20–50 người dùng vận hành đồng thời; không cần cơ chế đồng bộ thời gian thực trong lượt này.
- Gợi ý tìm kiếm chờ khoảng 250 ms, yêu cầu ít nhất hai ký tự và trả tối đa sáu kết quả.
- URL là nguồn trạng thái chuẩn cho từ khóa, bộ lọc, sắp xếp và phân trang để Back/Forward hoạt động đúng.
- Không thay đổi quyền, cơ chế đăng nhập, quy tắc bảo mật hoặc state machine nghiệp vụ hiện có.
- Không thêm IMEI, số sê-ri, pin, tình trạng máy, kết quả kiểm định hay giá của từng máy; các trường này thuộc FE-06.
- Không tạo route mới hoặc tái cấu trúc toàn bộ các màn hình backoffice ngoài FE-05.
- Mã được chia thành các commit nhỏ, mỗi commit tập trung một nhóm thay đổi và có kiểm thử tương ứng.

## 4. Thiết kế đã duyệt

### 4.1. Khung quản trị

- Dùng lại token và component hiện có, không tạo phong cách mới.
- Sidebar desktop rộng khoảng 264–272 px; chữ điều hướng 16 px, biểu tượng khoảng 22 px và vùng bấm cao 52–56 px.
- Điều hướng hiển thị Tổng quan, Danh mục, Kho hàng, Đơn hàng và Mã ưu đãi. Mục chưa có màn hình riêng không được tự ý sinh route mới.
- Topbar cao khoảng 72–76 px; tiêu đề trang, khoảng cách và chiều rộng nội dung dùng cùng quy chuẩn trên catalog và voucher.
- Ở tablet/mobile, điều hướng thu gọn và nội dung chuyển một cột, không có tràn ngang.

### 4.2. Danh sách, sắp xếp và tìm kiếm

- Mặc định dùng `releaseYear desc`; cùng năm xếp ổn định theo tên. Giá trị năm trống nằm cuối.
- Bộ lọc có state điều khiển, tự quay về trang 1 khi thay đổi và đồng bộ URL mà không cuộn lên đầu.
- Trong lúc lấy dữ liệu mới, giữ danh sách hiện tại và chỉ báo “Đang cập nhật”; skeleton chỉ dùng cho lần tải đầu.
- Bộ đếm trạng thái được lấy riêng, không được làm mất danh sách khi lỗi và không gọi lại khi chỉ đổi trang hoặc thứ tự.
- Ô tìm kiếm hoạt động như combobox: hỗ trợ chuột, phím lên/xuống, Enter và Escape; yêu cầu cũ bị hủy để kết quả chậm không ghi đè truy vấn mới.
- Chọn gợi ý mở chi tiết sản phẩm; nhấn Enter áp dụng từ khóa vào danh sách.

### 4.3. Biến thể sản phẩm

- Form chia thành các nhóm Nhận diện, Cấu hình hoặc Thông số phụ kiện, Bán hàng và Bảo hành.
- iPhone có tên phiên bản, mã biến thể, dung lượng, tên màu và bộ chọn màu đồng bộ với mã màu.
- Phụ kiện có tên, mã, giá bán, giá niêm yết, màu nếu có và các thuộc tính tên–giá trị như tương thích, chất liệu, đầu kết nối, chiều dài hoặc công suất.
- Chính sách bảo hành cho phép dùng mặc định hoặc chọn riêng; thao tác sửa phải xóa được lựa chọn riêng để quay về mặc định.
- Trạng thái bản nháp và kiểu quản lý tồn kho chỉ hiển thị để giải thích, không cho người dùng nhập dữ liệu sai tầng nghiệp vụ.

### 4.4. Mã ưu đãi

- Chuẩn hóa chiều cao nhãn, control và dòng hướng dẫn; mọi field có `min-width: 0` và `box-sizing` nhất quán.
- Các lưới ba hoặc bốn cột chuyển thành hai cột khi vùng form không đủ rộng; không ép nhãn dài hoặc input ngày giờ bị tràn.
- Cột xem trước khoảng 22 rem trên desktop và xếp sau form ở màn hình hẹp.
- Danh sách mã ưu đãi tự áp dụng select và debounce tìm kiếm; bỏ hàng nút áp dụng riêng làm panel cao không cần thiết.
- Tiêu đề trang, status chip, button destructive và rail lifecycle dùng chung nhịp thị giác với catalog và mockup đã duyệt.

## 5. Xử lý lỗi và trạng thái biên

- Từ khóa dưới hai ký tự không gọi API gợi ý.
- Khi gợi ý lỗi, chỉ đóng dropdown hoặc hiển thị thông báo gọn; danh sách chính vẫn dùng được.
- Khi truy vấn danh sách lỗi, giữ dữ liệu đang có và cung cấp thao tác thử lại, không chuyển cả trang sang màn hình trắng.
- Đổi loại, năm, trạng thái hoặc sắp xếp luôn đặt trang về 1; Back/Forward khôi phục đúng các control.
- Request chậm hoặc bị hủy không được cập nhật state sau một request mới hơn.
- Form phụ kiện không dùng JSON; thuộc tính trống bị bỏ qua và tên thuộc tính trùng được xác thực bằng thông báo tiếng Việt.

## 6. Kế hoạch kiểm thử và nghiệm thu

- Component/API tests: thứ tự đời máy, năm trống nằm cuối, parser URL, state bộ lọc, chống race của gợi ý và thuộc tính phụ kiện.
- Interaction tests: chuột và bàn phím cho combobox, Back/Forward, đổi bộ lọc không làm mất danh sách và form biến thể theo từng loại.
- Browser QA bằng in-app browser trên cả sáu route FE-05 ở 1487×1058; kiểm tra thêm các breakpoint 1366 px, 1024 px và 360 px.
- Mỗi màn hình phải được ghép cùng mockup ở cùng viewport và trạng thái để so sánh trực tiếp; chụp riêng sidebar, dropdown gợi ý, modal biến thể và các hàng form mã ưu đãi.
- Kiểm tra focus, nội dung tiếng Việt, console error, tràn ngang, nhãn bị cắt, chiều cao input và nút hành động.
- Chỉ nghiệm thu khi không còn lỗi P0, P1 hoặc P2 trong `design-qa.md`.

## 7. Kế hoạch commit

1. Đồng bộ khung quản trị và thanh điều hướng với mockup.
2. Sửa thứ tự sản phẩm và bộ lọc cập nhật tại chỗ.
3. Thêm tìm kiếm gợi ý có hỗ trợ bàn phím.
4. Mở rộng form và dữ liệu thuộc tính biến thể.
5. Chuẩn hóa bố cục danh sách/form mã ưu đãi.
6. Bổ sung kiểm thử, ảnh đối chiếu và hồ sơ QA.

## 8. Nhật ký quyết định

| Quyết định | Phương án đã cân nhắc | Lý do chọn |
| --- | --- | --- |
| Bám mockup và nâng cấp đúng luồng FE-05 | Chỉ vá lỗi; tái cấu trúc toàn bộ backoffice | Đủ giải quyết nguyên nhân, giữ phạm vi và giảm rủi ro ảnh hưởng màn hình khác |
| “UI tổng quan” là chất lượng chung của FE-05 | Tạo thêm trang Tổng quan | Người dùng xác nhận không yêu cầu route mới |
| URL là nguồn trạng thái chuẩn | State chỉ tồn tại trong component | Giữ chia sẻ URL và Back/Forward chính xác |
| Gợi ý dùng endpoint danh sách hiện có | Endpoint gợi ý riêng | Dữ liệu model hiện có đã đủ; tránh mở rộng backend chưa cần thiết |
| Không thêm dữ liệu từng máy vào biến thể | Gộp một phần FE-06 vào modal | Giữ đúng ranh giới nghiệp vụ và tránh form sai tầng dữ liệu |
| QA bằng ảnh ghép cùng mockup | Chỉ chụp ảnh kết quả | So sánh trực tiếp mới phát hiện sai lệch căn chỉnh và tỷ lệ |
| Chia nhỏ commit theo nhóm chức năng | Một commit tổng | Dễ kiểm tra, quay lui và rà lỗi hơn |

