# FE-06 — Quản trị máy vật lý, kiểm định và tồn kho

> Ngày chốt: 2026-08-28  
> Trạng thái: Thiết kế đã duyệt  
> Nhánh triển khai: `feat/fe-6-inventory-stock`

## 1. Tóm tắt phạm vi đã xác nhận

- Biến wizard nhập máy đơn lẻ thành workspace kho hàng đầy đủ cho nhân viên và quản trị viên.
- Quản lý iPhone theo từng máy vật lý (`InventoryUnit`) và phụ kiện theo số lượng (`StockLevel`).
- Phủ tám route FE-06 và toàn bộ 26 operation inventory, inspection, unit media và stock hiện có.
- Giữ backend làm nguồn sự thật cho quyền, vòng đời, điều kiện đưa bán, kiểm định và số dư kho.
- Bảo vệ IMEI, serial và EID: danh sách chỉ hiện dạng che; tra cứu hoặc xem đầy đủ cần lý do và chỉ tồn tại tạm thời trong bộ nhớ.
- Giá vốn là vùng riêng cho quản trị viên; tài khoản nhân viên không được gọi endpoint hoặc nhận projection giá vốn.
- Không cho sửa trực tiếp trạng thái hoặc bộ đếm tồn kho; mọi thay đổi dùng command có tên và tạo movement tương ứng.

## 2. Người dùng, mục tiêu và giới hạn

### Người dùng

- `EMPLOYEE`: nhập máy, sửa dữ liệu vận hành, kiểm định, chuyển kho, tra cứu định danh và xử lý tồn phụ kiện.
- `ADMIN`: có toàn bộ quyền của nhân viên, cộng thêm đọc/sửa giá vốn và các thao tác bị giới hạn theo giá vốn.
- `CUSTOMER` và anonymous: không truy cập workspace FE-06.

### Mục tiêu

- Nhân viên tìm đúng máy hoặc phụ kiện nhanh mà không dùng Swagger hay nhập UUID không cần thiết.
- Hồ sơ máy cho biết rõ trạng thái, vị trí, giá bán, ảnh thật, kiểm định và thao tác tiếp theo.
- Kiểm định 18 hạng mục có thể lưu nháp, tiếp tục và hoàn tất an toàn.
- Stock level và movement ledger luôn đối soát được sau nhận, chuyển, điều chỉnh và hoàn kho.

### Non-goal

- Không thêm trình sửa địa điểm, auto-restock, quản lý linh kiện sửa chữa hoặc generic JSON editor.
- Không cho chỉnh trực tiếp lifecycle, stock counter hay movement lịch sử.
- Không thay đổi state machine, quy tắc giá, reservation hoặc điều kiện đưa máy lên bán.
- Không lưu raw identifier trong URL, storage, cache, log hoặc state dùng chung lâu dài.

## 3. Giả định phi chức năng

- Quy mô mục tiêu: 20–50 nhân viên đồng thời, vài nghìn máy và movement; list tiếp tục phân trang phía máy chủ.
- Bộ lọc đồng bộ URL và cập nhật tại chỗ; không thay toàn trang bằng loading khi chỉ đổi filter.
- Mọi command refetch projection chính thức sau thành công hoặc xung đột `409`.
- Không tự retry command thay đổi trạng thái; replay và conflict được giải thích bằng tiếng Việt.
- Reuse token, shell và primitive FE-05 để giảm chi phí bảo trì; không tạo hệ thiết kế thứ hai.
- API chỉ bổ sung projection đọc cần cho UI như action readiness, media và tên hiển thị; không nới lỏng nghiệp vụ.

## 4. Kiến trúc màn hình

### 4.1. Điều hướng Kho hàng

Sidebar chính trỏ `Kho hàng` tới `/backoffice/inventory/units`. Bên trong workspace có điều hướng phụ:

1. Máy vật lý
2. Nhập máy
3. Tra cứu mã
4. Tồn phụ kiện
5. Lịch sử kho
6. Địa điểm

Các route:

- `/backoffice/inventory/units`
- `/backoffice/inventory/units/[id]`
- `/backoffice/inventory/intake`
- `/backoffice/inventory/lookup`
- `/backoffice/inventory/inspections/[id]`
- `/backoffice/inventory/locations`
- `/backoffice/inventory/stock`
- `/backoffice/inventory/stock/movements`

### 4.2. Máy vật lý

- List dùng data board responsive với tìm kiếm, trạng thái, vị trí, phân loại, SIM và pin.
- Detail là hồ sơ vận hành gồm tổng quan, thông tin thiết bị, giá bán, định danh đã che, ảnh thật và lịch sử kiểm định.
- Action rail chỉ hiển thị command được backend cho phép; command cần lý do dùng dialog xác nhận.
- Cost compartment chỉ mount và request khi role là `ADMIN`.
- Upload ảnh kiểm tra loại/tệp tối đa 8 MiB; sau upload refetch media authoritative.

### 4.3. Nhập máy và tra cứu định danh

- Wizard nhập máy giữ khả năng resume bằng `unitId`, nhưng được tách thành các bước có dữ liệu typed và copy thuần Việt.
- Product/variant/location dùng selector theo tên; không yêu cầu người dùng nhập UUID.
- Raw identifier được giữ trong form cục bộ, xóa sau khi submit thành công hoặc rời màn hình.
- Lookup yêu cầu loại định danh, giá trị và lý do 5–500 ký tự; kết quả chỉ trả projection đã che và liên kết hồ sơ máy.

### 4.4. Kiểm định

- Editor gom 18 mục theo nhóm để dễ quét, hỗ trợ lưu nháp và hoàn tất.
- Trạng thái khác “Đạt” yêu cầu ghi chú ngay tại dòng.
- Backend tự tính kết quả; UI không gửi `overallResult`.
- Bản hoàn tất chỉ đọc. Sửa sai bằng cách tạo lần kiểm định mới.
- Xung đột hoặc thay đổi quyền sở hữu draft hiển thị cảnh báo rồi refetch.

### 4.5. Tồn phụ kiện

- Stock list hiển thị phụ kiện, cấu hình, địa điểm, tồn thực, đang giữ, có thể bán và ngưỡng cảnh báo.
- Bốn command nhận kho, chuyển kho, điều chỉnh và hoàn kho dùng drawer/form typed.
- Movement ledger là append-only, có filter loại, ngày, địa điểm và tham chiếu.
- Sau command, UI refetch cả level và movement để đối soát; không sửa counter ở client.

## 5. Projection API cần bổ sung

- Unit detail trả media thuộc chính máy để render sau reload.
- Unit detail trả action/readiness projection do backend tính, bao gồm lý do chưa thể đưa bán.
- Stock movement trả tên biến thể và tên địa điểm thân thiện; stock level trả product summary.
- Inspection trả checklist đã project theo registry và thông tin kỹ thuật viên đủ dùng cho backoffice.

Các bổ sung trên chỉ là dữ liệu đọc. DTO command, state machine, transaction và RBAC giữ nguyên.

## 6. Xử lý lỗi và trạng thái biên

- Loading đầu trang dùng skeleton; đổi filter giữ dữ liệu cũ và báo “Đang cập nhật”.
- `404/403` có màn hình rõ ràng; `409` refetch; `413/415/503` hiển thị hướng xử lý tải ảnh.
- Thiếu điều kiện đưa bán hiển thị checklist readiness từ backend, không suy diễn ở frontend.
- Tra cứu không tìm thấy không làm lộ việc định danh có tồn tại ngoài quyền hiện tại.
- Stock thiếu tồn hoặc đang được giữ không tạo movement; UI giữ số dư cũ và refetch.
- EMPLOYEE không request cost ngay cả khi JavaScript đã tải component detail.

## 7. Kiểm thử và nghiệm thu

- Adapter/component tests: role projection, status copy, filter URL, media, readiness, identifier cleanup và stock reconciliation.
- API tests: projection mới, không rò cost/raw identifier, action readiness, movement enrichment.
- Interaction tests: keyboard/filter, reason dialog, draft inspection, 18 checks, command refetch và conflict.
- Browser QA trên intake, unit list/detail, lookup, inspection, stock và movements ở 1440, 1024 và 360 px.
- Kiểm tra console, focus, overflow, copy tiếng Việt, raw identifier trong DOM/storage và request cost theo role.
- DoD: 26/26 operation `DONE`, không còn P0/P1/P2, lint/typecheck/test/build xanh.

## 8. Kế hoạch commit

1. Mở hồ sơ và nền workspace FE-06.
2. Bổ sung projection API an toàn.
3. Thêm list và lookup máy vật lý.
4. Hoàn thiện intake và hồ sơ máy.
5. Thêm editor/lịch sử kiểm định.
6. Thêm địa điểm và tồn phụ kiện.
7. Thêm movement ledger và command kho.
8. Hoàn thiện responsive, tests và browser evidence.

## 9. Decision log

| Quyết định | Phương án đã cân nhắc | Lý do chọn |
| --- | --- | --- |
| Dùng workspace tám route | Dashboard một trang; mở rộng wizard cũ | Khớp contract, dễ deep-link và tránh component nguyên khối |
| Kế thừa FE-05 | Tạo giao diện kho mới hoàn toàn | Đồng nhất backoffice và giảm bảo trì |
| Bổ sung projection đọc | Frontend tự suy diễn; chỉ xử lý `409` | Giữ backend authoritative và UX rõ ràng |
| Tách iPhone và phụ kiện theo mô hình tồn | Gộp mọi thứ vào một bảng/form | Phản ánh đúng `SERIALIZED` và `QUANTITY` |
| Raw identifier chỉ tồn tại tạm thời | Lưu session/local storage để tiện thao tác | Bảo vệ dữ liệu nhạy cảm và đúng audit contract |
| Cost compartment chỉ ADMIN mount/request | Fetch rồi ẩn bằng CSS | Không rò dữ liệu và kiểm thử quyền rõ ràng |
| Chia commit theo lát cắt | Một commit tổng | Dễ review, rollback và truy vết lỗi |
