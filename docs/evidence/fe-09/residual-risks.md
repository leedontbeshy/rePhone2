# FE-09 — Residual-risk log

| ID | Trạng thái | Mức | Owner | Bằng chứng hiện tại | Điều kiện đóng |
| --- | --- | --- | --- | --- | --- |
| FE9-R03 | OPEN | Cao | WP-01 | 73 operation đang trỏ tới `operations-lifecycle` hoặc `system-admin-health` nhưng hai suite chưa tồn tại | Registry kiểm được suite/test ID thật; negative contract test xanh |
| FE9-R04 | OPEN | Cao | WP-01/WP-14 | Asset integrity test mất `12.863 s` với timeout `15 s` và đã lỗi khi chạy gate song song | Xác định policy thực thi tuần tự hoặc tối ưu test; hai release run không retry/flaky |
| FE9-R05 | OPEN | Rất cao | WP-01/WP-14 | Chưa có CI artifact để kiểm redaction | Workflow chỉ dùng test secret; artifact review không có token/PII |
| FE9-R08 | OPEN | Trung bình | WP-12 | Mới có tổng static JS; chưa có route-level production baseline | Baseline/after report cùng profile và SHA |
| FE9-R10 | OPEN | Cao | WP-01 | Repository chưa có GitHub Actions workflow | Fast PR gate và full release gate chạy trên CI, có URL/artifact thật |
| FE9-R01 | MONITOR | Cao | WP-02–WP-13 | `globals.css` còn lớn và nhiều surface dùng shared selector | Consumer scan + browser regression trước từng cleanup commit |

## Rủi ro đã giảm trong WP-00

| Concern | Kết quả |
| --- | --- |
| Format gate đỏ | Đã chuẩn hóa `design-qa.md`; full `format:check` xanh |
| Lint quét raw artifact | `.local/` đã được bỏ khỏi ESLint scope; lint xanh mà không tăng heap runtime |
| Node script thiếu global | `URL` được khai báo read-only cho JavaScript/ESM lint scope |

Residual risk chỉ chuyển `CLOSED` khi có bằng chứng đúng điều kiện đóng; không đóng
theo cảm nhận hoặc chỉ vì một lần chạy không lỗi.
