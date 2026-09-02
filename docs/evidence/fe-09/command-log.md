# FE-09 — Command log

## Môi trường

| Thuộc tính | Giá trị |
| --- | --- |
| Ngày chạy | 2026-09-01 |
| Branch | `feat/fe-9-release-hardening` |
| Product baseline | `3e79db7` |
| Baseline run SHA | `1b6f4b245d04916e2dc3febfb9b407ca45ad2e23` |
| Package manager | pnpm `10.18.3` |
| Node target | `>=24.18.0 <25` |

## Baseline run tại `1b6f4b2`

| Command | Exit | Kết quả |
| --- | ---: | --- |
| `pnpm format:check` | 1 | `design-qa.md` chưa đúng Prettier |
| `pnpm lint` | 134 | Node hết heap khi ESLint quét cả raw artifact trong `.local/` |
| `pnpm typecheck` | 0 | 4/4 Turbo tasks xanh |
| `pnpm test` — lần đầu chạy song song với gate khác | 1 | API `679/680`; asset integrity test chạm timeout 15 giây |
| `pnpm test` — chạy lại độc lập | 0 | API client `7/7`; API `680/680`; web `567/567`; tổng `1.254/1.254` |
| `pnpm fe:coverage` | 0 | 4/4 |
| `pnpm fe:a11y` | 0 | 15/15 |
| `pnpm build` | 0 | 4/4 Turbo tasks; production Next build thành công |
| `pnpm exec playwright test --list` | 0 | 46 test trong 9 file |

Lần chạy API độc lập hoàn thành asset integrity test trong `12.863 s`, gần timeout
`15 s`. Đây vẫn là rủi ro flake cần theo dõi; lần lỗi đầu không bị xóa khỏi log.

## Build-size snapshot tại `1b6f4b2`

| Chỉ số | Giá trị |
| --- | ---: |
| `.next/static/chunks/**/*.js` | 2.950.360 byte |
| Số JavaScript chunk | 82 |
| Toàn bộ `.next` local | 4.974.382.324 byte |

Kích thước toàn bộ `.next` gồm cache và artifact local nên không được dùng làm
release payload budget. WP-12 phải tạo route-level production measurement trước
khi kết luận bundle tăng hoặc giảm.

## Baseline remediation tree `14f30fa`

| Command | Exit | Kết quả |
| --- | ---: | --- |
| `pnpm exec prettier --check package.json design-qa.md` | 0 | PASS |
| `pnpm lint` | 0 | PASS sau khi loại `.local/` và khai báo global Node script |
| `pnpm format:check` | 0 | PASS |
| `pnpm typecheck` | 0 | 4/4 Turbo tasks |

## Artifact policy

Output đầy đủ không được commit. CI sau WP-01 phải lưu sanitized summary khi
thành công và trace/screenshot/video chi tiết khi thất bại, với retention policy
rõ ràng.

## WP-01 verification — tree `d21bd07`

### Lịch sử browser gate

| Lượt | Exit | Kết quả |
| --- | ---: | --- |
| Full browser baseline | 1 | 44/48; lộ bốn drift thật: selector commerce cũ, fixture thanh toán hết hạn và hai nhóm visual baseline cũ |
| Visual update | 0 | Review và cập nhật 6 ảnh desktop/mobile; không tăng sai số hoặc che vùng nội dung |
| Visual determinism 1 | 0 | 2/2, 49,2 giây |
| Visual determinism 2 | 0 | 2/2, 50,8 giây |
| Full browser cuối | 0 | 48/48, Chromium, 1 worker, 3 phút 24 giây |

Không xóa dấu hiệu drift đầu tiên khỏi log. Fixture hết hạn được đổi thành thời
điểm tương đối; selector được đồng bộ theo UI hiện hành; ảnh chỉ được cập nhật sau
khi kiểm tra đủ sáu viewport artifact.

### Fast gate cuối

| Command | Exit | Kết quả |
| --- | ---: | --- |
| `pnpm format:check` | 0 | PASS |
| `pnpm lint` | 0 | PASS |
| `pnpm typecheck` | 0 | 4/4 Turbo tasks |
| `pnpm test` | 0 | API client 7/7; API 680/680; web 572/572; release lifecycle 2/2 |
| `pnpm fe:coverage` | 0 | 9/9, gồm executable browser ownership contract |
| `pnpm fe:a11y` | 0 | 15/15 |
| `pnpm build` | 0 | 4/4 Turbo tasks; 56 route Next build thành công |
| `pnpm verify:generated` | 0 | OpenAPI và generated client không drift |
| System-admin fixture follow-up tại `0a7d85a` | 0 | 1/1; tên cửa hàng luôn được khôi phục bằng `finally` |

Một lượt `typecheck`/`test` chạy đồng thời đã tranh chấp thư mục Prisma generated
trên Windows và cho lỗi giả `ENOTEMPTY`. Sau khi chạy `db:generate` độc lập, toàn
bộ gate tuần tự xanh. `verify:release` cố ý tuần tự hóa các bước và sẽ chạy hai
lượt; không chạy nhiều Turbo command có chung `db:generate` đồng thời.

### Release automation đã thêm

- Fast gate trên Ubuntu 24.04 và Windows 2025.
- Database integration/coverage dùng PostgreSQL 17 test service.
- Browser release suite chạy Chromium trên Windows.
- Generated-drift rehearsal, remote/non-test DB negative rehearsal và cleanup
  container đúng trạng thái ban đầu.
- Summary sanitized luôn được upload; browser diagnostics chi tiết chỉ upload khi
  lỗi. CI URL và review artifact thật được hoãn tới lúc push/closeout.

## WP-02 verification — tree `eb9820e`

### Fast gate cuối

| Command | Exit | Kết quả |
| --- | ---: | --- |
| `pnpm --filter @rephone/web test` | 0 | 124 file, 588/588 test |
| `pnpm --filter @rephone/web typecheck` | 0 | PASS |
| `pnpm fe:a11y` | 0 | 4 file, 21/21 test |
| `pnpm lint` | 0 | PASS, zero warning |
| `pnpm format:check` | 0 | PASS |
| `git diff --check` | 0 | PASS |

### Browser và review gate

| Lượt | Exit | Kết quả |
| --- | ---: | --- |
| Full Chromium trước remediation review | 0 | 48/48, 1 worker, 3,6 phút |
| Forced-colors upload focus | 0 | 2/2, shared picker và custom picker |
| Full Chromium cuối | 0 | 48/48, 1 worker, 3,6 phút |
| Independent post-fix review | 0 | GO; zero P0/P1/P2 |

Review đầu không được xóa khỏi lịch sử: nó phát hiện stale variant khi đổi dòng
máy gặp lỗi, focus dialog có điều kiện trong React Strict Mode, focus forced-colors
và lỗi tệp động chưa được thông báo. Bốn concern đã được sửa riêng và kiểm thử lại
trước full browser cuối.

## WP-03 verification — tree `3bc763a`

### Fast gate cuối

| Command | Exit | Kết quả |
| --- | ---: | --- |
| `pnpm --filter @rephone/web test` | 0 | 126 file, 597/597 test |
| `pnpm fe:coverage` | 0 | 9/9 executable coverage contract |
| `pnpm typecheck` | 0 | 4/4 Turbo tasks |
| `pnpm lint` | 0 | PASS, zero warning |
| `pnpm format:check` | 0 | PASS |
| `pnpm build` | 0 | API/web production build; Next sinh đủ 56 route |
| `git diff --check` | 0 | PASS |

### Browser, visual và performance gate

| Lượt | Exit | Kết quả |
| --- | ---: | --- |
| Storefront browser trước contract refresh | 1 | 11/17; lộ một assertion geometry quá cứng và năm contract/snapshot cũ |
| Storefront browser + reviewed snapshot update | 0 | 17/17; cập nhật 4 visual baseline đã review |
| Storefront browser cuối, không update | 0 | 17/17, Chromium, 1 worker, 1,5 phút |
| Production performance cuối | 0 | 1/1; model LCP 508 ms, exact unit 596 ms, CLS 0 |

Browser review trực tiếp phát hiện media treo/broken-alt và menu fixed bị sticky
header cắt còn 81 px. Hai lỗi được sửa bằng commit độc lập rồi khóa bằng browser
regression; raw screenshot nằm trong `.local/fe09-wp03-audit/`.

## WP-04 verification — tree `7551933`

### Fast gate cuối

| Command | Exit | Kết quả |
| --- | ---: | --- |
| `pnpm --filter @rephone/web test` | 0 | 126 file, 602/602 test |
| `pnpm fe:coverage` | 0 | 9/9 executable coverage contract |
| `pnpm fe:a11y` | 0 | 4 file, 21/21 test |
| `pnpm --filter @rephone/web typecheck` | 0 | PASS |
| `pnpm lint` — lượt đầu | 1 | Bắt visual helper dùng arrow shorthand trả về `void` |
| `pnpm lint` — sau remediation | 0 | PASS, zero warning |
| `pnpm --filter @rephone/web build` | 0 | Production build; Next sinh đủ 56 route |
| `git diff --check` | 0 | PASS |

### Browser, visual và review gate

| Lượt | Exit | Kết quả |
| --- | ---: | --- |
| Auth/account full run trước remediation cuối | 0 | 9/9, Chromium, 1 worker |
| Visual focused, không update | 0 | 2/2 snapshot |
| Auth/account full run cuối | 0 | 9/9, Chromium, 1 worker, 1,2 phút |
| Manual browser audit | 0 | 1440×900, 390×844 và 320×844; profile/address/security ổn định |

Review độc lập đầu tiên phát hiện response sai chủ tài khoản, permanent skeleton và
reset-success flash sai trạng thái; snapshot review phát hiện skip link che logo và
account page được chụp giữa trang. Sau remediation, browser audit 320 px tiếp tục
phát hiện document overflow do `html { min-width: 20rem }` kết hợp scrollbar dành
chỗ. Concern được tách thành `11af652`, đo lại `scrollWidth === clientWidth === 320`
và khóa bằng browser regression.

## WP-05 verification — tree `727193d`

### Fast gate cuối

| Command | Exit | Kết quả |
| --- | ---: | --- |
| `pnpm format:check` | 0 | PASS sau khi chuẩn hóa `auth-provider.tsx` tại `8121362` |
| `pnpm lint` | 0 | PASS, zero warning |
| `pnpm typecheck` | 0 | 4/4 Turbo task |
| `pnpm --filter @rephone/web test` | 0 | 127 file, 612/612 test |
| `pnpm fe:coverage` | 0 | 162/162 operation, 56/56 route, 13/13 state |
| `pnpm fe:a11y` | 0 | 4 file, 21/21 test |
| `pnpm --filter @rephone/api test` | 0 | 117 file, 683/683 test |
| Commerce + checkout API E2E | 0 | 2 file, 18/18 test |
| `pnpm performance:storefront` | 0 | Production build + performance 1/1 |
| `git diff --check` | 0 | PASS |

### Browser, visual và review gate

| Lượt | Exit | Kết quả |
| --- | ---: | --- |
| Final candidate đầu tại `c5d9432` | 1 | 11/13; scroll ở 7 px vượt assertion 1 px và footer snapshot thiếu dữ liệu seed hiện hành |
| Visual update đã review | 0 | 20 snapshot được tạo lại sau khi ẩn dev portal và review 320/1440 px |
| Guest shipping + customer pickup full-stack | 0 | 2/2, API create thật và mở trang đơn |
| Full commerce trước identity isolation | 1 | 12/13; visual login vượt limit 5 lần/phút của cùng customer fixture |
| Full commerce cuối, lượt 1 | 0 | 13/13, Chromium, 1 worker, 2,0 phút |
| Full commerce cuối, lượt 2 | 0 | 13/13, Chromium, 1 worker, 2,0 phút |

Không xóa các lần lỗi: flow tạo đơn thật đầu tiên còn chọn một máy ở kho cho pickup
nên preview trả `409`; response body cũng không còn đọc được sau khi trang đã điều
hướng. Scenario được chuyển sang máy có tại cửa hàng và xác minh projection ở trang
đơn. Visual suite có fixture customer riêng để không phụ thuộc thứ tự hoặc rate-limit
của các scenario trước.

### Production performance tại `727193d`

Profile `390×844`, CPU ×4, latency 40 ms, 10 Mbps download, ba lượt lấy median:

| Route | LCP | CLS | Tương tác | Điều hướng | Bundle route |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/cart` | 1.664 ms | 0 | 58,13 ms | 655,4 ms | 228.913 B |
| `/checkout` | 1.620 ms | 0 | 61,2 ms | 628,5 ms | 233.658 B |

Cả hai đạt budget LCP `<= 2.500 ms`, CLS `<= 0,1` và interaction proxy
`<= 200 ms`. Raw report nằm tại `.local/release-performance/storefront.json`.

WP-05 chưa chuyển PASS vì `FE9-R14`: backend create chưa xác nhận toàn bộ business
preview. Frontend scope đã xanh; quyết định contract hoặc chấp nhận rủi ro phải được
ghi nhận trước closeout.

## WP-06 verification — tree `0de508c`

### Fast gate cuối

| Command | Exit | Kết quả |
| --- | ---: | --- |
| `pnpm --filter @rephone/web test` | 0 | 127 file, 614/614 test |
| `pnpm --filter @rephone/api test` | 0 | 117 file, 683/683 test |
| Targeted post-purchase web | 0 | 7 file, 44/44 test |
| `pnpm --filter @rephone/api test:e2e -- test/e2e/after-sales.e2e.spec.ts` | 0 | 1 file, 6/6 test |
| `pnpm --filter web lint` | 0 | PASS, zero warning |
| `pnpm --filter web typecheck` | 0 | PASS |
| `pnpm --filter @rephone/api lint` | 0 | PASS, zero warning |
| `pnpm --filter @rephone/api typecheck` | 0 | PASS |
| `git diff --check` | 0 | PASS |

### Browser, responsive và privacy gate

| Lượt | Exit | Kết quả |
| --- | ---: | --- |
| Khởi động đầu | 1 | Web server timeout do Docker Desktop crash ở Windows runtime socket |
| Browser sau khôi phục môi trường | 1 | 1/5; lộ locator collection sai, contrast 4,08:1 và picker đọc trước khi option tải xong |
| Browser remediation giữa | 1 | 3/5; còn strict locator và race chờ option |
| Browser cuối, lượt 1 | 0 | 5/5, Chromium, 1 worker, 57,7 giây |
| Browser cuối, lượt 2 | 0 | 5/5, Chromium, 1 worker, 56,2 giây |

Docker Desktop 4.66 trên máy kiểm thử bị Application Control chặn việc dọn hai
runtime socket của Docker AI/secrets. Runtime directory được di chuyển sang bản sao
`.stale-*`, tạo lại sạch và tắt Docker AI cục bộ; không factory reset hoặc xóa image,
volume hay dữ liệu PostgreSQL. Sau khôi phục, test database migrate đủ 12 migration
và hai browser run cuối xanh liên tiếp.

Browser suite phủ customer cancel thật, guest privacy, warranty detail/Axe,
after-sales eligibility, form focus, synchronous double-submit, attachment/provider
failure và đủ collection/detail ở 390 px. API E2E bổ sung owner, non-owner,
anonymous, staff, converted guest cookie và forged guest header cho warranty.

## WP-07 verification — code tree `f72fd6e`, browser logic `ef5708f`

### Fast gate cuối

| Command | Exit | Kết quả |
| --- | ---: | --- |
| `pnpm --filter @rephone/web test` | 0 | 130 file, 630/630 test |
| Targeted API catalog/voucher | 0 | 4 file, 50/50 test |
| `pnpm --filter @rephone/web lint` | 0 | PASS, zero warning |
| `pnpm --filter @rephone/web typecheck` | 0 | PASS |
| Targeted gate sau format `f72fd6e` | 0 | PASS |
| `git diff --check` | 0 | PASS |

### Browser, responsive và accessibility gate

| Lượt | Exit | Kết quả |
| --- | ---: | --- |
| Browser đầu | 1 | Lộ bốn lỗi a11y thật: catalog selected helper, shared selected-option hint, voucher table header và mobile context link |
| Remediation | 0 | Sửa riêng tại `3d8d18c`, `781bf41`, `16457ba`, `d2e566a`; Axe trở về zero serious/critical |
| Browser cuối trên logic `ef5708f`, lượt 1 | 0 | 4/4, Chromium, 1 worker, 1,2 phút |
| Browser cuối trên logic `ef5708f`, lượt 2 | 0 | 4/4, Chromium, 1 worker, 1,2 phút |

Browser matrix phủ đủ sáu route catalog/voucher ở 1440/360 px, đo không overflow;
media flow dùng file picker có nhãn riêng thay cho control tải tệp mặc định.
`f72fd6e` chỉ là formatting-only cho năm tệp catalog;
typecheck và targeted gate được chạy lại sau format, không thay đổi browser behavior.

## WP-08 verification — tree `3028e3e`

### Commit ledger

| Nhóm | Commit |
| --- | --- |
| Lookup, intake, inspection và unit refresh | `b76cd3f`, `46c252a`, `fb2c936`, `5e2e5fa`, `75f0a6c`, `5139ef5` |
| Stock, projection privacy và layout | `1083b41`, `bc38d00`, `4a5dd49`, `32c523b` |
| Contrast và focus remediation | `3cfe27f`, `a0a6550`, `21ceafd`, `fff6929`, `7a4ffb2`, `237ddfe` |
| Browser audit và capture hygiene | `adeb3a2`, `3028e3e` |

### Fast gate cuối

| Command | Exit | Kết quả |
| --- | ---: | --- |
| `pnpm --filter @rephone/web test` | 0 | 134 file, 646/646 test |
| `pnpm --filter @rephone/api test -- src/modules/inventory` | 0 | 9 file, 125/125 test |
| `pnpm exec prettier --check docs/evidence/fe-09/*.md` | 0 | PASS |
| `git diff --check` | 0 | PASS |

Targeted API inventory chạy controller/service/repository/gateway/validator thật
với dependency test double. Nó là backend service-boundary evidence; không được đánh
đồng với browser suite, nơi toàn bộ `/api/v1/backoffice/**` được route-intercept để
giữ journey và hình ảnh xác định.

### Browser, responsive và accessibility gate

| Lượt | Exit | Kết quả |
| --- | ---: | --- |
| Inventory-stock cuối A, có capture | 0 | 9/9, Chromium; tạo 14 ảnh current-run |
| Inventory-stock cuối B | 0 | 9/9, Chromium; lượt xanh liên tiếp thứ hai trên cùng final tree |
| Axe | 0 | Zero serious/critical |
| Responsive/overflow | 0 | 9 route ở 1440×1000 và 360×800; không overflow |
| Visual review | 0 | 14/14 ảnh trong `.local/fe09/wp08-audit/` được kiểm tra và chấp nhận |

Browser audit trước final gate đã dẫn tới các remediation contrast/focus tại
`3cfe27f`, `a0a6550`, `21ceafd`, `fff6929`, `7a4ffb2`, `237ddfe`. Dev overlay được
loại khỏi capture tại `3028e3e`; chỉ 14 ảnh current-run sau commit này được review và
chấp nhận. Không dùng screenshot như bằng chứng accessibility duy nhất: Axe và
assertion về focus, forced colors, landmark, active item và overflow cung cấp
automated evidence.

Media validation hiện chỉ áp dụng từng tệp: không rỗng, JPEG/PNG/WebP, tối đa 8 MiB.
Không có backend total media-count cap nên command log không ghi một giới hạn tổng giả
định. Việc không có trường lookup reason là quyết định sản phẩm trước WP-08, không
phải regression.

## WP-09 verification — code/browser tree `b10a0d4`

### Commit ledger

| Nhóm | Commit |
| --- | --- |
| Evidence và thao tác tài chính an toàn | `2caa6da`, `91aa642`, `6fe1c11` |
| Queue refresh, response ordering, scroll và focus | `5ffbf04`, `f598b5d`, `15fa16e`, `f391e91`, `5a889d2` |
| Contrast và hình học chi tiết đơn | `aa934db`, `9dc0459`, `91f2870` |
| Finance browser lifecycle | `680dfa2`, `a904f5a`, `0562d27` |
| Warranty và after-sales browser lifecycle | `db09f9f`, `184c3eb` |
| Route/order lifecycle và visual fixture | `1c9a8f3`, `b10a0d4` |

### Fast gate cuối

| Command | Exit | Kết quả |
| --- | ---: | --- |
| `pnpm --filter @rephone/web test` | 0 | 137 file, 663/663 test |
| Browser ownership + operations queue model | 0 | 2 file, 10/10 test |
| `pnpm --filter @rephone/web typecheck` | 0 | PASS |
| `pnpm --filter @rephone/web lint` | 0 | PASS, zero warning |
| Targeted API operations unit/service | 0 | 16 file, 106/106 test |
| Targeted API operations E2E | 0 | 5 file, 42/42 test |
| `pnpm --filter @rephone/api typecheck` | 0 | PASS |
| `pnpm --filter @rephone/api lint` | 0 | PASS, zero warning |

API E2E có cảnh báo deprecation từ `pg` về `client.query()` trong lúc client đã
thực thi, nhưng command thoát `0` và cả 42 test đều xanh. Cảnh báo được giữ trong
log thay vì mô tả như một run hoàn toàn không có warning.

### Browser, responsive và accessibility gate

| Lượt | Exit | Kết quả |
| --- | ---: | --- |
| Operations cuối A, có capture | 0 | 11/11, Chromium, khoảng 2,1 phút; tạo 22 ảnh current-run |
| Operations cuối B | 0 | 11/11, Chromium, khoảng 2,1 phút; lượt xanh liên tiếp thứ hai |
| Responsive/overflow | 0 | 11 route ở 1440×900 và 360×844; không overflow |
| Axe | 0 | Zero serious/critical trên từng route/viewport |
| Visual review | 0 | 22/22 ảnh trong `.local/fe09/wp09-audit/` đã kiểm tra và chấp nhận |

Bốn browser spec dùng route fixture để chứng minh UI, request path/body, loading,
focus, scroll, role presentation và conflict presentation. API unit/service/E2E là
lớp bằng chứng riêng cho authorization, state transition và side effect backend;
không dùng browser fixture để tuyên bố database thật đã được chạy.

Screenshot chỉ chứng minh phần visual. Accessibility được khóa riêng bằng Axe và
assertion về landmark, focus, accessible name và document overflow. Pending lock
chỉ chặn double-submit trong cùng frame; replay sau lỗi mạng mơ hồ vẫn là
`FE9-R15`. Chuỗi trống của native `datetime-local` trên Windows vẫn phụ thuộc
regional locale và được ghi tại `FE9-R16`.

## WP-10 verification — code/browser tree `37527d7`

### Commit ledger

| Nhóm | Commit |
| --- | --- |
| QR cleanup và mutation safety | `945105b`, `f4b45d4`, `e29722d` |
| User master-detail/lifecycle | `bbaca6e`, `9575c11` |
| Settings, audit, health và overview browser lifecycle | `cc5df77`, `708a5c5`, `49a0b4d` |
| Live read-only projection và health binding | `b827261`, `56cd39c` |
| Accessibility remediation | `c83406e`, `5381d17`, `aa18e48`, `3f20abe`, `7f230e6` |
| Route/role/visual matrix | `ee1e837` |
| Workspace format gate | `37527d7` |

### Fast gate cuối

| Command | Exit | Kết quả |
| --- | ---: | --- |
| `pnpm --filter @rephone/web test` | 0 | 138 file, 674/674 test |
| Targeted API system administration unit/service | 0 | 10 file, 79/79 test |
| Targeted API system administration E2E | 0 | 3 file, 15/15 test trên DB sạch |
| `pnpm fe:coverage` | 0 | 2 file, 9/9 executable coverage contract |
| `pnpm fe:a11y` | 0 | 4 file, 21/21 shared accessibility contract |
| Web/API typecheck | 0 | PASS |
| Web/API lint | 0 | PASS, zero warning |
| `pnpm format:check` | 0 | PASS sau formatting-only commit `37527d7` |
| `pnpm build` | 0 | API/web production build; Next sinh đủ route hiện hành |
| `git diff --check` | 0 | PASS |

### Browser, responsive và accessibility gate

| Lượt | Exit | Kết quả |
| --- | ---: | --- |
| System administration A, có capture | 0 | 12/12, Chromium, 1 worker, khoảng 1,8 phút; tạo 25 ảnh current-run |
| System administration B | 0 | 12/12, Chromium, 1 worker, khoảng 1,7 phút |
| Role matrix | 0 | ADMIN đủ sáu route FE-8; EMPLOYEE allow/deny đúng; CUSTOMER/anonymous fail-closed trước child request |
| Responsive/overflow | 0 | 1440×900 và 360×844; zero document overflow |
| Axe | 0 | Zero serious/critical trên success và permission states |
| Visual review | 0 | 25/25 ảnh `.local/fe09/wp10-audit/` đã review |

Route matrix đầu tiên đã đỏ tuần tự tại overview, user administration, settings,
audit và health do contrast/definition-list semantics thật. Các concern được sửa
trong năm commit production riêng rồi matrix mới được chạy lại; lịch sử lỗi không
bị xóa. Browser fixture chứng minh UI/state/role/geometry; API unit/E2E chứng minh
authorization, CAS, redaction, provider và persistence. Live smoke dùng backend
thật, chỉ đọc và đối chiếu health response với nhãn DOM.

Playwright giữ lại warning `NO_COLOR`/`FORCE_COLOR`, Node `DEP0190` và Docker
orphan-container notice. Test vẫn thoát `0`; không dùng `--remove-orphans` vì cleanup
destructive đó ngoài phạm vi WP-10.

## WP-11 verification — code/browser tree `8351095`

### Commit ledger

| Nhóm | Commit |
| --- | --- |
| Post-purchase và catalog five-viewport baseline | `310ba32` |
| Timeline trạng thái giao hàng | `f4eb615` |
| Inventory và operations five-viewport baseline | `1987f26` |
| Skip link và validation focus | `79d8949` |
| Backoffice mobile touch target | `3425590` |
| Cross-cut accessibility/reflow matrix | `0960af8` |
| System administration audit visual matrix | `8351095` |

### Fast gate cuối

| Command | Exit | Kết quả |
| --- | ---: | --- |
| `pnpm --filter @rephone/web test` | 0 | 138 file, 674/674 test |
| `pnpm --filter @rephone/web test:coverage-contract` | 0 | 2 file, 9/9 executable coverage contract |
| `pnpm fe:a11y` | 0 | 4 file, 21/21 shared accessibility contract |
| `pnpm --filter @rephone/web typecheck` | 0 | PASS |
| `pnpm --filter @rephone/web lint` | 0 | PASS, zero warning |
| `pnpm format:check` | 0 | PASS |
| `pnpm --filter @rephone/web build` | 0 | Production build; Next sinh đủ route hiện hành |
| `git diff --check` | 0 | PASS |

### Browser, responsive, accessibility và visual gate

| Lượt | Exit | Kết quả |
| --- | ---: | --- |
| Post-purchase + catalog update | 0 | 2/2; tạo bốn ảnh mobile/desktop đã review |
| Post-purchase + catalog strict | 0 | 2/2; error/permission Axe riêng 2/2 |
| Inventory + operations baseline | 0 | 4/4; bốn ảnh mobile/desktop đã review |
| Operations sau sửa timeline | 0 | Update 1/1; hai lượt strict tiếp theo đều 1/1 |
| Settings validation keyboard | 0 | 1/1; Tab tới summary link, Enter tới field sai |
| System audit matrix update | 0 | 1/1; hai ảnh 390/1440 đã review |
| System audit matrix strict | 0 | 1/1 ở đủ năm viewport |
| FE-0 exact-unit strict | 0 | 1/1; hai ảnh đã review |
| Auth/account strict | 0 | 2/2 |
| Commerce visual strict | 0 | 1/1; 20 snapshot ở năm viewport |
| Release matrix cuối 1 | 0 | 5/5, Chromium, 56,7 giây |
| Release matrix cuối 2 | 0 | 5/5, Chromium, 52,7 giây |

Lịch sử đỏ được giữ lại. FE-0 baseline cũ còn nội dung tiếng Anh “Grade A”; sau khi
đặt ảnh cũ và current cùng viewport, current tiếng Việt “Ngoại hình loại A” được xác
nhận là đúng và hai baseline được cập nhật. Commerce wishlist lệch 69 pixel ở badge
do baseline cũ; reference/current/diff cùng trạng thái đã được review trước khi cập
nhật đủ năm viewport rồi strict run mới chạy xanh.

Cross-cut matrix ban đầu lộ auth `autoFocus` bỏ qua skip link, focus target không
thật và timing sticky; các lỗi được sửa mà không nới geometry/hit-test. Review độc
lập sau đó bắt registry overclaim, keyboard test đặt focus trực tiếp, audit fixture
không hợp contract và icon “Về cửa hàng” mobile chỉ rộng `22 px`. Sau remediation,
touch target storefront/customer/backoffice đều tối thiểu `44×44 px`, Axe chạy cả
bốn shell và hai full matrix cuối xanh liên tiếp. Một targeted reflow run gặp
exact-unit `404` môi trường một lần; lần targeted kế tiếp và cả hai full run cuối đều
xanh, không retry bên trong test.

Playwright tiếp tục phát warning `NO_COLOR`/`FORCE_COLOR`, Node `DEP0190`, `pg`
client-query deprecation ở commerce và Docker orphan-container notice. Không dùng
`--remove-orphans`; proxy `720×450` không được ghi thành native zoom, và không tuyên
bố Firefox/WebKit khi môi trường chưa có bằng chứng.

## WP-12 verification — baseline `783e029`, after `e661e8b`

### Performance và client/media

| Command / lượt | Exit | Kết quả |
| --- | ---: | --- |
| `pnpm performance:audit-client-media --output ...` | 0 | 38 client page, 116 client TSX, 4 consumer/5 raw `<img>` occurrence |
| Baseline production | 1 | Report đủ 12 route; login CLS `0,1212`, order-detail CLS `0,596`; harness cũ gate baseline |
| After production A | 0 | 12/12 route đạt absolute budget, zero runtime issue |
| After production B | 0 | 12/12 route đạt absolute budget, zero runtime issue; xác nhận host variance |
| Comparator baseline → after A | 1 | Bốn relative flag; ba delta interaction tuyệt đối nhỏ và order LCP `+10,06%` |
| Comparator baseline → after B | 1 | Nhiều route không sửa cùng drift; giữ evidence, không nới threshold |
| Comparator contract | 0 | 9/9 |
| Auth + order focused component test | 0 | 7/7 |
| Production web build | 0 | 43/43 static/dynamic route entry; `next-env.d.ts` giữ production import |
| Prettier, ESLint, typecheck, diff check | 0 | PASS |

Hai lỗi visual/performance thật được sửa ở `11a1971` và `e661e8b`. Ảnh baseline,
after-pending và after-ready được so cùng `390×844`; CLS observer và geometry test
xác nhận thay đổi. Report raw ở `.local/release-performance/`; scan không tìm thấy
credential, email, database URL hoặc production PII.

Harness baseline/after semantics được tách tại `8aefcd3`. Performance CI job riêng
tại `6b5fa41` dùng Windows, PostgreSQL test sạch, Chromium, production after gate và
sanitized artifact 14 ngày. CI URL/artifact thật chỉ có sau push và thuộc WP-14.

## WP-13 verification — cleanup tree `a66c114`

### Commit/consumer sequence

WP-13 xóa compatibility và global CSS theo 10 cleanup concern độc lập, cùng hai
snapshot-only commit và hai test/determinism commit. Danh sách đầy đủ cùng rollback
checkpoint nằm trong `wp-13-legacy-cleanup.md`. Consumer scan cuối giữ lại các
bridge `.status`, `.button`, `.eyebrow`, `.wizard-*` và `.inspection-result` vì còn
được intake/inspection dùng thật.

| Gate theo surface | Exit | Kết quả |
| --- | ---: | --- |
| Operations mobile visual strict | 0 | `1/1` sau expected/current/diff review |
| Auth/account focused unit | 0 | `38/38` |
| Auth/account browser | 0 | `9/9`; hai locator stale được sửa và targeted `2/2` |
| Storefront/auth/account browser | 0 | `20/20` sau locator remediation |
| Commerce focused unit | 0 | `25/25` |
| Cart/customer/critical-commerce browser | 0 | `19/19`, gồm 5 viewport visual |
| Payment focused unit/API | 0 | `9/9` + `8/8` |
| Operations browser | 0 | `6/6` |
| Orders/refunds focused unit | 0 | `33/33` |
| Inventory focused unit | 0 | `43/43` |
| Inventory browser | 0 | `9/9` sau một baseline icon stale; strict target `1/1` |
| Production build sau từng concern | 0 | PASS |

### Final tree gate

| Command / lượt | Exit | Kết quả |
| --- | ---: | --- |
| Full web unit/component | 0 | 139 file, `676/676` |
| `pnpm fe:coverage` | 0 | 2 file, `9/9` |
| `pnpm fe:a11y` | 0 | 4 file, `21/21` |
| Web lint/typecheck/build | 0 | PASS; build sinh 43 route entry |
| Release matrix A | 0 | `5/5`, Chromium, khoảng 58 giây |
| Release matrix B | 0 | `5/5`, Chromium, 56,7 giây |
| `pnpm performance:release` | 0 | `12/12` route đạt budget; zero runtime issue |
| Client/media static audit | 0 | 38 client page, 115 client TSX, 3 raw-image consumer / 4 occurrence, 5 layout |
| `git status --short` | 0 | Sạch trước khi ghi evidence |

`globals.css` giảm từ 2.777 xuống 167 dòng vật lý theo cùng phép đếm. Hai snapshot
mobile chỉ đổi sau khi review cùng viewport chứng minh icon dịch `11 px` vì touch
target `44 px`; không bulk-update và không nới threshold. Performance raw report ở
`.local/release-performance/wp13-after.json`; advisory client/media report ở
`.local/release-performance/wp13-client-media.json`. Cả hai không được commit.

## WP-14 local release closeout — release candidate `de82f60`

### Contract remediation

| Residual | Commit | Focused proof |
| --- | --- | --- |
| FE9-R13 — registration enumeration | `266e2ce`, `fdc4242`, `890622c` | Email mới/trùng cùng HTTP `201` và response chung; browser không thấy `DUPLICATE_RESOURCE`; generated contract sạch |
| FE9-R14 — checkout preview authority | `88b1da9`, `d818e0a`, `890622c` | Fingerprint bao phủ full preview; stale fingerprint trả `409` kèm preview mới; downstream fixture đồng bộ tại `467bc48`, `cc2cb1d` |
| FE9-R15 — refund replay | `e8aefbe`, `26bfa48`, `890622c` | UUID idempotency key + request fingerprint; sequential/concurrent replay hội tụ, payload mismatch bị từ chối |
| FE9-R18 — engine coverage | `587be7c`, `65ed527`, `5958751` | WebKit skip-link fix, cross-browser smoke config và CI job đa engine |

### Exact ownership

| Command | Exit | Kết quả |
| --- | ---: | --- |
| `pnpm fe:coverage` | 0 | 2 file, `9/9`; 162 operation, 56 route, 13 state, 12 browser suite, 93 scenario trong 20 spec file |
| `pnpm verify:generated` | 0 | OpenAPI/generated client không drift |

Coverage contract kiểm exact set và fail-closed: operation manifest bằng OpenAPI,
56 route đều `EXISTING` và có đúng một primary owner, mọi state có owner, không có
browser test thiếu/ngoài registry.

### Lịch sử gate đỏ và remediation

| Lượt | Exit | Kết quả |
| --- | ---: | --- |
| Full release sau contract change | 1 | 32 API E2E đỏ vì fixture downstream chưa gửi preview fingerprint; sửa riêng tại `467bc48`, `cc2cb1d`, targeted downstream `36/36` |
| Production smoke đầu | 1 | Tất cả probe runtime xanh; cleanup guard từ chối vì harness đọc label container sai vị trí. Project được kiểm đúng rồi dọn có kiểm soát; `50b6cc9` sửa phép đọc label |
| Performance preflight đầu | 1 | Clean-tree guard từ chối do tệp infra của agent song song chưa commit; không phải regression runtime |
| Rollback shell đầu | 1 | Harness đọc unstaged thay vì staged diff và gọi Vitest config không tồn tại; sửa harness rồi rehearsal lại |
| Release trước candidate cuối | 1 | Chromium `89` đạt, `2` lỗi, `2` chưa chạy: auth test còn copy đăng ký cũ và snapshot mobile lệch 107 pixel do touch target 44 px có chủ ý |
| Targeted remediation | 0 | Auth/account full file `9/9`; visual update `1/1`, strict no-update `1/1`; commit `ecdc8e0`, `de82f60` |

### Hai release pass nội bộ cuối trên `de82f60`

| Gate trong mỗi pass `verify:release:once` | Pass 1/2 | Pass 2/2 |
| --- | ---: | ---: |
| Format, lint, typecheck | PASS | PASS |
| Web unit/component | 139 file, `677/677` | 139 file, `677/677` |
| API unit | 119 file, `705/705` | 119 file, `705/705` |
| Script contract | `11/11` | `11/11` |
| Test database | 13 migration | 13 migration |
| Integration | 12 file, `55/55` | 12 file, `55/55` |
| API E2E | 14 file, `103/103` | 14 file, `103/103` |
| Coverage | 145 file, `863/863` | 145 file, `863/863` |
| Production build | 43 page/route entry | 43 page/route entry |
| Full Chromium | `93/93` | `93/93` |

Hai pass có cùng coverage: statements `88,11%`, branches `76,17%`, functions
`84,06%`, lines `93,19%`. Không retry/skip/fixme để đạt kết quả cuối.

### Production smoke và performance tại runtime SHA `50b6cc9`

| Gate | Exit | Kết quả |
| --- | ---: | --- |
| `Invoke-ProductionSmoke.ps1` lượt cuối | 0 | Compiled `api-operations`, `api-runtime`, `web-runtime`; PostgreSQL `17.6`; TLS `verify-full`; internal-only network |
| Runtime probes | 0 | Live/ready/public; anonymous account `401`; customer account `200`; customer backoffice `403`; admin overview/health; version SHA; web health |
| Dependency projection | 0 | Database/API healthy; storage và mail cố ý offline bằng `example.invalid` và được báo đúng trạng thái |
| Cleanup proof | 0 | Còn `0` container, `0` network, `0` volume của project smoke |
| `pnpm performance:release` | 0 | `12/12` route đạt absolute budget; zero runtime issue; Chromium Windows `390×844`, CPU ×4, latency 40 ms |

`git diff 50b6cc9..de82f60` chỉ có auth browser test copy và một PNG snapshot catalog
mobile đã review; không có thay đổi runtime production giữa hai SHA.

### Cross-browser và rollback

| Gate | Exit | Kết quả |
| --- | ---: | --- |
| `pnpm test:browser:cross-browser-smoke` | 0 | Firefox `1/1`, WebKit `1/1` |
| Revert shared shell `a39c923` | 0 | Đúng một file; shell `7/7`, lint/typecheck xanh |
| Revert global CSS `a66c114` | 0 | Inventory 20 file, `68/68`; lint/typecheck/build 43 route xanh |
| Revert geometry `11a1971` | 0 | Auth `5/5`; lint/typecheck/build 43 route xanh |

Rehearsal chạy trong worktree tạm và được dọn sạch; không rollback database hoặc
business state.

### Release hold còn lại

WP-14 là **LOCAL PASS — RELEASE HOLD** nhưng FE-09 vẫn `IN PROGRESS`. Người
dùng/Product đã chấp nhận `FE9-R16`, `FE9-R17` ngày 02/09/2026. Chưa push nên chưa
có CI URL, performance/cross-browser artifact hoặc redaction review (`FE9-R05`,
`FE9-R08`, `FE9-R10`, `FE9-R18`). Tổng hợp tại `wp-14-release-closeout.md`.
