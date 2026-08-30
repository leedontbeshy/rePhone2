# FE-08 System Administration Design

**Ngày khóa thiết kế:** 30/08/2026  
**Nhánh triển khai:** `feat/fe-8-system-administration`  
**Mockup đã duyệt:** [employee-master-detail-selected.png](../assets/ui/fe-08/employee-master-detail-selected.png)

## 1. Understanding summary

- FE-08 hoàn thiện khu vực quản trị hệ thống cho nhân viên, khách hàng, cấu hình cửa
  hàng, nhật ký hoạt động và trạng thái hệ thống.
- Người dùng chính là `ADMIN`; riêng danh sách và hồ sơ khách hàng cho phép
  `EMPLOYEE` đọc theo đúng projection an toàn từ máy chủ.
- Hướng giao diện đã chọn là danh sách–hồ sơ song song: danh sách ở trái để quét và
  chọn nhanh, hồ sơ đang chọn ở phải để xem hoặc thao tác mà không rời trang.
- Toàn bộ nội dung hiển thị dùng tiếng Việt tự nhiên, tránh thuật ngữ triển khai,
  enum, mã nội bộ, dữ liệu nhạy cảm hoặc thông tin cấu hình môi trường.
- Giao diện kế thừa shell, token, typography và navigation đã ổn định ở FE-07;
  không tạo một dashboard hoặc design system mới.

## 2. Scope

### 2.1 Routes

1. `/backoffice/employees`
2. `/backoffice/customers`
3. `/backoffice/settings`
4. `/backoffice/audit-logs`
5. `/backoffice/audit-logs/[id]`
6. `/backoffice/system/health`

Phạm vi API giữ theo `plan-fe.md`: Employees 7, Customers 4, Settings 3, Audit 2
và Health 2 — tổng 18 operations.

### 2.2 Explicit non-goals

- Không tạo tài khoản `ADMIN`, không đổi vai trò và không giả lập phiên người dùng.
- Không xuất nhật ký hoạt động, không tìm toàn văn trong JSON và không hiển thị dữ
  liệu chưa được che chắn.
- Không hiển thị secret, biến môi trường, chuỗi kết nối, cấu hình hạ tầng hoặc điều
  khiển lịch chạy nền.
- Không tự hợp nhất cấu hình khi có xung đột phiên bản.

## 3. Assumptions and non-functional requirements

### 3.1 Performance and scale

- Danh sách có thể đạt hàng chục nghìn bản ghi; tìm kiếm, lọc, sắp xếp và phân
  trang chạy qua máy chủ.
- Thay đổi bộ lọc giữ khung trang ổn định, không reload document và không làm trắng
  toàn bộ vùng nội dung.
- Hồ sơ được tải theo lựa chọn; không tạo N+1 request cho từng dòng danh sách.

### 3.2 Security and privacy

- Root backoffice gate phải xác định vai trò trước khi render nội dung route.
- Frontend chỉ trình bày quyền; API vẫn là nguồn quyết định cuối cùng cho mọi thao
  tác tạo, sửa, khóa, kích hoạt và đọc dữ liệu.
- Danh sách khách hàng chỉ dùng safe projection; nhật ký chi tiết chỉ hiển thị dữ
  liệu đã được che chắn từ API.
- Trang trạng thái chỉ hiển thị `Đang hoạt động`, `Sẵn sàng`, `Gián đoạn` cùng thời
  điểm kiểm tra; không đưa chi tiết hạ tầng lên UI.

### 3.3 Reliability

- Cấu hình cửa hàng dùng `expectedVersion`. Khi nhận xung đột, tải lại dữ liệu mới
  nhất và yêu cầu người dùng xem lại; không tự ghi đè hoặc tự hợp nhất.
- Thao tác đang gửi phải khóa double-submit. Sau thành công, refetch projection
  chính thức thay vì tự suy diễn trạng thái.
- Lỗi gửi lời mời, tải ảnh QR, trạng thái hệ thống suy giảm và kết quả rỗng đều có
  thông báo riêng, rõ hành động tiếp theo.

### 3.4 Responsive and accessibility

- Desktop tối ưu từ `>=1024px`. Master–detail dùng tỉ lệ khoảng 42/58 và có chiều
  cao/column ổn định để nhãn trạng thái dài không làm lệch dòng.
- Dưới `960px`, danh sách và hồ sơ xếp dọc; chọn một dòng sẽ cuộn/focus tới hồ sơ.
- Dưới `768px`, row chuyển thành card có nhãn, vẫn hoàn tất được thao tác chính ở
  320px và 390px.
- Control cao tối thiểu 44px, có focus ring, nhãn trạng thái bằng chữ, live status
  và error summary liên kết đúng trường lỗi.

## 4. Final visual design

### 4.1 Shared shell

- Giữ sidebar và topbar của FE-07; thêm nhóm `Hệ thống` mở sẵn gồm `Nhân viên`,
  `Khách hàng`, `Cấu hình cửa hàng`, `Nhật ký hoạt động`, `Trạng thái hệ thống`.
- Canvas xanh-xám rất nhạt, panel trắng, mực đậm và teal tiết chế; dùng border tạo
  cấu trúc, shadow nhẹ chỉ cho panel chính.
- Page header có eyebrow `Hệ thống`, tiêu đề, mô tả và tối đa một CTA chính.

### 4.2 Master–detail pattern

- Thanh tìm kiếm và bộ lọc nằm ngay dưới page header.
- Cột trái là danh sách dày vừa phải, avatar chữ cái, tên, thông tin phụ và status
  pill có chiều rộng/line-height ổn định. Dòng được chọn dùng nền teal nhạt và vạch
  nhấn bên trái.
- Cột phải là hồ sơ được chọn: nhận diện, trạng thái, các cặp nhãn–giá trị ổn định
  và thanh hành động ở đáy. Không nhồi form chỉnh sửa vào trạng thái đọc.
- Tạo mới/chỉnh sửa/thay đổi trạng thái dùng dialog hoặc panel chuyên biệt, giữ
  context danh sách và khôi phục focus về trigger khi đóng.

### 4.3 Route-specific adaptation

| Route | Danh sách / nội dung chính | Vùng chi tiết / thao tác |
| --- | --- | --- |
| Nhân viên | tên, email, trạng thái lời mời/tài khoản | hồ sơ, gửi lại lời mời, sửa, vô hiệu/kích hoạt |
| Khách hàng | tên, email, trạng thái, lần đăng nhập | hồ sơ an toàn, tạm khóa/kích hoạt theo vai trò |
| Cấu hình cửa hàng | form chia nhóm liên hệ, thanh toán, chính sách | phiên bản hiện tại, xem trước và vòng đời QR |
| Nhật ký hoạt động | thời gian, người thực hiện, hành động, đối tượng | chi tiết đã che chắn, request id và metadata an toàn |
| Trạng thái hệ thống | hai hàng trạng thái trực tiếp/sẵn sàng | thời điểm kiểm tra và nút kiểm tra lại |

### 4.4 Copy

- Dùng `Nhật ký hoạt động`, không dùng `Audit log` trong UI.
- Dùng `Chờ kích hoạt`, `Đang hoạt động`, `Đã vô hiệu hóa`, `Đang tạm khóa` cho
  trạng thái tài khoản.
- Dùng `Gửi lại lời mời`, `Vô hiệu hóa`, `Kích hoạt lại`, `Tạm khóa khách hàng`,
  `Lưu thay đổi`, `Kiểm tra lại` cho thao tác.
- Không nói về token, session, SMTP, projection, redaction, runtime, API hoặc mật
  khẩu do quản trị viên quản lý trong nội dung hiển thị.

## 5. Data and interaction flow

```text
Route page
  -> API adapter
    -> presenter tiếng Việt / safe view model
      -> list + selected detail
        -> dialog xác nhận hoặc form chỉnh sửa
          -> command API
            -> refetch authoritative list/detail
```

- Bộ lọc được allowlist trong state/URL, phân trang từ máy chủ và không reload trang.
- Sau khi tải danh sách, chọn bản ghi đầu tiên nếu chưa có lựa chọn hợp lệ; giữ lựa
  chọn khi refetch nếu bản ghi vẫn tồn tại.
- Lỗi theo trường được hiển thị sát control và gom trong error summary. Lỗi command
  không xóa draft hoặc lựa chọn hiện tại.

## 6. Error and edge states

- Loading ban đầu dùng skeleton đúng geometry master–detail; không ló giao diện cũ.
- Empty có mô tả theo bộ lọc và nút xóa bộ lọc.
- Lời mời gửi thất bại vẫn giữ nhân viên đã tạo và đưa ra nút gửi lại lời mời.
- Thay đổi trạng thái yêu cầu lý do 5–500 ký tự và xác nhận đúng đối tượng.
- QR chỉ nhận JPEG/PNG/WebP tối đa 5 MiB; lỗi file giữ nguyên dữ liệu form.
- Xung đột cấu hình tải lại phiên bản mới và cảnh báo người dùng xem lại.
- Health degraded/unavailable không lộ nguyên nhân nội bộ; cho phép kiểm tra lại.

## 7. Testing strategy

- Unit test API adapter, presenter trạng thái/copy, query normalization và error map.
- Component test loading/empty/error, selected row, dialog focus, validation,
  pending lock, admin/employee action visibility và stale settings.
- Browser test cho tìm/lọc không reload, tạo nhân viên, gửi lại lời mời, khóa/kích
  hoạt, khách hàng read-only theo role, QR upload, audit detail và health degraded.
- Viewport QA tại 1440, 1024, 768, 390 và 320px.
- Đối chiếu mockup đã duyệt với route nhân viên thật ở cùng viewport; báo cáo
  `design-qa.md` phải có `final result: passed` trước bàn giao.

## 8. Decision log

| Quyết định | Phương án đã cân nhắc | Lý do |
| --- | --- | --- |
| Chọn master–detail 42/58 | table thuần, danh sách ưu tiên cảnh báo | Giảm đổi trang và cho phép quét/chỉnh hồ sơ nhanh |
| Giữ shell FE-07 | shell quản trị riêng | Nhất quán, giảm rủi ro responsive và quyền truy cập |
| Dùng dialog cho command | form luôn mở trong detail | Detail dễ đọc, action nguy hiểm có ngữ cảnh/xác nhận |
| Nhóm hệ thống mở sẵn | accordion đóng/mở | Các route FE-08 đều cần truy cập trực tiếp, không ẩn cấp hai |
| Health chỉ có hai trạng thái an toàn | dashboard hạ tầng chi tiết | Đúng contract và tránh lộ cấu hình vận hành |
| Refetch sau command | cập nhật state lạc quan | API là nguồn sự thật cho vòng đời và audit |

## 9. Implementation slices

1. Khóa mockup, navigation và shared system administration primitives.
2. Employee master–detail và toàn bộ lifecycle actions.
3. Customer master–detail với role matrix.
4. Store settings, QR lifecycle và version conflict.
5. Audit list/detail và safe health view.
6. Tests, browser scenarios, responsive/design QA và tài liệu đóng FE-08.

## 10. Lượt nâng cấp chiều sâu giao diện

### 10.1 Understanding summary

- Giữ nguyên phạm vi nghiệp vụ, sáu route, quyền truy cập và toàn bộ contract FE-08.
- Khắc phục hai vấn đề đã được xác nhận: giao diện thiếu phân tầng thị giác và nội
  dung mỗi trang chưa tận dụng hết dữ liệu sẵn có.
- Tiếp tục dùng master–detail cho Nhân viên, Khách hàng và Nhật ký hoạt động; không
  đổi thành dashboard hoặc điều hướng sang trang chi tiết mới.
- Làm giàu giao diện bằng dữ liệu hiện có như ngày vào làm, đăng nhập gần nhất,
  trạng thái email, số đơn hàng, đơn gần nhất và thời điểm kiểm tra hệ thống.
- Không tạo thống kê giả, không suy diễn dữ liệu lịch sử và không thêm request chỉ
  để trang trông đầy hơn.
- Giữ tiếng Việt tự nhiên, hành động có thứ bậc, chặn quyền trước khi render và bộ
  lọc không tải lại document.

### 10.2 Phương án đã chọn

Nguồn thiết kế mới: [employee-depth-direction-selected.png](../assets/ui/fe-08/employee-depth-direction-selected.png).

Ngôn ngữ **Bảng điều hành phân tầng** được áp dụng như sau:

- Hồ sơ được chọn có vùng nhận diện với nền teal rất nhạt và dải tóm tắt ba thông
  tin quan trọng; các trường còn lại chia thành nhóm dễ quét.
- Danh sách vẫn là một mặt phẳng liên tục có phân cách hàng; không biến từng hàng
  hoặc từng trường thành card.
- Chỉ dùng elevation cho bề mặt chính. Chiều sâu đến từ khoảng cách, màu nền phân
  tầng, typography và đường phân cách trước khi dùng thêm shadow.
- Hành động chính, phụ và nguy hiểm có trọng lượng khác nhau; không kéo mọi nút
  thành cùng chiều rộng khi không cần thiết.

### 10.3 Áp dụng theo route

| Khu vực | Nội dung làm giàu bằng dữ liệu hiện có |
| --- | --- |
| Nhân viên | Dải ngày vào làm, đăng nhập gần nhất, trạng thái email; nhóm Liên hệ và Tài khoản; giữ lựa chọn hợp lệ |
| Khách hàng | Dải số đơn hàng, đơn gần nhất, đăng nhập gần nhất; nhóm Liên hệ và Hoạt động tài khoản |
| Cấu hình | Tóm tắt phí giao hàng, thời gian giữ máy, bảo hành; nhóm form có điểm neo và trạng thái lưu rõ |
| Nhật ký | Bộ lọc gọn hơn; nhận diện hành động/đối tượng rõ; trình bày thay đổi theo nhãn tiếng Việt thay cho khối dữ liệu thô khi có thể |
| Trạng thái hệ thống | Tổng quan 2/2 phép kiểm tra, độ mới kết quả, hướng xử lý theo trạng thái và giải thích ngắn về hai phép kiểm tra |
| Điều hướng | Mục hiện tại luôn nằm trọn trong vùng nhìn; thanh ngang có dấu hiệu cuộn trên màn hình hẹp |

### 10.4 Assumptions và giới hạn

- Không bổ sung chức danh, phòng ban, địa điểm làm việc, quyền chi tiết, ảnh nhân
  viên, lịch sử gửi lời mời, tổng chi tiêu khách hàng, uptime, latency hoặc nguyên
  nhân hạ tầng vì contract không cung cấp.
- Không dựng tổng số theo từng trạng thái từ một trang dữ liệu phân trang.
- Có thể sinh nhãn và tóm tắt từ chính payload hiện tại, nhưng API vẫn là nguồn sự
  thật duy nhất cho trạng thái và lifecycle.
- Responsive bắt buộc từ 320 đến 1440px; ở layout dọc phải có đường quay lại danh
  sách và không để thanh điều hướng cắt chữ mà không có affordance.

### 10.5 Decision log bổ sung

| Quyết định | Phương án đã cân nhắc | Lý do |
| --- | --- | --- |
| Chọn phương án trực quan số 1 | hồ sơ có callout lớn; hồ sơ theo timeline | Giữ gần nhất với master–detail đã duyệt, giàu thông tin nhưng ít rủi ro bịa dữ liệu |
| Dùng dải tóm tắt ba thông tin | card KPI toàn trang; biểu đồ | Tận dụng đúng field hiện có và tạo điểm nhấn mà không biến UI thành dashboard |
| Chia nhóm chi tiết | definition list phẳng; mỗi field một card | Dễ quét hơn, giảm khoảng trống và tránh card lồng card |
| Không mở rộng backend | thêm aggregate/history endpoint | Người dùng yêu cầu nâng UI; contract hiện tại đủ cho mục tiêu và giảm rủi ro scope |
| Giữ shell hiện có | thiết kế lại toàn bộ backoffice | Bảo toàn tính nhất quán với FE-05–FE-07 và giảm hồi quy điều hướng/quyền |
