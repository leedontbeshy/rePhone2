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

---

# Design QA — FE-07 vận hành đơn hàng và hậu mãi

Ngày kiểm tra: 2026-08-29

Trang xem chính: `http://localhost:3000/backoffice/orders/01a02a39-3b79-7434-8b82-4c116e08b526`

## Phạm vi

Mười một màn hình đã được kiểm tra:

- Danh sách và chi tiết đơn hàng.
- Danh sách và chi tiết thanh toán.
- Danh sách và chi tiết hoàn tiền.
- Danh sách và chi tiết hỗ trợ sau mua.
- Danh sách và chi tiết bảo hành.
- Danh sách và chi tiết chính sách bảo hành trong cùng một workspace.

## Nguồn và điều kiện đối chiếu

- Mockup được duyệt: [chi tiết đơn hàng — phương án 1](docs/assets/ui/fe-07/order-detail-selected.png).
- Bản chạy thực tế dùng tài khoản Admin Demo, API và dữ liệu Supabase trong môi trường Docker cục bộ.
- Trạng thái đối chiếu là đơn hàng đang hoạt động; quá trình QA không xác nhận thao tác làm thay đổi nghiệp vụ thật.
- Bản triển khai đã được đặt cạnh mockup ở cùng kích thước trước khi đánh giá bố cục.

## Ảnh kiểm tra

- [Chi tiết đơn hàng — phần đầu desktop](docs/assets/ui/fe-07/qa/order-detail-1440.png).
- [Chi tiết đơn hàng — phần cuối desktop](docs/assets/ui/fe-07/qa/order-detail-1440-bottom.png).
- [Chi tiết đơn hàng — mobile](docs/assets/ui/fe-07/qa/order-detail-390.png).
- [Chi tiết hỗ trợ sau mua](docs/assets/ui/fe-07/qa/after-sales-detail-1440.png).
- [Chính sách bảo hành](docs/assets/ui/fe-07/qa/warranty-policies-1440.png).

## Kết quả trực quan và tương tác

- Workspace giữ đúng hướng mockup: tiêu đề đơn hàng rõ ràng, liên kết quay lại, ba trục trạng thái, vùng nội dung chính và thanh “Xử lý đơn hàng”.
- Các lựa chọn trong thanh xử lý là control nhẹ; chỉ nút xác nhận hành động là nút chính, tránh tạo nhiều điểm nhấn cạnh tranh.
- Tab hiện tại tự căn vào vùng nhìn thấy khi tải trực tiếp hoặc đổi kích thước từ desktop sang mobile.
- Danh sách chính sách bảo hành không còn chồng lên thanh thao tác ở desktop; trên mobile, các trường và nút được xếp thành từng hàng riêng.
- Phiếu kiểm định nhúng trong hồ sơ hỗ trợ dùng tiêu đề cấp hai, không tạo thêm tiêu đề trang hoặc vùng nội dung chính lồng nhau.
- Bộ lọc đơn hàng cập nhật tại chỗ, không làm trắng hoặc tải lại toàn trang; chuyển chính sách và lựa chọn hành động cập nhật đúng trạng thái đã chọn.
- Không thấy nội dung kỹ thuật dành cho lập trình viên trong giao diện khách hàng hoặc nhân viên.

## Ma trận responsive

| Chiều rộng | Tràn ngang | Vùng nội dung chính | Tiêu đề trang | Nút xác nhận |
| ---------: | :--------: | :-----------------: | :------------: | :-----------: |
|    1440 px |   Không    |        1 vùng        |   1 tiêu đề    | Trong khung   |
|    1024 px |   Không    |        1 vùng        |   1 tiêu đề    | Trong khung   |
|     768 px |   Không    |        1 vùng        |   1 tiêu đề    | Trong khung   |
|     390 px |   Không    |        1 vùng        |   1 tiêu đề    | Trong khung   |
|     320 px |   Không    |        1 vùng        |   1 tiêu đề    | Trong khung   |

## Quyền truy cập và độ tin cậy

- Cổng quyền của khu vực vận hành giữ nguyên nguyên tắc chặn trước khi hiển thị nội dung quản trị.
- Các thao tác tài chính, bảo hành và hậu mãi dùng kết quả chính thức từ máy chủ; lỗi, xung đột và thao tác lặp được xử lý trong bộ kiểm thử.
- Chính sách bảo hành đang được áp dụng không thể bị lưu đè làm thay đổi ngược các bảo hành đã phát hành.

## Cổng chất lượng

- Web: lint và typecheck đạt; production build đạt, tạo đủ `42/42` trang.
- Web test: `108/108` tệp, `489/489` bài kiểm tra đạt.
- API test: `109/109` tệp, `666/666` bài kiểm tra đạt.
- API client: `7/7` bài kiểm tra đạt; lint, typecheck và build đạt.
- API E2E trọng điểm: `5/5` đạt; kiểm thử tích hợp: `7/7` đạt.
- Phạm vi FE-07: `53/53` thao tác được đánh dấu hoàn tất.

final result: passed

---

## Kiểm tra bổ sung — độ thẳng hàng, chiều sâu và điều hướng FE-07

Ngày kiểm tra: 2026-08-29

### Phạm vi phản hồi

- Cố định lưới của danh sách hỗ trợ sau mua và bảo hành để nhãn trạng thái dài hoặc ngắn
  không làm xô lệch các cột còn lại.
- Căn nội dung của danh sách đơn hàng, thanh toán và hoàn tiền theo mép trên khi một ô có
  nhiều dòng hơn ô bên cạnh.
- Tăng phân cấp thị giác bằng bóng đổ nhẹ, nền phân tầng và đường phân cách nhất quán.
- Giữ mở sẵn bốn nhóm điều hướng trên mọi màn hình vận hành: Vận hành, Kho hàng, Đơn hàng
  và Sau mua.

### Ảnh kiểm tra

- [Đối chiếu phản hồi và bản hoàn thiện](docs/assets/ui/fe-07/qa/after-sales-reference-comparison.png).
- [Hỗ trợ sau mua — desktop](docs/assets/ui/fe-07/qa/after-sales-list-aligned-1440.png).
- [Hỗ trợ sau mua — mobile](docs/assets/ui/fe-07/qa/after-sales-list-aligned-390.png).
- [Bảo hành — desktop](docs/assets/ui/fe-07/qa/warranties-list-aligned-1440.png).
- [Bảo hành — tablet](docs/assets/ui/fe-07/qa/warranties-list-aligned-1024.png).
- [Bảo hành — mobile](docs/assets/ui/fe-07/qa/warranties-list-aligned-390.png).
- [Bảo hành — nhãn dài ở cuối danh sách](docs/assets/ui/fe-07/qa/warranties-long-status-1440.png).
- [Điều hướng mở sẵn tại Hỗ trợ sau mua](docs/assets/ui/fe-07/qa/navigation-expanded-after-sales-1440.png).
- [Điều hướng mở sẵn tại Danh mục](docs/assets/ui/fe-07/qa/navigation-expanded-catalog-1440.png).

### Kết quả đo trực tiếp trong trình duyệt

| Chiều rộng | Hỗ trợ sau mua | Bảo hành | Tràn ngang | Chồng hàng |
| ---------: | :------------: | :------: | :---------: | :---------: |
|    1440 px |      Đạt       |   Đạt   |    Không    |    Không    |
|    1024 px |      Đạt       |   Đạt   |    Không    |    Không    |
|     768 px |      Đạt       |   Đạt   |    Không    |    Không    |
|     390 px |      Đạt       |   Đạt   |    Không    |    Không    |
|     320 px |      Đạt       |   Đạt   |    Không    |    Không    |

- Trên desktop, mọi nhãn trạng thái trong từng danh sách dùng chung một mép phải; nhãn
  “Còn hiệu lực” và “Không còn hiệu lực” đều cao `28 px`.
- Ở 1024 px, bộ lọc bảo hành chuyển thành hai cột nên nút thao tác không bị cắt và tài liệu
  không phát sinh thanh cuộn ngang.
- Ở 320 px, trạng thái chuyển xuống một hàng riêng; từ 390 px trở lên vẫn giữ một cột trạng
  thái dùng chung cho toàn danh sách.
- Danh sách đơn hàng, duyệt thanh toán và hoàn tiền không tràn ngang; nội dung nhiều dòng
  không làm các ô kế bên bị căn giữa lệch nhịp.
- Điều hướng dùng chung có đủ `4` nhóm và `15` mục tại các khu vực vận hành, danh mục và kho.

### Cổng chất lượng của lượt sửa

- Web test: `108/108` tệp, `489/489` bài kiểm tra đạt.
- Web lint: đạt, không có cảnh báo.
- Web typecheck: đạt.
- Production build: đạt, tạo đủ `42/42` trang.
- Kiểm tra khoảng trắng của thay đổi: đạt.

final result: passed
