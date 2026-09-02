# FE-09 — Residual-risk log

| ID | Trạng thái | Mức | Owner | Bằng chứng hiện tại | Điều kiện đóng |
| --- | --- | --- | --- | --- | --- |
| FE9-R03 | CLOSED | Cao | WP-01 | Registry có 11 suite/48 test; FE-07 và FE-08 chạy thật; negative ownership contract 5/5 | Đã đóng tại `74a3700`; full browser 48/48 |
| FE9-R04 | CLOSED | Cao | WP-01/WP-14 | Release orchestration đã tuần tự hóa; một `pnpm verify:release` trên candidate `de82f60` hoàn thành pass `1/2` và `2/2`, mỗi pass Chromium `93/93`, không dùng retry để che lỗi | Đóng tại WP-14 local gate; chi tiết trong `wp-14-release-closeout.md` |
| FE9-R05 | CLOSED | Rất cao | WP-01/WP-14 | Final CI artifact qua redaction gate, schema verifier và scan bổ sung; không có credential, token, PII, signed URL hoặc fixture nhạy cảm | Đóng bằng artifact run `33690470254` trên merge SHA `e1ba2eb` |
| FE9-R08 | CLOSED | Trung bình | WP-12/WP-14 | Final CI đo 12 route, một warm-up + ba sample; `12/12` đạt absolute budget, zero runtime issue. Relative comparator vẫn được ghi đúng là host variance; ngưỡng `>10%` không bị nới | Đóng bằng performance job/artifact run `33690470254`; relative gate chỉ required khi có immutable baseline từ cùng runner/profile |
| FE9-R10 | CLOSED | Cao | WP-01/WP-14 | Final CI có fast Linux/Windows, PostgreSQL 17, Chromium `93/93`, performance và critical Firefox/WebKit; cả 5/5 job xanh | Đóng bằng CI URL và artifact run `33690470254` |
| FE9-R01 | CLOSED | Cao | WP-02–WP-14 | WP-13 xóa selector theo consumer proof; `globals.css` giảm từ 2.777 xuống 167 dòng, giữ bridge còn consumer thật; full release chạy hai pass sau cleanup | Đóng bằng consumer scan WP-13 và release candidate `de82f60` |
| FE9-R11 | CLOSED | Trung bình | WP-02–WP-10 | WP-02 foundation đến WP-10 system administration đều có browser/responsive/accessibility evidence; WP-10 thêm API/live smoke để không che contract bằng UI suy diễn | Đóng tại `37527d7`: 12/12 browser hai lượt, 79/79 API unit, 15/15 E2E và 25/25 ảnh WP-10 đã review |
| FE9-R13 | CLOSED | Trung bình | Backend/Auth | `266e2ce` và `fdc4242` đưa đăng ký mới/trùng về cùng HTTP `201` và nội dung chung; OpenAPI/client được làm mới tại `890622c`; browser kiểm body không chứa `DUPLICATE_RESOURCE` | Đóng bằng backend/OpenAPI/browser proof trên release candidate |
| FE9-R14 | CLOSED | Cao | Backend/Checkout + Product | `88b1da9` tạo fingerprint cho toàn bộ business preview; `d818e0a` bắt create gửi fingerprint và trả `409` kèm preview mới khi lệch; contract/fixture được đồng bộ tại `890622c`, `467bc48`, `cc2cb1d` | Đóng bằng contract, API E2E và full release gate |
| FE9-R15 | CLOSED | Cao | Backend/Operations + Product | `e8aefbe` thêm idempotency persistence/replay cho tạo hoàn tiền; `26bfa48` giữ một key theo intent khi client retry; OpenAPI/client tại `890622c`; E2E kiểm replay tuần tự, đồng thời và payload mismatch | Đóng bằng schema, service/API E2E, client regression và full release gate |
| FE9-R16 | ACCEPTED — PRODUCT LIMITATION | Thấp | WP-11 / Shared form | Native `datetime-local` trên Windows Chromium hiển thị phần trống theo regional locale của hệ điều hành (`mm/dd/yyyy --:-- --`). HTML/input `lang`, Playwright locale/timezone và `placeholder` không kiểm soát được chuỗi này; label, value và validation vẫn hoạt động | Người dùng/Product chấp nhận giới hạn ngày 02/09/2026; theo dõi shared accessible `DateTimeField` như cải tiến sau release, không còn chặn FE-09 |
| FE9-R17 | ACCEPTED — EVIDENCE LIMITATION | Thấp | WP-11/WP-14 | WP-11 kiểm reflow bằng viewport CSS `720×450`, tương đương layout `1440×900` ở 200%, cùng bounding box và hit-test; đây không phải native browser zoom | Người dùng/Product chấp nhận proxy reflow ngày 02/09/2026; native zoom proof là cải tiến evidence sau release, không còn chặn FE-09 |
| FE9-R18 | CLOSED | Trung bình | WP-11/WP-14 | Final CI đạt Firefox `1/1`, WebKit `1/1`, zero retry/skip/flaky. Full 93-scenario matrix và PNG baseline vẫn là Chromium/Windows | Đóng bằng cross-browser artifact run `33690470254` |

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
- WP-08 không được dùng để đóng auth enumeration hoặc checkout preview contract;
  `FE9-R13` và `FE9-R14` chỉ được đóng sau remediation riêng của WP-14 như bảng trên.
