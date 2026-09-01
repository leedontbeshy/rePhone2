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
