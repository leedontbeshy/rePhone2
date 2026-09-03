# FE-09 — Evidence index

> Trạng thái: **DONE**<br>
> Product baseline: `3e79db7`<br>
> Kế hoạch được khóa tại: `1b6f4b2`<br>
> Baseline thực thi tại: `1b6f4b2`<br>
> Nhánh: `feat/fe-9-release-hardening`<br>
> Con trỏ triển khai: **WP-14 — PASS, artifact đã rà soát**<br>
> Release candidate cục bộ: `de82f6095d0e8aaea8da563d2dd8ea58c8e196f4`<br>
> CI mã nguồn cuối — head SHA: `a366b529f97d35e033bc1bc71762c81f4021b768`<br>
> CI mã nguồn cuối — merge SHA: `c74b2e6a6fc9f816f69731cb33c292d0f26c9804`<br>
> CI mã nguồn cuối: [33708368519](https://github.com/leedontbeshy/rePhone2/actions/runs/33708368519) — **5/5 job xanh**<br>
> Điều kiện còn mở: **Không còn điều kiện chặn FE-09; PR #23 vẫn chờ quyết định merge riêng**<br>
> Giới hạn đã chấp nhận: **FE9-R16, FE9-R17 — 02/09/2026**

## Phạm vi bằng chứng

FE-09 hoàn thiện toàn diện FE-0–FE-8. Evidence chỉ được chấp nhận khi gắn với
command, commit SHA và artifact có thể chạy lại. Operation và route tiếp tục do
FE-1–FE-8 sở hữu; FE-09 không nhân đôi hoặc chuyển ownership.

## Chỉ mục

- [Command log và baseline](./command-log.md)
- [Residual-risk log](./residual-risks.md)
- [WP-03 storefront evidence](./wp-03-storefront.md)
- [WP-04 auth/account evidence](./wp-04-auth-account.md)
- [WP-05 commerce evidence](./wp-05-commerce.md)
- [WP-06 customer post-purchase evidence](./wp-06-post-purchase.md)
- [WP-07 catalog/voucher evidence](./wp-07-catalog-voucher.md)
- [WP-08 inventory/stock evidence](./wp-08-inventory-stock.md)
- [WP-09 operations evidence](./wp-09-operations.md)
- [WP-10 system administration evidence](./wp-10-system-admin.md)
- [WP-11 accessibility, responsive và visual evidence](./wp-11-accessibility-responsive-visual.md)
- [WP-12 performance, client boundary và media evidence](./wp-12-performance-client-media.md)
- [WP-13 legacy cleanup evidence](./wp-13-legacy-cleanup.md)
- [WP-14 release closeout evidence](./wp-14-release-closeout.md)
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

Tree WP-01 kết thúc tại `0a7d85a` có registry thực thi cho **11 browser suite / 48 test**,
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
| CI workflow | PASS | Linux/Windows fast gate, PostgreSQL 17, Windows browser, artifact retention |
| CI run URL | PASS | CI mã nguồn cuối [33708368519](https://github.com/leedontbeshy/rePhone2/actions/runs/33708368519), 5/5 job xanh |

## Foundation và shared UX consistency WP-02

WP-02 kết thúc tại `eb9820e` với shared form, file picker, pagination, loading,
sidebar scroll, focus token và dialog lifecycle đã được harden. Review độc lập
không còn P0/P1/P2 sau remediation. Full web unit đạt `588/588`, shared a11y đạt
`21/21` và full Chromium đạt `48/48` trong 3,6 phút.

Chi tiết command, ảnh trước/sau và acceptance mapping nằm tại
[WP-02 foundation evidence](./wp-02-foundation.md).

## Storefront hardening WP-03

WP-03 kết thúc tại `3bc763a` với sáu route public được Việt hóa, filter giữ shell,
gợi ý tìm kiếm desktop/mobile, voucher account-safe, media fallback và menu di
động toàn màn hình. Full web unit đạt `597/597`; storefront browser đạt `17/17`
hai lượt liên tiếp và hai route đại diện đều nằm trong performance budget.

Chi tiết browser review, visual baseline, performance profile và acceptance nằm
tại [WP-03 storefront evidence](./wp-03-storefront.md).

## Auth và account hardening WP-04

WP-04 kết thúc tại `7551933` với refresh theo đúng chủ phiên, form chống gửi lặp,
token một lần không replay, account state cô lập giữa khách hàng và lỗi tải phục
hồi theo vùng. Browser review trực tiếp bắt và đóng lỗi tràn ngang ở 320 px. Full
web unit đạt `602/602`; auth/account browser đạt `9/9`, coverage `9/9` và shared
a11y `21/21`.

WP-14 đóng `FE9-R13` tại `266e2ce`, `fdc4242`: đăng ký mới và trùng trả cùng HTTP
`201` cùng nội dung chung, không lộ `DUPLICATE_RESOURCE`; OpenAPI/client được đồng
bộ tại `890622c`.

Chi tiết security/privacy, browser state, visual baseline và acceptance nằm tại
[WP-04 auth/account evidence](./wp-04-auth-account.md).

## Commerce hardening WP-05

Frontend WP-05 kết thúc tại `727193d` với cart queue cô lập theo phiên, wishlist giữ
quantity, local loading, checkout chống gửi lặp/stale response và phục hồi create
không chắc chắn chỉ sau thao tác rõ ràng của khách. Guest shipping và customer pickup
đã tạo đơn bằng API/DB thật. Browser cart/wishlist/checkout đạt `13/13` hai lượt;
20 snapshot phủ bốn trạng thái ở năm viewport; production cart/checkout lần lượt có
LCP median `1.664 ms` và `1.620 ms`.

WP-14 đóng `FE9-R14` bằng full-preview fingerprint tại `88b1da9`, `d818e0a` và
generated contract `890622c`. Create bắt buộc dùng fingerprint của projection vừa
duyệt; mismatch trả `409` kèm preview mới. Chi tiết implementation, lịch sử lỗi và
performance nằm tại [WP-05 commerce evidence](./wp-05-commerce.md).

## Customer post-purchase hardening WP-06

WP-06 kết thúc tại `0de508c` với local loading cho collection/detail, mutation lock,
guest credential fail-closed, warranty ownership E2E, after-sales eligibility và
retry đúng hành động. Full web unit đạt `614/614`; API unit đạt `683/683`;
after-sales/warranty E2E đạt `6/6`; browser post-purchase đạt `5/5` hai lượt liên
tiếp, gồm đủ bảy route ở 390 px và Axe zero serious/critical.

Chi tiết lỗi đã bắt, privacy matrix và acceptance nằm tại
[WP-06 customer post-purchase evidence](./wp-06-post-purchase.md).

## Catalog và voucher administration hardening WP-07

WP-07 kết thúc code tại `f72fd6e` (browser logic `ef5708f`) với catalog snapshot
gắn query/owner, suggestion lỗi có retry, pagination clamp/focus, product media và
conflict recovery, dirty-state guard, voucher date/time/lifecycle cùng negative
role flow. Full web unit đạt `630/630`; targeted API catalog/voucher đạt `50/50`;
browser catalog/voucher đạt `4/4` hai lượt liên tiếp. Sáu route đều xanh ở
1440/360 px, không overflow và Axe zero serious/critical sau bốn remediation
accessibility.

Chi tiết commit, lịch sử lỗi và acceptance nằm tại
[WP-07 catalog/voucher evidence](./wp-07-catalog-voucher.md).

## Inventory và stock hardening WP-08

WP-08 kết thúc tại `3028e3e` với lookup POST không lộ mã thô qua URL/DOM, intake
resume không flash bước một, inspection review/confirmation đúng nguồn, EMPLOYEE
cost privacy, stock local refresh/stale isolation và ledger chỉ đọc. Full web unit
đạt `646/646`; targeted API inventory đạt `125/125`; browser inventory-stock đạt
`9/9` hai lượt liên tiếp. Cả chín route đều xanh ở 1440/360 px, không overflow và
Axe zero serious/critical. Mười bốn ảnh current-run đã được review sau khi loại dev
overlay khỏi capture.

Upload chỉ có giới hạn **theo từng tệp**: JPEG/PNG/WebP, không rỗng, tối đa 8 MiB;
backend chưa có giới hạn tổng số ảnh theo máy. Lookup reason cố ý không có theo quyết
định trước của người dùng.

Chi tiết browser fixture/API service boundary, commit và acceptance nằm tại
[WP-08 inventory/stock evidence](./wp-08-inventory-stock.md).

## Operations hardening WP-09

WP-09 kết thúc code/browser tại `b10a0d4` với 11 route vận hành được kiểm tra ở
desktop/mobile, queue refresh cục bộ, giữ scroll/focus, conflict refetch, minh chứng
ký mới theo từng lần bấm và đầy đủ vòng đời đơn hàng, tài chính, hỗ trợ sau mua,
bảo hành/chính sách. Full web unit đạt `663/663`; API unit/service đạt `106/106`;
API E2E đạt `42/42`; browser operations đạt `11/11` hai lượt liên tiếp. Hai mươi
hai ảnh current-run đã được review, không có document overflow và Axe bằng zero
serious/critical.

WP-14 đóng `FE9-R15` cho thao tác tạo hoàn tiền bằng UUID idempotency key, request
fingerprint và replay ổn định ở `e8aefbe`, `26bfa48`. Control ngày giờ native trên
Windows vẫn phụ thuộc regional locale; giới hạn thấp `FE9-R16` đã được người dùng
chấp nhận ngày 02/09/2026. Chi tiết proof boundary, commit, test và acceptance nằm
tại [WP-09 operations evidence](./wp-09-operations.md).

## System administration hardening WP-10

WP-10 kết thúc code/browser tại `37527d7` với master-detail người dùng giữ
list/scroll/focus, mutation lock, settings CAS, QR upload/retry/cleanup, audit
redaction/deep link, health backend thật và overview refresh cục bộ. Full web unit
đạt `674/674`; API unit/service đạt `79/79`; API E2E đạt `15/15`; browser system
administration đạt `12/12` hai lượt liên tiếp.

Sáu route FE-8 cùng overview được kiểm tra ở 1440/360 px. ADMIN, EMPLOYEE,
CUSTOMER và anonymous có role matrix deterministic; trường hợp bị từ chối không
mount hoặc fetch child. Axe bằng zero serious/critical, không document overflow và
25/25 ảnh current-run đã được review. Chi tiết trust boundary, commit và acceptance
nằm tại [WP-10 system administration evidence](./wp-10-system-admin.md).

## Accessibility, responsive và visual matrix WP-11

WP-11 kết thúc code/browser tại `8351095` với ma trận đại diện cho tám miền, đủ
năm viewport chuẩn trên toàn sản phẩm và 38 ảnh baseline liên quan. Cross-cut
release matrix kiểm bốn shell bằng skip link/Axe, hành trình bàn phím thật, touch
target `44×44 px` trên storefront/customer/backoffice, reduced motion, forced
colors và proxy reflow `720×450` có geometry + hit-test. Hai full matrix cuối đạt
`5/5` liên tiếp; full web unit đạt `674/674`, coverage contract `9/9`, shared a11y
`21/21`, typecheck/lint/build đều xanh.

Review bắt và sửa thêm bốn lỗi sản phẩm: auth `autoFocus` bỏ qua skip link, validation
cấu hình không đưa focus tới tóm tắt lỗi, liên kết icon backoffice mobile chỉ rộng
`22 px`, và timeline đơn đang vận chuyển ghi nhầm “Đã giao hàng”. Full matrix/PNG
vẫn là Chromium/Windows; WP-14 bổ sung critical smoke Firefox `1/1` và WebKit `1/1`,
được CI xác nhận với zero retry/skip/flaky và đóng `FE9-R18`. Proxy reflow chưa phải
native zoom. Chi tiết ma
trận, ảnh, lịch sử lượt đỏ và giới hạn nằm tại
[WP-11 accessibility/responsive/visual evidence](./wp-11-accessibility-responsive-visual.md).

## Performance, client boundary và media WP-12

WP-12 đo production web build trên 12 route, một warm-up và ba sample/route. Hai
lượt `after` tại `e661e8b` đều đạt budget tuyệt đối và không có runtime issue. Login
CLS giảm `0,1212 → 0,0065`; chi tiết đơn khách hàng giảm `0,596 → 0`. Client/media
audit ghi 38 client page, 116 client TSX và 5 raw `<img>` occurrence; không chuyển
boundary/media hàng loạt khi chưa có lợi ích và allowlist proof.

Relative comparator giữ nguyên ngưỡng `>10%` nhưng hai lượt cùng SHA cho drift trên
nhiều route không sửa. Kết quả đỏ được giữ lại; absolute `after` budget trở thành CI
gate riêng, còn relative gate chờ baseline cùng runner ở WP-14. Chi tiết report,
visual proof và quyết định FE9-R08 nằm tại
[WP-12 performance/client/media evidence](./wp-12-performance-client-media.md).

WP-14 đo lại production trên runtime SHA `50b6cc9`: `12/12` route đạt budget, zero
runtime issue; compiled container smoke cũng xanh và dọn sạch tài nguyên cô lập.

## Legacy cleanup có kiểm soát WP-13

WP-13 kết thúc local tree tại `a66c114` với compatibility component catalog và các
nhóm selector global zero-consumer được xóa theo từng owner/commit. `globals.css`
giảm từ 2.777 xuống 167 dòng vật lý; các bridge còn consumer thật của shared
primitive và inventory intake/inspection vẫn được giữ. Hai baseline icon mobile chỉ
được cập nhật sau review expected/current/diff cùng viewport và chứng minh thay đổi
vị trí `11 px` đến từ touch target `44 px` có chủ ý.

Final tree đạt full web unit `676/676`, coverage `9/9`, a11y `21/21`, lint,
typecheck, build, hai lượt release matrix `5/5` và performance production `12/12`
route. Chi tiết consumer proof, lịch sử lượt đỏ và rollback checkpoint nằm tại
[WP-13 legacy cleanup evidence](./wp-13-legacy-cleanup.md).

## Release closeout WP-14

Một lần `pnpm verify:release` trên candidate `de82f60` đạt cả pass `1/2` và `2/2`.
Mỗi pass có
web `677/677`, API `705/705`, integration `55/55`, E2E `103/103`, coverage
`863/863`, Chromium `93/93`, production build 43 page/route entry và generated drift
bằng zero. Exact-set gate `9/9` khóa 162 operation, 56 route, 13 state và 93 browser
scenario trong 20 spec file.

Production smoke/performance chạy ở runtime SHA `50b6cc9`; hai commit sau chỉ cập
nhật test copy và một snapshot touch target 44 px đã review. Rollback shared shell,
global CSS và performance geometry đều được rehearsal trong worktree tạm rồi dọn
sạch. Chi tiết lượt đỏ, cleanup, rollback và điều kiện đóng nằm tại
[WP-14 release closeout](./wp-14-release-closeout.md).

CI mã nguồn cuối [33708368519](https://github.com/leedontbeshy/rePhone2/actions/runs/33708368519)
trên head `a366b52` / merge SHA `c74b2e6` đạt đủ 5/5 job. Báo cáo Chromium có
`93/93` expected, Firefox/WebKit có `2/2` expected; cả hai có zero
unexpected/flaky/skipped/retry. Performance đạt `12/12` route, database/API và hai
fast gate đều xanh. Artifact redaction gate, schema verifier và lượt quét độc lập
xác nhận không có giá trị nhạy cảm. Coverage cuối đạt lines `93,2%`, statements
`88,12%`, functions `84,06%`, branches `76,21%`.

## Artifact index

| Work package | Artifact theo dõi | Trạng thái |
| --- | --- | --- |
| WP-00 | Evidence index, command log, residual risks | Có |
| WP-01 | Browser ownership registry và release workflow | PASS; CI 5/5 và artifact đã rà soát |
| WP-02 | Foundation/browser/visual evidence | PASS |
| WP-03 | Storefront browser/visual/performance evidence | PASS |
| WP-04 | Auth/account browser/visual/security evidence | PASS |
| WP-05 | Commerce evidence + 20 snapshot | PASS — FE9-R14 đã đóng tại WP-14 |
| WP-06 | Customer post-purchase browser/ownership/responsive evidence | PASS |
| WP-07 | Catalog/voucher browser/responsive/accessibility evidence | PASS |
| WP-08 | Inventory/stock browser/responsive/accessibility evidence | PASS |
| WP-09 | Operations browser/API/visual evidence | PASS — FE9-R15 đóng; FE9-R16 đã chấp nhận |
| WP-10 | System administration browser/API/visual evidence | PASS |
| WP-11 | Accessibility, responsive và visual matrix | PASS; Firefox/WebKit CI `2/2`, FE9-R17 đã chấp nhận |
| WP-12 | Performance và client-boundary report | PASS; CI `12/12` route và artifact sạch |
| WP-13 | Consumer scan, owner regression và rollback checkpoint | PASS |
| WP-14 | Hai release run, production smoke, exact-set, rollback và cross-browser | PASS; final CI 5/5, FE9-R16/R17 đã chấp nhận |

## Quy tắc cập nhật

1. Ghi đúng SHA của tree đã chạy; không gắn kết quả ở SHA khác.
2. Ghi cả lần lỗi và lần chạy lại; không xóa dấu hiệu flake.
3. Mỗi residual risk có owner, trạng thái và điều kiện đóng.
4. Selected screenshot chỉ được theo dõi sau khi đã review đúng viewport/state.
5. Không đánh dấu FE-09 `DONE` trước khi WP-14 chứng minh toàn bộ definition of done.

## Trạng thái bàn giao

WP-14 đã đóng `FE9-R05`, `FE9-R08`, `FE9-R10`, `FE9-R13`–`FE9-R15` và `FE9-R18`;
`FE9-R16`, `FE9-R17` đã được người dùng chấp nhận ngày 02/09/2026. FE-09 đã chuyển
`DONE`. PR #23 vẫn mở; merge chỉ thực hiện khi người dùng yêu cầu riêng.
