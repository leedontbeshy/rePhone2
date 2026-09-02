# FE-09 WP-12 — Performance, client boundary và media

> Trạng thái: **PASS CỤC BỘ; CI ARTIFACT CHỜ PUSH**<br>
> Baseline SHA: `783e029bff5203fc67df0f3651fd6607999ef159`<br>
> After SHA: `e661e8b16c0e1f15892481686a4ca976a838dc21`<br>
> CI gate implementation: `6b5fa41`<br>
> Ngày đo: 02/09/2026<br>
> Raw artifact: `.local/release-performance/` và `.local/release-performance/visual/`

## Kết luận

WP-12 đã đo đủ 12 route đại diện trên production web build với API/PostgreSQL test
thật, sửa hai lỗi CLS được baseline chỉ ra và đo lại hai lượt độc lập. Cả hai lượt
`after` đều đạt toàn bộ budget tuyệt đối: LCP không quá `2.500 ms`, CLS không quá
`0,1`, interaction proxy không quá `200 ms`; không có hydration warning, page error
hoặc runtime issue.

- Login: CLS giảm từ `0,1212` xuống `0,0065`.
- Chi tiết đơn khách hàng: CLS giảm từ `0,596` xuống `0`.
- Client JavaScript chỉ tăng `315 byte` ở login và `425 byte` ở chi tiết đơn,
  tương ứng khoảng `0,15%` và `0,20%`.
- Không chuyển hàng loạt Server/Client Component, provider hoặc raw `<img>` vì số đo
  không chứng minh lợi ích đủ lớn và media host allowlist chưa có proof triển khai.
- Relative comparator vẫn giữ nguyên ngưỡng `>10%` và vẫn báo đỏ. Hai lượt `after`
  trên cùng SHA đảo chiều/tăng giảm ở nhiều route không sửa, cho thấy host cục bộ
  chưa ổn định đủ để dùng phần trăm tương đối làm release gate. Quyết định là giữ
  báo cáo này như evidence, dùng budget tuyệt đối làm CI gate và chỉ đóng rủi ro
  variance sau artifact trên cùng loại runner tại WP-14; không xóa run hoặc nới
  threshold để làm xanh giả.

## Giao thức đo

| Thuộc tính | Giá trị |
| --- | --- |
| Web runtime | Next production build, `next start` |
| API runtime | Nest full-stack test harness qua `tsx`; compiled API smoke thuộc WP-14 |
| Database | PostgreSQL test riêng, dữ liệu được chuẩn bị ngoài timed path |
| Browser | Chromium trên Windows, zero retry, một worker |
| Viewport | `390×844` |
| CPU / network | CPU ×4; latency 40 ms; download/upload 10/5 Mbps |
| Media | Deterministic public media |
| Sampling | Một warm-up + ba sample/route; báo cáo median |
| Metric | LCP, CLS, interaction proxy, navigation, request, bytes, client JS |
| Runtime guard | Route ready, metric bắt buộc, page error và hydration warning |
| Privacy | Chỉ lưu route template/path đã bỏ query; không lưu cookie/token/email/DB URL |

Session khách hàng/quản trị, order và inventory data được chuẩn bị ngoài đoạn đo.
Dynamic ID không xuất hiện trong report. Scan artifact không tìm thấy credential,
production PII hoặc database URL; những chuỗi như `password`/`token` trong static
audit chỉ là tên file hoặc tên hook trong source inventory.

## Baseline và after report

| Lượt | SHA sạch | Report | Exit | Kết quả |
| --- | --- | --- | ---: | --- |
| Baseline | `783e029` | `wp12-baseline.json` | 1 | Đủ 12 route; login và order-detail vượt CLS. Harness cũ vẫn gate baseline |
| After A | `e661e8b` | `wp12-after.json` | 0 | 12/12 route đạt absolute budget |
| After B | `e661e8b` | `wp12-after-repeat.json` | 0 | 12/12 route đạt absolute budget; xác nhận variance tương đối |

Harness được sửa tại `8aefcd3` để baseline hoàn chỉnh vẫn ghi report và chỉ chế độ
`after` mới gate budget tuyệt đối. Thiếu metric, route chưa ready, page error hoặc
hydration warning vẫn làm cả hai chế độ thất bại.

Đơn vị LCP/interaction là mili giây.

| Route | LCP baseline → after A / B | CLS baseline → after A / B | Tương tác baseline → after A / B |
| --- | ---: | ---: | ---: |
| storefront-model | 496 → 484 / 508 | 0 → 0 / 0 | 79,5 → 71,6 / 78,9 |
| storefront-exact-unit | 568 → 588 / 584 | 0 → 0 / 0 | 68,3 → 69,5 / 76,8 |
| login | 316 → 316 / 336 | 0,1212 → 0,0065 / 0,0065 | 14 → 15,8 / 18,7 |
| customer-account | 340 → 324 / 344 | 0,0733 → 0,0733 / 0,0733 | 71,6 → 69,2 / 78,3 |
| guest-cart | 1.684 → 1.624 / 1.736 | 0 → 0 / 0 | 70,7 → 71,5 / 76,2 |
| guest-checkout | 1.624 → 1.600 / 1.912 | 0 → 0 / 0 | 69,7 → 69,1 / 82,9 |
| customer-order-detail | 1.432 → 1.576 / 1.852 | 0,596 → 0 / 0 | 75,2 → 75,1 / 88,2 |
| backoffice-catalog-product-detail | 1.552 → 1.508 / 1.772 | 0,0614 → 0,0614 / 0,0614 | 111,3 → 115,3 / 148,3 |
| backoffice-inventory-intake | 1.248 → 1.220 / 1.408 | 0 → 0 / 0 | 17,7 → 20 / 26,3 |
| backoffice-order-detail | 1.568 → 1.568 / 1.368 | 0 → 0 / 0 | 9,5 → 11,4 / 14,3 |
| backoffice-audit-log | 1.216 → 1.200 / 1.312 | 0 → 0 / 0 | 32,7 → 34,2 / 42,1 |
| backoffice-system-health | 1.140 → 1.144 / 1.176 | 0 → 0 / 0 | 16,9 → 16,6 / 17,2 |

### Quyết định về relative comparator

Comparator A báo bốn cờ: ba interaction delta tuyệt đối `1,8–2,3 ms` và LCP chi
tiết đơn `+144 ms`. Comparator B báo thêm nhiều route không đổi code cùng chậm hơn,
trong khi storefront-model và backoffice-order-detail lại cải thiện ở chỉ số khác.
Transferred bytes/client JS/request count gần như bất biến giữa hai lượt.

Vì cả hai report `after` đều đạt absolute budget và lượt B cho thấy drift toàn host,
WP-12 chấp nhận phần tăng LCP của order loading để loại CLS nghiêm trọng, đồng thời
không dùng relative result cục bộ làm claim cải thiện. CI mới chạy absolute `after`
gate trên Windows sạch; relative gate chỉ được nâng thành required khi có baseline
bất biến từ cùng runner/profile. Quyết định này thực thi FE9-R08, không thay đổi
ngưỡng comparator.

## Remediation và visual proof

### Login

- Commit `11a1971` giữ trước geometry của form hai trường bằng skeleton cùng design
  system, có trạng thái tiếng Việt và `aria-busy`.
- Baseline loading panel cao khoảng `206 px`, sau tối ưu khoảng `525 px`, gần trạng
  thái ready `543 px`; CLS đo lại `0,0065`.
- Ảnh cùng viewport/state: `login-baseline-pending.png`,
  `login-after-pending.png`, `login-after-ready.png`.

### Chi tiết đơn khách hàng

- Commit `e661e8b` thay loading title đơn lẻ bằng skeleton header, lifecycle và detail
  grid; giữ footer dưới viewport trong lúc tải.
- Main loading baseline cao khoảng `259 px`; sau tối ưu khoảng `1.225 px`; delayed
  response diagnostic không còn layout-shift entry.
- Ảnh cùng viewport/state: `customer-order-baseline-pending.png`,
  `customer-order-after-pending.png`, `customer-order-after-ready.png`.

Reference và current đã được đặt cạnh nhau ở cùng `390×844` để review spacing,
overflow, footer, header và trạng thái ready. Screenshot không được dùng một mình:
CLS observer, geometry assertion và focused component test là evidence chức năng.

## Client boundary và media audit

Static audit tại `3704754` ghi:

| Chỉ số | Kết quả |
| --- | ---: |
| Client `page.tsx` | 38 |
| Client TSX | 116 |
| Wrapper candidate / client-required / needs-review | 21 / 17 / 0 |
| Raw `<img>` consumer / occurrence | 4 / 5 |
| `next/image` consumer | 0 |
| Remote media allowlist | Chưa cấu hình |
| Root provider | `AuthProvider`, `CommerceProvider` |

Static scan chỉ là advisory. Kiểm build cho thấy 57 rendered manifest hiện đều dùng
commerce boundary; di chuyển provider ước tính chỉ giảm khoảng 3–4% JavaScript ở
route không dùng commerce nhưng có nguy cơ reset cart/session queue. Raw media hiện
có fallback an toàn còn `next/image` thiếu allowlist và deployment proof. Vì route
after đã trong budget, WP-12 không thực hiện chuyển đổi hàng loạt theo cảm tính; các
consumer dead-code thật được xử lý riêng ở WP-13.

Không ghi giảm request `37 → 30` ở order-detail thành tối ưu API: khác biệt chủ yếu
đến từ timing Next prefetch. Request nghiệp vụ vẫn là một order GET và một auth
refresh, không có endpoint/N+1 mới.

## CI và gate đã chạy

- `30cad15`: production route harness 12 route.
- `11a1971`: auth loading geometry.
- `e661e8b`: customer order loading geometry.
- `8aefcd3`: tách baseline capture khỏi after release gate.
- `6b5fa41`: performance job Windows riêng, database sạch, client/media audit,
  production after report và sanitized artifact 14 ngày.
- Focused auth/order component test: `7/7`.
- Comparator contract: `9/9`.
- Prettier, ESLint, typecheck, production build và `git diff --check`: PASS.

### Xác nhận production WP-14

WP-14 chạy lại production performance trên runtime code SHA `50b6cc9` với cùng
profile `390×844`, CPU ×4 và latency 40 ms: **12/12 route đạt absolute budget**,
zero runtime issue. Production container smoke cũng dựng compiled API/web cùng
PostgreSQL test cô lập, kiểm health/projection rồi dọn còn 0 container/network/volume
của project smoke. Hai commit sau runtime SHA chỉ đổi auth test copy và một PNG
baseline đã review; không đổi code runtime.

CI job chưa thể có URL/artifact thật khi nhánh chưa được push. Đây là điều kiện còn
lại của WP-14, không làm thay đổi kết luận local WP-12.

## Giới hạn và handoff

- Đây là synthetic local Chromium/Windows, không phải real-user monitoring, load
  test hay kết luận cross-browser.
- Interaction proxy bằng hai animation frame, không phải field INP.
- API performance harness chạy source qua `tsx`; compiled API/production image smoke
  đã đạt cục bộ ở WP-14, còn CI artifact trên release SHA chưa có.
- Static boundary audit không tự chứng minh một chuyển đổi Server Component an toàn.
- Raw report và ảnh giữ ở `.local/`; chỉ summary đã làm sạch được commit.
- WP-13 chỉ xóa legacy sau consumer scan, build và browser proof; WP-14 đã đóng
  FE9-R13–R15 cục bộ, nhưng vẫn phải kiểm CI artifact và chốt FE9-R16/R17 trước khi
  chuyển FE-09 sang `DONE`.
