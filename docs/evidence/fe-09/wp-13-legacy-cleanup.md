# WP-13 — Legacy cleanup có kiểm soát

> Trạng thái: **PASS cục bộ**  
> Tree đã kiểm: `a66c1146361f553b29b1336ac6dfe38823e08898`  
> Nhánh: `feat/fe-9-release-hardening`  
> Phạm vi: compatibility component, selector global không còn consumer và snapshot
> mobile đã cũ sau thay đổi touch target có chủ ý

## Kết quả

WP-13 xóa legacy theo từng owner thay vì dọn hàng loạt. Mỗi nhóm đều được khóa bằng
consumer scan, test của surface, browser regression và production build trước khi
chuyển sang nhóm kế tiếp.

- `apps/web/app/catalog-ui.tsx` đã được xóa sau khi xác nhận zero consumer.
- `apps/web/app/globals.css` giảm từ **2.777** xuống **167 dòng vật lý** trên cùng
  cách đếm, nhưng vẫn giữ các bridge toàn cục còn consumer thật.
- Diff WP-13 của hai file legacy chính là **31 dòng thêm / 2.745 dòng xóa**; mục
  tiêu là xóa dead code có bằng chứng, không phải đạt một số dòng tùy ý.
- Hai baseline mobile được cập nhật riêng sau khi so expected/current/diff cùng
  viewport và chứng minh icon chỉ dịch đúng `11 px` do vùng bấm `44 px` đã được
  thêm có chủ ý; hình dạng và weight icon không đổi.
- Final tree đạt full web unit `676/676`, coverage contract `9/9`, shared a11y
  `21/21`, lint, typecheck, production build, hai lượt release matrix `5/5` và
  performance production `12/12` route.

## Commit ledger và rollback checkpoint

| Concern | Commit | Consumer / regression proof | Rollback độc lập |
| --- | --- | --- | --- |
| Nút order cũ | `e7eda52` | Zero selector consumer; operations owner vẫn xanh | Revert riêng commit |
| Catalog compatibility component | `c4ffbfc` | Zero import/reference; catalog build/browser xanh | Revert riêng commit |
| System administration global CSS | `b59bdbb` | CSS Module là owner; system-admin regression xanh | Revert riêng commit |
| Warranty global CSS | `f18f2e6` | Zero legacy consumer; post-purchase regression xanh | Revert riêng commit |
| Context icon determinism | `a39c923` | Khóa explicit regular weight | Revert riêng commit |
| Operations mobile baseline | `8067a30` | Expected/current/diff; strict visual `1/1` | Revert snapshot riêng |
| Auth/account global CSS | `d42ef01` | Giữ `.status` do intake Suspense còn dùng; auth/account `9/9` | Revert riêng commit |
| Login locator | `716cccd` | Hai helper dùng chính xác `#password`; targeted `2/2` | Revert riêng commit |
| Storefront global CSS | `07cd5ca` | Storefront/auth/account regression; production build xanh | Revert riêng commit |
| Commerce global CSS | `951ea1f` | Cart/customer/critical-commerce `19/19` | Revert riêng commit |
| Payment global CSS | `24327bd` | Payment unit `9/9`, API `8/8`, operations `6/6` | Revert riêng commit |
| Operations global CSS | `0921d6d` | Orders/refunds unit `33/33`, operations `6/6` | Revert riêng commit |
| Inventory mobile baseline | `3bd9318` | Expected/current/diff; strict visual `1/1` | Revert snapshot riêng |
| Inventory global CSS | `a66c114` | Inventory unit `43/43`, browser `9/9`, build xanh | Revert riêng commit |

Không commit nào trong WP-13 yêu cầu migration database hoặc sửa business state.

## Bridge toàn cục được giữ lại

Consumer scan cuối không cho phép xóa nguyên khối inventory. Các selector sau vẫn
có consumer thật và được giữ có chủ ý:

- nền tảng: `:root`, reset `*`, `body`, `a`, heading và typography;
- primitive chia sẻ: `.eyebrow`, `.status`, `.actions`, `.button`;
- intake/inspection bridge: `.wizard-header`, `.wizard-alert`, `.wizard-actions`,
  `.inspection-result` và responsive rule liên quan.

Trong lúc cleanup auth, scan trực tiếp còn bắt được `.status` trong intake Suspense
fallback mà scan theo nhóm ban đầu bỏ sót. Selector này được giữ lại thay vì tin
vào kết quả zero-consumer chưa đầy đủ.

## Lịch sử lỗi và cách xử lý

| Lượt đỏ | Nguyên nhân | Cách xử lý |
| --- | --- | --- |
| Auth/account browser `7/9` | Locator nhãn “Mật khẩu” khớp nhiều control sau markup mới | Target đúng `#password`; hai case chạy lại `2/2` |
| Operations visual `0/1` | Baseline cũ trước thay đổi vùng bấm icon `44 px` | So ba ảnh cùng viewport, chứng minh dịch `11 px`, cập nhật một baseline rồi strict `1/1` |
| Inventory browser `8/9` | Cùng baseline icon mobile đã cũ | Review expected/current/diff, cập nhật đúng một baseline rồi strict `1/1` |

Không nới threshold, không thêm retry và không dùng bulk snapshot update.

## Final verification trên tree `a66c114`

| Gate | Kết quả |
| --- | --- |
| Full web unit/component | PASS — 139 file, `676/676` |
| Executable coverage contract | PASS — 2 file, `9/9` |
| Shared accessibility contract | PASS — 4 file, `21/21` |
| Web lint | PASS — zero warning |
| Web typecheck | PASS |
| Web production build | PASS — 43 route entry |
| Release matrix lượt A | PASS — `5/5`, Chromium, khoảng 58 giây |
| Release matrix lượt B | PASS — `5/5`, Chromium, 56,7 giây |
| Production performance | PASS — `12/12` route, zero runtime issue |
| Client/media audit | PASS tư vấn — 38 client page, 115 client TSX, 3 raw-image consumer / 4 occurrence, 5 layout |
| Working tree / generated route import | Sạch; `next-env.d.ts` dùng `.next/types/routes.d.ts` |

Performance final tree dùng một warm-up và ba sample/route. Tất cả route đạt budget
tuyệt đối; LCP cao nhất là guest cart `1.728 ms`, CLS cao nhất là customer account
`0,07`. Report raw nằm trong `.local/release-performance/` và không được commit.
Warning standalone output của `next start` vẫn xuất hiện từ harness nhưng bài đo
thoát `0`, không có console/page/request runtime issue.

## Acceptance mapping

| Acceptance WP-13 | Kết quả |
| --- | --- |
| Một owner/concern mỗi cleanup commit | PASS |
| Có consumer scan, build và browser owner proof | PASS |
| Không đặt mục tiêu giảm dòng tùy ý | PASS — selector còn consumer được giữ |
| Rollback không cần migration/business-state repair | PASS |

## Handoff WP-14

Tại thời điểm đóng WP-13, handoff yêu cầu WP-14 chốt `FE9-R13`–`FE9-R18`, release
gate, production smoke, ownership exact-set, rollback và CI thật. WP-14 sau đó đã
đóng `FE9-R13`–`FE9-R15` và hoàn tất toàn bộ gate cục bộ. Người dùng đã chấp nhận
`FE9-R16`, `FE9-R17`; hiện chỉ còn CI/artifact trước khi FE-09 được chuyển `DONE`.
Trạng thái hiện hành nằm tại [WP-14 release closeout](./wp-14-release-closeout.md).
