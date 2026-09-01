# FE-09 — Kế hoạch hoàn thiện toàn diện frontend và release hardening

> Trạng thái tài liệu: **ACTIVE**<br>
> Trạng thái phase trong coverage manifest: **IN PROGRESS**<br>
> Ngày khóa phạm vi: **01/09/2026**  
> Nhánh triển khai: `feat/fe-9-release-hardening`  
> Start SHA: `3e79db7` — merge FE-08 order-detail refinement vào `main`  
> Delivery authority: [plan-fe.md](../../plan-fe.md)  
> Design authority: [design.md](../../design.md)  
> HTTP authority: [apps/api/openapi/openapi.json](../../apps/api/openapi/openapi.json)  
> Executable coverage: [apps/web/lib/frontend-coverage.ts](../../apps/web/lib/frontend-coverage.ts)

## 1. Understanding summary

- FE-09 là phase hoàn thiện **toàn bộ frontend từ FE-0 đến FE-8**, không phải đợt
  bổ sung riêng cho FE-7 và FE-8.
- Phạm vi bao gồm storefront, auth/account, cart/wishlist/checkout, customer
  post-purchase, catalog/voucher administration, inventory, operations và system
  administration — đủ **56 route hiện hành**.
- FE-09 không thêm nghiệp vụ backend mới. Mọi quyền, state transition, giá, tồn
  kho, `availableActions`, replay và conflict tiếp tục lấy từ API chính thức.
- Mục tiêu là đưa sản phẩm tới chất lượng phát hành: giao diện nhất quán, tiếng
  Việt tự nhiên, responsive ổn định, accessibility, hiệu năng, bảo mật hiển thị,
  test và bằng chứng release đầy đủ.
- Coverage chỉ hoàn tất khi OpenAPI, ledger và executable manifest cùng chứng minh
  đúng **162 operation duy nhất**, đồng thời mỗi browser owner trỏ tới test thật.
- Mọi chỉnh sửa phải được chia theo concern/surface, kiểm tra bằng trình duyệt và
  không gom thành một commit lớn.
- Không dọn legacy hoặc thay shared CSS theo kiểu big-bang. Chỉ xóa sau khi scan
  consumer bằng zero và browser regression của surface cuối cùng đã xanh.

Yêu cầu người dùng “hoàn thiện toàn diện, không chỉ FE-07 và FE-08” là quyết định
khóa phạm vi. Việc yêu cầu viết tài liệu này được xem là xác nhận understanding
và lựa chọn phương án triển khai theo work package có gate.

## 2. Mục tiêu và definition of done

FE-09 chỉ được đánh dấu `DONE` khi đồng thời đạt tất cả điều kiện sau:

1. **Coverage chính xác:** OpenAPI IDs = plan ledger IDs = executable manifest IDs
   = 162 unique `{operationId, method, path}`; 56 route được sở hữu đúng một lần.
2. **Không còn owner giả:** mọi nhãn `browser:*` trong coverage manifest ánh xạ
   tới suite/test tồn tại và chạy được; không có test ID mồ côi.
3. **Toàn bộ surface được rà soát:** FE-1 đến FE-8 đều có browser, responsive,
   accessibility và visual evidence đại diện; FE-0 foundation được kiểm tra lại
   sau cleanup.
4. **State matrix đủ:** mapping và evidence khớp đủ 13 state đã khóa — `loading`,
   `empty`, `error`, `success`, `warning`, `permission`, `unavailable`, `stale`,
   `conflict`, `disabled`, `pending`, `provider-error`, `upload-progress` — cùng
   terminal/offline state tại nơi contract có thể phát sinh.
5. **UX ổn định:** đổi filter/selection/detail không reload hoặc làm trắng toàn
   trang; không mất scroll, focus, dữ liệu form hoặc shell ổn định ngoài chủ đích.
6. **Accessibility đạt chuẩn:** không có axe violation mức serious/critical được
   chấp nhận; critical journey hoàn tất bằng bàn phím ở viewport đại diện; focus,
   landmark, label, error summary, live region và contrast đạt WCAG 2.2 AA.
7. **Responsive đạt chuẩn:** không có document overflow hoặc control bị che tại
   320, 390, 768, 1024 và 1440 px; zoom 200% và reduced motion vẫn dùng được.
8. **Hiệu năng có số đo:** route đại diện có baseline và budget; không tăng client
   bundle hoặc Core Web Vitals vượt ngưỡng đã khóa mà không có lý do/evidence.
9. **Bảo mật giao diện được chứng minh:** guard fail-closed; không lộ token, raw
   identifier, private evidence, cost hoặc internal field sai role qua HTML, URL,
   log, analytics, cache hoặc browser storage.
10. **Release gate xanh:** `pnpm verify:release` chạy xanh hai lần liên tiếp từ test
    database sạch, không retry/skip/flaky; có release SHA, CI URL, artifact và
    residual-risk log.

## 3. Phạm vi

### 3.1. Surface bắt buộc

| Owner | Surface | Route count | Trọng tâm FE-09 |
| --- | --- | ---: | --- |
| FE-0 | token, primitive, shell, route/operation contract | dùng chung | kiểm tra foundation sau toàn bộ migration và cleanup |
| FE-1 | home, store, product discovery/detail/unit, public vouchers | 6 | nội dung, media, SSR, filter/history, responsive storefront |
| FE-2 | login/register/recovery/invitation, account/profile/address/security | 8 | auth safety, form UX, focus/error, session và account lifecycle |
| FE-3 | cart, wishlist, checkout | 3 | guest/customer merge, preview/reconfirm, local loading và conversion flow |
| FE-4 | orders, warranties, after-sales của khách | 7 | collection/detail/action, guest credential, evidence và eligibility |
| FE-5 | catalog/product/media/voucher administration | 6 | form alignment, search suggestion, lifecycle, role và partial refresh |
| FE-6 | overview, unit/intake/inspection/lookup/location/stock/movement | 9 | workflow resume, identifier privacy, stock authority và inventory media |
| FE-7 | orders/payments/refunds/after-sales/warranties/policies backoffice | 11 | queue/detail/action/timeline, conflict/replay, scroll và evidence |
| FE-8 | employees/customers/settings/audit/health | 6 | master-detail, CAS, redaction, role, live backend health và overview |

Tổng route bắt buộc: **56/56**.

### 3.2. Công việc nằm trong scope

- Rà soát và sửa UI/UX trên toàn bộ surface, không giới hạn ở test automation.
- Chuẩn hóa typography, spacing, panel, control, status, loading, empty/error,
  filter, pagination, modal/drawer, upload và action hierarchy.
- Rà soát toàn bộ copy hiển thị; dùng tiếng Việt tự nhiên, không đưa thuật ngữ
  code, enum hoặc chi tiết triển khai không cần thiết tới khách hàng.
- Tối ưu data loading theo vùng: giữ shell/list ổn định, chỉ loading nơi dữ liệu
  thay đổi; tránh reload document hoặc skeleton toàn khung cho detail-only update.
- Bổ sung browser suite còn thiếu và mở rộng coverage hiện hữu theo state/role.
- Xây dựng visual, accessibility và performance matrix có thể chạy lại.
- Audit Server/Client Component boundary, media strategy và shared bundle.
- Dọn legacy component/CSS sau ownership scan và rollback checkpoint.
- Thiết lập release verification tự động và evidence có thể truy xuất.

### 3.3. Explicit non-goals

- Không thêm API, Prisma schema, state machine, role, payment gateway, carrier,
  scheduler hoặc business capability mới trong FE-09.
- Không đổi backend contract chỉ để làm UI dễ hơn. Nếu tìm thấy contract gap, ghi
  blocker riêng và dừng surface liên quan thay vì suy diễn dữ liệu ở frontend.
- Không redesign thương hiệu, thêm dark mode, native app hoặc animation trang trí.
- Không tạo generic status editor, direct stock editor hoặc action không có trong
  projection chính thức.
- Không dùng test/mocks để che lỗi runtime thật và không gọi Supabase production
  trong release automation.
- Không xóa fallback/legacy selector chỉ vì “trông có vẻ không dùng”; phải có scan,
  build và browser proof.

## 4. Giả định và non-functional requirements

### 4.1. Quy mô và dữ liệu

- Mục tiêu P1 giữ 20–50 người dùng đồng thời và dữ liệu demo/SMB scale.
- Collection lớn luôn phân trang/lọc/sắp xếp phía API; UI không tải full graph để
  render queue.
- Browser automation dùng Nest API thật được build/seed bởi
  `apps/api/test/browser/test-server.ts` tại `:4001`, Next dev tại `:3001` và
  PostgreSQL test riêng; không sử dụng database Supabase thật.
- Test seed phải có customer, employee, admin, guest, terminal/conflict record và
  provider failure fixture đủ cho state matrix.

### 4.2. Hiệu năng

- Đo production build, không dùng số đo Next dev làm release evidence.
- Public route đại diện hướng tới LCP `<= 2.5 s`, CLS `<= 0.1`; critical interaction
  hướng tới INP/proxy `<= 200 ms` trong môi trường đo đã khóa.
- Mỗi số đo dùng median tối thiểu ba lần; lưu thiết bị, viewport, network/CPU profile
  và commit SHA cùng kết quả.
- Sau khi khóa baseline, không surface nào được tăng initial client JavaScript hơn
  10% nếu không có decision/evidence riêng.
- Detail/filter refresh không làm trắng shell/list; route transition phải có feedback
  trong 100 ms và không gây layout shift lớn.

Nếu môi trường CI không ổn định đủ để dùng ngưỡng tuyệt đối, CI dùng budget
baseline-relative; ngưỡng tuyệt đối vẫn phải được xác minh bằng local release run.

### 4.3. Security và privacy

- Backoffice child không render hoặc fetch trước khi role được xác nhận.
- Ẩn control không thay thế API authorization; negative role test luôn kiểm tra cả
  request và DOM.
- Access token không lưu `localStorage`; guest/order credential không vào query,
  SSR HTML, analytics hoặc log.
- Signed URL và evidence URL là ephemeral; không cache dai dẳng hoặc tái sử dụng
  sau expiry.
- Raw identifier, cost, internal note, audit-private field và storage path chỉ xuất
  hiện đúng role/projection.
- Error UI không echo secret, SQL/provider detail hoặc xác nhận sự tồn tại của hồ
  sơ ngoài quyền.

### 4.4. Reliability

- Action pending khóa double-submit; terminal/replay/conflict refetch projection
  chính thức và không phát side effect lần hai.
- Không auto-retry mutation. Retry tự động chỉ dành cho read idempotent khi đã có
  policy rõ ràng; mặc định retry thủ công.
- Loading/error của detail không xóa list đã tải; filter refresh giữ stale result và
  báo trạng thái cập nhật.
- Upload phải xử lý file type/size, 413/415/503, retry có chủ đích và cleanup không
  bảo đảm.
- External provider unavailable phải hiện thông báo theo ngôn ngữ người dùng và
  không biến thành lỗi “Kiểm tra lại thông tin” chung chung.

### 4.5. Accessibility và responsive

- WCAG 2.2 AA là target; axe serious/critical bằng 0 là gate tối thiểu, không thay
  cho keyboard/manual review.
- Viewport chuẩn: 320×844, 390×844, 768×1024, 1024×768 và 1440×900.
- Touch target tối thiểu 44×44 px cho critical control.
- Focus-visible phải tồn tại cả trong forced colors; modal/drawer giữ và trả focus;
  focus programmatic dùng `preventScroll` khi cần giữ danh sách.
- Không dựa riêng vào màu để truyền trạng thái. Text, icon và semantic role phải
  cùng biểu đạt.
- Zoom 200%, reduced motion và Windows forced colors được smoke trên surface đại
  diện.

### 4.6. Maintenance và ownership

- Route page chỉ orchestration; feature state/presenter/adapter nằm đúng owner.
- Shared primitive chỉ nhận pattern thật sự dùng lại; không tạo component khổng lồ
  chứa logic nhiều domain.
- Mỗi commit có một concern, test liên quan và rollback path; không stage file ngoài
  scope.
- Cập nhật snapshot là commit review riêng, không trộn với behavior fix nếu thay đổi
  lớn.
- Raw report nằm dưới `.local/` hoặc CI artifact; repo chỉ giữ summary, selected
  evidence và ảnh đã review, không chứa credential.

## 5. Baseline đã xác minh ngày 01/09/2026

| Hạng mục | Baseline hiện tại | Ý nghĩa đối với FE-09 |
| --- | ---: | --- |
| OpenAPI operation | 162 unique | exact-set đã xanh nhưng cần chứng minh owner test thật |
| Executable operation ledger | 162, FE-1…FE-8 đều `DONE` | không đổi owner sang FE-09; FE-09 kiểm tra claim |
| Next route | 56 | toàn bộ nằm trong release matrix |
| Coverage contract | 4/4 test xanh | mới kiểm tra assignment/exact set, chưa kiểm tra browser owner tồn tại |
| Shared a11y contract | 15/15 test xanh | chỉ foundation/shell, chưa phải toàn sản phẩm |
| Browser automation | 46 test trong 9 file | đủ FE-0…FE-6; chưa có suite chuyên biệt FE-7/FE-8 |
| Browser owner chưa có suite thật | 73 operation | `operations-lifecycle` 53 + `system-admin-health` 20 |
| Browser runtime | Nest API thật + PostgreSQL test + Next dev | deterministic full-stack nhưng chưa smoke production runtime |
| Browser engine | Chromium desktop, 1 worker | cần thêm viewport matrix và critical cross-browser smoke |
| Axe trong browser | 4/9 spec file | chưa phủ operations và system administration |
| Visual snapshot chuẩn | 6 ảnh, chỉ FE-0/FE-1 | cần representative baseline FE-2…FE-8 |
| Frontend spec inventory | 122 file | phải chạy lại số test thật trên baseline SHA |
| API spec inventory | 115 unit + 12 integration + 14 E2E file | giữ nguyên backend contract/reliability gate |
| API coverage artifact gần nhất | 87,44% statements; 75,20% branches; 83,50% functions; 92,37% lines | phải đo lại trên HEAD; branch coverage sát ngưỡng 75% |
| `page.tsx` có `use client` | 38/56 | cần audit boundary, không mặc định coi tất cả là lỗi |
| Client TSX | 114 file | khóa baseline bundle trước khi tối ưu |
| `globals.css` | 2.778 dòng | cleanup sau ownership scan, không thay big-bang |
| Raw `<img>` production | 5 chỗ trong 4 component/file | giữ fallback an toàn đến khi chứng minh media allowlist |
| Legacy `app/catalog-ui.tsx` | không tìm thấy consumer | ứng viên cleanup đầu tiên sau test |
| GitHub Actions | chưa có workflow | chưa thể cung cấp CI URL/release gate bắt buộc |
| OpenAPI/client drift gate | chỉ regenerate rồi build | cần fail nếu regeneration làm working tree thay đổi |
| Release DB lifecycle | `verify:release` gọi `test:db:prepare`; script tự bật `postgres-test` khi không có `TEST_DATABASE_URL` | gap là chưa cleanup container tự sở hữu; CI có URL thì phải dùng service ngoài rõ ràng |

Baseline command đã chạy xanh khi lập kế hoạch:

- `pnpm fe:coverage` — 4/4.
- `pnpm fe:a11y` — 15/15.
- `pnpm exec playwright test --list` — 46 test trong 9 file.

Số test chạy xanh ở thời điểm lập kế hoạch không thay thế baseline mới trên commit
khởi động FE-09. WP-00 phải chạy lại toàn bộ fast gate và ghi SHA.

## 6. Phương án triển khai đã cân nhắc

| Phương án | Mô tả | Ưu điểm | Rủi ro | Quyết định |
| --- | --- | --- | --- | --- |
| A — Comprehensive gated hardening | khóa baseline, sửa từng surface FE-0…FE-8, rồi chạy cross-cutting a11y/perf/cleanup/release | toàn diện, rollback nhỏ, bằng chứng rõ | nhiều checkpoint, thời gian dài hơn | **Chọn** |
| B — Chỉ bổ sung gap FE-7/FE-8 | thêm browser test còn thiếu và đóng phase | nhanh | trái yêu cầu người dùng, bỏ sót UX/perf/legacy toàn sản phẩm | Loại |
| C — Big-bang refactor | đổi shared shell/CSS/client boundary toàn repo một lần | nhìn có vẻ nhanh | regression diện rộng, commit lớn, rollback khó | Loại |

Phương án A là phương án đã được chấp nhận từ yêu cầu “hoàn thiện toàn diện” và
quy tắc chia commit nhỏ.

## 7. Nguyên tắc triển khai

1. **Đo trước, sửa sau:** không tối ưu bundle/performance hoặc xóa CSS nếu chưa có
   baseline và consumer proof.
2. **Surface trước, cross-cutting sau:** mỗi surface tự đạt state/role/responsive
   gate rồi mới chạy matrix toàn sản phẩm.
3. **Partial loading:** initial route có thể dùng skeleton ổn định; detail/filter
   update chỉ loading vùng thay đổi và giữ dữ liệu hợp lệ đang hiển thị.
4. **Backend authoritative:** UI chỉ render `availableActions`/projection; không
   suy diễn command từ status label.
5. **Browser evidence bắt buộc:** mọi fix về layout, scroll, focus, loading hoặc
   responsive phải được tái hiện và xác minh trên browser.
6. **No hidden regression:** thay shared primitive/CSS phải chạy owner scan và các
   consumer suite liên quan trước khi commit.
7. **Vietnamese-first copy:** copy khách hàng thuần Việt; nội dung backoffice vẫn
   dùng từ nghiệp vụ tự nhiên, không raw enum hoặc thuật ngữ code.
8. **Security before polish:** phát hiện lộ dữ liệu hoặc bypass role thì dừng polish,
   sửa security concern riêng và chạy negative tests.

## 8. State và role matrix bắt buộc

### 8.1. Shared state matrix

| State | Acceptance chung |
| --- | --- |
| Initial loading | không flash UI cũ/private; geometry ổn định; có accessible status |
| Partial loading | chỉ vùng thay đổi báo pending; list/shell/form hợp lệ không bị xóa |
| Empty | nêu lý do và hành động hợp lệ; có xóa filter khi phù hợp |
| Validation error | lỗi theo field + summary; focus tới lỗi đầu; giữ dữ liệu đã nhập |
| Read error | thông báo tự nhiên; retry thủ công; không echo detail kỹ thuật |
| Success | xác nhận đúng đối tượng/kết quả; refetch projection; không phát lại side effect |
| Warning | nêu ảnh hưởng và hành động an toàn; không dùng màu làm tín hiệu duy nhất |
| Permission | fail-closed trước render/fetch; không lộ sự tồn tại ngoài quyền |
| Unavailable | phân biệt service/provider không khả dụng với dữ liệu nhập sai |
| Stale | giữ dữ liệu cũ có nhãn rõ; refresh không làm trắng shell/list |
| Conflict/replay | refetch authoritative projection; không duplicate side effect |
| Disabled | có lý do/điều kiện mở lại; vẫn đọc được context cần thiết |
| Provider unavailable | phân biệt lỗi nhà cung cấp/mạng với dữ liệu người dùng sai |
| Pending mutation | khóa double-submit; vẫn cho đọc context cần thiết |
| Upload progress | picker tùy biến, tiến độ/trạng thái đọc được, xử lý 413/415/503 |
| Terminal | read-only; command không hợp lệ biến mất theo projection |
| Offline/recovery | giữ dữ liệu ổn định; thông báo reconnect/retry đúng capability |

### 8.2. Role matrix

| Surface | Anonymous | CUSTOMER | EMPLOYEE | ADMIN |
| --- | --- | --- | --- | --- |
| Public/storefront | đọc public | đọc public + account-only voucher | public như khách | public như khách |
| Auth/account | auth public; account bị chặn | self-service của chính mình | staff invitation/session flow | admin invitation/session flow |
| Customer post-purchase | chỉ guest credential hợp lệ | hồ sơ thuộc mình | không dùng customer ownership để xem chéo | không dùng customer ownership để xem chéo |
| Catalog/inventory/operations | chặn trước render | chặn trước render | đúng capability, không cost/admin action | đầy đủ projection admin |
| System administration | chặn trước render | chặn trước render | chỉ route/capability cho phép | đầy đủ employee/customer/settings/audit/health |

Negative tests phải xác minh cả DOM, request và error copy; không chỉ kiểm tra URL
redirect.

## 9. Work packages

### WP-00 — Khởi động, baseline và evidence skeleton

**Mục tiêu**

- Chuyển FE-09 từ `NOT STARTED` sang `IN PROGRESS` đồng thời trong `plan-fe.md` và
  `FRONTEND_PHASE_STATUS`; operation rows vẫn thuộc FE-1…FE-8.
- Tạo evidence index, residual-risk log và command log theo SHA.
- Chạy fast baseline trên start SHA; ghi rõ pass/fail thay vì giả định từ phase cũ.

**Đầu ra**

- `docs/planning/2026-09-01-fe-09-comprehensive-release-hardening-plan.md`.
- `docs/evidence/fe-09/README.md` hoặc cấu trúc tương đương khi implementation bắt
  đầu; raw artifact vẫn ở `.local/`.
- Baseline coverage/a11y/browser list/build size và danh sách blocker.

**Acceptance**

- Chỉ FE-09 có trạng thái `IN PROGRESS`.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm fe:coverage`,
  `pnpm fe:a11y`, `pnpm build` có kết quả gắn SHA.

**Commit dự kiến:** `docs(fe09): start comprehensive release hardening`

### WP-01 — Coverage truth và release automation

**Mục tiêu**

- Biến nhãn `browser:*` từ chuỗi mô tả thành registry/test ownership có thể kiểm
  tra tự động.
- Fail nếu operation/route/state trỏ tới suite hoặc test title không tồn tại.
- Thêm CI release workflow có Node 24, pnpm 10.18.3, cache, PostgreSQL test và
  artifact retention.

**Tasks**

1. Định nghĩa registry cho browser suite/test ID; map 162 operation và 56 route.
2. Bổ sung contract test cho owner tồn tại, không trùng và không orphan.
3. Tách fast PR gate và full release gate nếu thời gian CI yêu cầu.
4. Upload sanitized coverage/performance/summary artifact cả khi release thành
   công; upload Playwright trace/screenshot/video chi tiết khi fail.
5. Thêm release orchestration nhận biết DB ownership: dùng CI PostgreSQL service
   khi có `TEST_DATABASE_URL`; nếu script tự bật `postgres-test`, bảo đảm cleanup
   container do run đó sở hữu kể cả khi gate lỗi.
6. Sau `api:openapi` và `api:client`, fail nếu generated artifact làm
   `git diff --exit-code` thay đổi.
7. Không đưa `.env`, token hoặc database URL production vào workflow/artifact.

**Acceptance**

- Thay tên/xóa một test owner làm coverage contract đỏ.
- Fresh CI run dựng được test DB và chạy deterministic browser suite.
- Regeneration drift và test DB lifecycle đều có negative test/rehearsal.
- Có CI URL thật trước closeout; nếu repo không cho cấu hình branch protection,
  ghi rõ hạn chế thay vì tuyên bố protected gate.

**Commit dự kiến**

- `test(fe09): enforce executable frontend coverage ownership`
- `ci(fe09): add deterministic release verification`

### WP-02 — FE-0 foundation và shared UX consistency

**Mục tiêu**

- Rà soát token, primitive, shell, navigation, focus, form, status, pagination,
  dialog/drawer, upload và loading contract sau FE-1…FE-8.

**Tasks**

- Khóa control height, font, spacing, border, radius và focus ring bằng token.
- Chuẩn hóa loading policy: initial skeleton, local detail loader, stale list update.
- Kiểm tra sidebar/header giữ vị trí, active item luôn nhìn thấy và không kéo page
  ngoài chủ đích.
- Kiểm tra form hai cột, help/error text không làm hàng bên cạnh lệch; file picker
  không dùng UI mặc định.
- Forced colors, reduced motion và focus restoration cho primitive dùng chung.

**Acceptance**

- Shared a11y contract phủ tất cả primitive có interaction.
- Consumer scan và browser regression xanh trước mỗi shared-style commit.
- Không route nào bị thay đổi ngoài owner đã khai báo.

**Commit dự kiến:** các commit `fix(fe09): harden ... primitive` theo từng concern.

### WP-03 — FE-1 storefront discovery hardening

**Routes:** `/`, `/store`, `/products`, `/products/[slug]`,
`/products/[slug]/units/[inventoryCode]`, `/vouchers`.

**Tasks**

- Rà soát header/footer, search suggestion, filter/history, card alignment, model
  facts, media gallery và exact-unit dossier.
- Kiểm tra copy thuần Việt, availability/price không tạo claim ngoài dữ liệu.
- Giữ product/catalog ưu tiên Server Component; client island chỉ cho interaction.
- Kiểm tra account-only voucher, unavailable unit fallback và public field safety.

**Acceptance**

- SSR public contracts hoạt động khi JavaScript bị tắt ở route đại diện.
- 320–1440 px không overflow; card/action không lệch vì optional content.
- Axe, keyboard, visual snapshot và performance budget storefront xanh.

**Commit dự kiến:** concern-scoped `fix(fe09): harden storefront ...`.

### WP-04 — FE-2 auth và account hardening

**Routes:** `/login`, `/register`, `/forgot-password`, `/reset-password`,
`/accept-invitation`, `/account`, `/account/addresses`, `/account/security`.

**Tasks**

- Rà soát enumeration-safe errors, fragment token consumption và staff/customer
  destination.
- Chuẩn hóa form validation, error focus, pending lock và password guidance theo
  ngôn ngữ người dùng.
- Kiểm tra account/profile/address/security partial update không reload shell.
- Kiểm tra anonymous, expired token, revoked session và network failure.

**Acceptance**

- Auth/account critical flow hoàn tất bằng bàn phím trên desktop/mobile.
- Token không xuất hiện trong query, HTML hoặc browser storage sai contract.
- Axe/visual/state matrix FE-2 xanh.

### WP-05 — FE-3 commerce hardening

**Routes:** `/cart`, `/wishlist`, `/checkout`.

**Tasks**

- Kiểm tra guest cart, customer merge/retry, wishlist và quantity update giữ state.
- Checkout preview/reconfirm phải dùng projection mới nhất, không optimistic terminal
  transition hoặc auto-retry mutation.
- Tối ưu local loading cho line item/summary/preview; không skeleton toàn trang khi
  chỉ cập nhật một dòng.
- Rà soát mobile purchase controls, sticky action và footer overlap.

**Acceptance**

- Guest shipping và customer pickup end-to-end xanh.
- Merge/reconfirm/conflict không mất sản phẩm hoặc double submit.
- Money, voucher và fulfillment option luôn từ server.

### WP-06 — FE-4 customer post-purchase hardening

**Routes:** `/orders`, `/orders/[orderNumber]`, `/warranties`,
`/warranties/[warrantyCode]`, `/after-sales`, `/after-sales/new`,
`/after-sales/[requestNumber]`.

**Tasks**

- Chuẩn hóa row/card geometry khi status text dài; detail hierarchy và timeline.
- Kiểm tra eligibility hỗ trợ chỉ từ đơn hoàn thành; không hỗ trợ đơn hủy/chưa hoàn
  tất.
- Rà soát proof/attachment upload, signed URL expiry và guest credential.
- Tối ưu collection/detail loading, scroll/focus và back navigation.

**Acceptance**

- Customer/guest ownership negative test không lộ hồ sơ.
- Order/warranty/after-sales collection và detail hoạt động ở 390 px.
- Error/provider failure copy cụ thể, không báo validation chung sai nguyên nhân.

### WP-07 — FE-5 catalog và voucher administration hardening

**Routes:** `/backoffice/catalog/products`, `.../new`, `.../[id]`,
`/backoffice/vouchers`, `.../new`, `.../[id]`.

**Tasks**

- Rà soát search suggestion, sort đời mới nhất, filter không reload toàn page.
- Kiểm tra product/variant/media fields đủ contract, form alignment và dirty state.
- Kiểm tra voucher form geometry, date/time, lifecycle và role privacy.
- Rà soát media upload/fallback và không N+1 catalog lookup.

**Acceptance**

- Sáu route dùng được ở 360/1440 px, không overflow hoặc UI mặc định lộ ra.
- Employee không truy cập admin-only voucher mutation.
- Product/voucher lifecycle và conflict test xanh.

### WP-08 — FE-6 inventory và stock hardening

**Routes:** `/backoffice`, inventory units/detail/intake/lookup/inspection/locations,
stock và stock movements.

**Tasks**

- Rà soát intake step isolation, resume không flash bước một và post-inspection
  summary/confirmation.
- Chuẩn hóa form geometry, sort đời máy, IMEI/serial validation và custom upload.
- Kiểm tra inspection 18 mục, draft/complete/read-only và media limit.
- Kiểm tra unit cost privacy, raw identifier không đi qua URL/GET và stock ledger
  immutable.
- Tối ưu queue/detail/stock refresh theo vùng.

**Acceptance**

- EMPLOYEE không phát request cost và không thấy cost DOM.
- Intake/inspection/stock critical browser journey xanh ở desktop/mobile.
- Không raw identifier trong URL, analytics hoặc log.

### WP-09 — FE-7 operations hardening

**Routes:** 11 route orders, payments, refunds, after-sales, warranties và policies.

**Tasks**

- Tạo `operations-lifecycle` browser suite thật cho toàn bộ route owner đã khai báo.
- Rà soát queue/detail/action rail/timeline/evidence/financial summary.
- Kiểm tra filter/selection/detail chỉ tải vùng cần thiết và giữ scroll/focus.
- Kiểm tra `availableActions`, terminal, replay, 409 refetch, cash/bank,
  pickup/shipping/returned và năm resolution after-sales.
- Kiểm tra evidence expired/unavailable và signed URL refresh.

**Acceptance**

- FE-7 operation owner không còn trỏ tới suite giả.
- Critical mutation có pending lock, success/refetch và conflict/replay test.
- Tất cả 11 route có desktop/mobile/axe representative evidence.

### WP-10 — FE-8 system administration hardening

**Route owner FE-8:** employees, customers, settings, audit list/legacy detail và
system health — tổng 6 URL. `/backoffice` overview tiếp tục thuộc route owner FE-6;
operation `getBackofficeOperationsOverview` thuộc FE-8 nên được kiểm thử chéo trong
suite `system-admin-health`, không đổi hoặc nhân đôi route ownership.

**Tasks**

- Tạo `system-admin-health` browser suite thật.
- Kiểm tra employee/customer master-detail giữ scroll và chỉ load detail.
- Kiểm tra settings CAS, QR upload/failure/cleanup và private configuration.
- Kiểm tra audit redaction, filter/deep link, detail-only loading và scroll retention.
- Kiểm tra system health đọc trạng thái API/database/storage/email thật từ backend;
  không hardcode trạng thái thành công.
- Kiểm tra overview metrics, warning và work shortcuts theo role.

**Acceptance**

- ADMIN/EMPLOYEE/CUSTOMER/anonymous role matrix deterministic.
- Stale settings 409, session revoke, audit redaction và provider degradation test
  xanh.
- Sáu route FE-8 có responsive/axe/visual evidence.

### WP-11 — Accessibility, responsive và visual matrix toàn sản phẩm

**Tasks**

1. Tạo representative route/state fixture cho tám domain surface.
2. Chạy axe tại success và ít nhất một error/permission state phù hợp.
3. Chạy keyboard-only critical journey, skip link, modal/drawer focus trap/restore,
   error focus và list/detail focus.
4. Kiểm tra 320/390/768/1024/1440, zoom 200%, reduced motion, forced colors.
5. Tạo visual snapshot đã ổn định dữ liệu/media; cập nhật snapshot phải có review.
6. Chromium chạy full matrix; Firefox/WebKit chạy critical smoke nếu môi trường CI
   hỗ trợ ổn định.

**Acceptance**

- Không serious/critical axe violation.
- Không horizontal document overflow hoặc CTA bị che.
- Visual baseline có ít nhất một màn hình đại diện cho storefront, auth/account,
  commerce, post-purchase, catalog, inventory, operations và system admin.
- Screenshot/reference/prototype so cùng viewport/state; design QA ghi pass/fail.

### WP-12 — Performance, client boundary và media

**Tasks**

- Ghi route-level build/client bundle baseline trước thay đổi.
- Audit 38 client `page.tsx` và 114 client TSX theo lý do tương tác; chỉ chuyển về
  Server Component khi contract và test chứng minh an toàn.
- Đo LCP/CLS/interaction trên production build cho route đại diện.
- Kiểm tra skeleton dimension, media aspect ratio, lazy loading và list virtualization
  nếu số đo thực sự yêu cầu.
- Chứng minh media host allowlist/fallback trước khi thay raw `<img>` bằng
  `next/image`; không đổi chỉ để thỏa lint.
- Tách client island/bundle nặng theo measurement, không theo cảm giác.

**Acceptance**

- Có baseline và after report cùng môi trường/SHA.
- Không route đại diện vượt budget; regression >10% có decision rõ.
- Không hydration warning, CLS do media/loading hoặc N+1 request mới.

### WP-13 — Legacy cleanup có kiểm soát

**Thứ tự đề xuất**

1. Xóa `apps/web/app/catalog-ui.tsx` sau consumer scan zero, test và build.
2. Lập ownership map selector của `globals.css`.
3. Xóa selector theo từng surface đã có CSS Module owner và browser regression.
4. Xóa compatibility import/component chỉ khi route scan zero.
5. Rerun foundation, storefront và critical commerce sau mỗi shared cleanup.

**Acceptance**

- Mỗi cleanup commit chỉ chứa một owner/concern.
- `rg` consumer scan, build và browser test được ghi trong commit/evidence.
- Không đặt mục tiêu giảm số dòng tùy ý; chỉ xóa dead code đã chứng minh.
- Rollback từng commit không yêu cầu database migration hoặc sửa business state.

### WP-14 — Release closeout

**Tasks**

- Chạy full release gate hai lần từ test DB sạch.
- Build một lần và smoke compiled API + `next start` hoặc Docker production image;
  probe API `/health/live`, `/health/ready`, web `/api/health`, authenticated admin
  `/api/v1/backoffice/system/health`, một public route và một protected
  deny/redirect.
- Rà lại operation/route/state/browser ownership exact set.
- Chạy final visual/a11y/performance matrix và lưu artifact.
- Rehearse rollback cho shared shell/CSS/client-boundary concern.
- Cập nhật `plan-fe.md`, phase status, evidence, release SHA, CI URL và known
  limitations.
- Không đánh dấu `DONE` khi còn serious/critical accessibility issue, security gap,
  flaky browser test hoặc operation owner giả.

**Acceptance**

- `pnpm verify:release` xanh hai lần liên tiếp, zero retry/skip/flaky.
- CI xanh trên release SHA và artifact truy cập được.
- FE-09 chuyển `DONE`; không phase nào còn `IN PROGRESS`.
- Residual risk có owner, severity và quyết định chấp nhận/hoãn rõ ràng.

## 10. Test strategy và quality gates

### 10.1. Gate theo commit

- Prettier check cho file đổi.
- ESLint không warning.
- Typecheck package liên quan.
- Unit/component test của concern.
- `git diff --check`.
- Browser reproduction/verification nếu concern liên quan UI, scroll, focus,
  responsive hoặc loading.

### 10.2. Gate theo work package

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm fe:coverage`
- `pnpm fe:a11y`
- `pnpm build`
- Browser subset của surface và visual review.

### 10.3. Final release gate

- `pnpm verify`
- `pnpm test:coverage`
- `pnpm test:browser`
- `pnpm verify:release`
- Chạy lại `pnpm verify:release` lần hai từ test DB sạch.

DB lifecycle bắt buộc bao quanh release gate:

1. Nếu CI cấp `TEST_DATABASE_URL`, đợi PostgreSQL service ready và không tự quản
   container ngoài run.
2. Nếu không có `TEST_DATABASE_URL`, dùng `test:db:prepare` hiện hữu để tự bật
   `postgres-test`, prepare/seed và ghi nhận run sở hữu container này.
3. Chạy `pnpm verify:release`.
4. Reset/prepare baseline sạch đã xác định rồi chạy `pnpm verify:release` lần hai.
5. Cleanup luôn chạy khi success/failure; chỉ stop/down container do run tự tạo.

`verify:release` hiện đã bao gồm `verify`, API coverage và Playwright. Các command
được liệt kê riêng để evidence chỉ rõ bước nào thất bại và không che lỗi bằng một
exit code tổng quát. `verify:release` gọi `verify` rồi `test:db:prepare`; script
prepare hiện có thể tự bật PostgreSQL test khi không được cấp `TEST_DATABASE_URL`.
WP-01 phải bổ sung ownership/cleanup và nhánh CI service, không viết lại startup
logic trùng lặp.

### 10.4. Browser suite mục tiêu

| Suite | Trạng thái đầu FE-09 | Mục tiêu |
| --- | --- | --- |
| `frontend-foundation` | có | regression shared shell/primitive/visual |
| `storefront-discovery` | có | mở rộng perf/responsive/a11y |
| `auth-account` | có | mở rộng mobile/keyboard/state |
| `cart-checkout` | có | mở rộng partial loading/conflict |
| `customer-post-purchase` | có | mở rộng evidence/eligibility/error |
| `catalog-voucher-admin` | có | mở rộng role/state/visual |
| `inventory-stock` | có | mở rộng axe/perf/workflow resume |
| `backoffice-access` | có | giữ fail-closed toàn backoffice |
| `critical-commerce-flow` | có | release smoke end-to-end |
| `operations-lifecycle` | **thiếu** | tạo cho FE-7 |
| `system-admin-health` | **thiếu** | tạo cho FE-8 |
| `release-matrix` | **thiếu** | cross-surface viewport/a11y/visual/perf owner |

## 11. Performance measurement protocol

1. Build production và serve cùng cấu hình release.
2. Dùng deterministic seed, cùng commit, viewport và network/CPU profile.
3. Warm-up một lần, đo tối thiểu ba lần, lấy median.
4. Route public đo từ navigation sạch; route authenticated chuẩn bị session bằng
   fixture, không tính login vào từng route measurement.
5. Ghi LCP, CLS, interaction/INP proxy, navigation duration, request count, transferred
   bytes và route client bundle.
6. So baseline/after; mọi cải thiện hoặc regression phải gắn change SHA.
7. Không dùng screenshot đẹp hoặc cảm giác “nhanh hơn” thay số đo.

Representative routes tối thiểu:

- `/products/[slug]`
- `/products/[slug]/units/[inventoryCode]`
- `/login` hoặc `/account`
- `/cart` và `/checkout`
- `/orders/[orderNumber]`
- `/backoffice/catalog/products/[id]`
- `/backoffice/inventory/intake`
- `/backoffice/orders/[id]`
- `/backoffice/audit-logs`
- `/backoffice/system/health`

## 12. Evidence policy

### 12.1. Tracked evidence

- Kế hoạch và closeout summary trong `docs/planning`/`docs/evidence`.
- Selected visual baseline đã review trong `docs/assets/ui/fe-09` hoặc Playwright
  snapshot directory.
- Coverage/state/route matrix dạng Markdown không chứa dữ liệu riêng tư.
- Release SHA, CI URL, command/result, known limitation và rollback result.

### 12.2. Untracked/CI-only evidence

- Full Playwright HTML report, trace, video và raw screenshot failure.
- Full coverage HTML/JSON.
- Performance trace/profile.
- Environment logs.

Các artifact trên nằm ở `.local/` hoặc CI artifact storage, có retention policy và
không chứa token, cookie, database URL hoặc production PII.

## 13. Commit strategy

Nguyên tắc: một commit chỉ có một concern và có thể revert độc lập. Không dùng một
commit “FE09 complete” chứa toàn bộ code.

| Concern | Commit mẫu |
| --- | --- |
| Khởi động/evidence | `docs(fe09): start comprehensive release hardening` |
| Coverage owner | `test(fe09): enforce executable browser ownership` |
| CI | `ci(fe09): add release verification workflow` |
| Shared UX | `fix(fe09): preserve partial loading state` |
| Surface fix | `fix(fe09): harden customer order detail states` |
| A11y | `fix(fe09): restore keyboard focus visibility` |
| Performance | `perf(fe09): reduce catalog client boundary` |
| Legacy cleanup | `refactor(fe09): remove unused catalog compatibility layer` |
| Browser evidence | `test(fe09): cover operations lifecycle` |
| Closeout | `docs(fe09): record release evidence and close phase` |

Nếu một surface cần nhiều behavior độc lập, tách tiếp theo loading, responsive,
accessibility, security hoặc performance; không gộp chỉ vì cùng route.

## 14. Risk register và rollback

| ID | Rủi ro | Mức | Dấu hiệu | Giảm thiểu / rollback |
| --- | --- | --- | --- | --- |
| FE9-R01 | shared CSS làm hỏng surface khác | Cao | visual/browser regression ngoài owner | consumer scan, commit nhỏ, revert CSS concern |
| FE9-R02 | chuyển Server/Client boundary gây hydration hoặc bundle tăng | Cao | hydration warning, request lặp, build delta | đo trước/sau, revert boundary riêng |
| FE9-R03 | test owner “xanh giả” nhưng không chạy flow thật | Cao | label có nhưng không có test title/selector | executable registry, negative contract test |
| FE9-R04 | browser suite flaky vì data/time/provider | Cao | retry phụ thuộc thứ tự/thời gian | deterministic seed/clock/provider fixture, zero retry gate |
| FE9-R05 | CI làm lộ secret hoặc PII qua artifact | Rất cao | env/log/trace chứa token | fake/local env, redaction, artifact review, rotate secret nếu lộ |
| FE9-R06 | role/privacy regression khi mở rộng test | Rất cao | request private xuất hiện trước guard | fail-closed negative test, forward-fix trước polish |
| FE9-R07 | cleanup legacy xóa consumer ngầm | Cao | route compile nhưng UI vỡ | `rg` + build + browser owner, revert cleanup commit |
| FE9-R08 | performance budget không ổn định | Trung bình | CI variance lớn | median, fixed profile, relative gate + local absolute proof |
| FE9-R09 | snapshot churn che regression | Trung bình | update hàng loạt không review | deterministic fixture, snapshot commit riêng |
| FE9-R10 | full gate quá dài làm bỏ qua kiểm thử | Cao | chỉ chạy subset trước merge | fast PR gate + required release gate + artifact |
| FE9-R11 | backend contract gap bị vá bằng UI suy diễn | Cao | status/action tự tính ở client | dừng WP, ghi blocker backend, không workaround |
| FE9-R12 | Docker/test DB khác Supabase runtime | Trung bình | local xanh nhưng provider runtime lỗi | contract/integration parity, provider degradation smoke |

Rollback policy:

- Revert theo concern/surface; không rollback database hoặc business state.
- Giữ compatibility component/selector đến khi consumer cuối đã có regression proof.
- Security/ownership fix không được rollback chỉ để làm gate xanh; phải forward-fix.
- Snapshot có thể revert độc lập với behavior.
- Performance change phải có baseline; nếu regression vượt budget, revert change chứ
  không nới budget im lặng.

## 15. Decision log

| Quyết định | Phương án đã cân nhắc | Lý do |
| --- | --- | --- |
| FE-09 bao phủ FE-0…FE-8 | chỉ FE-7/FE-8 | yêu cầu người dùng là hoàn thiện toàn diện |
| Không thêm backend capability | mở rộng API trong cùng phase | FE-09 là release hardening; tránh trộn contract mới với stabilization |
| Work package theo surface + cross-cutting gate | big-bang refactor | giảm blast radius, commit/rollback rõ |
| Browser owner phải executable | chấp nhận chuỗi `browser:*` | chuỗi hiện tại chưa chứng minh test tồn tại |
| Partial loading là chuẩn | skeleton/spinner toàn khung cho mọi request | giữ context và tránh cảm giác reload trang |
| Full Chromium + critical Firefox/WebKit smoke | Chromium-only hoặc full mọi engine | cân bằng coverage và độ ổn định/thời gian |
| Đo production build trước tối ưu | tối ưu theo cảm giác | performance phải có baseline và budget |
| Cleanup legacy ở cuối | xóa sớm để giảm code | cần consumer/visual proof sau khi surface ổn định |
| CI là phần DoD | chỉ chạy local thủ công | C9 cần release gate, artifact và CI URL truy xuất được |
| Commit nhỏ theo concern | một commit lớn theo phase | yêu cầu người dùng và rollback safety |

## 16. Dependency và thứ tự thực hiện

```text
WP-00 Baseline
  -> WP-01 Coverage truth + CI
    -> WP-02 Shared foundation
      -> WP-03 FE-1 storefront
      -> WP-04 FE-2 auth/account
      -> WP-05 FE-3 commerce
      -> WP-06 FE-4 post-purchase
      -> WP-07 FE-5 catalog/voucher
      -> WP-08 FE-6 inventory
      -> WP-09 FE-7 operations
      -> WP-10 FE-8 system admin
        -> WP-11 A11y/responsive/visual matrix
        -> WP-12 Performance/client/media
          -> WP-13 Legacy cleanup
            -> WP-14 Release closeout
```

Surface WP có thể xen kẽ khi độc lập, nhưng một thời điểm chỉ một concern được
`in progress` trong working plan. WP-13 tuyệt đối không bắt đầu trước khi owner
surface tương ứng đã qua browser/visual gate.

## 17. Handoff và bước tiếp theo

Khi bắt đầu triển khai:

1. Chạy WP-00, cập nhật FE-09 `IN PROGRESS` và commit planning/evidence riêng.
2. Không sửa UI trước khi baseline/gap list được ghi trên start SHA.
3. Thực hiện WP-01 trước để mọi claim coverage sau đó có owner thật.
4. Mỗi surface được audit bằng browser, ghi issue/evidence, sửa theo concern rồi
   chạy lại cùng viewport/state.
5. Chỉ chuyển sang closeout khi toàn bộ WP acceptance đã xanh hoặc residual risk
   được ghi rõ và người có thẩm quyền chấp nhận.

Tài liệu này là kế hoạch triển khai; không tự đánh dấu FE-09 `IN PROGRESS` hoặc
`DONE` chỉ vì file đã được tạo.
