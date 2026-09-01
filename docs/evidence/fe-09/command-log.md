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
