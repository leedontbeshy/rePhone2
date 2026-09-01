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

# Design QA — FE-08 phân tầng và làm giàu nội dung

Ngày kiểm tra: 2026-08-30

### Nguồn và trạng thái đối chiếu

- Hướng thiết kế được duyệt: **phương án 1 — Bảng điều hành phân tầng**.
- Ảnh nguồn: [mockup Quản lý nhân viên đã chốt](docs/assets/ui/fe-08/employee-depth-direction-selected.png).
- Ảnh triển khai chính: [Quản lý nhân viên ở desktop](docs/assets/ui/fe-08/refinement/01-employees-layered-desktop.png).
- Hai ảnh được chuẩn hóa về cùng khung nhìn đầu trang `1440 × 900` trước khi đánh giá.
- Bằng chứng đặt cạnh nhau: [mockup và bản triển khai](docs/assets/ui/fe-08/refinement/qa-employees-layered-comparison.png).
- Dữ liệu trong mockup là dữ liệu minh họa; bản triển khai dùng dữ liệu vận hành thật nên tên,
  email và trạng thái khác nhau. Việc đối chiếu tập trung vào phân cấp, nhịp lưới, trạng thái chọn
  và khả năng đọc.

### Ảnh triển khai

- [Quản lý nhân viên](docs/assets/ui/fe-08/refinement/01-employees-layered-desktop.png).
- [Quản lý khách hàng](docs/assets/ui/fe-08/refinement/02-customers-layered-desktop.png).
- [Cấu hình cửa hàng](docs/assets/ui/fe-08/refinement/03-settings-layered-desktop.png).
- [Nhật ký hoạt động](docs/assets/ui/fe-08/refinement/04-audit-layered-desktop.png).
- [Trạng thái hệ thống](docs/assets/ui/fe-08/refinement/05-health-layered-desktop.png).
- [Nhân viên ở vùng nhìn hẹp](docs/assets/ui/fe-08/refinement/01-employees-layered.png).
- [Nhật ký ở vùng nhìn hẹp](docs/assets/ui/fe-08/refinement/04-audit-layered-narrow.png).
- [Trạng thái hệ thống ở vùng nhìn hẹp](docs/assets/ui/fe-08/refinement/05-health-layered-narrow.png).

### Kết quả đối chiếu

- Nhân viên và khách hàng dùng cùng cấu trúc master–detail: hàng đang chọn, hero hồ sơ, dải
  tóm tắt ba mục, nhóm thông tin và thanh hành động có thứ bậc rõ.
- Cấu hình cửa hàng có bốn nhóm biểu mẫu và rail tóm tắt dùng chính dữ liệu đang áp dụng;
  trạng thái đã lưu, chưa lưu, đang lưu và xung đột đều phân biệt được.
- Nhật ký đưa ba bộ lọc chính và thao tác lên cùng hàng; bộ lọc chi tiết có số điều kiện đang
  nhập. Chi tiết hoạt động được chuyển từ khối dữ liệu thô thành nhóm thông tin tiếng Việt;
  dữ liệu lạ chỉ nằm trong vùng kỹ thuật thu gọn.
- Trạng thái hệ thống có ba tín hiệu tóm tắt, hướng dẫn cách đọc và khuyến nghị vận hành;
  độ mới kết quả cập nhật theo thời gian mà không gọi thêm máy chủ.
- Điều hướng hệ thống ở màn hình hẹp tự đưa mục hiện tại vào vùng nhìn thấy và hiển thị dấu
  hiệu cuộn ở đúng mép.

### Các vòng sửa sau review

- Ngăn bảng chi tiết tự chuyển sang tài khoản khác khi bản ghi vừa đổi trạng thái không còn
  khớp bộ lọc; thông báo và hành động tiếp theo luôn gắn với đúng tài khoản vừa thao tác.
- Sửa cấu trúc `dt`/`dd` để công cụ hỗ trợ giữ đúng quan hệ nhãn–giá trị.
- Ngày chỉ có phần ngày không còn xuất hiện giờ giả; các trạng thái phổ biến trong nhật ký
  được chuyển hoàn toàn sang tiếng Việt. Enum lạ và payload không phải object vẫn được giữ
  trong vùng kỹ thuật, không bị báo nhầm là không có dữ liệu.
- Bỏ thanh cuộn lồng của chi tiết nhật ký; toàn workspace chỉ dùng cuộn trang và cuộn sidebar.
- Dòng nhật ký đang chọn có `aria-current="page"` thống nhất với danh sách người dùng.
- Giảm một nhịp khoảng trắng nội bộ của thẻ Trạng thái hệ thống. Ở desktop, `scrollHeight`
  và `clientHeight` đều bằng `900 px`; không còn thanh cuộn dọc thừa `6 px`.

### Kiểm tra trực tiếp

- Desktop `1440 × 900`: năm workspace không tràn ngang, không có lỗi hoặc cảnh báo console.
- Vùng nhìn hẹp `679 × 675`: điều hướng hiện tại nằm trọn trong khung, form và các dải tóm
  tắt chuyển thành một cột, tài liệu không tràn ngang.
- Chọn bản ghi thứ hai ở Nhân viên, Khách hàng và Nhật ký cập nhật đúng URL, chi tiết và
  trạng thái chọn.
- Nút Kiểm tra lại cập nhật thời điểm; Cấu hình cửa hàng giữ đúng trạng thái chưa lưu/đã lưu.

### Cổng chất lượng của lượt nâng cấp

- Web test: `117/117` tệp, `544/544` bài kiểm tra đạt.
- Web lint: đạt, không có cảnh báo.
- Web typecheck: đạt.
- Production build: đạt; đầy đủ sáu route FE-08.
- Kiểm tra khoảng trắng thay đổi: đạt.

final result: passed

---

# Design QA — FE-08 quản trị hệ thống

Ngày kiểm tra: 2026-08-30

Trang xem chính: `http://localhost:3000/backoffice/employees`

## Phạm vi

Năm workspace, tương ứng sáu route, đã được kiểm tra:

- `/backoffice/employees`
- `/backoffice/customers`
- `/backoffice/settings`
- `/backoffice/audit-logs`
- `/backoffice/audit-logs/[id]`
- `/backoffice/system/health`

## Nguồn và trạng thái đối chiếu

- Mockup được duyệt: [quản lý nhân viên — phương án 2](docs/assets/ui/fe-08/employee-master-detail-selected.png).
- Bản triển khai: tài khoản quản trị viên, danh sách nhân viên đã tải và hồ sơ đầu tiên được chọn.
- Vùng nhìn logic dùng để kiểm tra là `1280 × 720`; ảnh trình duyệt lưu ở `1265 × 712` do phần viền của cửa sổ nhúng.
- Mockup được co và cắt về cùng vùng nhìn trước khi đánh giá, không thay đổi nội dung thiết kế.
- Ảnh đối chiếu kết hợp: [mockup và bản triển khai](docs/assets/ui/fe-08/qa-employees-comparison.png).

## Ảnh kiểm tra

- [Quản lý nhân viên](docs/assets/ui/fe-08/qa-employees-1280.png).
- [Quản lý khách hàng](docs/assets/ui/fe-08/qa-customers-1280.png).
- [Cấu hình cửa hàng](docs/assets/ui/fe-08/qa-settings-1280.png).
- [Nhật ký hoạt động](docs/assets/ui/fe-08/qa-audit-1280.png).
- [Trạng thái hệ thống](docs/assets/ui/fe-08/qa-health-1280.png).

## Kết quả đối chiếu và các vòng sửa

- Bản triển khai giữ đúng cấu trúc master–detail, thẻ hồ sơ, hàng đang chọn, nhịp khoảng cách và màu chủ đạo của mockup.
- Sidebar tiếp tục mở đầy đủ theo yêu cầu trước đó của người dùng và giữ chiều rộng chung của workspace vận hành; đây là khác biệt có chủ đích so với mockup rút gọn.
- Dữ liệu thật có tên, email và mã nhân viên dài hơn mockup; danh sách vẫn cắt chữ an toàn và cột trạng thái không làm xô lệch chi tiết.
- Lần kiểm tra đầu phát hiện hồ sơ cũ vẫn còn sau khi đổi bộ lọc. Bản sửa hiện xóa lựa chọn ngay khi tìm kiếm, đổi trạng thái hoặc đổi sắp xếp.
- Vòng đối chiếu đầu có viền lấy nét thừa quanh tiêu đề được lấy nét bằng chương trình. Viền này đã được bỏ khỏi tiêu đề không tương tác, không ảnh hưởng focus của nút và trường nhập.
- Lỗi tổng của biểu mẫu cấu hình từng còn lại sau khi người dùng sửa trường sai. Bản sửa hiện xóa lỗi cũ ngay khi nội dung được điều chỉnh; lỗi riêng từng trường và trạng thái xung đột vẫn giữ đúng chức năng.
- Liên kết xem ảnh QR thông báo rõ việc mở trong thẻ mới cho trình đọc màn hình.

## Quyền và hành trình đã kiểm tra trực tiếp

- Quản trị viên mở được cả năm workspace, lọc danh sách không tải lại toàn trang và xem được hồ sơ chi tiết.
- Nhân viên bị chặn ngay tại quản lý nhân viên, không nhìn thấy nội dung bên trong; quản lý khách hàng chỉ có quyền xem và không có thao tác đổi trạng thái.
- Khách hàng truy cập link quản trị bị chặn trước khi shell quản trị xuất hiện.
- Cấu hình cửa hàng xử lý trường bắt buộc, giới hạn giá trị tiền, thay đổi chưa lưu, xung đột phiên bản và ảnh QR.
- Nhật ký chỉ hiển thị dữ liệu đã được làm sạch; danh sách, bộ lọc, phân trang và chi tiết giữ cùng workspace.
- Trạng thái hệ thống phân biệt sẵn sàng, suy giảm và không kết nối; nút kiểm tra lại hoạt động tại chỗ.

## Cổng chất lượng

- Web test: `117/117` tệp, `535/535` bài kiểm tra đạt.
- API unit test: `110/110` tệp, `670/670` bài kiểm tra đạt.
- API E2E cấu hình/nhật ký: `6/6` đạt, bao gồm biên tiền 15/16 chữ số và không ghi thay đổi khi dữ liệu sai.
- Frontend coverage contract: `4/4` đạt; FE-08 có `18/18` operation `DONE`, toàn ledger `160/160` `DONE`.
- Web/API lint và typecheck: đạt.
- Production build: đạt; route `/backoffice/system/health` có trong kết quả build.
- Kiểm tra khoảng trắng thay đổi: đạt.

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
| ---------: | :--------: | :-----------------: | :-----------: | :----------: |
|    1440 px |   Không    |       1 vùng        |   1 tiêu đề   | Trong khung  |
|    1024 px |   Không    |       1 vùng        |   1 tiêu đề   | Trong khung  |
|     768 px |   Không    |       1 vùng        |   1 tiêu đề   | Trong khung  |
|     390 px |   Không    |       1 vùng        |   1 tiêu đề   | Trong khung  |
|     320 px |   Không    |       1 vùng        |   1 tiêu đề   | Trong khung  |

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
| ---------: | :------------: | :------: | :--------: | :--------: |
|    1440 px |      Đạt       |   Đạt    |   Không    |   Không    |
|    1024 px |      Đạt       |   Đạt    |   Không    |   Không    |
|     768 px |      Đạt       |   Đạt    |   Không    |   Không    |
|     390 px |      Đạt       |   Đạt    |   Không    |   Không    |
|     320 px |      Đạt       |   Đạt    |   Không    |   Không    |

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

---

# Design QA — Làm rõ chi tiết đơn hàng backoffice

Ngày kiểm tra: 2026-09-01

Route: `/backoffice/orders/[id]`

Ảnh chuẩn: `docs/assets/ui/fe-08/order-detail-refinement/reference.png`

## Bằng chứng trực quan

- Bản triển khai desktop: `docs/assets/ui/fe-08/order-detail-refinement/implementation-1440.png`.
- So sánh ảnh chuẩn và bản triển khai trong cùng một khung: `docs/assets/ui/fe-08/order-detail-refinement/comparison.png`.
- Trạng thái mở biểu mẫu xử lý: `docs/assets/ui/fe-08/order-detail-refinement/action-open-1440.png`.
- Bản responsive 390 × 844: `docs/assets/ui/fe-08/order-detail-refinement/mobile-390.png`.

Ảnh chuẩn 1487 × 1058 được đặt cạnh ảnh chụp từ viewport kiểm tra 1440 × 1024 và
scale về cùng khung 1440 × 1024 cho bước so sánh cuối.

## Các vòng sửa sau đối chiếu

1. Dải tổng quan ban đầu làm mã đơn và chip trạng thái xuống dòng. Đã giảm padding theo
   token, phân bổ lại cột và khóa chip trạng thái trên một dòng.
2. Nội dung chính ban đầu thấp hơn ảnh chuẩn vì panel còn quá thoáng. Đã giảm khoảng cách
   header cục bộ, nới cột nội dung và giữ rail ở mật độ vận hành.
3. Nhãn mở biểu mẫu trong rail bị xuống dòng. Đã dùng cỡ label, giảm gap/padding và giữ
   vùng bấm tối thiểu 44 px.
4. Ở 390 px, dải tổng quan một cột đẩy hành động xuống quá sâu. Đã dùng bố cục hai cột với
   mã đơn chiếm toàn hàng; rail hành động xuất hiện trước phần nội dung dài.

## Kết quả theo rubric

| Bề mặt                    | Kết quả                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bố cục và phân cấp        | Dải tổng quan, sản phẩm, khách hàng, timeline, action rail và tài chính đúng thứ tự của phương án 1. Rail sticky trên desktop, chuyển lên trước main ở màn hẹp. |
| Typography và khoảng cách | Không còn nhãn/chip bị cắt; mã đơn desktop không xuống dòng; panel dùng cùng token chữ và khoảng cách của rePhone.                                              |
| Màu và trạng thái         | Dùng token brand/surface hiện có; chip trạng thái giữ tone success/warning/danger từ projection, không hiển thị enum thô.                                       |
| Hình ảnh và icon          | DTO đơn hàng không có URL ảnh sản phẩm. Bản triển khai dùng `DeviceMobileIcon` trung tính từ Phosphor, không tự dựng hoặc gán sai ảnh máy.                      |
| Tương tác                 | Action chỉ lấy từ `availableActions`; biểu mẫu dùng disclosure native, đóng mặc định, mở/đóng được và giữ nguyên validation/submit hiện có.                     |
| Responsive                | Desktop 1440 × 1024 và mobile 390 × 844 không chồng lấn hay cắt control; timeline ngang tự chuyển dọc dưới 48 rem.                                              |
| Accessibility             | Một `h1`; trạng thái có chữ và màu; timeline là `ol`; thông tin là `dl/dt/dd`; disclosure dùng `details/summary`; focus-visible và vùng bấm tối thiểu được giữ. |

## Sai khác có chủ đích so với ảnh chuẩn

- Không dùng ảnh iPhone trong panel sản phẩm vì dữ liệu authoritative hiện tại không cung
  cấp media cho order item. Dùng icon trung tính để tránh trình bày sai chiếc máy.
- Giữ sidebar, breadcrumb, token và primitive hiện hành của backoffice thay vì thay shell
  theo ảnh tạo mẫu.

## Kiểm tra mã nguồn

- ESLint: đạt.
- TypeScript: đạt.
- Next.js production build: đạt.
- Vitest tập trung: 4 file, 33 test đạt.
- `git diff --check`: đạt.

Không còn finding P0, P1 hoặc P2 trong phạm vi màn chi tiết đơn hàng.

final result: passed
