# FE-09 WP-11 — Ma trận accessibility, responsive và visual

> Trạng thái: **PASS trong phạm vi Chromium cục bộ, kèm giới hạn đã ghi rõ**  
> Phạm vi: tám miền giao diện từ storefront đến quản trị hệ thống  
> Viewport chuẩn: `320×844`, `390×844`, `768×1024`, `1024×768`, `1440×900`  
> Ngày kiểm tra: 02/09/2026  
> Release SHA và CI artifact cuối: ghi tại WP-14 sau khi cây thay đổi được commit

## Kết luận

WP-11 đã khóa ma trận đại diện cho tám miền giao diện, bổ sung suite cross-cutting
`browser:release-matrix` và tạo các ảnh chuẩn còn thiếu cho post-purchase, catalog,
inventory, operations và system administration. Hai lượt cuối của release matrix
đều đạt `5/5`; không còn Axe finding mức `serious` hoặc `critical` trong các state
được chọn; các kiểm tra bàn phím, skip link, touch target, reduced motion, forced
colors và hình học sticky đều xanh.

Kết quả này không được diễn giải thành chứng nhận WCAG đầy đủ hoặc bằng chứng đa
trình duyệt. Ma trận hiện chạy trên Chromium/Windows; kiểm tra “200%” là proxy CSS
viewport `720×450`, không phải native browser zoom. Các giới hạn được ghi chi tiết ở
cuối tài liệu.

## Ma trận tám miền

| Miền | Route/state đại diện | Responsive và accessibility evidence | Ảnh chuẩn đại diện |
| --- | --- | --- | --- |
| Storefront | `/`, sáu route public, dòng máy và máy cụ thể | `responsive-route-matrix` đo 320/768/1024/1440; 390 được kiểm tra ở menu, keyboard, sticky purchase và visual; Axe mobile 320; search, dialog và Escape/restore focus dùng bàn phím | Bốn ảnh `fe1-model-detail-*` và `fe1-exact-unit-dossier-*`; hai ảnh FE-0 exact-unit được strict-check lại trên cây WP-11 |
| Auth/account | `/login` error; `/account` success; route đăng ký/khôi phục/bảo mật | Axe trên auth error và customer account; 320/390/1024/1440; release matrix kiểm skip link và forced-colors trên link/input/button | `fe2-login-error-mobile-390-*`, `fe2-account-profile-success-desktop-*` |
| Commerce | `/cart`, `/wishlist`, `/checkout` preview và conflict | Bốn state × đủ năm viewport; mỗi state đo document overflow và Axe serious/critical | 20 ảnh: `fe3-cart-populated-*`, `fe3-wishlist-populated-*`, `fe3-checkout-preview-*`, `fe3-checkout-conflict-*` |
| Post-purchase | Chi tiết đơn chưa thanh toán; order/warranty/after-sales success và guest error | Chi tiết đơn chạy đủ năm viewport; các route còn lại chạy mobile; Axe trên success, cancel, guest denial, warranty và after-sales | `wp11-post-purchase-order-detail-unpaid-{mobile-390,desktop-1440}-*` |
| Catalog/voucher | Chi tiết sản phẩm `Bản nháp`, permission state và các dialog lifecycle | Chi tiết sản phẩm chạy đủ năm viewport; sáu route và dialog kiểm thêm ở 390/1440; Axe trên success, permission và dialog | `wp11-catalog-product-detail-draft-{mobile-390,desktop-1440}-*` |
| Inventory | Intake đang tiếp tục/upload; lookup not-found và provider-error | Đủ năm viewport; document overflow, sticky topbar, CTA trong viewport và hit-test; Axe trên hai error state lookup | `wp11-inventory-intake-resume-{mobile-390,desktop-1440}-*` |
| Operations | Chi tiết đơn ở bước đang giao; concurrent-modification | Đủ năm viewport; detail rail sticky từ 1024 và static ở width nhỏ; CTA/hit-test; route matrix 11 route còn kiểm desktop/mobile; Axe trên conflict | `wp11-operations-order-processing-{mobile-390,desktop-1440}-*` |
| System administration | Audit deep-link với record đang chọn, metadata dài và dữ liệu đã che | Đủ năm viewport; current nav, selected row, long-content wrap, document overflow và Axe tại mỗi width; permission matrix giữ fail-closed | `wp11-system-admin-audit-selected-{mobile-390,desktop-1440}-*` |

Đây là ma trận representative route/state, không phải tích Descartes của mọi route ×
mọi state × mọi viewport. Năm viewport chuẩn đều xuất hiện trong ma trận; commerce
và năm miền từ post-purchase đến system administration chạy trọn bộ năm kích thước.
Storefront kết hợp route matrix 320/768/1024/1440 với interaction/visual 390.
Auth/account có evidence trực tiếp ở 320/390/1024/1440 nhưng chưa có scenario auth
riêng ở đúng 768 px; breakpoint trung gian được đại diện bởi các shell/product khác,
không được ghi nhận như một phép đo auth 768 độc lập.

## Ma trận viewport và hình học

| Viewport | Mục tiêu được khóa |
| --- | --- |
| `320×844` | Chiều rộng nhỏ nhất, không document overflow, menu/search mobile, CTA và touch target quan trọng |
| `390×844` | Mobile chuẩn để review ảnh, dialog, form, sticky action và nội dung dài |
| `768×1024` | Chuyển tiếp tablet; grid/rail không ép tràn, action vẫn đọc và thao tác được |
| `1024×768` | Chuyển tiếp laptop; sidebar/detail rail sticky chỉ khi đủ không gian |
| `1440×900` | Desktop chuẩn; alignment, mật độ thông tin, selected state và full-page visual |

Inventory và operations đo thêm rằng CTA hiện hữu nằm trong viewport và điểm giữa
control thật sự nhận hit-test. System administration dùng actor, user-agent và
metadata dài để khóa wrap, trong khi `resourceId` vẫn là UUID và `requestId` vẫn
nằm trong giới hạn contract backend. Storefront reflow proxy kiểm control focus thật
không bị header hoặc purchase bar che, rồi xác nhận purchase bar được bàn giao đúng
khi footer vào viewport.

## Accessibility cross-cutting

### Skip link và bàn phím

`browser:release-matrix#skip-links-and-axe` kiểm bốn shell đại diện:

- storefront `/`;
- auth `/login`;
- customer `/account`;
- backoffice `/backoffice`.

Ở mỗi shell, phím `Tab` đầu tiên đưa focus tới “Chuyển đến nội dung chính”, liên kết
nằm trong viewport, và `Enter` đưa focus tới `main#main-content`. Lần chạy đầu phát
hiện `autoFocus` của form đăng nhập chiếm focus trước skip link; `autoFocus` đã được
gỡ khỏi login, register và forgot-password rồi scenario chạy lại xanh.

`browser:release-matrix#keyboard-master-detail-focus` dùng `Tab` từ đầu trang để tới
nhân viên thứ hai rồi mở bằng `Enter`, xác nhận heading chi tiết nhận focus, sau đó
`Tab` tới “Quay lại danh sách” và `Enter` trả focus về heading danh sách. Error
summary của cấu hình cửa hàng cũng được tới bằng `Tab`, không đặt focus trực tiếp
trong test. Các suite surface tiếp tục giữ các journey riêng như search suggestion,
mobile menu, filter/dialog Escape, form error focus và dialog focus restoration.

### Touch target 44 px

Tại 320 và 390 px, release matrix đo bounding box của tám control quan trọng:

- nút mở danh mục;
- liên kết giỏ hàng;
- nút đóng menu;
- ô tìm kiếm trong menu mobile.
- nút mở danh mục và nút đăng xuất trong tài khoản khách hàng;
- liên kết về cửa hàng và nút đăng xuất trong backoffice.

Cả chiều rộng và chiều cao của từng target đều `>= 44 px`. Scenario còn xác nhận
`Escape` đóng menu, trả focus về trigger và không tạo document overflow. Đây là mẫu
critical target có chủ đích trên storefront, customer và backoffice; chưa phải phép
đo mọi control trên toàn bộ 56 route. Lượt mở rộng đầu tiên bắt được liên kết icon
“Về cửa hàng” ở mobile chỉ rộng `22 px`; production CSS đã được sửa thành tối thiểu
`44×44 px` rồi chạy lại xanh.

### Reduced motion

`browser:release-matrix#reduced-motion` chạy storefront và backoffice với
`prefers-reduced-motion: reduce`. Test xác nhận media query đang active,
`scroll-behavior` tính toán là `auto`, animation/transition của các control đại diện
về gần `0 ms`, không lặp animation, và skip-link journey vẫn hoạt động. Bằng chứng
dùng computed style, không dựa vào cảm nhận từ ảnh chụp.

### Forced colors và focus visibility

`browser:release-matrix#forced-colors-focus` chạy với `forced-colors: active` và đưa
focus lần lượt tới:

- link wordmark, input email và nút đăng nhập;
- navigation item hiện tại và nút đăng xuất backoffice.

Mỗi control phải thực sự nhận focus và có computed outline khác `none`, rộng tối
thiểu `2 px`. Đây là kiểm tra representative link/button/input/navigation, không
phải review trực quan toàn bộ từng page trong Windows High Contrast.

### Axe

Ngưỡng release là không có Axe finding mức `serious` hoặc `critical`. Axe được chạy
trên success cùng error/permission/conflict phù hợp, gồm:

- storefront, auth, customer account và backoffice overview ở success state
  cross-cut;
- auth error và account success;
- cart/wishlist/checkout preview/conflict tại ma trận visual;
- post-purchase guest denial và customer lifecycle;
- catalog permission, draft detail và lifecycle dialog;
- inventory not-found/provider-error;
- operations concurrent-modification cùng route matrix;
- system audit selected ở năm viewport và permission route matrix.

Các scan dùng WCAG A/AA, 2.1 AA và 2.2 AA khi suite khai báo tag. Axe là gate tự
động tối thiểu; keyboard, focus, accessible name, role/landmark, overflow và geometry
assertion là các lớp bằng chứng độc lập.

## Proxy reflow 200% và sticky obstruction

`browser:release-matrix#touch-targets-and-reflow-proxy` dùng viewport CSS `720×450`
làm proxy xác định cho layout `1440×900` ở 200%. Scenario trên trang máy cụ thể:

1. xác nhận không có document overflow;
2. đưa purchase actions vào viewport và chờ hai animation frame cho
   `IntersectionObserver` ổn định;
3. focus một link nội dung thật, không dùng heading không focusable;
4. dùng `expect.poll` để khóa đồng thời bounding box nằm dưới sticky header, nằm trên
   purchase bar và `elementFromPoint` trúng chính control;
5. cuộn tới footer và xác nhận purchase bar được gỡ đúng lúc.

Hai lượt cuối đều xanh sau khi thêm bước ổn định hai frame. Bằng chứng này chỉ chứng
minh CSS reflow/hình học ở viewport tương đương; Playwright không đặt native browser
zoom 200%, nên không được ghi thành kết quả zoom thật.

## Ảnh chuẩn và quy tắc review

Cây WP-11 hiện có 38 PNG liên quan tám miền cùng foundation regression:

- 4 storefront discovery;
- 2 auth/account;
- 20 commerce, tức bốn state × năm viewport;
- 2 post-purchase;
- 2 catalog/voucher;
- 2 inventory;
- 2 operations;
- 2 system administration;
- 2 FE-0 exact-unit để khóa shared visual foundation.

Mười ảnh mới của WP-11 ở post-purchase, catalog, inventory, operations và system
administration đã được mở ở kích thước gốc và review. Commerce strict compare chạy
lại đủ 20 ảnh sau baseline review; auth matrix và hai ảnh FE-0 exact-unit cũng chạy
lại xanh. Bốn ảnh storefront discovery giữ bằng chứng review/no-update đã chấp nhận
tại WP-03; WP-11 bổ sung strict exact-unit ở lớp foundation thay vì tuyên bố đã tạo
lại toàn bộ storefront baseline.

Mười đường dẫn mới có thể truy xuất trực tiếp:

- `tests/browser/customer-post-purchase.spec.ts-snapshots/wp11-post-purchase-order-detail-unpaid-mobile-390-chromium-win32.png`
- `tests/browser/customer-post-purchase.spec.ts-snapshots/wp11-post-purchase-order-detail-unpaid-desktop-1440-chromium-win32.png`
- `tests/browser/catalog-voucher-admin.spec.ts-snapshots/wp11-catalog-product-detail-draft-mobile-390-chromium-win32.png`
- `tests/browser/catalog-voucher-admin.spec.ts-snapshots/wp11-catalog-product-detail-draft-desktop-1440-chromium-win32.png`
- `tests/browser/inventory-stock.spec.ts-snapshots/wp11-inventory-intake-resume-mobile-390-chromium-win32.png`
- `tests/browser/inventory-stock.spec.ts-snapshots/wp11-inventory-intake-resume-desktop-1440-chromium-win32.png`
- `tests/browser/operations-lifecycle.spec.ts-snapshots/wp11-operations-order-processing-mobile-390-chromium-win32.png`
- `tests/browser/operations-lifecycle.spec.ts-snapshots/wp11-operations-order-processing-desktop-1440-chromium-win32.png`
- `tests/browser/system-admin-route-matrix.spec.ts-snapshots/wp11-system-admin-audit-selected-mobile-390-chromium-win32.png`
- `tests/browser/system-admin-route-matrix.spec.ts-snapshots/wp11-system-admin-audit-selected-desktop-1440-chromium-win32.png`

Visual helper chờ font và ảnh ổn định, cố định thời gian/media khi cần, vô hiệu hóa
animation/caret và ẩn Next dev portal. Shared helper còn ẩn skip link để tránh chụp
trạng thái focus nhân tạo, nhưng không còn ép storefront header từ `sticky` thành
`static`, nên ảnh không che giấu hành vi header thật. Vì vậy screenshot không được
dùng làm bằng chứng skip link hoặc focus — các assertion bàn phím riêng mới là nguồn
xác nhận cho hành vi đó.

## Kết quả chạy cuối

| Gate | Kết quả |
| --- | --- |
| `browser:release-matrix` lượt cuối 1 | PASS — `5/5`, Chromium, 56,7 giây |
| `browser:release-matrix` lượt cuối 2 | PASS — `5/5`, Chromium, 52,7 giây |
| Post-purchase + catalog five-viewport update | PASS — `2/2` |
| Post-purchase + catalog strict verification | PASS — `2/2`; error/permission Axe `2/2` |
| Inventory + operations baseline run | PASS — `4/4`; bốn ảnh đã review |
| Operations visual sau sửa timeline | PASS — update `1/1`, sau đó hai lượt strict `1/1` |
| System administration audit matrix | PASS — update `1/1`, visual review `2/2`, strict verification `1/1` |
| Commerce visual strict | PASS — `1/1`, 20 snapshot |
| Auth matrix | PASS — `2/2` |
| FE-0 exact-unit strict | PASS — `1/1`, 2 snapshot |
| Release-matrix executable ownership | PASS — coverage/browser contract `9/9` |
| Release-matrix lint/format/typecheck theo phạm vi | PASS |

Playwright giữ warning môi trường `NO_COLOR`/`FORCE_COLOR`, Node `DEP0190` và Docker
orphan-container notice trong một số lượt. Các warning này không làm command thất bại;
không chạy cleanup destructive ngoài phạm vi WP-11.

## Findings và remediation giữ lại trong evidence

| Phát hiện | Xử lý | Loại thay đổi |
| --- | --- | --- |
| `autoFocus` ở login làm phím Tab đầu bỏ qua skip link | Gỡ `autoFocus` ở login/register/forgot-password; chạy lại bốn shell | Product accessibility |
| Validation cấu hình đưa focus tới generic alert thay vì danh sách lỗi có liên kết | Tách focus lỗi API và lỗi field; đưa focus tới error summary, Tab/Enter tới đúng field | Product accessibility |
| Assertion reflow dùng heading không focusable và đo quá sớm khi sticky bar vừa mount | Chuyển sang control thật; thêm hai frame ổn định; giữ nguyên bounding + hit-test nghiêm ngặt | Test evidence hardening |
| Helper visual từng ép storefront header thành static | Bỏ override; baseline hiện kiểm hành vi sticky thật | Test evidence hardening |
| Timeline đơn đang vận chuyển ghi “Đã giao hàng” | Đổi thành “Đang giao hàng” và đồng bộ fixture projection | Product copy/state clarity |
| System audit token `[REDACTED]` nằm trong JSON dài làm exact-text locator không phù hợp | Kiểm nội dung bên trong `pre` thay vì nới yêu cầu redaction | Test evidence hardening |
| Audit visual fixture dùng `requestId` quá dài và `resourceId` không phải UUID | Giữ chuỗi stress ở actor/user-agent/metadata; đưa hai identifier về đúng contract backend | Test evidence hardening |
| Liên kết icon “Về cửa hàng” trong backoffice mobile chỉ rộng `22 px` | Khóa tối thiểu `44×44 px`, thêm account/backoffice vào touch matrix | Product accessibility |

Không xóa lịch sử lượt đỏ khỏi kết luận: release matrix từng đạt `3/5` do auth focus
và assertion reflow; sau sửa auth, lượt A đạt `5/5`; lượt B còn lộ timing sticky
`4/5`. Khi mở rộng touch coverage, lượt đầu đạt `4/5` và bắt được icon backoffice
chỉ rộng `22 px`. Một lượt targeted kế tiếp gặp exact-unit `404` môi trường một lần,
chạy lại đạt; hai full matrix cuối sau remediation đều đạt `5/5`. Hình học reflow
vẫn dùng control thật, hai animation frame, polling geometry và hit-test nghiêm ngặt.

## Giới hạn và việc chuyển tiếp

- **Không phải native zoom:** `720×450` chỉ là proxy reflow xác định cho 200% của
  `1440×900`; vẫn cần manual/native zoom smoke nếu release policy yêu cầu bằng chứng
  browser zoom thật.
- **Chromium-only:** toàn bộ kết quả WP-11 hiện tại và PNG baseline là Chromium trên
  Windows. Firefox/WebKit critical smoke chưa có bằng chứng cục bộ; chỉ chạy khi CI
  cung cấp môi trường ổn định.
- **Không phải chứng nhận WCAG:** Axe zero serious/critical không phát hiện mọi vấn đề;
  forced-colors, touch và keyboard chỉ dùng representative journey/control.
- **Không phải full Cartesian matrix:** không chạy mọi route × mọi state × năm
  viewport. Auth/account chưa có scenario riêng đúng 768 px; các breakpoint khác có
  bằng chứng trực tiếp như ghi ở ma trận.
- **Screenshot chỉ là visual evidence:** ảnh không chứng minh focus order, accessible
  name, screen-reader output, hit target hoặc sticky obstruction. Những concern này
  được khóa bằng assertion riêng; screen-reader manual pass chưa được thực hiện.
- **Thiết bị thật chưa được đo:** viewport là CSS emulation; chưa bao gồm browser
  chrome, safe-area, bàn phím ảo hoặc mật độ điểm ảnh của thiết bị vật lý.
- **CI/release artifact chưa chốt:** SHA phát hành, URL CI, artifact và critical
  Firefox/WebKit smoke thuộc WP-14; không được suy ra từ local pass này.

Với các giới hạn trên được giữ nguyên, WP-11 đạt acceptance cho representative
accessibility/responsive/visual matrix và có thể chuyển con trỏ sang WP-12. Các giới
hạn không được tự động đóng hoặc nâng thành claim rộng hơn trong WP-14.
