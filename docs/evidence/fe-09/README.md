# FE-09 — Evidence index

> Trạng thái: **IN PROGRESS**<br>
> Product baseline: `3e79db7`<br>
> Kế hoạch được khóa tại: `1b6f4b2`<br>
> Baseline thực thi tại: `1b6f4b2`<br>
> Nhánh: `feat/fe-9-release-hardening`<br>
> Work package hiện tại: **WP-02**

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

## Coverage truth và release automation WP-01

Tree kết thúc tại `d21bd07` có registry thực thi cho **11 browser suite / 48 test**,
sở hữu chính xác **56/56 route** và đủ 13 state đã khóa. Hai suite FE-07/FE-08
không còn là nhãn mô tả: chúng chạy thật trên route matrix backoffice và backend
projection. Contract sẽ đỏ khi test bị xóa, đổi ID, thêm ngoài registry, dùng
`skip`/`only`/`fixme`/`fail`, trùng owner hoặc claim route/state không hợp lệ.

| Hạng mục | Kết quả | Bằng chứng tóm tắt |
| --- | --- | --- |
| Browser ownership contract | PASS | 9/9 coverage contract; 11 suite, 48 test, 56 primary route |
| Full browser suite | PASS | 48/48 Chromium, 1 worker, 3 phút 24 giây |
| Visual determinism | PASS | 2/2 test ảnh chạy xanh hai lượt liên tiếp sau khi review 6 ảnh |
| Fast quality gates | PASS | format, lint, typecheck, unit/component, a11y, build và generated drift |
| Release DB guard | PASS | Chặn DB không có hậu tố `_test` và host từ xa; lifecycle test 2/2 |
| CI workflow | IMPLEMENTED | Linux/Windows fast gate, PostgreSQL 17, Windows browser, artifact retention |
| CI run URL | PENDING | Chỉ có sau khi nhánh được push; bắt buộc bổ sung trước WP-14 closeout |

## Artifact index

| Work package | Artifact theo dõi | Trạng thái |
| --- | --- | --- |
| WP-00 | Evidence index, command log, residual risks | Có |
| WP-01 | Browser ownership registry và release workflow | Có; CI URL chờ push |
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

Thực hiện WP-02 theo từng concern dùng chung: token/focus, file picker, sidebar,
loading, dialog và pagination. Mỗi thay đổi phải chạy consumer scan cùng browser
regression của surface chịu ảnh hưởng.
