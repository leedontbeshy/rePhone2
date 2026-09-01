# FE-09 — Residual-risk log

| ID | Trạng thái | Mức | Owner | Bằng chứng hiện tại | Điều kiện đóng |
| --- | --- | --- | --- | --- | --- |
| FE9-R03 | CLOSED | Cao | WP-01 | Registry có 11 suite/48 test; FE-07 và FE-08 chạy thật; negative ownership contract 5/5 | Đã đóng tại `74a3700`; full browser 48/48 |
| FE9-R04 | MITIGATED | Cao | WP-01/WP-14 | Gate chạy song song tranh chấp Prisma generated trên Windows; gate tuần tự xanh | Release orchestration đã tuần tự hóa; đóng sau hai release run không retry/flaky |
| FE9-R05 | OPEN | Rất cao | WP-01/WP-14 | Chưa có CI artifact để kiểm redaction | Workflow chỉ dùng test secret; artifact review không có token/PII |
| FE9-R08 | OPEN — PARTIAL BASELINE | Trung bình | WP-03/WP-12 | Model và exact-unit đã có production baseline 3 lượt tại `3bc763a`; route authenticated/backoffice chưa đo | Hoàn tất toàn bộ representative route baseline/after cùng profile và SHA tại WP-12 |
| FE9-R10 | MITIGATED | Cao | WP-01/WP-14 | Workflow đã có fast Linux/Windows, DB PostgreSQL 17 và browser Windows | Push nhánh, kiểm CI thật và ghi URL/artifact trước closeout |
| FE9-R01 | MONITOR | Cao | WP-02–WP-13 | `globals.css` còn lớn và nhiều surface dùng shared selector | Consumer scan + browser regression trước từng cleanup commit |
| FE9-R11 | OPEN — PARTIALLY MITIGATED | Trung bình | WP-02–WP-10 | WP-02 foundation, WP-03 storefront, WP-04 auth/account, WP-05 commerce, WP-06 post-purchase, WP-07 catalog/voucher và WP-08 inventory/stock đã có browser/responsive/accessibility evidence; WP-09–WP-10 chưa audit sâu | Hoàn tất browser, responsive, accessibility và visual evidence riêng cho WP-09–WP-10 |
| FE9-R13 | OPEN — CONTRACT DECISION | Trung bình | Backend/Auth | UI đăng ký dùng nội dung chung và API có giới hạn 5 lượt/15 phút, nhưng endpoint vẫn trả HTTP `409 DUPLICATE_RESOURCE` có thể quan sát trong Network | Đóng bằng thay đổi backend/OpenAPI đã được phê duyệt để dùng response không phân biệt, hoặc ghi nhận chấp nhận rủi ro tại WP-14 |
| FE9-R14 | OPEN — CONTRACT BLOCKER | Cao | Backend/Checkout + Product | Tạo đơn chỉ so thời điểm giỏ hàng, tổng tiền và tiền cọc; cửa hàng nhận máy, phân bổ giá theo dòng, tên ưu đãi hoặc metadata sản phẩm có thể đổi mà ba giá trị này vẫn giữ nguyên | Theo non-goal FE-09, không suy diễn ở frontend. Chỉ đóng khi backend/OpenAPI dùng một phiên bản hoặc fingerprint bất biến bao phủ toàn bộ business preview và trả `409` kèm preview mới khi lệch; nếu hoãn, Product Owner phải chấp nhận rõ rủi ro và sửa acceptance trước WP-14 |

## Rủi ro đã giảm trong WP-00

| Concern | Kết quả |
| --- | --- |
| Format gate đỏ | Đã chuẩn hóa `design-qa.md`; full `format:check` xanh |
| Lint quét raw artifact | `.local/` đã được bỏ khỏi ESLint scope; lint xanh mà không tăng heap runtime |
| Node script thiếu global | `URL` được khai báo read-only cho JavaScript/ESM lint scope |

Residual risk chỉ chuyển `CLOSED` khi có bằng chứng đúng điều kiện đóng; không đóng
theo cảm nhận hoặc chỉ vì một lần chạy không lỗi.

## Ghi chú contract WP-08

- Upload inventory hiện chỉ khóa tệp rỗng, loại JPEG/PNG/WebP và kích thước tối đa
  8 MiB **cho từng tệp**. Backend chưa có total media-count cap; evidence không tạo
  hoặc tuyên bố một giới hạn tổng không tồn tại.
- Trường lookup reason cố ý vắng mặt theo quyết định trước của người dùng. Lookup vẫn
  dùng POST, xóa mã sau xử lý và không đưa mã thô vào URL/DOM.
- `FE9-R13` và `FE9-R14` giữ nguyên trạng thái mở. WP-08 không cung cấp bằng chứng để
  đóng auth enumeration hoặc checkout preview contract.
