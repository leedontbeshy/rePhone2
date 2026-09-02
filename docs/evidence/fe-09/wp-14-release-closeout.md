# FE-09 WP-14 — Release closeout

> Trạng thái: **LOCAL PASS — chờ CI/artifact**<br>
> Release candidate code SHA: `de82f6095d0e8aaea8da563d2dd8ea58c8e196f4`<br>
> Production smoke/performance code SHA: `50b6cc9b1786accadc205489882342d8c6dd5752`<br>
> Nhánh: `feat/fe-9-release-hardening`<br>
> Ngày chạy cuối: 02/09/2026

## Kết luận hiện tại

Phần kiểm tra cục bộ của WP-14 đã hoàn tất. Một lần chạy `pnpm verify:release` trên
release candidate `de82f60` hoàn thành cả pass `1/2` và `2/2`; full Chromium đạt
`93/93` ở mỗi pass và smoke Firefox/WebKit đạt `2/2`. Exact-set contract xác nhận
162 operation, 56 route hiện hữu, 13 state bắt buộc và toàn bộ browser owner khớp
registry.

FE-09 vẫn giữ **IN PROGRESS** cho tới khi CI/artifact được kiểm. Người dùng đã cho
phép push và chấp nhận rõ hai giới hạn mức thấp `FE9-R16`, `FE9-R17` ngày 02/09/2026;
hai mục này không còn chặn release.

## Release candidate và phạm vi thay đổi WP-14

| Concern | Commit | Kết quả |
| --- | --- | --- |
| Không để lộ tài khoản trùng khi đăng ký | `266e2ce`, `fdc4242` | Cả đăng ký mới và trùng đều dùng phản hồi chung; UI không tạo tín hiệu khác biệt |
| Checkout gắn với toàn bộ preview | `88b1da9`, `d818e0a` | Preview trả fingerprint bất biến; create bắt buộc gửi fingerprint và trả `409` kèm preview mới khi projection lệch |
| Hoàn tiền replay an toàn | `e8aefbe`, `26bfa48` | Idempotency key được tạo một lần cho intent và tái sử dụng khi retry sau kết quả mạng mơ hồ |
| Đồng bộ contract và fixture downstream | `890622c`, `467bc48`, `cc2cb1d` | OpenAPI/client và test downstream dùng contract mới; generated drift bằng zero |
| Critical smoke đa trình duyệt | `587be7c`, `65ed527`, `5958751` | Skip link hoạt động với WebKit; Firefox/WebKit có smoke riêng và workflow CI tương ứng |
| Production container smoke | `465ee97`, `785dd49`, `50b6cc9` | Dựng stack production cô lập, kiểm health chi tiết, xác thực label cleanup và dọn sạch tài nguyên theo project |
| Khóa test với hành vi sản phẩm hiện tại | `ecdc8e0`, `de82f60` | Auth lifecycle copy và snapshot touch target 44 px được review, cập nhật rồi strict-check lại |

## Exact-set ownership

`pnpm fe:coverage` đạt `9/9` và fail-closed khi thiếu/thừa owner:

| Registry | Số lượng | Kết quả |
| --- | ---: | --- |
| OpenAPI operation | 162 unique | Manifest đủ 162, tất cả `DONE`, mỗi operation có đúng một phase/browser owner |
| Route | 56 | 56 `EXISTING`, 0 `PLANNED`; mỗi route có đúng một primary browser owner |
| State dùng chung | 13 | Đủ 13 state có browser owner |
| Browser suite | 12 | 93 scenario trong 20 spec file; không có test ngoài registry |
| Secondary route claim | 163 | Tất cả claim trỏ tới route hợp lệ |

Phân bổ operation theo phase giữ nguyên ownership FE-1–FE-8: FE-1 `5`, FE-2 `14`,
FE-3 `10`, FE-4 `12`, FE-5 `22`, FE-6 `26`, FE-7 `53`, FE-8 `20`.

## Hai release pass nội bộ cuối

Hai pass dưới đây do cùng một lệnh `pnpm verify:release` điều phối tuần tự trên code
SHA `de82f60`, từ test database được dựng lại với 13 migration. Không dùng retry để
biến lỗi thành xanh.

| Gate trong mỗi lượt | Lượt 1 | Lượt 2 |
| --- | ---: | ---: |
| Format, lint, typecheck | PASS | PASS |
| Web unit/component | 139 file, `677/677` | 139 file, `677/677` |
| API unit | 119 file, `705/705` | 119 file, `705/705` |
| Script contract | `11/11` | `11/11` |
| Integration | 12 file, `55/55` | 12 file, `55/55` |
| API E2E | 14 file, `103/103` | 14 file, `103/103` |
| Coverage suite | 145 file, `863/863` | 145 file, `863/863` |
| Production build | 43 page/route entry | 43 page/route entry |
| Full Chromium browser | `93/93` | `93/93` |
| Generated OpenAPI/client drift | Sạch | Sạch |

Coverage giống nhau ở hai pass: statements `88,11%` (`7237/8213`), branches
`76,17%` (`4311/5659`), functions `84,06%` (`1677/1995`) và lines `93,19%`
(`6921/7426`).

## Firefox và WebKit

`pnpm test:browser:cross-browser-smoke` chạy sau release gate trên `de82f60`:

| Engine | Kết quả |
| --- | ---: |
| Firefox | `1/1` |
| WebKit | `1/1` |

Đây là critical smoke cục bộ, không mở rộng claim thành full 93-scenario matrix trên
mọi engine. Workflow CI đã có cùng smoke, nhưng `FE9-R18` chỉ được đóng hoàn toàn sau
khi có artifact CI thật trên release SHA.

## Production compiled smoke và performance

Các gate production dùng code SHA `50b6cc9`; `git diff 50b6cc9..de82f60` chỉ có
`tests/browser/auth-account.spec.ts` và PNG snapshot catalog mobile đã review, không
đổi runtime production.

Nguồn chạy lại: [production smoke runner](../../../scripts/infra/Invoke-ProductionSmoke.ps1),
[production smoke compose](../../../scripts/infra/production-smoke.compose.yaml),
[cross-browser config](../../../playwright.cross-browser.config.ts) và
[release workflow](../../../.github/workflows/release-verification.yml).

| Gate | Kết quả |
| --- | --- |
| Production container smoke | PASS; compiled `api-operations`, `api-runtime`, `web-runtime`; PostgreSQL 17.6; TLS `verify-full`; internal-only network |
| Runtime probes | PASS; live/ready/public, anonymous account `401`, customer account `200`, customer backoffice `403`, admin overview/health, version SHA và web health |
| Dependency projection | PASS; database/API healthy, storage/mail cố ý offline và được báo đúng trạng thái |
| Cleanup isolation | PASS; sau lượt cuối không còn container, network hoặc volume của project smoke |
| Performance production | PASS `12/12` route, zero runtime issue |
| Profile | Chromium Windows, `390×844`, CPU ×4, latency 40 ms |
| Raw report | `.local/release-performance/wp12-baseline.json` — local-only, không commit |

Trước production smoke, máy chỉ còn khoảng 1,5 GB ổ đĩa. Khoảng 40 GB cache có thể
tạo lại trong `.turbo/cache` và `apps/web/.next/dev` được xác định đúng workspace rồi
dọn bằng cơ chế chỉ xóa ignored cache; source, database và dữ liệu người dùng không
bị xóa. Sau đó ổ D còn khoảng 44,5 GB trống.

## Rollback rehearsal

Rollback chỉ revert concern code trong worktree tạm, không rollback database hoặc
business state:

| Concern | Checkpoint revert | Bằng chứng sau revert |
| --- | --- | --- |
| Shared backoffice shell | `a39c923` | Đúng một file thay đổi; shell test `7/7`, lint và typecheck xanh |
| Global CSS cleanup | `a66c114` | Inventory `20` file / `68/68` test; lint, typecheck và production build 43 route xanh |
| Performance geometry | `11a1971` | Auth `5/5`; lint, typecheck và production build 43 route xanh |

Các worktree tạm được dọn sạch sau rehearsal; chỉ còn worktree chính.

## Lịch sử lượt đỏ được giữ lại

| Lượt | Kết quả | Nguyên nhân và xử lý |
| --- | --- | --- |
| Production smoke đầu | Probe xanh nhưng cleanup guard từ chối | Harness đọc label sai vị trí; kiểm đúng project, dọn thủ công an toàn rồi sửa validation tại `50b6cc9` |
| Performance đầu | Dừng ở clean-tree guard | Agent song song còn tệp infra chưa commit; đây là điều kiện harness, không phải regression sản phẩm |
| Rollback shell đầu | Harness không chứng minh đúng diff và gọi config test không tồn tại | Sửa phép đo staged/unstaged và dùng lệnh test hiện hữu; rehearsal sau đó xanh |
| Full release đầu sau contract change | 32 API E2E lỗi | Fixture downstream chưa gửi preview fingerprint; sửa tại `467bc48`, `cc2cb1d`, targeted downstream `36/36` rồi mới chạy lại full gate |
| Release gate trước candidate cuối | Browser `89` đạt, `2` lỗi, `2` chưa chạy | Test auth còn copy cũ; snapshot mobile lệch 107 pixel do touch target 44 px có chủ ý. Sửa riêng tại `ecdc8e0`, `de82f60`, targeted strict xanh rồi hai full run xanh |

Không xóa hoặc mô tả lại các lượt đỏ thành flake. Mỗi lỗi đều có nguyên nhân được
chứng minh và lần chạy lại trên tree sau sửa.

## Residual risk và điều kiện đóng FE-09

| ID | Trạng thái sau local gate | Việc còn lại |
| --- | --- | --- |
| FE9-R04 | CLOSED | Hai pass `1/2` và `2/2` tuần tự, không retry/flaky đã hoàn tất |
| FE9-R05 | OPEN | Push, review CI artifact và xác nhận không có token/PII |
| FE9-R08 | MITIGATED — CI PENDING | Performance local `12/12`; cần performance CI xanh |
| FE9-R10 | MITIGATED — CI PENDING | Workflow có sẵn; cần CI URL thật |
| FE9-R13 | CLOSED | Generic registration response đã có backend/OpenAPI/browser proof |
| FE9-R14 | CLOSED | Full-preview fingerprint và stale-preview `409` đã có contract/test |
| FE9-R15 | CLOSED | Refund intent có idempotency key ổn định và replay test |
| FE9-R16 | ACCEPTED — LOW | Người dùng/Product chấp nhận `datetime-local` theo regional locale ngày 02/09/2026; shared field là cải tiến sau release |
| FE9-R17 | ACCEPTED — LOW | Người dùng/Product chấp nhận proxy reflow `720×450` ngày 02/09/2026; native zoom proof là cải tiến evidence sau release |
| FE9-R18 | MITIGATED — CI PENDING | Local Firefox/WebKit `2/2`; cần CI artifact trên release SHA |

## Điều kiện chuyển FE-09 sang DONE

1. Có CI xanh trên release candidate/rebased equivalent.
2. Ghi CI URL, review artifact và xác nhận artifact không chứa credential, token, PII
   hoặc signed URL. Quyền push và acceptance `FE9-R16`/`FE9-R17` đã được xác nhận.
3. Sau đó mới cập nhật `plan-fe.md`, frontend coverage phase và evidence index sang
   `DONE`; việc merge vẫn cần yêu cầu riêng của người dùng.
