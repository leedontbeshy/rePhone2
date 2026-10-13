# Design QA — UI 2.1 / UI2-13

**Bổ sung 13/10/2026:** [Giá vốn đơn hàng](docs/evidence/ui-v2/order-current-costs.md) đã được kiểm tra riêng trên source mới. Các kết quả release toàn bộ dưới đây thuộc lần nghiệm thu UI2-13 trước bổ sung này.

Ngày 13/10/2026. **UI2-13 DONE; local QA và kiểm tra Supabase dev sau migration đều đạt.** [Report](docs/evidence/ui-v2/refinement-2026-10-13.md), [manifest](docs/assets/ui/v2-implementation/ui2-13-refinement/manifest.json) và [handoff](docs/evidence/ui-v2/handoff.md) có ưu tiên cho source cuối.

Hai lượt Chromium production **101/101**, integration **55/55**, API E2E **149/149** và coverage **1.064/1.064** đều đạt. Unit API 860 + web 737 + client 7 + script 38; frontend coverage 9, accessibility contract 21; format/lint/typecheck/build và OpenAPI/client hash idempotency đạt. Firefox/WebKit 2/2, native zoom 15/15, partner breakpoint 5/5, populated finance/home 3/3; performance 12/12 và comparator đạt.

Đã review các ảnh mới của home/filter/settings, native200, partner và báo cáo tài chính hai role; 25 ảnh được giữ với hash. Viền/bo/bóng rõ hơn, năm card nổi bật vừa desktop, mobile không tràn document. Bảng dài có vùng cuộn riêng. Không còn P0/P1/P2 được quan sát trong các view/flow đã kiểm. Các giới hạn fixture, phạm vi và adaptation được ghi ở report; [Supabase dev đã kích hoạt](docs/evidence/ui-v2/dev-activation.md) sau xác nhận trực tiếp của người dùng.

## Lịch sử nghiệm thu các WP

# Design QA — UI v2.0 / UI2-12 dealer and affiliate

Ngày 12/10/2026. Scope tám route owners, trong đó bảy trang có UI và một redirect `/r/[code]`. [Evidence](docs/evidence/ui-v2/partners.md), [manifest](docs/assets/ui/v2-implementation/ui2-12/manifest.json). Chương trình chưa hoàn tất.

Root đã mở lại selected home và backoffice cùng các bản render cuối. Public partner dùng hero cyan, panel thông tin lavender, CTA teal, typography và header/footer của Soft Studio Retail; workspace quản trị dùng Ink Backoffice. Đây là kế thừa design language cho các màn chưa có mockup riêng, không nhận pixel clone của home/dashboard. Đã xem đủ chín supplemental pairs: hai terms, dealer public mobile, CUSTOMER profile và ADMIN profile list ở1440/390; tám canonical public/guide/terms views ở1440/390/320. Guide full-page rất dài; canonical bổ sung kiểm keyboard cho vùng code/table có horizontal scroll và semantic table headers.

Trước sửa cuối, root đã xem toàn bộ27 enabled section views (CUSTOMER4 và ADMIN5 tại1440/390/320). Phát hiện hero icon chưa ẩn trên mobile do selector global `.rp-surface svg` thắng `.heroIcon`; selector responsive giờ là `.hero .heroIcon`. Sau sửa đã chạy lại đủ11ca và27section views, mở lại CUSTOMER320/ADMIN390 hero, hai desktop overview, ADMIN payout320 và cả năm boundary screenshots. Icon ẩn ở mobile, giữ trên desktop; tiêu đề không còn bị ép vào cột hẹp. Regression assertion kiểm icon ẩn trên viewport≤390 nếu tồn tại. Các section còn lại giữ anatomy đã review; không claim mọi ảnh cuối đều được mở lại riêng.

Đã sửa contrast chữ teal trên cyan/lavender, hint trong disclosure, empty state và retry action trên alert. Không có serious/critical axe findings ở các ca cuối. Focus ring hiện rõ; native disclosures và navigation dùng bàn phím; bảng hoa hồng cuộn ngang bên trong vùng có tên và nhận focus, không làm tràn document. Một số ảnh bảng đang cuộn ngang sau kiểm ArrowRight, không phải mất cột. Dữ liệu ngân hàng mặc định được che; admin reveal/hide dùng dữ liệu synthetic riêng. Payout form nhỏ vẫn giữ label, datetime và hành động.

Gate thực tế: web lint/typecheck exit0; unit5files17tests PASS6,92s; normal canonical5/5 PASS40,5s; supplemental pairs3/3 PASS12,9s; enabled synthetic11/11 PASS1,4phút. Canonical backend dùng API TEST4001 được tạo lại từ guarded localhost5433/rephone_test; Next DEV3001 phục vụ source đã áp dụng. Enabled frontend dùng interception hoàn toàn riêng, không bật affiliate backend/worker và không thực hiện giao dịch thật. Source fingerprints trước/sau ổn định.

Không còn P0/P1/P2 trong scope.49 presentation captures được index,32 principal1440/390 được giữ nguyên bytes; năm ảnh lifecycle canonical vẫn ở local output. Dev indicator xuất hiện trong một số ảnh supplemental, được ghi đúng là DEV evidence. Native200%zoom, cross-browser, fresh production/performance-after và risk reconciliation thuộc UI2-13.

**final result: passed**

---

# Design QA — UI v2.0 / UI2-11 system administration

Ngày 12/10/2026. Scope sáu route owners. [Evidence](docs/evidence/ui-v2/system-administration.md), [manifest](docs/assets/ui/v2-implementation/ui2-11/manifest.json). Chương trình UI v2 chưa hoàn tất.

Root đã mở selected backoffice1052×1495 cùng employees1440/390/1024; reference là composite dashboard EMPLOYEE/ADMIN, không cùng route/state. Đối chiếu ngôn ngữ Ink BO, density, typography, panel và cyan selection, không nhận pixel clone. Toàn bộ employees/customers/settings/audit-list tại năm widths được xem; health cả năm và audit-detail cả năm được xem sau đó. Audit-detail được chụp lại sau sửa scroll reset; cả hai canonical audit PNG cuối1440×1812/390×2705 được mở và duyệt. Viewports1440×900/390×844/320×844/768×1024/1024×768, density1, full-page có thể cao hơn viewport.

Không còn P0/P1/P2 trong scope. Các sửa có căn cứ: audit loading opacity gây contrast thấp trên danh sách cũ còn tương tác, avatar chữ đậm hơn; test menu mobile đổi sang mở/kiểm/đóng native drawer và trả focus; capture đợi scroll0 tức thời sau khi mở disclosure. Không thay app navigation để thỏa giả định cũ, không giấu skip link hoặc transform sidebar để giả hình. List ellipsis có full detail, long IDs/JSON wrap trong panel, các field/action reflow đầy đủ. Shared chip border là P3 theo dõi UI13.

Web lint/typecheck PASS; unit11files70tests PASS8,39s. Final custom1/1 PASS37,9s/exit0,30views/12retained. Selective snapshot1/1 PASS12,9s, chỉ2auditPNG. Final normal canonical14/14 PASS1,2phút/exit0, bao gồm role denial trước child requests, user lifecycle/race/conflict, settings validation/QR/rebase, audit loading/redaction/recovery, health dependency/stale states, geometry và axe. Custom không chạy axe; không gán cho nó kết quả của canonical.

Runtime root-owned Next DEV3001/API4001. Fixtures synthetic, EMPLOYEE customers/ADMIN các views còn lại; health ảnh healthy không đại diện mọi dependency state. Live-admin canonical đọc local TEST backend riêng. Source ổn định trong các lượt chạy, original patch và source overrides giữ hash riêng. Native200%zoom, cross-browser, fresh production/performance-after và owners còn lại chưa nghiệm thu ở scope này.

**final result: passed**

---

# Design QA — UI v2.0 / UI2-10 operations

Ngày 12/10/2026. Scope 11 route owners. [Evidence](docs/evidence/ui-v2/operations.md), [manifest](docs/assets/ui/v2-implementation/ui2-10/manifest.json). Chương trình UI v2 chưa hoàn tất.

Root mở selected backoffice1052×1495 cùng order-detail1440/390 trong một input. Reference là composite EMPLOYEE/ADMIN dashboard, không cùng nội dung/state với operations; đối chiếu Ink BO, panel, typography, density và màu. Không nhận pixel clone hoặc kéo giãn ảnh để giả khớp. Root mở thêm payment-detail1440, refund-detail390, after-sales-detail768, orders320, rồi hai snapshot processing cuối1440×1708/390×3308 ở viewport1440×900/390×844, density1.

Peer review kết hợp25+30 ảnh của lượt đầu ở năm widths. P2 được phát hiện và sửa: header mobile flex-basis, link trên nền pastel/hover, warranty policy link contrast4,36:1, contact/shipment bị ép cột tại1024, và datetime field bị cắt phần giờ tại1024. Container order-main42rem chuyển customer/shipment/timeline sang một cột theo bề rộng thật; filter date dùng auto-fit minimum15rem. Không thay request, business state, capability hoặc dữ liệu.

Root mở lại order-detail1024, payments1024, refunds1024, warranty-detail390/1024, payments320, refunds1440, order-detail768/390 và cả hai canonical snapshots cuối. Tên/phone/email/handover đọc nguyên dòng; ngày giờ đầy đủ, action rail vẫn reachable, mobile không tràn ngang. Driver assert contact/time Range rects một dòng, không clip email, date field≥240px ở mọi width. Trong25 first-pass hash records,24 ảnh giữ nguyên bytes; ảnh order-detail1024 đã review sau sửa. Không còn P0/P1/P2 trong scope. P3 giữ lại: ký hiệuđ có thể xuống dòng riêng ở summary desktop, số tiền không vỡ nhóm; shared status-chip border tiếp tụcUI13.

Web lint/typecheck PASS. Unit26files145tests PASS. Selective snapshot1/1 PASS44,9s; chỉ hai processing PNG được update sau review. Final normal canonical11/11 PASS1,4phút/exit0, bao gồm pickup/shipping, payment proof, refund, after-sales, warranty/policy, role/lock/conflict, local refresh, axe và responsive assertions. Final custom1/1 PASS1phút/exit0,55views/22principal; unknown APIs, external traffic và business mutations bị chặn. Custom capture không chạy axe, nên không gán cho nó kết quả accessibility của canonical.

Runtime root-owned Next DEV3001/API4001, canonical synthetic fixtures. Empty queues, payment availableActions=[] và synthetic financial inconsistencies được ghi rõ trong evidence; không nhận live payment/provider/backend integration từ bộ ảnh. Source ổn định khi chạy, patch/overrides/driver hashes được giữ; các hash không chứng minh production build. Native200%zoom, cross-browser, fresh production/performance-after và owners còn lại tiếp tục UI2-13.

**final result: passed**

---

# Design QA — UI v2.0 / UI2-09 kho, kiểm định và stock

Ngày12/10/2026. Scope tám route inventory; ADMIN cost là projection riêng của cùng unit, không phải route owner thứ chín. [Evidence](docs/evidence/ui-v2/inventory-stock.md), [manifest](docs/assets/ui/v2-implementation/ui2-09/manifest.json). Chương trình UI v2.0 chưa hoàn tất.

Nguồn hình: `docs/assets/ui/selected/backoffice.png`1052×1495, composite EMPLOYEE trên/ADMIN dưới; nguồn recipe `design.md`§15–16. Kho không có mockup chi tiết riêng, nên đối chiếu Ink BO và anatomy nghiệp vụ, không nhận pixel clone hoặc cùng data/state với overview. Root mở reference cùng intake1440/390 trong cùng input, rồi cùng hai snapshot intake-resume mới; viewport1440×900/390×844, density1. Snapshot full-page1440×976/390×1535. Các PNG full-page giữ CSS width và chiều cao theo nội dung, không kéo giãn composite hoặc thu nhỏ desktop thành mobile.

Root mở thêm units320/768, lookup390, locations320, movements390, ADMIN cost390 trước/sau sửa và stock390 cuối. Ảnh cuối ADMIN390 là390×4973; các dimension/hash khác nằm trong index/manifest. Full-view và focused cost review xác nhận sidebar ink/nền sáng, cyan section, action teal, form hierarchy, masked identifier, empty physical-media trung thực, table chuyển thành labeled rows trên mobile. Snapshot resume giữ step2 và file đã chọn; chưa upload không nhận là đã có ảnh.

Lịch sử sửa P2: chữ ADMIN eyebrow trên nền warning tương phản4,38 → warning ink; broad `.actionBar span`/`.reviewActions span` và `.commandBar span` ghi đè màu Button content → chỉ chọn helper text trực tiếp; link unit list khi hover row → primary-hover; text done-step trên pastel → success-strong. Peer phát hiện cost390/320 chia ba cột làm số tiền bị tách nhóm chữ số; panel ADMIN nằm ngoài container unit-dossier nên breakpoint cũ không áp dụng. Đã thêm container inventory-cost và stack summary/form ở chiều rộng phù hợp. Root mở lại full-view ADMIN390 sau sửa:9.000.000₫/200.000₫/9.200.000₫ đọc nguyên dòng, form và save button đủ rộng. Range rect-count assertion kiểm mọi amount một dòng ở cả năm width; focused ADMIN1/1 PASS12,8s.

Các lần fail và log được giữ: selector required-label suffix ở intake rồi lookup là lỗi local capture readiness, sửa theo label thật và giữ assertion value/enabled; ADMIN/inspection/stock contrast là lỗi CSS thực đã sửa. Không xóa assertion axe/privacy hoặc thay business logic để đạt PASS. Sáu CSS override được ghi rõ và hash kiểm chứng, patch staged gốc giữ nguyên.

Web lint/typecheck terminalexit0. Unit26files104tests PASS23,89s. Selective snapshot1/1 PASS35,9s, chỉ hai intake-resume PNG; root đã mở lại cả hai. Normal canonical9/9 PASS52,1s, terminalexit0: EMPLOYEE zero-cost request/DOM, POST identifier lookup, filter no reload/raw identifier no URL,18-check review/completion, resume/upload, mobile step4, inspection-source integrity, stock command/reconcile/immutable ledger và responsive/axe. Final custom2/2 PASS1,3m, terminalexit0,45views/18principal at1440/390/320/768/1024; no serious/critical axe, pageerror, unknown API or document overflow. Retention dry-run validates45 PNGs, source identities and result JSON; no production inference from hashes.

Runtime là root-owned Next DEV3001/API4001, canonical synthetic response fixtures cho scoped browser/capture. Final source fingerprint giữ ổn định trong capture. Không nhận live backend/provider integration, mọi role/state combination hoặc production build từ bằng chứng này. Bộ unit chưa có ảnh thực tế giữ mediaCount0; canonical upload/inspection/stock cases cung cấp bằng chứng riêng cho những state đã chạy. Native200%zoom, cross-browser, fresh production/performance-after và owner còn lại tiếp tục UI2-13.

Peer đã chốt30 EMPLOYEE views của sáu route còn lại ở cả năm width và ADMIN390/320 sau sửa, kèm32 actual PNG identities trong `visual-review-images.json`; nhóm inspection/stock và ADMIN khác đã được reviewer trước xem. Root mở lại focused cost sau sửa và normal intake snapshots. Review kết hợp bao phủ45 views; không còn P0/P1/P2 trong scope. P3 shared status-chip border tiếp tục cleanup UI2-13.

**final result: passed**

---

# Design QA — UI v2.0 / UI2-08 catalog và voucher backoffice

Ngày12/10/2026. Kết luận chỉ sáu route owner UI2-08. [Evidence](docs/evidence/ui-v2/catalog-voucher-backoffice.md), [manifest](docs/assets/ui/v2-implementation/ui2-08/manifest.json). Chương trình toàn diện chưa hoàn tất.

Root mở selected backoffice1052×1495 cùng product-detail1440/390 trong một input, rồi mở product-new1440, voucher-detail1440/390 và final product-detail390/768, voucher-detail768. Các màn này kế thừa Ink BO, không có mockup catalog/voucher riêng và không nhận là pixel clone. Fixture ADMIN là iPhone15Pro/FE05, một variant, product-media404 có chủ ý, voucher draft10% và một usage row; khác nội dung minh họa của selected overview.

List là compact linked row board; forms chia section và dùng một footer save/cancel liên kết đúng form; rail theo chiều rộng content thực. Detail giữ variant/media, publish/archive, facts và usage semantics. Mobile usage thành labeled rows vẫn giữ order link/keyboard, trạng thái loading và đủ các cột dữ liệu.

P2 đã sửa trong CSS riêng: side rail ở768/1024 kéo giãn chip/nút archive → align-items/start và align-content/start; tab list/detail khuất nhãn ở320/390 → wrap theo content width. Root và peer đã mở lại ảnh liên quan; geometry assertions kiểm mọi tab nằm trong nav, chip≤40px và archive≤48px. Không còn P0/P1/P2 trong scope. P3 viền status chip dùng shared primitive tiếp tục UI2-13.

Latest lint/typecheck PASS;14files67unit PASS18,05s. Custom final30captures **1/1 PASS22,4s,exit0**;12 principal PNG giữ nguyên bytes với source overrides rõ cho hai CSS. Selective snapshot final1/1 PASS27,6s chỉ cập nhật mobile390 có thay đổi tab; normal canonical final **4/4 PASS41,9s,exit0**. Bốn ID giữ nguyên: EMPLOYEE/catalog và voucher denial, product/variant/media lifecycle/unsaved/conflict, voucher lifecycle/usage/conflict, six-route responsive/axe. Hai snapshot được review trước migration; không blanket update.

Response fixtures cô lập; không thực thi catalog/tiền/media thật. Giữ nguyên providers, backend, state machine, API và RBAC; geometry assertions không thay lifecycle assertions. Native200%zoom, cross-browser và production performance-after tiếp tục UI2-13; inventory/operations/system/partners chưa nghiệm thu từ đây.

**final result: passed**

---

# Design QA — UI v2.0 / UI2-07 backoffice shell và overview

Ngày 12/10/2026. Kết luận chỉ shell backoffice và owner `/backoffice`; các màn con là shell smoke. [Evidence](docs/evidence/ui-v2/backoffice-overview.md), [manifest](docs/assets/ui/v2-implementation/ui2-07/manifest.json). Chương trình toàn diện chưa hoàn tất.

Root đã mở selected backoffice cùng render EMPLOYEE/ADMIN1440 và ADMIN390/drawer trong một input; tiếp tục mở hai comparison đúng nửa vai trò và latest1254/390. Source là ảnh ghép1052×1495; render là viewport1440/1254/390, dùng dữ liệu synthetic12/3/4/2 và năm đơn, khác số liệu minh họa. Không nhận là pixel clone hoặc dữ liệu kinh doanh thật.

Sidebar ink240px, topbar trắng, canvas sáng, count strip cyan, orders trái/queue phải và shortcuts4/8 bám đúng hierarchy đã chọn. Giữ đủ22 destinations, role-disabled semantics, ba trục trạng thái và initial/stale failures. Mobile dùng native drawer, summary2×2, queue trước table và shortcut một cột. Bảng giữ vùng cuộn được đặt tên; cue chỉ xuất hiện khi panel nhỏ hơn table640px, ArrowRight hoạt động.

P1 đã sửa: mở native dialog chưa focus close; Tab ở biên có thể ra browser chrome. Scoped close ref/Tab và Shift+Tab wrap đã có regression cùng Escape/focus return. P2 đã sửa: cuộn ngang ở1254/mobile chưa dễ nhận biết. P3 viền status chip nặng do shared border shorthand để UI2-13 sửa cùng global regression. Không còn P0/P1/P2 trong phạm vi đã kiểm.

Final browser **8/8 PASS52,2s,exit0**,36 captures gồm14 overview,2 drawer,20 consumer;10 principal/compare giữ nguyên bytes. Latest lint toàn repo PASS; web typecheck PASS; shell/overview21units PASS10,27s, trước đó82unit/9coverage PASS. Root cũng sửa tương đương cú pháp void callback trong storefront test để lint toàn repo qua. Harness tách keyboard exercise khỏi fresh-page capture sau khi phát hiện smooth scroll làm bẩn ảnh; failed reset run được giữ trong lịch sử.

API response fixtures cô lập, font Inter được kiểm bằng loaded primary family và WOFF2 HTTP200; không thực thi mutation thật. Các consumer empty/disabled states không nghiệm thu UI2-08–12. Native200%zoom/cross-browser/production performance-after tiếp tục UI2-13.

**final result: passed**

---

# Design QA — UI v2.0 / UI2-06 customer post-purchase

Ngày 12/10/2026. **Kết luận chỉ bảy route owners UI2-06**. [Evidence](docs/evidence/ui-v2/post-purchase.md), [manifest](docs/assets/ui/v2-implementation/ui2-06/manifest.json). Chương trình toàn diện chưa hoàn tất.

Các màn này kế thừa Soft Studio và design.md §14; không có mockup post-purchase riêng đã chọn. Root đã mở nguồn checkout cùng order1440/390 và support form1024 trong một input, đối chiếu màu, type, panel và hierarchy, không nhận là pixel clone. Source checkout1003×1568 khác nội dung/viewport; order là owned fictional CUSTOMER fixture với demo bank. 42 full-page views được kiểm ở320/390/768/1024/1280/1440;15 principal views được giữ.

| Surface                  | Kết quả                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shell/navigation         | Chung storefront header, post-purchase pills, một main; orders/warranty/support giữ đúng route/current state; mobile đủ ba nhãn.                                         |
| Order                    | Timeline rõ pending/completed, receipt/teal total, contact/fulfillment/payment giữ dữ kiện API. Xem thanh toán nhảy và focus vào panel khi có existing proof attempt.    |
| Warranty/support         | Panels, facts và actions kế thừa tokens; code dài wrap; context, upload/privacy, request locks và eligibility giữ logic. Form radio reflow theo chiều rộng thực.         |
| Responsive/accessibility | Không overflow42views; canonical mobile checks payment jump/focus/header offset, pending label và1024radio line count; keyboard/ownership/privacy assertions giữ nguyên. |

**P2 đã sửa:** current timeline dùng nhãn hoàn thành khi chưa có timestamp → pending labels; ba support radios hẹp ở1024 → auto-fit theo form width. Payment panel được đưa vào tầm thao tác bằng jump link có focus. Latest affected captures đã được root và peer mở lại, không còn P0/P1/P2 trong scope. **P3 tùy chọn:** collection footer còn khoảng trắng khi pagination component trả null; không chặn flow, để cleanup UI2-13.

Canonical lint/typecheck PASS;14files81unit PASS, presenter regression10/10 sau sửa enum fixture đúng generated contract. Final selective update2snapshot1/1 PASS16,8s; normal canonical browser **5/5 PASS29,2s,exit0**. Latest custom capture1/1 PASS58,7s/42views. Các API fixtures intercept; không nhận là kiểm thử tích hợp thanh toán/bảo hành/vận chuyển thật. Cross-browser/native200%zoom/performance-after tiếp tục UI2-13.

**final result: passed**

---

# Design QA — UI v2.0 / UI2-05 cart/wishlist/checkout

Ngày12/10/2026. **Kết luận chỉ ba route owners UI2-05**. [Evidence](docs/evidence/ui-v2/commerce.md), [manifest](docs/assets/ui/v2-implementation/ui2-05/manifest.json). Chương trình UI v2.0 chưa hoàn tất.

Nguồn [checkout.png](docs/assets/ui/selected/checkout.png) và latest [native1003](docs/assets/ui/v2-implementation/ui2-05/checkout-shipping-1003.png) được mở trong cùng input. [Comparison](docs/assets/ui/v2-implementation/ui2-05/compare-checkout.png) đặt source trái/render phải, mỗi bên501px rộng giữ tỷ lệ, chỉ pad trắng. Cùng viewport width1003 và valid SHIPPING preview; device/name/pricing là fixture14Pro thay source17. Full-page render dài hơn vì48px controls, đủ required payload fields và unpaid-balance helper. Không kéo giãn ảnh nguồn hoặc fake dữ liệu để đạt pixel score.

| Surface         | Kết quả                                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Composition     | Form liên tục60% trái/receipt40% phải từ960; contact→fulfillment→address→voucher/note; email toàn width. Mobile/tablet summary trong flow; không sticky che focus.   |
| Receipt         | Media cyan, identity đúng cart/preview item, total teal24/32, deposit explanation lavender dưới total; verified state/CTA đổi theo preview và conflict.              |
| Data/type/art   | Inter/tokens chung; mọi amounts từ preview; deposit không cộng lại. No generated actual-unit art, no unsupported grade/pin/warranty chips; quantity/code giữ nguyên. |
| Cart/wishlist   | Inherited SoftStudio cards/media/price/action; populated1440/390 đã xem; access/quantity/merge/unavailable states giữ đúng contract.                                 |
| Responsive/a11y | Custom19 views320–1440, canonical20 snapshots/4states×5widths; no overflow, serious axe checks và keyboard/error focus đạt.                                          |

**P2 đã sửa:**1003px từng stack receipt → breakpoint960; “số tiền còn lại” dễ bị hiểu đã trừ cọc → helper nói chưa thanh toán, giữ APIbalanceDue. Source-only battery/grade/warranty bỏ vì thiếu DTOauthority. Không còn P0/P1/P2 trong scope đã kiểm. **P3 tùy chọn:** độ đầy actual media khi có ảnh production; không crop/retouch evidence.

Canonical lint/typecheck PASS,44unit PASS. Selective reviewed snapshot update1/1 PASS/20baselines; full normal commerce + critical shipping **14/14 PASS,2,2min,exit0**. Đã mở preview/conflict snapshot mới. Local `_test` API được giữ cô lập; không nhận BO fidelity hoặc mọi role/state từ critical commerce.

Preview policy được làm rõ theo API: pricing không phụ thuộc contact/address/note; chúng vẫn validate/create snapshot. Không thay state machine, frozen uncertain request/manual replay hoặc transport. In-app Browser cart empty recovery và console `[]`; populated flow qua isolated browser contexts. Cross-browser/native200%zoom/performance-after và các owner khác chưa được nhận PASS.

**final result: passed**

---

# Design QA — UI v2.0 / UI2-04 auth/account

Ngày: 12/10/2026. **Kết luận chỉ cho tám route owners UI2-04**; chương trình toàn diện tiếp tục. [Evidence](docs/evidence/ui-v2/auth-account.md), [manifest/captures](docs/assets/ui/v2-implementation/ui2-04/manifest.json).

Nguồn [auth.png](docs/assets/ui/selected/auth.png) đã được mở cùng login/register render. Source là composite1052×1495; login crop1052×708, register crop1052×787. [Login comparison](docs/assets/ui/v2-implementation/ui2-04/compare-login.png) và [register comparison](docs/assets/ui/v2-implementation/ui2-04/compare-register.png) normalize mỗi bên720px rộng, giữ tỷ lệ, source trái/render1440 phải. Không coi đây là cùng CSS viewport hoặc pixel diff; form480 và controls48 theo design.md, artwork từ1120 để giữ form rõ.

| Surface                  | Kết quả                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Composition              | Form trắng giữa, không split/floating card; artwork lavender/cyan ở rìa, header/home và security footer gọn; login/register riêng, đúng active route.                        |
| Type/image/color         | Inter local, title40/48 desktop, teal actions, pastel studio cùng art direction; decoration aria-hidden, không dùng như actual-device evidence.                              |
| Forms/states             | Giữ năm register fields, phone optional, password policy, visibility, field errors/focus, pending và terminal states; recovery/invitation kế thừa shell, không fake tabs.    |
| Customer account         | Storefront/customer header và mobile search thống nhất; profile/address/security panel/token; mobile nav grid giữ mọi link đầy đủ trong viewport, không bị cắt current item. |
| Responsive/accessibility | Tám routes×sáu widths320–1440, không document overflow; skip/axe/reduced-motion/forced-colors/touch targets đạt. Full-page content không bị ép/cắt chiều cao.                |

**P2 đã sửa:** artwork cắt điện thoại ở phải → right alignment; mobile account nav cắt Địa chỉ → responsive grid và regression full visibility. Latest native captures và browser xác nhận. Không còn P0/P1/P2 trong scope đã kiểm. **P3 tùy chọn:** chỉnh nhịp copy phụ/artwork giữa các desktop aspect ratio; không chặn WP.

Canonical lint/typecheck PASS; auth/account/shell26 unit và session/token/API17 unit PASS. Snapshot update có review9/9; final fresh normal browser **15/15 PASS, 1,5min, exit0** gồm cả chín auth lifecycle IDs,48captures và bốn release checks. Hai snapshot mới được mở kiểm và chạy lại bình thường. In-app Browser login→register, console warn/error `[]`.

Các lần fixture hết hạn, API chưa ready và rerun profile đã mutate được ghi trong evidence; final run dùng fresh local `_test` và HTTP readiness200. Search touch locator được scope vào dialog sau khi mobile header có search riêng; giữ44px/focus assertions. Không dùng các run lỗi môi trường/locator đó để nhận PASS.

Native zoom200%, cross-browser, production performance after và các owner còn lại chưa được nhận đạt. 720×450 chỉ là reflow proxy; dữ liệu CUSTOMER là fixture, không phải dữ liệu người dùng thật.

**final result: passed**

---

# Design QA — UI v2.0 / UI2-03 catalog, model, exact unit và public

Ngày: 12/10/2026. **Phạm vi kết luận: UI2-03**. Các report bên dưới giữ nguyên lịch sử; chương trình toàn diện chưa hoàn tất.

**Nguồn:** [product-model.png](docs/assets/ui/selected/product-model.png), [product-unit.png](docs/assets/ui/selected/product-unit.png), [design.md](design.md). Hash nguồn giữ trong registry và [manifest nghiệm thu](docs/assets/ui/v2-implementation/ui2-03/manifest.json).

**Bản thực thi:** [model 1254](docs/assets/ui/v2-implementation/ui2-03/model-guest-source-native-viewport.png), [unit 1003](docs/assets/ui/v2-implementation/ui2-03/unit-guest-source-native-viewport.png), [model có máy](docs/assets/ui/v2-implementation/ui2-03/model-guest-1440-sampled-public.png), [unit mobile](docs/assets/ui/v2-implementation/ui2-03/unit-guest-390-sampled-public.png). Catalog, store và vouchers kế thừa Soft Studio; không có mockup riêng được chọn cho ba màn này.

## Điều kiện đối chiếu UI2-03

- Đã mở hai source và hai render trong cùng input. Model native 1254 × 1254; unit native 1003 × 1568; không resize PNG gốc. Bổ sung populated model/unit 1440 và mobile 390; catalog/store/vouchers 1440/390 được xem riêng.
- Runtime GUEST, local `_test` API. iPhone 17 hết máy nên không có giá/card minh họa; iPhone 14 Pro có hai máy dùng để kiểm tra giá/card và đi vào unit. Không tạo máy 17 hoặc giá giả để khớp ảnh.
- Unit fixture khác model/màu trong source. Gallery chọn đúng URL của exact-unit DTO; browser media interceptor dùng ảnh demo ổn định. Các ảnh này chứng minh presentation/identity mapping, không chứng minh tình trạng một máy ngoài thực tế.
- Full-page unit dài hơn source vì giữ đầy đủ public facts của contract. Chỉ năm kết quả kiểm tra public, không lộ dossier nội bộ. Dev captures có Next.js dev indicator; production snapshot không có chrome đó.
- Đã capture 320/390/768/1024/1440 cho năm route samples và model 17; bổ sung 1280 cho model/unit direct+refresh. Không tràn ngang. Không suy rộng sang mọi tổ hợp role/state hoặc mọi route của chương trình.

## Fidelity và xử lý findings UI2-03

| Surface              | Kết quả                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model                | Banner ngang cyan, copy/giá trái, studio phải; một fact rail; card ảnh trái/thông tin phải, hai cột desktop từ 1200. Artwork 17 giữ ba thiết bị và nhãn minh họa; các model khác dùng cover đúng DTO/contain. |
| Exact unit           | Unified cyan hero, ảnh trái/mua phải desktop; mobile title → gallery → purchase. Ba tile cyan/mint/lavender dưới hero; facts và inspection thành hai panel; related dùng cùng card máy.                       |
| Type/color/elevation | Inter local, ink hierarchy, teal price/action, pastel surfaces và shadow nhẹ; giá card 24/32, control 48 px. Header dùng foundation đã nghiệm thu.                                                            |
| Data/content         | Giá/stock/grade/pin/warranty/fulfillment từ authority. Không dùng giá offers làm giá từ của model. Missing/404/provider failure/sold-out giữ riêng; store dùng contact config an toàn.                        |
| Interaction          | Sort/filter URL/history, gallery/keyboard, account voucher và recovery giữ nguyên. Thanh mua mobile chỉ hiện khi CTA chính đã qua viewport và footer chưa hiện.                                               |

1. **P2 đã sửa:** banner quá cao và copy dư → hero desktop gọn, copy theo source; native capture xác nhận.
2. **P2 đã sửa:** card dài, lặp cấu hình và giá màu ink → presenter gọn, giữ đầy đủ dữ kiện, giá teal; populated model 1440 xác nhận.
3. **P2 đã sửa:** thanh mua còn hiện khi instant-scroll trở lại đầu → đọc geometry hiện thời qua scroll/resize rAF; regression giữ nguyên và production final đạt.
4. **P2 đã sửa:** selector repair-history không khớp key khiến tile thứ ba cyan → sửa selector; native/mobile mới xác nhận lavender.

Không còn P0/P1/P2 được xác nhận trong phạm vi đã kiểm tra. Khác biệt dữ liệu, số facts, màu ảnh demo và sold-out được ghi rõ. **P3 tùy chọn:** tinh chỉnh ranh giới nền giữa studio banner và copy khi có bộ media sản xuất đầy đủ; không chặn WP.

## Verification UI2-03

- Canonical lint/typecheck PASS; targeted unit 14 files / 56 tests PASS. Sau sửa mobile: lint/typecheck và regression PASS. Coverage 9/9 PASS.
- Browser tổng trước sửa mobile: 17 PASS / 1 FAIL; lỗi được giữ trong lịch sử. Final captures/direct+refresh dev **3/3 PASS, 57,7 s**. Production build PASS; selective snapshot update **4/4 PASS**, normal rerun **6/6 PASS, 29,3 s** gồm snapshot, a11y 320, mobile footer/top và dynamic routes.
- In-app Browser đã mở model 17 và unit hợp lệ; console warning/error được ghi nhận **[]**. User-reported unit code không có trong fixture: API/web direct và refresh đều 404 với recovery; kết quả này không kết luận dữ liệu database dev của người dùng.
- [Evidence chi tiết](docs/evidence/ui-v2/catalog-public.md) giữ logs, limits và retained captures. Chưa nhận native zoom 200%, cross-browser, production performance after hay toàn bộ UI v2.0 đạt; các gate đó tiếp tục theo owner/UI2-13.

**final result: passed**

---

# Design QA — UI v2.0 / UI2-02 storefront và home

Ngày: 12/10/2026. **Phạm vi kết luận: UI2-02**, chương trình UI v2.0 tiếp tục ở UI2-03. Các report FE cũ bên dưới là lịch sử.

**Source visual truth:** [home.png](docs/assets/ui/selected/home.png), SHA-256 trong registry; [design.md](design.md) quyết định token, responsive và dữ liệu thực thi.

**Implementation:** [home 1254](docs/assets/ui/v2-implementation/ui2-02/home-1254.png), [desktop đầy đủ](docs/assets/ui/v2-implementation/ui2-02/home-1440-full.png), [mobile đầy đủ](docs/assets/ui/v2-implementation/ui2-02/home-390-full.png), [tablet 960](docs/assets/ui/v2-implementation/ui2-02/home-960.png), [footer](docs/assets/ui/v2-implementation/ui2-02/footer-1254.png). [Manifest](docs/assets/ui/v2-implementation/ui2-02/manifest.json) giữ viewport, state, source/capture hashes và giới hạn.

## Điều kiện đối chiếu

- Source raster 1254 × 1254; implementation native viewport 1254 × 1254, density 1, không device/browser frame. Đã mở hai ảnh trong cùng input để so sánh toàn vùng; không giả định ảnh nguồn khai báo CSS viewport hoặc scale khác.
- Bổ sung 1440 × 1000, 1024/960/768 × 1000, 390/320 × 844. Full-page PNG dài hơn viewport vì API có 47 dòng máy. Source chỉ minh họa bốn card; implementation giữ đủ catalog theo contract.
- State GUEST, real local `_test` API. Featured 17/16/15 đang hết máy; ba model có API cover và các model thiếu cover dùng fallback trung thực. Giá, stock và số model minh họa trong source không được hard-code.
- Focused comparisons: `.local/ui-v2/home/captures/compare-header.png` và `compare-bento.png`, nguồn bên trái, implementation bên phải. Header crop theo vùng thực tế; hai bento crop resize cùng width 1100, giữ tỷ lệ; file PNG gốc không thay đổi. Kiểm tra riêng footer/trust và mobile trên ảnh retained.

## Kết quả theo fidelity surface

| Surface                   | Kết quả trong phạm vi UI2-02                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fonts/type                | Inter local render thực tế, tiếng Việt rõ; page 32/40, hero 48/56 desktop, body 16/24, label tối thiểu 14. Header/control lớn hơn raster minh họa theo contract accessibility và token v2.                                |
| Layout/spacing            | Bento 3:2, một ô trái/hai ô phải; bốn card desktop từ 1024; pills native scroll; tablet main trước/hai ô phụ; mobile reflow. Radius 20/24, elevation nhẹ. Đã loại bỏ crop sát mép ở 960 và khoảng trắng sai do count 1/2. |
| Color/tokens              | Cyan/lavender/warm studio, ink type, teal actions/logo; trust cyan liên tục, footer trắng gọn. Tương phản kiểm qua foundation và axe.                                                                                     |
| Image quality             | Ba WebP model đúng slug, cùng palette/ánh sáng/contact shadow; không thay ảnh exact unit. Hero tải đủ tại bảy widths. Ảnh API lazy ở cuối grid còn nguyên sau 4,5 giây và tải khi cuộn tới.                               |
| Copy/content              | Giữ heading, model name, CTA, năm liên kết chính, trust đúng capability. Không copy ngày/slogan quảng cáo/giá/claim từ mockup. Giá và sold-out từ API; empty/provider-failure được render riêng.                          |
| Interaction/accessibility | Search, suggestions keyboard, GET URL filter/history, mobile sheet/focus return, skip link, footer/store navigation đạt; 320–1440 không tràn ngang.                                                                       |

## Findings và lịch sử sửa

1. **P2 đã sửa:** logo chưa teal và icon header bị co → semantic logo color, giữ kích thước icon/control. Latest captures xác nhận.
2. **P2 đã sửa:** chỉ ba card ở 1254 và bento cắt điện thoại ở 960 → bốn cột từ 1024, tablet main span hai cột, media reflow. Latest 1254/960 và responsive matrix xác nhận.
3. **P2 đã sửa:** mobile thiếu search trực tiếp, bento cao quá mức ở desktop nhỏ → compact search row và fluid hero height; ảnh 320/390/1254 xác nhận.
4. **P2 đã sửa:** lazy timeout có thể thay ảnh trước khi cuộn tới → bắt đầu deadline khi gần viewport; browser late-scroll + cached-before-hydration đạt.
5. **P2 đã sửa ở recipe/source:** catalog chỉ một/hai model có span/crop sai → count-specific stacked copy/contain-safe media. Presenter small-catalog unit đạt; chưa có runtime API subset fixture cho hai trường hợp này, không nhận là đã chụp.

Không còn P0/P1/P2 hành động được xác nhận trong scope đã kiểm tra. Khác biệt stock, missing media, số dòng và data price là state của fixture, được giữ trung thực. **P3 tùy chọn:** tinh chỉnh độ lấp đầy của studio artwork sau khi có catalog production media đầy đủ; không chặn WP.

## Verification và giới hạn

- Lint/typecheck PASS; targeted unit 46/46, coverage 9/9. Browser behavior 13/13; sau chỉnh geometry, final stable rerun **6/6 PASS, exit 0, 59,8 s**. [Evidence](docs/evidence/ui-v2/storefront-home.md) ghi phạm vi từng run.
- In-app Browser phiên mới mở home và kiểm tra console: không có warning/error được ghi nhận. Warning effect-dependency cũ trong phiên HMR trước phát sinh lúc đổi source, không còn trong phiên mới.
- Chưa chứng minh mọi route v2.0, native zoom 200%, cross-browser hoặc production performance after; các gate đó thuộc owner tiếp theo/UI2-13. Không dùng QA này để nhận toàn chương trình DONE.
- Màn đã có dữ liệu bán được kiểm giá qua model card/unit contracts; featured sold-out state trong runtime này không phải ảnh bento in-stock. Các source-only/fixture limits còn được giữ trong manifest để kiểm tiếp.

**final result: passed**

---

# Design QA — FE-06 kho hàng, kiểm định và tồn phụ kiện (lịch sử)

Ngày kiểm tra: 2026-08-28

Trang xem chính: `http://localhost:3000/backoffice/inventory/units`

## Phạm vi

Tám màn hình đã được kiểm tra:

- `/backoffice/inventory/units`
- `/backoffice/inventory/intake`
- `/backoffice/inventory/lookup`
- `/backoffice/inventory/units/[id]`
- `/backoffice/inventory/inspections/[id]`
- `/backoffice/inventory/locations`
- `/backoffice/inventory/stock`
- `/backoffice/inventory/stock/movements`

## Điều kiện kiểm tra

| Nhóm            |  Kích thước | Dữ liệu                                                        |
| --------------- | ----------: | -------------------------------------------------------------- |
| Desktop         | 1440 × 1000 | Quản trị viên, một máy iPhone và một dòng tồn phụ kiện         |
| Mobile          |   360 × 800 | Cùng dữ liệu; kiểm tra cuộn ngang điều hướng và bố cục một cột |
| Quyền nhân viên |     Desktop | Kiểm tra hồ sơ máy không gọi hoặc hiển thị giá vốn             |

Kiểm tra trực tiếp trên cửa sổ trình duyệt localhost cho thấy API và cơ sở dữ liệu cục bộ
không chạy. Bộ hành trình đầy đủ vì vậy dùng chính server web localhost với dữ liệu giả lập
ổn định, không ghi thay đổi vào dữ liệu thật.

## Ảnh đối chiếu

Desktop:

- [Danh sách máy](docs/assets/ui/fe-06/units-1440.png)
- [Nhập máy](docs/assets/ui/fe-06/intake-1440.png)
- [Tra cứu mã](docs/assets/ui/fe-06/lookup-1440.png)
- [Hồ sơ máy](docs/assets/ui/fe-06/unit-detail-1440.png)
- [Phiếu kiểm định](docs/assets/ui/fe-06/inspection-1440.png)
- [Địa điểm](docs/assets/ui/fe-06/locations-1440.png)
- [Tồn phụ kiện](docs/assets/ui/fe-06/stock-1440.png)
- [Lịch sử kho](docs/assets/ui/fe-06/movements-1440.png)

Mobile:

- [Danh sách máy](docs/assets/ui/fe-06/units-360.png)
- [Hồ sơ máy](docs/assets/ui/fe-06/unit-detail-360.png)
- [Phiếu kiểm định](docs/assets/ui/fe-06/inspection-360.png)
- [Tồn phụ kiện](docs/assets/ui/fe-06/stock-360.png)

## Kết quả trực quan

- Tám màn hình dùng chung điều hướng kho hàng, nhịp lưới, card, bảng và trạng thái.
- Nút “Nhập máy” giữ chữ và biểu tượng trắng trên nền xanh ở mọi trạng thái liên kết.
- Trên mobile, tab hiện tại tự cuộn vào giữa sau khi xác nhận đăng nhập và luôn nằm trọn
  trong khung điều hướng.
- Bộ lọc xếp lại thành một cột trên mobile; bảng chuyển sang cách trình bày responsive mà
  không làm tràn chiều ngang tài liệu.
- Thanh thao tác kiểm định cố định không che nội dung cần nhập; toàn bộ 18 mục vẫn truy cập
  được bằng bàn phím và có nhãn riêng.
- Phần tra cứu bỏ các từ kỹ thuật như “URL” và “bộ nhớ trình duyệt”; giá nhập máy dùng đơn
  vị “đồng”.
- Không có lỗi console hoặc tràn ngang ở 1440 px và 360 px.

## Hành trình đã kiểm tra

- Tài khoản nhân viên xem hồ sơ máy mà không phát sinh yêu cầu giá vốn.
- IMEI đầy đủ chỉ gửi trong yêu cầu tra cứu có lý do, bị xóa khỏi ô nhập sau khi gửi và
  không xuất hiện trong đường dẫn hoặc nội dung kết quả.
- Tìm kiếm và bộ lọc danh sách máy cập nhật tại chỗ, không tải lại toàn trang; chuỗi giống
  định danh đầy đủ bị chuyển sang trang tra cứu bảo vệ.
- Phiếu kiểm định có đúng 18 mục, lưu được bản nháp rồi hoàn tất; bản hoàn tất chuyển sang
  chỉ đọc.
- Thao tác nhận hàng ghi vào lịch sử, tải lại số dư chính thức và hiển thị đúng dòng biến
  động không thể sửa.
- Cả tám route đều có đúng một vùng nội dung chính và tab hiện tại hiển thị đầy đủ trên
  mobile.

## Cổng chất lượng

- Web: 76/76 tệp, 324/324 bài kiểm tra đạt.
- API: 107/107 tệp, 625/625 bài kiểm tra đạt.
- API client: 7/7 bài kiểm tra; lint, typecheck và build đạt.
- Accessibility contract: 15/15 đạt.
- Browser FE-06: 6/6 đạt.
- Production build: đạt, tạo đủ 41 trang.
- OpenAPI và mã API client tạo lại không phát sinh chênh lệch.
- PostgreSQL/Docker integration chưa chạy vì Docker Desktop đang tắt.

Kết quả cuối: **đạt**.

---

## Kiểm tra bổ sung — thiết kế lại màn nhập máy

Ngày kiểm tra: 2026-08-29

### Nguồn và trạng thái đối chiếu

- Mockup đã chọn: phương án 1, ảnh gốc `1487 × 1059`, trạng thái bước 1.
- Bản triển khai: `1280 × 720`, mật độ điểm ảnh `2`, tài khoản quản trị viên, dữ liệu thật từ môi trường Docker cục bộ.
- Ảnh triển khai: [màn nhập máy sau thiết kế lại](docs/assets/ui/fe-06/intake-redesign-1280.png).
- Ảnh hồi quy: [tra cứu IMEI sai nhưng hai trường vẫn thẳng hàng](docs/assets/ui/fe-06/lookup-error-1280.png).
- Mockup và ảnh triển khai đã được chuẩn hóa về cùng chiều cao, đặt cạnh nhau trong một ảnh so sánh trước khi đánh giá.

### Kết quả đối chiếu

- Nhóm công cụ Kho hàng đã chuyển vào sidebar trái; không còn thanh điều hướng ngang lặp lại.
- Sidebar chỉ có một mục `aria-current="page"`; “Nhập máy” được làm nổi bật đúng route.
- Tiến độ 5 bước, form hai cột, các nhóm nghiệp vụ và khối tóm tắt bên phải giữ đúng hướng thiết kế của mockup, đồng thời dùng token và cỡ chữ hiện có của rePhone.
- Tóm tắt máy cập nhật ngay theo dòng máy, nơi nhận, số mã nhận diện và giá bán; không gửi dữ liệu khi chỉ nhập thử.
- Phiếu kiểm định không đạt hoặc chỉ đạt một phần vẫn dừng ở bước Kiểm định và hiển thị “Cần xử lý”, không chuyển nhầm sang bước mở bán.
- Bước hiện tại có `aria-current="step"` và trạng thái ẩn dành cho trình đọc màn hình.
- Trạng thái IMEI sai giữ hai control tại cùng tung độ `373 px`; chiều cao lần lượt `49,5 px` và `50 px`; không có tràn ngang.
- Không có lỗi console sau khi tải trang, thay đổi dữ liệu form, chuyển route và kích hoạt trạng thái lỗi.

### Cổng chất lượng của lượt sửa

- Web lint: đạt.
- Web typecheck: đạt.
- Web test: `87/87` tệp, `390/390` bài kiểm tra đạt.
- Production build: đạt, tạo đủ `42/42` trang.
- Kiểm tra trực tiếp: nhập liệu tóm tắt, trạng thái lỗi, sidebar hiện tại và điều hướng đều đạt.

final result: passed

---

# Design QA — FE-08 phân tầng và làm giàu nội dung

Ngày kiểm tra: 2026-08-30

### Nguồn và trạng thái đối chiếu

- Hướng thiết kế được duyệt: **phương án 1 — Bảng điều hành phân tầng**.
- Ảnh nguồn: [mockup Quản lý nhân viên đã chốt](docs/assets/ui/fe-08/employee-depth-direction-selected.png).
- Ảnh triển khai chính: [Quản lý nhân viên ở desktop](docs/assets/ui/fe-08/refinement/01-employees-layered-desktop.png).
- Hai ảnh được chuẩn hóa về cùng khung nhìn đầu trang `1440 × 900` trước khi đánh giá.
- Bằng chứng đặt cạnh nhau: [mockup và bản triển khai](docs/assets/ui/fe-08/refinement/qa-employees-layered-comparison.png).
- Dữ liệu trong mockup là dữ liệu minh họa; bản triển khai dùng dữ liệu vận hành thật nên tên,
  email và trạng thái khác nhau. Việc đối chiếu tập trung vào phân cấp, nhịp lưới, trạng thái chọn
  và khả năng đọc.

### Ảnh triển khai

- [Quản lý nhân viên](docs/assets/ui/fe-08/refinement/01-employees-layered-desktop.png).
- [Quản lý khách hàng](docs/assets/ui/fe-08/refinement/02-customers-layered-desktop.png).
- [Cấu hình cửa hàng](docs/assets/ui/fe-08/refinement/03-settings-layered-desktop.png).
- [Nhật ký hoạt động](docs/assets/ui/fe-08/refinement/04-audit-layered-desktop.png).
- [Trạng thái hệ thống](docs/assets/ui/fe-08/refinement/05-health-layered-desktop.png).
- [Nhân viên ở vùng nhìn hẹp](docs/assets/ui/fe-08/refinement/01-employees-layered.png).
- [Nhật ký ở vùng nhìn hẹp](docs/assets/ui/fe-08/refinement/04-audit-layered-narrow.png).
- [Trạng thái hệ thống ở vùng nhìn hẹp](docs/assets/ui/fe-08/refinement/05-health-layered-narrow.png).

### Kết quả đối chiếu

- Nhân viên và khách hàng dùng cùng cấu trúc master–detail: hàng đang chọn, hero hồ sơ, dải
  tóm tắt ba mục, nhóm thông tin và thanh hành động có thứ bậc rõ.
- Cấu hình cửa hàng có bốn nhóm biểu mẫu và rail tóm tắt dùng chính dữ liệu đang áp dụng;
  trạng thái đã lưu, chưa lưu, đang lưu và xung đột đều phân biệt được.
- Nhật ký đưa ba bộ lọc chính và thao tác lên cùng hàng; bộ lọc chi tiết có số điều kiện đang
  nhập. Chi tiết hoạt động được chuyển từ khối dữ liệu thô thành nhóm thông tin tiếng Việt;
  dữ liệu lạ chỉ nằm trong vùng kỹ thuật thu gọn.
- Trạng thái hệ thống có ba tín hiệu tóm tắt, hướng dẫn cách đọc và khuyến nghị vận hành;
  độ mới kết quả cập nhật theo thời gian mà không gọi thêm máy chủ.
- Điều hướng hệ thống ở màn hình hẹp tự đưa mục hiện tại vào vùng nhìn thấy và hiển thị dấu
  hiệu cuộn ở đúng mép.

### Các vòng sửa sau review

- Ngăn bảng chi tiết tự chuyển sang tài khoản khác khi bản ghi vừa đổi trạng thái không còn
  khớp bộ lọc; thông báo và hành động tiếp theo luôn gắn với đúng tài khoản vừa thao tác.
- Sửa cấu trúc `dt`/`dd` để công cụ hỗ trợ giữ đúng quan hệ nhãn–giá trị.
- Ngày chỉ có phần ngày không còn xuất hiện giờ giả; các trạng thái phổ biến trong nhật ký
  được chuyển hoàn toàn sang tiếng Việt. Enum lạ và payload không phải object vẫn được giữ
  trong vùng kỹ thuật, không bị báo nhầm là không có dữ liệu.
- Bỏ thanh cuộn lồng của chi tiết nhật ký; toàn workspace chỉ dùng cuộn trang và cuộn sidebar.
- Dòng nhật ký đang chọn có `aria-current="page"` thống nhất với danh sách người dùng.
- Giảm một nhịp khoảng trắng nội bộ của thẻ Trạng thái hệ thống. Ở desktop, `scrollHeight`
  và `clientHeight` đều bằng `900 px`; không còn thanh cuộn dọc thừa `6 px`.

### Kiểm tra trực tiếp

- Desktop `1440 × 900`: năm workspace không tràn ngang, không có lỗi hoặc cảnh báo console.
- Vùng nhìn hẹp `679 × 675`: điều hướng hiện tại nằm trọn trong khung, form và các dải tóm
  tắt chuyển thành một cột, tài liệu không tràn ngang.
- Chọn bản ghi thứ hai ở Nhân viên, Khách hàng và Nhật ký cập nhật đúng URL, chi tiết và
  trạng thái chọn.
- Nút Kiểm tra lại cập nhật thời điểm; Cấu hình cửa hàng giữ đúng trạng thái chưa lưu/đã lưu.

### Cổng chất lượng của lượt nâng cấp

- Web test: `117/117` tệp, `544/544` bài kiểm tra đạt.
- Web lint: đạt, không có cảnh báo.
- Web typecheck: đạt.
- Production build: đạt; đầy đủ sáu route FE-08.
- Kiểm tra khoảng trắng thay đổi: đạt.

final result: passed

---

# Design QA — FE-08 quản trị hệ thống

Ngày kiểm tra: 2026-08-30

Trang xem chính: `http://localhost:3000/backoffice/employees`

## Phạm vi

Năm workspace, tương ứng sáu route, đã được kiểm tra:

- `/backoffice/employees`
- `/backoffice/customers`
- `/backoffice/settings`
- `/backoffice/audit-logs`
- `/backoffice/audit-logs/[id]`
- `/backoffice/system/health`

## Nguồn và trạng thái đối chiếu

- Mockup được duyệt: [quản lý nhân viên — phương án 2](docs/assets/ui/fe-08/employee-master-detail-selected.png).
- Bản triển khai: tài khoản quản trị viên, danh sách nhân viên đã tải và hồ sơ đầu tiên được chọn.
- Vùng nhìn logic dùng để kiểm tra là `1280 × 720`; ảnh trình duyệt lưu ở `1265 × 712` do phần viền của cửa sổ nhúng.
- Mockup được co và cắt về cùng vùng nhìn trước khi đánh giá, không thay đổi nội dung thiết kế.
- Ảnh đối chiếu kết hợp: [mockup và bản triển khai](docs/assets/ui/fe-08/qa-employees-comparison.png).

## Ảnh kiểm tra

- [Quản lý nhân viên](docs/assets/ui/fe-08/qa-employees-1280.png).
- [Quản lý khách hàng](docs/assets/ui/fe-08/qa-customers-1280.png).
- [Cấu hình cửa hàng](docs/assets/ui/fe-08/qa-settings-1280.png).
- [Nhật ký hoạt động](docs/assets/ui/fe-08/qa-audit-1280.png).
- [Trạng thái hệ thống](docs/assets/ui/fe-08/qa-health-1280.png).

## Kết quả đối chiếu và các vòng sửa

- Bản triển khai giữ đúng cấu trúc master–detail, thẻ hồ sơ, hàng đang chọn, nhịp khoảng cách và màu chủ đạo của mockup.
- Sidebar tiếp tục mở đầy đủ theo yêu cầu trước đó của người dùng và giữ chiều rộng chung của workspace vận hành; đây là khác biệt có chủ đích so với mockup rút gọn.
- Dữ liệu thật có tên, email và mã nhân viên dài hơn mockup; danh sách vẫn cắt chữ an toàn và cột trạng thái không làm xô lệch chi tiết.
- Lần kiểm tra đầu phát hiện hồ sơ cũ vẫn còn sau khi đổi bộ lọc. Bản sửa hiện xóa lựa chọn ngay khi tìm kiếm, đổi trạng thái hoặc đổi sắp xếp.
- Vòng đối chiếu đầu có viền lấy nét thừa quanh tiêu đề được lấy nét bằng chương trình. Viền này đã được bỏ khỏi tiêu đề không tương tác, không ảnh hưởng focus của nút và trường nhập.
- Lỗi tổng của biểu mẫu cấu hình từng còn lại sau khi người dùng sửa trường sai. Bản sửa hiện xóa lỗi cũ ngay khi nội dung được điều chỉnh; lỗi riêng từng trường và trạng thái xung đột vẫn giữ đúng chức năng.
- Liên kết xem ảnh QR thông báo rõ việc mở trong thẻ mới cho trình đọc màn hình.

## Quyền và hành trình đã kiểm tra trực tiếp

- Quản trị viên mở được cả năm workspace, lọc danh sách không tải lại toàn trang và xem được hồ sơ chi tiết.
- Nhân viên bị chặn ngay tại quản lý nhân viên, không nhìn thấy nội dung bên trong; quản lý khách hàng chỉ có quyền xem và không có thao tác đổi trạng thái.
- Khách hàng truy cập link quản trị bị chặn trước khi shell quản trị xuất hiện.
- Cấu hình cửa hàng xử lý trường bắt buộc, giới hạn giá trị tiền, thay đổi chưa lưu, xung đột phiên bản và ảnh QR.
- Nhật ký chỉ hiển thị dữ liệu đã được làm sạch; danh sách, bộ lọc, phân trang và chi tiết giữ cùng workspace.
- Trạng thái hệ thống phân biệt sẵn sàng, suy giảm và không kết nối; nút kiểm tra lại hoạt động tại chỗ.

## Cổng chất lượng

- Web test: `117/117` tệp, `535/535` bài kiểm tra đạt.
- API unit test: `110/110` tệp, `670/670` bài kiểm tra đạt.
- API E2E cấu hình/nhật ký: `6/6` đạt, bao gồm biên tiền 15/16 chữ số và không ghi thay đổi khi dữ liệu sai.
- Frontend coverage contract: `4/4` đạt; FE-08 có `18/18` operation `DONE`, toàn ledger `160/160` `DONE`.
- Web/API lint và typecheck: đạt.
- Production build: đạt; route `/backoffice/system/health` có trong kết quả build.
- Kiểm tra khoảng trắng thay đổi: đạt.

final result: passed

---

# Design QA — FE-07 vận hành đơn hàng và hậu mãi

Ngày kiểm tra: 2026-08-29

Trang xem chính: `http://localhost:3000/backoffice/orders/01a02a39-3b79-7434-8b82-4c116e08b526`

## Phạm vi

Mười một màn hình đã được kiểm tra:

- Danh sách và chi tiết đơn hàng.
- Danh sách và chi tiết thanh toán.
- Danh sách và chi tiết hoàn tiền.
- Danh sách và chi tiết hỗ trợ sau mua.
- Danh sách và chi tiết bảo hành.
- Danh sách và chi tiết chính sách bảo hành trong cùng một workspace.

## Nguồn và điều kiện đối chiếu

- Mockup được duyệt: [chi tiết đơn hàng — phương án 1](docs/assets/ui/fe-07/order-detail-selected.png).
- Bản chạy thực tế dùng tài khoản Admin Demo, API và dữ liệu Supabase trong môi trường Docker cục bộ.
- Trạng thái đối chiếu là đơn hàng đang hoạt động; quá trình QA không xác nhận thao tác làm thay đổi nghiệp vụ thật.
- Bản triển khai đã được đặt cạnh mockup ở cùng kích thước trước khi đánh giá bố cục.

## Ảnh kiểm tra

- [Chi tiết đơn hàng — phần đầu desktop](docs/assets/ui/fe-07/qa/order-detail-1440.png).
- [Chi tiết đơn hàng — phần cuối desktop](docs/assets/ui/fe-07/qa/order-detail-1440-bottom.png).
- [Chi tiết đơn hàng — mobile](docs/assets/ui/fe-07/qa/order-detail-390.png).
- [Chi tiết hỗ trợ sau mua](docs/assets/ui/fe-07/qa/after-sales-detail-1440.png).
- [Chính sách bảo hành](docs/assets/ui/fe-07/qa/warranty-policies-1440.png).

## Kết quả trực quan và tương tác

- Workspace giữ đúng hướng mockup: tiêu đề đơn hàng rõ ràng, liên kết quay lại, ba trục trạng thái, vùng nội dung chính và thanh “Xử lý đơn hàng”.
- Các lựa chọn trong thanh xử lý là control nhẹ; chỉ nút xác nhận hành động là nút chính, tránh tạo nhiều điểm nhấn cạnh tranh.
- Tab hiện tại tự căn vào vùng nhìn thấy khi tải trực tiếp hoặc đổi kích thước từ desktop sang mobile.
- Danh sách chính sách bảo hành không còn chồng lên thanh thao tác ở desktop; trên mobile, các trường và nút được xếp thành từng hàng riêng.
- Phiếu kiểm định nhúng trong hồ sơ hỗ trợ dùng tiêu đề cấp hai, không tạo thêm tiêu đề trang hoặc vùng nội dung chính lồng nhau.
- Bộ lọc đơn hàng cập nhật tại chỗ, không làm trắng hoặc tải lại toàn trang; chuyển chính sách và lựa chọn hành động cập nhật đúng trạng thái đã chọn.
- Không thấy nội dung kỹ thuật dành cho lập trình viên trong giao diện khách hàng hoặc nhân viên.

## Ma trận responsive

| Chiều rộng | Tràn ngang | Vùng nội dung chính | Tiêu đề trang | Nút xác nhận |
| ---------: | :--------: | :-----------------: | :-----------: | :----------: |
|    1440 px |   Không    |       1 vùng        |   1 tiêu đề   | Trong khung  |
|    1024 px |   Không    |       1 vùng        |   1 tiêu đề   | Trong khung  |
|     768 px |   Không    |       1 vùng        |   1 tiêu đề   | Trong khung  |
|     390 px |   Không    |       1 vùng        |   1 tiêu đề   | Trong khung  |
|     320 px |   Không    |       1 vùng        |   1 tiêu đề   | Trong khung  |

## Quyền truy cập và độ tin cậy

- Cổng quyền của khu vực vận hành giữ nguyên nguyên tắc chặn trước khi hiển thị nội dung quản trị.
- Các thao tác tài chính, bảo hành và hậu mãi dùng kết quả chính thức từ máy chủ; lỗi, xung đột và thao tác lặp được xử lý trong bộ kiểm thử.
- Chính sách bảo hành đang được áp dụng không thể bị lưu đè làm thay đổi ngược các bảo hành đã phát hành.

## Cổng chất lượng

- Web: lint và typecheck đạt; production build đạt, tạo đủ `42/42` trang.
- Web test: `108/108` tệp, `489/489` bài kiểm tra đạt.
- API test: `109/109` tệp, `666/666` bài kiểm tra đạt.
- API client: `7/7` bài kiểm tra đạt; lint, typecheck và build đạt.
- API E2E trọng điểm: `5/5` đạt; kiểm thử tích hợp: `7/7` đạt.
- Phạm vi FE-07: `53/53` thao tác được đánh dấu hoàn tất.

final result: passed

---

## Kiểm tra bổ sung — độ thẳng hàng, chiều sâu và điều hướng FE-07

Ngày kiểm tra: 2026-08-29

### Phạm vi phản hồi

- Cố định lưới của danh sách hỗ trợ sau mua và bảo hành để nhãn trạng thái dài hoặc ngắn
  không làm xô lệch các cột còn lại.
- Căn nội dung của danh sách đơn hàng, thanh toán và hoàn tiền theo mép trên khi một ô có
  nhiều dòng hơn ô bên cạnh.
- Tăng phân cấp thị giác bằng bóng đổ nhẹ, nền phân tầng và đường phân cách nhất quán.
- Giữ mở sẵn bốn nhóm điều hướng trên mọi màn hình vận hành: Vận hành, Kho hàng, Đơn hàng
  và Sau mua.

### Ảnh kiểm tra

- [Đối chiếu phản hồi và bản hoàn thiện](docs/assets/ui/fe-07/qa/after-sales-reference-comparison.png).
- [Hỗ trợ sau mua — desktop](docs/assets/ui/fe-07/qa/after-sales-list-aligned-1440.png).
- [Hỗ trợ sau mua — mobile](docs/assets/ui/fe-07/qa/after-sales-list-aligned-390.png).
- [Bảo hành — desktop](docs/assets/ui/fe-07/qa/warranties-list-aligned-1440.png).
- [Bảo hành — tablet](docs/assets/ui/fe-07/qa/warranties-list-aligned-1024.png).
- [Bảo hành — mobile](docs/assets/ui/fe-07/qa/warranties-list-aligned-390.png).
- [Bảo hành — nhãn dài ở cuối danh sách](docs/assets/ui/fe-07/qa/warranties-long-status-1440.png).
- [Điều hướng mở sẵn tại Hỗ trợ sau mua](docs/assets/ui/fe-07/qa/navigation-expanded-after-sales-1440.png).
- [Điều hướng mở sẵn tại Danh mục](docs/assets/ui/fe-07/qa/navigation-expanded-catalog-1440.png).

### Kết quả đo trực tiếp trong trình duyệt

| Chiều rộng | Hỗ trợ sau mua | Bảo hành | Tràn ngang | Chồng hàng |
| ---------: | :------------: | :------: | :--------: | :--------: |
|    1440 px |      Đạt       |   Đạt    |   Không    |   Không    |
|    1024 px |      Đạt       |   Đạt    |   Không    |   Không    |
|     768 px |      Đạt       |   Đạt    |   Không    |   Không    |
|     390 px |      Đạt       |   Đạt    |   Không    |   Không    |
|     320 px |      Đạt       |   Đạt    |   Không    |   Không    |

- Trên desktop, mọi nhãn trạng thái trong từng danh sách dùng chung một mép phải; nhãn
  “Còn hiệu lực” và “Không còn hiệu lực” đều cao `28 px`.
- Ở 1024 px, bộ lọc bảo hành chuyển thành hai cột nên nút thao tác không bị cắt và tài liệu
  không phát sinh thanh cuộn ngang.
- Ở 320 px, trạng thái chuyển xuống một hàng riêng; từ 390 px trở lên vẫn giữ một cột trạng
  thái dùng chung cho toàn danh sách.
- Danh sách đơn hàng, duyệt thanh toán và hoàn tiền không tràn ngang; nội dung nhiều dòng
  không làm các ô kế bên bị căn giữa lệch nhịp.
- Điều hướng dùng chung có đủ `4` nhóm và `15` mục tại các khu vực vận hành, danh mục và kho.

### Cổng chất lượng của lượt sửa

- Web test: `108/108` tệp, `489/489` bài kiểm tra đạt.
- Web lint: đạt, không có cảnh báo.
- Web typecheck: đạt.
- Production build: đạt, tạo đủ `42/42` trang.
- Kiểm tra khoảng trắng của thay đổi: đạt.

final result: passed

---

# Design QA — Làm rõ chi tiết đơn hàng backoffice

Ngày kiểm tra: 2026-09-01

Route: `/backoffice/orders/[id]`

Ảnh chuẩn: `docs/assets/ui/fe-08/order-detail-refinement/reference.png`

## Bằng chứng trực quan

- Bản triển khai desktop: `docs/assets/ui/fe-08/order-detail-refinement/implementation-1440.png`.
- So sánh ảnh chuẩn và bản triển khai trong cùng một khung: `docs/assets/ui/fe-08/order-detail-refinement/comparison.png`.
- Trạng thái mở biểu mẫu xử lý: `docs/assets/ui/fe-08/order-detail-refinement/action-open-1440.png`.
- Bản responsive 390 × 844: `docs/assets/ui/fe-08/order-detail-refinement/mobile-390.png`.

Ảnh chuẩn 1487 × 1058 được đặt cạnh ảnh chụp từ viewport kiểm tra 1440 × 1024 và
scale về cùng khung 1440 × 1024 cho bước so sánh cuối.

## Các vòng sửa sau đối chiếu

1. Dải tổng quan ban đầu làm mã đơn và chip trạng thái xuống dòng. Đã giảm padding theo
   token, phân bổ lại cột và khóa chip trạng thái trên một dòng.
2. Nội dung chính ban đầu thấp hơn ảnh chuẩn vì panel còn quá thoáng. Đã giảm khoảng cách
   header cục bộ, nới cột nội dung và giữ rail ở mật độ vận hành.
3. Nhãn mở biểu mẫu trong rail bị xuống dòng. Đã dùng cỡ label, giảm gap/padding và giữ
   vùng bấm tối thiểu 44 px.
4. Ở 390 px, dải tổng quan một cột đẩy hành động xuống quá sâu. Đã dùng bố cục hai cột với
   mã đơn chiếm toàn hàng; rail hành động xuất hiện trước phần nội dung dài.

## Kết quả theo rubric

| Bề mặt                    | Kết quả                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bố cục và phân cấp        | Dải tổng quan, sản phẩm, khách hàng, timeline, action rail và tài chính đúng thứ tự của phương án 1. Rail sticky trên desktop, chuyển lên trước main ở màn hẹp. |
| Typography và khoảng cách | Không còn nhãn/chip bị cắt; mã đơn desktop không xuống dòng; panel dùng cùng token chữ và khoảng cách của rePhone.                                              |
| Màu và trạng thái         | Dùng token brand/surface hiện có; chip trạng thái giữ tone success/warning/danger từ projection, không hiển thị enum thô.                                       |
| Hình ảnh và icon          | DTO đơn hàng không có URL ảnh sản phẩm. Bản triển khai dùng `DeviceMobileIcon` trung tính từ Phosphor, không tự dựng hoặc gán sai ảnh máy.                      |
| Tương tác                 | Action chỉ lấy từ `availableActions`; biểu mẫu dùng disclosure native, đóng mặc định, mở/đóng được và giữ nguyên validation/submit hiện có.                     |
| Responsive                | Desktop 1440 × 1024 và mobile 390 × 844 không chồng lấn hay cắt control; timeline ngang tự chuyển dọc dưới 48 rem.                                              |
| Accessibility             | Một `h1`; trạng thái có chữ và màu; timeline là `ol`; thông tin là `dl/dt/dd`; disclosure dùng `details/summary`; focus-visible và vùng bấm tối thiểu được giữ. |

## Sai khác có chủ đích so với ảnh chuẩn

- Không dùng ảnh iPhone trong panel sản phẩm vì dữ liệu authoritative hiện tại không cung
  cấp media cho order item. Dùng icon trung tính để tránh trình bày sai chiếc máy.
- Giữ sidebar, breadcrumb, token và primitive hiện hành của backoffice thay vì thay shell
  theo ảnh tạo mẫu.

## Kiểm tra mã nguồn

- ESLint: đạt.
- TypeScript: đạt.
- Next.js production build: đạt.
- Vitest tập trung: 4 file, 33 test đạt.
- `git diff --check`: đạt.

Không còn finding P0, P1 hoặc P2 trong phạm vi màn chi tiết đơn hàng.

final result: passed
