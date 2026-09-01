# FE-09 — Evidence index

> Trạng thái: **IN PROGRESS**<br>
> Product baseline: `3e79db7`<br>
> Kế hoạch được khóa tại: `1b6f4b2`<br>
> Baseline thực thi tại: `1b6f4b2`<br>
> Nhánh: `feat/fe-9-release-hardening`<br>
> Work package hiện tại: **WP-00**

## Phạm vi bằng chứng

FE-09 hoàn thiện toàn diện FE-0–FE-8. Evidence chỉ được chấp nhận khi gắn với
command, commit SHA và artifact có thể chạy lại. Operation và route tiếp tục do
FE-1–FE-8 sở hữu; FE-09 không nhân đôi hoặc chuyển ownership.

## Chỉ mục

- [Command log và baseline](./command-log.md)
- [Residual-risk log](./residual-risks.md)
- [Kế hoạch triển khai](../../planning/2026-09-01-fe-09-comprehensive-release-hardening-plan.md)
- [Frontend delivery authority](../../../plan-fe.md)

Raw coverage report, Playwright report, trace, video, performance profile và log
môi trường nằm trong `.local/` hoặc CI artifact storage. Không commit token,
cookie, database URL, production PII hoặc signed URL vào thư mục này.

## Baseline WP-00

| Hạng mục | Kết quả | Bằng chứng tóm tắt |
| --- | --- | --- |
| Exact coverage | PASS | 162 operation, 56 route; contract `4/4` |
| Shared accessibility | PASS | Foundation contract `15/15` |
| Typecheck | PASS | 4 Turbo tasks |
| Unit/component | PASS khi chạy tuần tự | API client `7/7`, API `680/680`, web `567/567` |
| Production build | PASS | 4 Turbo tasks; Next build sinh đủ 56 route |
| Browser inventory | BASELINE | 46 test trong 9 file; chưa thực thi full browser ở WP-00 |
| Format | Đã khắc phục | `design-qa.md` được chuẩn hóa bằng Prettier |
| Lint | Đã khắc phục | Bỏ `.local/` khỏi phạm vi và khai báo global `URL` cho Node script |

## Artifact index

| Work package | Artifact theo dõi | Trạng thái |
| --- | --- | --- |
| WP-00 | Evidence index, command log, residual risks | Có |
| WP-01 | Browser ownership registry, CI run và sanitized report | Chưa có |
| WP-02–WP-10 | Browser/visual evidence theo surface | Chưa có |
| WP-11 | Accessibility, responsive và visual matrix | Chưa có |
| WP-12 | Performance và client-boundary report | Chưa có |
| WP-13 | Consumer scan và rollback evidence | Chưa có |
| WP-14 | Hai release run, production smoke, release SHA và CI URL | Chưa có |

## Quy tắc cập nhật

1. Ghi đúng SHA của tree đã chạy; không gắn kết quả ở SHA khác.
2. Ghi cả lần lỗi và lần chạy lại; không xóa dấu hiệu flake.
3. Mỗi residual risk có owner, trạng thái và điều kiện đóng.
4. Selected screenshot chỉ được theo dõi sau khi đã review đúng viewport/state.
5. Không đánh dấu FE-09 `DONE` trước khi WP-14 chứng minh toàn bộ definition of done.

## Bước tiếp theo

Hoàn tất verification cho commit khởi động WP-00, sau đó chuyển sang WP-01 để
biến `browser:*` thành ownership thực thi và thêm release automation.
