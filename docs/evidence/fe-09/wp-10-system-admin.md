# FE-09 WP-10 — Hoàn thiện quản trị hệ thống

> Trạng thái: **PASS**  
> Routes FE-8: `/backoffice/employees`, `/backoffice/customers`,
> `/backoffice/settings`, `/backoffice/audit-logs`,
> `/backoffice/audit-logs/[id]`, `/backoffice/system/health`  
> Route kiểm thử chéo: `/backoffice`  
> Phạm vi commit: `945105b` → `37527d7`  
> Cây code/browser cuối: `37527d7`  
> Ngày kiểm tra: 02/09/2026

## Kết quả triển khai

| Concern | Commit | Kết quả |
| --- | --- | --- |
| Dọn QR cũ an toàn | `945105b` | Chỉ dọn object QR cũ sau khi transaction mới đã commit; lỗi provider không rollback cấu hình mới và không xóa nhầm object hiện tại |
| Khóa mutation cùng frame | `f4b45d4` | Nhân viên, khách hàng, cấu hình và QR không gửi lặp command trong cùng lượt thao tác |
| Master-detail người dùng | `bbaca6e`, `9575c11` | Detail-only loading, loại response cũ, giữ list/scroll/focus và retry lỗi chi tiết không refetch collection |
| QR retry và settings CAS | `e29722d`, `cc5df77` | Tệp hợp lệ được giữ khi provider lỗi; retry hoạt động; hai cách xử lý conflict đều rebase theo version chính thức |
| Audit workspace | `708a5c5` | Filter, legacy deep link, detail-only loading, stale response, redaction presentation và retry cục bộ |
| Health và overview state | `49a0b4d`, `56cd39c` | Đủ healthy/degraded/unavailable/not-configured; live UI được đối chiếu trực tiếp với snapshot backend |
| Live smoke chỉ đọc | `b827261` | Không còn đổi rồi khôi phục tên cửa hàng; xác nhận zero backoffice mutation trong smoke |
| Accessibility remediation | `c83406e`, `5381d17`, `aa18e48`, `3f20abe`, `7f230e6` | Sửa contrast dashboard, người dùng, cấu hình, audit, health và cấu trúc definition list hợp lệ |
| Route, role và visual matrix | `ee1e837` | Sáu route FE-8 cùng overview được kiểm tra desktop/mobile; chặn sai quyền trước child request |
| Workspace format gate | `37527d7` | Chuẩn hóa bốn file tồn đọng để full Prettier gate trở lại xanh; không đổi behavior |

## Người dùng và trạng thái master-detail

- Chọn hồ sơ chỉ tải vùng chi tiết; danh sách đã tải không bị thay bằng skeleton.
- Response detail đến trễ không thể ghi đè hồ sơ đang được chọn. Scenario customer
  cố ý cho response B chậm hơn A để khóa hành vi này.
- Lỗi detail `503` giữ collection, vị trí cuộn và focus. Thử lại chỉ gọi detail,
  xóa lỗi cục bộ và đưa focus về heading hồ sơ đã phục hồi.
- Mutation tạo/sửa/gửi lại lời mời/vô hiệu hóa hoặc khóa khách hàng dùng lock đồng
  bộ. Conflict tải lại projection chính thức thay vì tự suy diễn trạng thái.
- EMPLOYEE chỉ đọc khách hàng; control thay đổi trạng thái và request tương ứng chỉ
  tồn tại với ADMIN.

## Cấu hình cửa hàng và QR chuyển khoản

- Save cấu hình dùng compare-and-swap theo `version`. Cả lựa chọn dùng dữ liệu mới
  nhất và tiếp tục với bản nháp đều giữ draft có chủ đích, rebase version và chỉ gửi
  một request.
- Picker QR là control tùy biến có nhãn; kiểm tra file sai, upload progress, provider
  `503`, retry và success. Sau provider failure, file hợp lệ vẫn được giữ để thử lại.
- QR stale version được API E2E trả `409 SETTINGS_VERSION_CONFLICT` theo cùng ranh
  giới CAS. Dọn QR cũ là best-effort sau commit và không làm mất cấu hình mới.
- Public store projection không lộ số tài khoản, ngân hàng, QR object path, version
  hoặc người cập nhật.

## Nhật ký hoạt động và privacy boundary

- Bộ lọc tạo đúng query; legacy detail URL chuyển về list với `selected` mà vẫn mở
  đúng hồ sơ.
- Loading/error/retry chỉ thuộc vùng chi tiết, không tải lại list hoặc kéo người dùng
  về đầu trang. Response cũ không ghi đè selection mới.
- Backend là privacy boundary: sanitizer được áp dụng lại khi đọc cả list và detail.
  API E2E chèn bản ghi lịch sử chứa password, số tài khoản và storage path rồi xác
  nhận các giá trị này không xuất hiện trong response.
- Browser fixture nhận projection đã che và chứng minh UI không làm rò dữ liệu riêng
  từ list sang DOM; không dùng fixture để tuyên bố frontend tự sanitize raw secret.

## Trạng thái hệ thống và tổng quan vận hành

- Health backend đọc probe API, database, storage và mail; không hardcode toàn bộ ở
  trạng thái thành công. Ma trận UI phủ ổn định, hạn chế, gián đoạn và chưa cấu hình.
- Khi refresh health lỗi, snapshot hợp lệ gần nhất vẫn hiển thị cùng cảnh báo dữ liệu
  cũ. Live smoke so trực tiếp state trong response backend với heading và nhãn của
  từng dependency trên DOM.
- Overview dùng metric, ưu tiên và đơn hàng có shape thật; refresh chỉ cập nhật vùng
  dashboard, giữ snapshot khi request sau lỗi.
- Lối tắt được giới hạn theo role: ADMIN có system administration shortcuts;
  EMPLOYEE chỉ thấy công việc được phép.

## Role matrix và fail-closed

| Vai trò | Kết quả browser |
| --- | --- |
| ADMIN | Mở đủ sáu route FE-8 và overview; API child được gọi sau khi role xác nhận |
| EMPLOYEE | Mở overview và customers; bị chặn employees, settings, audit list, audit legacy detail và health trước child request |
| CUSTOMER | Bị chặn toàn backoffice tại access gate; scenario đại diện xác nhận không có child request |
| Anonymous | Bị chặn toàn backoffice tại access gate; scenario đại diện xác nhận không có child request |

API E2E kiểm thêm `401/403/200` trên user operations, settings, health và audit;
browser matrix chứng minh protected child không render hoặc fetch trước khi quyền
được xác định.

## Responsive, accessibility và visual evidence

Route matrix chạy tại `1440×900` và `360×844` cho toàn bộ route ADMIN, cùng overview
và customers của EMPLOYEE. Mỗi trang kiểm tra shell, heading/state, active navigation
trong viewport và `scrollWidth <= clientWidth`. Legacy audit detail còn kiểm tra URL
canonical sau redirect.

Axe chạy với WCAG 2 A/AA, 2.1 AA và 2.2 AA; kết quả cuối bằng zero
serious/critical. Permission states cũng được đo Axe và overflow riêng. Các lần đỏ
đầu đã bắt lỗi thật về contrast và definition-list semantics; năm commit remediation
được giữ tách biệt trong lịch sử thay vì xóa dấu vết.

Lượt có `FE09_CAPTURE_SCREENSHOTS=1` tạo 25 ảnh current-run trong
`.local/fe09/wp10-audit/`. Toàn bộ 25 ảnh đã được review trực quan ở đúng state và
viewport sau remediation. Screenshot chỉ là visual evidence; Axe, role/request,
focus, URL và geometry assertions là bằng chứng tự động độc lập.

## Test evidence

| Gate | Kết quả tại tree cuối |
| --- | --- |
| Full web unit/component | PASS — 138 file, 674/674 test |
| API unit/service WP-10 | PASS — 10 file, 79/79 test |
| API E2E WP-10 | PASS — 3 file, 15/15 test trên DB sạch |
| Browser WP-10 lượt A, có capture | PASS — 12/12, Chromium, 1 worker, khoảng 1,8 phút |
| Browser WP-10 lượt B | PASS — 12/12, Chromium, 1 worker, khoảng 1,7 phút |
| Executable coverage | PASS — 2 file, 9/9 test; 56 route giữ đúng một primary owner |
| Shared accessibility contract | PASS — 4 file, 21/21 test |
| Web/API typecheck | PASS |
| Web/API lint | PASS, zero warning |
| Full format check | PASS |
| Production build | PASS — API/web; Next sinh đủ route hiện hành |
| `git diff --check` | PASS |
| Visual review | PASS — 25/25 ảnh current-run |

Playwright có warning môi trường `NO_COLOR`/`FORCE_COLOR`, Node `DEP0190` và Docker
orphan-container notice; tất cả command thoát `0`. Không dùng `--remove-orphans` vì
đó là cleanup destructive ngoài phạm vi WP-10.

## Acceptance mapping

| Acceptance WP-10 | Đánh giá |
| --- | --- |
| ADMIN/EMPLOYEE/CUSTOMER/anonymous role matrix deterministic | **PASS** — UI chặn sai quyền trước child request; API E2E kiểm authorization đại diện |
| Stale settings 409, session revoke, audit redaction và provider degradation xanh | **PASS** — browser + API unit/E2E chia đúng trust boundary |
| Sáu route FE-8 có responsive/Axe/visual evidence | **PASS** — đủ desktop/mobile, zero serious/critical, không document overflow và 25 ảnh đã review |

WP-10 không còn blocker triển khai đã biết trong contract hiện tại. Tại thời điểm
đóng WP-10, `FE9-R13`–`FE9-R16` vẫn mở và không được đóng bằng bằng chứng system
administration. Remediation riêng ở WP-14 đã đóng `FE9-R13`–`FE9-R15`; `FE9-R16`
vẫn còn mở.
