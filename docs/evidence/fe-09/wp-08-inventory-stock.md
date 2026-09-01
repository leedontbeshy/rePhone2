# FE-09 WP-08 — Inventory và stock hardening

> Trạng thái: **PASS**<br>
> Routes: `/backoffice`, `/backoffice/inventory/units`,
> `/backoffice/inventory/units/[id]`, `/backoffice/inventory/intake`,
> `/backoffice/inventory/lookup`, `/backoffice/inventory/inspections/[id]`,
> `/backoffice/inventory/locations`, `/backoffice/inventory/stock`,
> `/backoffice/inventory/stock/movements`<br>
> Phạm vi commit: `b76cd3f` → `3028e3e`<br>
> Cây code và browser cuối: `3028e3e58c14b4c22129fa372328cb99d7ba108b`<br>
> Ngày kiểm tra trình duyệt: 02/09/2026

## Kết quả triển khai

| Concern | Commit | Kết quả |
| --- | --- | --- |
| Identifier lookup | `b76cd3f` | Lookup dùng POST, không đưa mã thô vào URL và phân biệt đúng trạng thái kết quả |
| Intake validation | `46c252a` | Lỗi gắn đúng trường, dữ liệu không hợp lệ không đi tiếp quy trình |
| Intake → inspection handoff | `fb2c936` | Resume và chuyển bước giữ đúng unit/inspection, không flash lại bước tiếp nhận |
| Unit refresh | `5e2e5fa` | Detail giữ projection hiện tại khi làm mới; response cũ không ghi đè state mới |
| Rejected identifiers | `75f0a6c` | Mã đã nhập được xóa sau cả not-found và provider failure, không còn trong DOM |
| Lookup failure copy | `5139ef5` | Not-found và gián đoạn nhà cung cấp có thông báo riêng, không dùng lỗi chung sai nguyên nhân |
| Stock local refresh | `1083b41` | Row vẫn hiện khi refresh, page vượt phạm vi tự clamp và option được sắp xếp ổn định |
| Read-only/privacy contract | `bc38d00` | Ledger chỉ có collection GET; EMPLOYEE projection không có cost/price nội bộ; locations không có mutation |
| Stock filter geometry | `4a5dd49` | Khóa top-alignment của mã tham chiếu và padding dropdown để không cắt nét dưới |
| Stock response ordering | `32c523b` | Request gate loại response stale/aborted và option tải muộn không làm mất lựa chọn hiện tại |
| Table contrast | `3cfe27f` | Tăng tương phản header bảng dùng chung |
| Intake contrast | `a0a6550` | Tăng tương phản nội dung và control trong quy trình nhập máy |
| Status contrast | `21ceafd` | Status chip đạt lại ngưỡng accessibility |
| Inspection contrast | `fff6929` | Tăng tương phản phần kiểm định và trạng thái checklist |
| Location contrast | `7a4ffb2` | Tăng tương phản card địa điểm vận hành |
| Progress focus | `237ddfe` | Bước hiện hành trong progress rail có thể nhận focus và nằm trong vùng nhìn ở mobile |
| Browser audit | `adeb3a2` | Mở rộng 9 journey với privacy, resume, upload, geometry, stock, responsive, overflow và Axe |
| Capture hygiene | `3028e3e` | Ẩn Next development overlay khỏi ảnh audit trước khi chụp |

## Inventory workflow, identifier và media

- Tra cứu IMEI dùng POST. Mã đầy đủ chỉ nằm trong request body cần thiết, không nằm
  trong URL; sau success, not-found hoặc provider failure, trường nhập được xóa và
  UI chỉ trả định danh đã che. API unit còn xác nhận audit metadata chỉ ghi loại mã
  và outcome, không chứa giá trị mã gốc.
- Trường “Lý do tra cứu” **cố ý không tồn tại** theo quyết định trước của người dùng.
  Đây không phải thiếu sót WP-08. Quyền xem/sửa mã đầy đủ ở unit detail vẫn là luồng
  riêng có kiểm soát.
- Search danh sách máy chặn IMEI/EID/số sê-ri trước khi phát query collection; đổi
  filter không reload document hoặc làm mất browser state.
- Intake resume mở thẳng bước đang làm, không render thoáng qua bước một. Hoàn tất
  kiểm định phải qua màn hình xem lại và xác nhận rồi mới chuyển sang bước đưa máy
  lên bán. Inspection không thuộc intake không bị gắn nhầm progress rail.
- Phiếu kiểm định giữ đủ 18 hạng mục; control tổng quan/checklist và hai vùng ghi chú
  được đo đồng đều. Draft và complete gửi đúng projection, complete chỉ phát một lần.
- Upload hiện kiểm tra **từng tệp**: từ chối tệp rỗng, chỉ nhận JPEG/PNG/WebP và tối
  đa 8 MiB. Backend hiện **không có giới hạn tổng số ảnh theo máy**; evidence này
  không tuyên bố hoặc suy diễn một media-count cap chưa tồn tại.

## Overview, privacy, locations và stock

- Dashboard dùng projection tổng hợp thật ở API; link quản trị chỉ hiện cho ADMIN.
  EMPLOYEE không thấy link cấu hình/trạng thái hệ thống.
- EMPLOYEE không phát request cost và không thấy “Giá vốn nội bộ” trong DOM. Unit/API
  tests khóa projection inventory và stock không chứa cost/price nội bộ.
- Locations là danh mục chỉ đọc tại surface này. Card đã tải vẫn được giữ khi vùng
  dữ liệu làm mới.
- Stock và movement thay query bằng History API trong cùng document; danh sách đã tải
  vẫn hiển thị trong local refresh. Request sequence loại response cũ, page vượt
  `totalPages` được replace về trang hợp lệ và product/variant sort tự nhiên, ổn định.
- Movement ledger chỉ được ghi thêm; UI không có sửa/xóa và controller chỉ expose GET
  cho `/backoffice/stock-movements`. Các stock command hợp lệ tạo movement mới thay
  vì sửa lịch sử cũ.
- Filter mã tham chiếu top-align với các control có/không có helper; dropdown dùng
  vertical padding để chữ tiếng Việt và ký tự có nét dưới không bị cắt.

## Phạm vi chứng minh của browser và API

`tests/browser/inventory-stock.spec.ts` dùng `page.route` để intercept các request
`/api/v1/backoffice/**` và trả fixture xác định. Vì vậy hai lượt Playwright chứng minh
đúng frontend journey, request method/body/URL, local refresh, focus, responsive,
overflow và accessibility; chúng **không phải** full-stack HTTP/database evidence.

Backend được kiểm riêng bằng 9 file API inventory, 125/125 test. Các test này gọi
code controller/service/repository/gateway/validator thật với dependency test double
phù hợp, nên chứng minh policy và projection ở service boundary; chúng không bị thay
thế bởi browser route fixture và cũng không được mô tả như production smoke.

## Responsive, accessibility và visual evidence

Browser matrix mở đủ chín route ở `1440×1000` và `360×800`, đo
`scrollWidth <= clientWidth`, một landmark `main`, active navigation/current step nằm
trong viewport và không có console/page error. Axe chạy trên từng route/viewport với
ngưỡng zero serious/critical.

Một lượt cuối có `FE09_CAPTURE_SCREENSHOTS=1` tạo 14 ảnh hiện hành trong
`.local/fe09/wp08-audit/`: chín ảnh desktop và năm ảnh mobile cho overview, units,
unit detail, inspection và stock. Tất cả 14 ảnh được kiểm tra trực quan và chấp nhận
sau khi dev overlay được loại khỏi capture tại `3028e3e`.

Screenshot hỗ trợ review hình học và hierarchy nhưng **không tự nó chứng minh đầy đủ
accessibility**. Axe cùng browser assertions về focus, landmark, overflow, forced
colors và accessible name là bằng chứng tự động cho phần đó.

## Test evidence

| Gate | Kết quả tại tree cuối |
| --- | --- |
| Full web unit/component | PASS — 134 file, 646/646 test |
| Targeted API inventory | PASS — 9 file, 125/125 test |
| Browser inventory-stock cuối, lượt A có capture | PASS — 9/9, Chromium |
| Browser inventory-stock cuối, lượt B | PASS — 9/9, Chromium; xanh liên tiếp với lượt A |
| Responsive matrix | PASS — 9 route × 1440/360 px, không overflow |
| Axe | PASS — zero serious/critical |
| Visual review | PASS — 14/14 ảnh current-run đã kiểm tra và chấp nhận |
| Prettier evidence docs | PASS |
| `git diff --check` | PASS |

## Acceptance mapping

| Acceptance WP-08 | Đánh giá |
| --- | --- |
| EMPLOYEE không phát request cost và không thấy cost DOM | **PASS** — browser probe bằng 0, DOM không có panel cost và API projection test khóa field nội bộ |
| Intake/inspection/stock critical journey xanh ở desktop/mobile | **PASS** — 9/9 hai lượt liên tiếp; đủ chín route ở 1440/360 px, Axe và overflow đều xanh |
| Không raw identifier trong URL, analytics hoặc log | **PASS trong phạm vi quan sát được** — POST body có mã cần tra cứu; URL/query/DOM sau xử lý chỉ có masked value; API unit xác nhận audit writer không nhận mã gốc |

WP-08 không còn blocker trong phạm vi. `FE9-R13` và `FE9-R14` vẫn mở độc lập;
kết quả inventory không thay đổi quyết định auth enumeration hoặc checkout preview
contract.
