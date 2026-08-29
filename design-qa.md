# Design QA — FE-06 kho hàng, kiểm định và tồn phụ kiện

Ngày kiểm tra: 2026-08-28

Trang xem chính: `http://localhost:3000/backoffice/inventory/units`

## Phạm vi

Tám màn hình đã được kiểm tra:

- `/backoffice/inventory/units`
- `/backoffice/inventory/intake`
- `/backoffice/inventory/lookup`
- `/backoffice/inventory/units/[id]`
- `/backoffice/inventory/inspections/[id]`
- `/backoffice/inventory/locations`
- `/backoffice/inventory/stock`
- `/backoffice/inventory/stock/movements`

## Điều kiện kiểm tra

| Nhóm            |  Kích thước | Dữ liệu                                                        |
| --------------- | ----------: | -------------------------------------------------------------- |
| Desktop         | 1440 × 1000 | Quản trị viên, một máy iPhone và một dòng tồn phụ kiện         |
| Mobile          |   360 × 800 | Cùng dữ liệu; kiểm tra cuộn ngang điều hướng và bố cục một cột |
| Quyền nhân viên |     Desktop | Kiểm tra hồ sơ máy không gọi hoặc hiển thị giá vốn             |

Kiểm tra trực tiếp trên cửa sổ trình duyệt localhost cho thấy API và cơ sở dữ liệu cục bộ
không chạy. Bộ hành trình đầy đủ vì vậy dùng chính server web localhost với dữ liệu giả lập
ổn định, không ghi thay đổi vào dữ liệu thật.

## Ảnh đối chiếu

Desktop:

- [Danh sách máy](docs/assets/ui/fe-06/units-1440.png)
- [Nhập máy](docs/assets/ui/fe-06/intake-1440.png)
- [Tra cứu mã](docs/assets/ui/fe-06/lookup-1440.png)
- [Hồ sơ máy](docs/assets/ui/fe-06/unit-detail-1440.png)
- [Phiếu kiểm định](docs/assets/ui/fe-06/inspection-1440.png)
- [Địa điểm](docs/assets/ui/fe-06/locations-1440.png)
- [Tồn phụ kiện](docs/assets/ui/fe-06/stock-1440.png)
- [Lịch sử kho](docs/assets/ui/fe-06/movements-1440.png)

Mobile:

- [Danh sách máy](docs/assets/ui/fe-06/units-360.png)
- [Hồ sơ máy](docs/assets/ui/fe-06/unit-detail-360.png)
- [Phiếu kiểm định](docs/assets/ui/fe-06/inspection-360.png)
- [Tồn phụ kiện](docs/assets/ui/fe-06/stock-360.png)

## Kết quả trực quan

- Tám màn hình dùng chung điều hướng kho hàng, nhịp lưới, card, bảng và trạng thái.
- Nút “Nhập máy” giữ chữ và biểu tượng trắng trên nền xanh ở mọi trạng thái liên kết.
- Trên mobile, tab hiện tại tự cuộn vào giữa sau khi xác nhận đăng nhập và luôn nằm trọn
  trong khung điều hướng.
- Bộ lọc xếp lại thành một cột trên mobile; bảng chuyển sang cách trình bày responsive mà
  không làm tràn chiều ngang tài liệu.
- Thanh thao tác kiểm định cố định không che nội dung cần nhập; toàn bộ 18 mục vẫn truy cập
  được bằng bàn phím và có nhãn riêng.
- Phần tra cứu bỏ các từ kỹ thuật như “URL” và “bộ nhớ trình duyệt”; giá nhập máy dùng đơn
  vị “đồng”.
- Không có lỗi console hoặc tràn ngang ở 1440 px và 360 px.

## Hành trình đã kiểm tra

- Tài khoản nhân viên xem hồ sơ máy mà không phát sinh yêu cầu giá vốn.
- IMEI đầy đủ chỉ gửi trong yêu cầu tra cứu có lý do, bị xóa khỏi ô nhập sau khi gửi và
  không xuất hiện trong đường dẫn hoặc nội dung kết quả.
- Tìm kiếm và bộ lọc danh sách máy cập nhật tại chỗ, không tải lại toàn trang; chuỗi giống
  định danh đầy đủ bị chuyển sang trang tra cứu bảo vệ.
- Phiếu kiểm định có đúng 18 mục, lưu được bản nháp rồi hoàn tất; bản hoàn tất chuyển sang
  chỉ đọc.
- Thao tác nhận hàng ghi vào lịch sử, tải lại số dư chính thức và hiển thị đúng dòng biến
  động không thể sửa.
- Cả tám route đều có đúng một vùng nội dung chính và tab hiện tại hiển thị đầy đủ trên
  mobile.

## Cổng chất lượng

- Web: 76/76 tệp, 324/324 bài kiểm tra đạt.
- API: 107/107 tệp, 625/625 bài kiểm tra đạt.
- API client: 7/7 bài kiểm tra; lint, typecheck và build đạt.
- Accessibility contract: 15/15 đạt.
- Browser FE-06: 6/6 đạt.
- Production build: đạt, tạo đủ 41 trang.
- OpenAPI và mã API client tạo lại không phát sinh chênh lệch.
- PostgreSQL/Docker integration chưa chạy vì Docker Desktop đang tắt.

Kết quả cuối: **đạt**.

---

## Kiểm tra bổ sung — thiết kế lại màn nhập máy

Ngày kiểm tra: 2026-08-29

### Nguồn và trạng thái đối chiếu

- Mockup đã chọn: phương án 1, ảnh gốc `1487 × 1059`, trạng thái bước 1.
- Bản triển khai: `1280 × 720`, mật độ điểm ảnh `2`, tài khoản quản trị viên, dữ liệu thật từ môi trường Docker cục bộ.
- Ảnh triển khai: [màn nhập máy sau thiết kế lại](docs/assets/ui/fe-06/intake-redesign-1280.png).
- Ảnh hồi quy: [tra cứu IMEI sai nhưng hai trường vẫn thẳng hàng](docs/assets/ui/fe-06/lookup-error-1280.png).
- Mockup và ảnh triển khai đã được chuẩn hóa về cùng chiều cao, đặt cạnh nhau trong một ảnh so sánh trước khi đánh giá.

### Kết quả đối chiếu

- Nhóm công cụ Kho hàng đã chuyển vào sidebar trái; không còn thanh điều hướng ngang lặp lại.
- Sidebar chỉ có một mục `aria-current="page"`; “Nhập máy” được làm nổi bật đúng route.
- Tiến độ 5 bước, form hai cột, các nhóm nghiệp vụ và khối tóm tắt bên phải giữ đúng hướng thiết kế của mockup, đồng thời dùng token và cỡ chữ hiện có của rePhone.
- Tóm tắt máy cập nhật ngay theo dòng máy, nơi nhận, số mã nhận diện và giá bán; không gửi dữ liệu khi chỉ nhập thử.
- Phiếu kiểm định không đạt hoặc chỉ đạt một phần vẫn dừng ở bước Kiểm định và hiển thị “Cần xử lý”, không chuyển nhầm sang bước mở bán.
- Bước hiện tại có `aria-current="step"` và trạng thái ẩn dành cho trình đọc màn hình.
- Trạng thái IMEI sai giữ hai control tại cùng tung độ `373 px`; chiều cao lần lượt `49,5 px` và `50 px`; không có tràn ngang.
- Không có lỗi console sau khi tải trang, thay đổi dữ liệu form, chuyển route và kích hoạt trạng thái lỗi.

### Cổng chất lượng của lượt sửa

- Web lint: đạt.
- Web typecheck: đạt.
- Web test: `87/87` tệp, `390/390` bài kiểm tra đạt.
- Production build: đạt, tạo đủ `42/42` trang.
- Kiểm tra trực tiếp: nhập liệu tóm tắt, trạng thái lỗi, sidebar hiện tại và điều hướng đều đạt.

final result: passed
