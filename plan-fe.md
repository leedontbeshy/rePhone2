# Kế hoạch triển khai frontend Post-P0 / P1

> Trạng thái tài liệu: **APPROVED**  
> Phạm vi: **Post-P0 / P1 frontend refinement**  
> P0 baseline: [plan.md](plan.md)  
> Backend contract: [docs/readme.md](docs/readme.md)  
> Design contract: [design.md](design.md)  
> Frontend baseline SHA: `801ad26`  
> Ngày cập nhật: `2026-08-25`  
> Trạng thái triển khai: **FE-0 DONE · FE-1 NOT STARTED**
> HTTP baseline: `apps/api/openapi/openapi.json` — **160 operations**

Tài liệu điều phối triển khai toàn bộ frontend rePhone. FE-0 đã khóa foundation và contract coverage; các phase triển khai business UI FE-1…FE-9 chưa bắt đầu. Tại một thời điểm chỉ được có tối đa một phase mang trạng thái `IN PROGRESS`.

## 1. Vai trò tài liệu và thứ tự nguồn sự thật

### 1.1. Phân vai

- `docs/**` tiếp tục là nguồn sự thật cho domain, API, RBAC, state machine, transaction, security, failure handling và non-functional requirements.
- `apps/api/openapi/openapi.json` và `packages/api-client` là contract thực thi cho method, path, request, response, security scheme và `operationId`.
- [`design.md`](./design.md) là nguồn quyết định về định hướng hình ảnh, information architecture, token, component pattern, responsive, accessibility và content design.
- `plan-fe.md` chỉ điều phối thứ tự, dependency, trạng thái, checkpoint, test, rollback và bằng chứng nghiệm thu frontend.
- Code hiện hành là bằng chứng baseline, không được dùng để ghi đè contract đã khóa trong `docs` hoặc OpenAPI.

### 1.2. Thứ tự ưu tiên khi có mâu thuẫn

1. Quyết định/domain/security contract trong `docs`.
2. OpenAPI và generated client đối với HTTP shape.
3. `design.md` đối với cách tổ chức và trình bày UI.
4. `plan-fe.md` đối với thứ tự và acceptance gate.
5. Implementation hiện hành.

Khi hai nguồn ở cấp cao hơn mâu thuẫn, dừng work package, ghi risk/status log và đồng bộ nguồn trước khi code. Không tự suy đoán contract trong UI và không chỉnh `docs/decisions` trong chương trình này.

## 2. Mục tiêu, phạm vi và giả định

### 2.1. Mục tiêu đã khóa

- Redesign toàn bộ frontend theo hướng **light technical-editorial**, trong đó hồ sơ kiểm định của exact unit là điểm khác biệt cốt lõi.
- Phủ UI cho **toàn bộ 160 operation** của backend hiện có; không còn business operation chỉ thao tác qua Swagger.
- Tách rõ storefront, auth/account, customer commerce/post-purchase, backoffice operations và system administration nhưng giữ nguyên URL công khai hiện hành.
- Giữ backend là authority cho role, ownership, pricing, inventory, state transition, `availableActions`, replay và concurrency conflict.
- Chuyển từ CSS/page nguyên khối sang token, primitive và feature component có ownership rõ ràng, theo migration tăng dần và có rollback.

### 2.2. Ngoài phạm vi

- Không đổi API, Prisma schema, state machine, role model hoặc transaction policy chỉ để thuận tiện cho giao diện.
- Không thêm Redis/queue, payment gateway, carrier integration, multi-store, MFA, microservice hoặc design behavior không có contract.
- Không tạo generic status editor, direct stock counter editor hoặc màn hình tiết lộ dữ liệu private ngoài contract.
- Không làm native app, dark mode hoặc animation phức tạp trong P1 này.
- Scheduler, cron handler và transaction port nội bộ không có HTTP contract không được tính là UI operation.
- Business operation không được đánh dấu hoàn thành chỉ vì có thể gọi bằng Swagger.

### 2.3. Giả định non-functional

- Quy mô P1 giữ 20–50 người dùng đồng thời và seed/demo-scale data; list luôn phân trang, không tải full graph để render queue.
- Responsive bắt buộc từ 360 px đến 1440 px; desktop và mobile dùng cùng capability, không ẩn command quan trọng chỉ vì viewport.
- Duy trì semantic heading, label, keyboard focus, focus-on-error, `aria-live`, reduced-motion-safe behavior và contrast phù hợp WCAG 2.2 AA.
- Product/catalog tiếp tục ưu tiên Server Component; chỉ auth, cart, form, upload và command là client island.
- Access token tiếp tục ở memory; refresh/guest cart ở HttpOnly cookie; one-time/guest order token dùng fragment → memory hoặc `sessionStorage` theo contract. Không đưa token vào query, SSR HTML, analytics hoặc `localStorage`.
- Signed URL, raw identifier, cost, evidence metadata, internal note và audit-private fields chỉ xuất hiện đúng role/projection và không được cache dai dẳng ở frontend.
- Mỗi phase phải có maintainer-readable component boundary, test và rollback; không chấp nhận một lần thay toàn bộ `globals.css`.

## 3. Baseline route inventory tại `801ad26`

Baseline có 37 `page.tsx`: 32 client page và 5 server page. Các route đã chạy ở P0; FE-0 foundation đã hoàn thành nhưng **toàn bộ business operation trong chương trình redesign P1 vẫn là `NOT STARTED`** cho đến khi phase sở hữu có evidence triển khai.

| Nhóm hiện hành        | Route                                                                                                                                                                                                                                                                                                        | Số route | Bằng chứng/gap chính                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------: | ------------------------------------------------------------------------------------------- |
| Home                  | `/`                                                                                                                                                                                                                                                                                                          |        1 | `apps/web/app/page.tsx`, `home-content.tsx`; hero/account card tối thiểu                    |
| Auth                  | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/accept-invitation`                                                                                                                                                                                                                           |        5 | Có flow cơ bản; chưa có account management shell                                            |
| Public discovery      | `/products`, `/products/[slug]`, `/products/[slug]/units/[inventoryCode]`, `/vouchers`                                                                                                                                                                                                                       |        4 | Ba catalog route SSR; exact-unit đã có 18 checks nhưng chưa có dossier hierarchy hoàn chỉnh |
| Commerce              | `/cart`, `/wishlist`, `/checkout`                                                                                                                                                                                                                                                                            |        3 | Guest/customer cart, merge, preview/reconfirm đã có                                         |
| Post-purchase         | `/orders`, `/orders/[orderNumber]`, `/warranties`, `/warranties/[warrantyCode]`, `/after-sales`, `/after-sales/new`, `/after-sales/[requestNumber]`                                                                                                                                                          |        7 | Customer/guest credential flow đã có, page còn nguyên khối                                  |
| Inventory demo        | `/backoffice/inventory/intake`                                                                                                                                                                                                                                                                               |        1 | Wizard intake→inspection→available; chưa có inventory workspace đầy đủ                      |
| Backoffice operations | `/backoffice/orders`, `/backoffice/orders/[id]`, `/backoffice/payments`, `/backoffice/payments/[id]`, `/backoffice/refunds`, `/backoffice/refunds/[id]`, `/backoffice/after-sales`, `/backoffice/after-sales/[id]`, `/backoffice/warranties`, `/backoffice/warranties/[id]`, `/backoffice/warranty-policies` |       11 | Capability rộng nhưng thiếu shared operational shell và page decomposition                  |
| System admin          | `/backoffice/employees`, `/backoffice/customers`, `/backoffice/settings`, `/backoffice/audit-logs`, `/backoffice/audit-logs/[id]`                                                                                                                                                                            |        5 | Utility UI tối thiểu; chưa có runtime status                                                |

Các boundary legacy đáng chú ý:

- `apps/web/app/layout.tsx` chỉ mount `AuthProvider` và `CommerceProvider`; chưa có route-group layout theo surface.
- `CatalogHeader` nằm trong `apps/web/app/catalog-ui.tsx` và được nhúng thủ công ở nhiều storefront, customer và backoffice page.
- `apps/web/app/globals.css` có 2.773 dòng, không dùng design token/CSS variable và chứa generic selector dùng chéo surface.
- Chưa có `components/`, `hooks/`, `styles/` hoặc `public/`; nhiều page detail dài 900–1.300 dòng.

## 4. Route bắt buộc bổ sung

| Route mục tiêu                           | Capability bắt buộc                                              | Phase |
| ---------------------------------------- | ---------------------------------------------------------------- | ----- |
| `/store`                                 | Public store projection; address/phone/pickup context an toàn    | FE-1  |
| `/account`                               | Xem và cập nhật hồ sơ CUSTOMER                                   | FE-2  |
| `/account/addresses`                     | List/create/update/archive/default address                       | FE-2  |
| `/account/security`                      | Change password và security guidance                             | FE-2  |
| `/backoffice/catalog/products`           | Product list/filter/pagination                                   | FE-5  |
| `/backoffice/catalog/products/new`       | Create product                                                   | FE-5  |
| `/backoffice/catalog/products/[id]`      | Product detail/update/publish/archive; media; variant collection | FE-5  |
| `/backoffice/vouchers`                   | Admin voucher queue/list                                         | FE-5  |
| `/backoffice/vouchers/new`               | Create voucher DRAFT                                             | FE-5  |
| `/backoffice/vouchers/[id]`              | Detail/update/lifecycle/usage list                               | FE-5  |
| `/backoffice/inventory/units`            | Unit list/filter/pagination                                      | FE-6  |
| `/backoffice/inventory/units/[id]`       | Detail/update/cost/media/inspection/identifier/lifecycle         | FE-6  |
| `/backoffice/inventory/lookup`           | Identifier lookup có reason và safe result                       | FE-6  |
| `/backoffice/inventory/inspections/[id]` | Inspection draft/detail/complete editor                          | FE-6  |
| `/backoffice/inventory/locations`        | Read-only location directory cho transfer/stock                  | FE-6  |
| `/backoffice/inventory/stock`            | Stock levels và receive/transfer/adjust/return commands          | FE-6  |
| `/backoffice/inventory/stock/movements`  | Immutable movement ledger                                        | FE-6  |
| `/backoffice/system/health`              | ADMIN view cho liveness/readiness; chỉ status/timestamp an toàn  | FE-8  |

Product detail quản lý variant và product/variant media bằng embedded workflow vì backend không có standalone `GET variant`; không tạo route hoặc contract giả. Inspection create nằm trong unit detail rồi chuyển sang editor. Stock command dùng drawer/form trong stock workspace, không tạo route riêng cho từng command.

## 5. Target route-group và component ownership

Route group không làm đổi URL:

```text
app/
├── (storefront)/
│   ├── (discovery)/       # home, store, products, vouchers
│   ├── (commerce)/        # cart, wishlist, checkout; guest-aware
│   └── (post-purchase)/   # orders, warranties, after-sales; guest detail-aware
├── (auth)/                # login/register/reset/invitation
├── (account)/             # customer profile/address/security
└── backoffice/
    ├── (catalog)/         # products, variants, media, vouchers
    ├── (inventory)/       # units, intake, inspections, locations, stock
    ├── (operations)/      # orders, payments, refunds, warranty, after-sales
    └── (system-admin)/    # users, settings, audit, health
```

Component ownership dự kiến:

- `components/ui`: button, field, select, textarea, alert, status chip, pagination, dialog/drawer, data table, file input, money, date/time và empty/loading/error state.
- `components/storefront`: header, session actions, footer, container, breadcrumb, media frame.
- `components/catalog` và `components/dossier`: filter, product/model/unit presentation, evidence gallery, metric, inspection checklist, condition/identifier record và purchase rail.
- `components/commerce`: purchase actions, cart line/summary, checkout form/review.
- `components/account`: profile, address editor, security form.
- `components/backoffice`: staff shell, queue/table/filter, detail rail, authoritative action card, reason form, evidence link, timeline.
- `features/**`: API adapter, state hook và domain form cho từng bounded UI feature; không import Prisma/internal API DTO.
- `styles/tokens.css` + `styles/base.css` và CSS Modules; `globals.css` tồn tại tạm thời cho legacy route đến khi route owner hoàn tất migration.

### 5.1. Route ownership ledger — 37 hiện có + 18 mới

Mỗi URL xuất hiện đúng một lần trong ledger này. Route group hoặc embedded workflow không được tạo URL công khai khác.

|   # | Route                                    | Loại    | Owner phase |
| --: | ---------------------------------------- | ------- | ----------- |
|   1 | `/`                                      | Hiện có | FE-1        |
|   2 | `/login`                                 | Hiện có | FE-2        |
|   3 | `/register`                              | Hiện có | FE-2        |
|   4 | `/forgot-password`                       | Hiện có | FE-2        |
|   5 | `/reset-password`                        | Hiện có | FE-2        |
|   6 | `/accept-invitation`                     | Hiện có | FE-2        |
|   7 | `/products`                              | Hiện có | FE-1        |
|   8 | `/products/[slug]`                       | Hiện có | FE-1        |
|   9 | `/products/[slug]/units/[inventoryCode]` | Hiện có | FE-1        |
|  10 | `/vouchers`                              | Hiện có | FE-1        |
|  11 | `/cart`                                  | Hiện có | FE-3        |
|  12 | `/wishlist`                              | Hiện có | FE-3        |
|  13 | `/checkout`                              | Hiện có | FE-3        |
|  14 | `/orders`                                | Hiện có | FE-4        |
|  15 | `/orders/[orderNumber]`                  | Hiện có | FE-4        |
|  16 | `/warranties`                            | Hiện có | FE-4        |
|  17 | `/warranties/[warrantyCode]`             | Hiện có | FE-4        |
|  18 | `/after-sales`                           | Hiện có | FE-4        |
|  19 | `/after-sales/new`                       | Hiện có | FE-4        |
|  20 | `/after-sales/[requestNumber]`           | Hiện có | FE-4        |
|  21 | `/backoffice/inventory/intake`           | Hiện có | FE-6        |
|  22 | `/backoffice/orders`                     | Hiện có | FE-7        |
|  23 | `/backoffice/orders/[id]`                | Hiện có | FE-7        |
|  24 | `/backoffice/payments`                   | Hiện có | FE-7        |
|  25 | `/backoffice/payments/[id]`              | Hiện có | FE-7        |
|  26 | `/backoffice/refunds`                    | Hiện có | FE-7        |
|  27 | `/backoffice/refunds/[id]`               | Hiện có | FE-7        |
|  28 | `/backoffice/after-sales`                | Hiện có | FE-7        |
|  29 | `/backoffice/after-sales/[id]`           | Hiện có | FE-7        |
|  30 | `/backoffice/warranties`                 | Hiện có | FE-7        |
|  31 | `/backoffice/warranties/[id]`            | Hiện có | FE-7        |
|  32 | `/backoffice/warranty-policies`          | Hiện có | FE-7        |
|  33 | `/backoffice/employees`                  | Hiện có | FE-8        |
|  34 | `/backoffice/customers`                  | Hiện có | FE-8        |
|  35 | `/backoffice/settings`                   | Hiện có | FE-8        |
|  36 | `/backoffice/audit-logs`                 | Hiện có | FE-8        |
|  37 | `/backoffice/audit-logs/[id]`            | Hiện có | FE-8        |
|  38 | `/store`                                 | Mới     | FE-1        |
|  39 | `/account`                               | Mới     | FE-2        |
|  40 | `/account/addresses`                     | Mới     | FE-2        |
|  41 | `/account/security`                      | Mới     | FE-2        |
|  42 | `/backoffice/catalog/products`           | Mới     | FE-5        |
|  43 | `/backoffice/catalog/products/new`       | Mới     | FE-5        |
|  44 | `/backoffice/catalog/products/[id]`      | Mới     | FE-5        |
|  45 | `/backoffice/vouchers`                   | Mới     | FE-5        |
|  46 | `/backoffice/vouchers/new`               | Mới     | FE-5        |
|  47 | `/backoffice/vouchers/[id]`              | Mới     | FE-5        |
|  48 | `/backoffice/inventory/units`            | Mới     | FE-6        |
|  49 | `/backoffice/inventory/units/[id]`       | Mới     | FE-6        |
|  50 | `/backoffice/inventory/lookup`           | Mới     | FE-6        |
|  51 | `/backoffice/inventory/inspections/[id]` | Mới     | FE-6        |
|  52 | `/backoffice/inventory/locations`        | Mới     | FE-6        |
|  53 | `/backoffice/inventory/stock`            | Mới     | FE-6        |
|  54 | `/backoffice/inventory/stock/movements`  | Mới     | FE-6        |
|  55 | `/backoffice/system/health`              | Mới     | FE-8        |

## 6. Dependency graph

```text
FE-0 Foundation
├── FE-1 Storefront discovery ─┬── FE-3 Commerce ── FE-4 Post-purchase ─┐
├── FE-2 Auth/account ─────────┘                                      │
└── FE-1 ── FE-5 Catalog/media/voucher ── FE-6 Inventory/stock ───────┤
                                                                      └── FE-7 Operations
                                                                              │
                                                                              FE-8 System admin
                                                                                  │
                                                                                  FE-9 Hardening
```

- FE-1 và FE-2 có thể chạy song song sau khi token/header contracts ở FE-0 được khóa.
- FE-5 có thể chạy song song FE-3 sau FE-1; FE-6 chỉ bắt đầu khi product/variant workspace đủ dùng.
- FE-7 cần customer post-purchase primitives từ FE-4 và inventory vocabulary từ FE-6.
- FE-9 chỉ bắt đầu cleanup legacy sau khi C1–C8 đã đạt.

## 7. Kế hoạch phase FE-0 đến FE-9

Contract chung cho mọi phase:

- Trường `State bắt buộc` luôn kế thừa loading, empty, unavailable/stale, error, conflict, permission và provider-error khi capability có thể phát sinh; nội dung trong từng bảng là phần bổ sung theo domain.
- Responsive/a11y acceptance luôn gồm keyboard-only, focus/error focus, label/landmark/live region, touch target `44×44px`, viewport `320/390/768/1024/1440px`, zoom `200%` và reduced motion.
- Test của phase phải chọn đủ lớp phù hợp trong unit, component, browser và visual snapshot; không dùng browser happy path để thay component/accessibility test.
- Khi đổi status, chỉ một phase được `IN PROGRESS`; `Evidence` phải ghi commit/release SHA và kết quả gate, không dùng mô tả thủ công thay bằng chứng.

### FE-0 — Durable sources, baseline và frontend foundation

| Thuộc tính        | Nội dung                                                                                                                                                                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trạng thái        | **DONE**                                                                                                                                                                                                                                                                          |
| Mục tiêu          | Khóa `design.md`/`plan-fe.md`, coverage manifest 160 operations, token, base style, primitive và route shell contracts trước khi đổi giao diện.                                                                                                                                   |
| Non-goal          | Không đổi output route, business flow, backend hoặc xóa legacy CSS.                                                                                                                                                                                                               |
| Dependency        | Baseline `801ad26`; OpenAPI 160 operations; generated client hiện hành.                                                                                                                                                                                                           |
| Route             | Không thêm behavior route; chuẩn bị layout `(storefront)`, `(auth)`, `(account)`, `backoffice`.                                                                                                                                                                                   |
| API group         | Không gọi API mới; chỉ lập ledger/contract tests.                                                                                                                                                                                                                                 |
| Design anchor     | Light technical-editorial; paper/ink/rule/accent; mono metadata; operational backoffice density; focus visible.                                                                                                                                                                   |
| State bắt buộc    | Loading, empty, error, success, warning, permission, stale/conflict, disabled/pending, upload progress.                                                                                                                                                                           |
| Test              | Route/role/state inventory; desktop 1440 + mobile 390 screenshots; keyboard baseline; lint/typecheck/unit/build; current Playwright flow.                                                                                                                                         |
| Commit thực tế    | `9b7f72f`, `ffe4b84`, `5a6e302`, `ea6de09`, `e0cd7ca`, `881bd98`, `c4d2b3c`; strict-lint unblock `9542623`.                                                                                                                                                                       |
| DoD/checkpoint C0 | 160/160 operation được map đúng một lần; 37 route baseline có owner; primitives không đổi behavior; gates xanh.                                                                                                                                                                   |
| Rollback          | Revert foundation/layout commit; giữ nguyên providers, route và `globals.css`. Không có data rollback.                                                                                                                                                                            |
| Evidence          | Code SHA `c4d2b3c`; exact coverage `160/160`; route ownership `37 + 18`; Web `69`, API unit `600`, integration `54`, E2E `93`, browser `3/3`; `pnpm verify` xanh trên final closeout tree; desktop/mobile snapshots trong `tests/browser/frontend-foundation.spec.ts-snapshots/`. |

### FE-1 — Storefront discovery và inspection dossier

| Thuộc tính        | Nội dung                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Trạng thái        | **NOT STARTED**                                                                                                                                 |
| Mục tiêu          | Tạo storefront light technical-editorial; exact-unit dossier là design authority; hoàn thiện public store/catalog/voucher discovery.            |
| Non-goal          | Không đổi catalog query/API, pricing, availability hoặc thêm claim kiểm định không có trong DTO.                                                |
| Dependency        | FE-0.                                                                                                                                           |
| Route             | `/`, `/store`, `/products`, `/products/[slug]`, `/products/[slug]/units/[inventoryCode]`, `/vouchers`.                                          |
| API group         | Catalog 3, Store 1, public Voucher 1 — tổng 5 operations.                                                                                       |
| Design anchor     | Dossier masthead, evidence gallery, key metrics, 18-check index, condition/repair record, masked identifier, purchase rail; model ≠ exact unit. |
| State bắt buộc    | SSR success, empty, 404, API error, missing/broken media, in/out of stock, filter result, pagination boundary.                                  |
| Test              | Catalog query unit; server rendering; semantic headings/alt; back-forward/filter; public browser desktop/mobile; no private field.              |
| Commit dự kiến    | `feat(web): add storefront shell`; `feat(web): redesign inspection-first catalog`; `feat(web): expose public store experience`.                 |
| DoD/checkpoint C1 | Anonymous browse home→catalog→model→unit; `/store` an toàn; vouchers hiển thị đúng visibility; SSR/mobile/a11y gates xanh.                      |
| Rollback          | Route-by-route revert về legacy `CatalogHeader`/classes qua compatibility export; không đổi API/data.                                           |
| Evidence          | Chưa có — cần browser screenshots, route smoke, accessibility report và commit SHA.                                                             |

### FE-2 — Auth và self-service account đầy đủ

| Thuộc tính        | Nội dung                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trạng thái        | **NOT STARTED**                                                                                                                                                           |
| Mục tiêu          | Đồng bộ auth shell, session-aware navigation và UI cho toàn bộ account/profile/address/security contract.                                                                 |
| Non-goal          | Không MFA, social login, session management UI, email verification hoặc quản trị role.                                                                                    |
| Dependency        | FE-0; dùng storefront header contract.                                                                                                                                    |
| Route             | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/accept-invitation`, `/account`, `/account/addresses`, `/account/security`.                                |
| API group         | Auth 7 + Account 7 — tổng 14 operations.                                                                                                                                  |
| Design anchor     | Quiet auth canvas, explicit trust/security copy, account sub-navigation, address cards/editor, destructive archive confirmation.                                          |
| State bắt buộc    | Refresh loading, anonymous/authenticated, invalid/expired token, duplicate identity, validation, suspended/disabled, password success/error, default address.             |
| Test              | Fragment consume+clear; cookie/CSRF; memory-only access token; auth/provider unit; account ownership; keyboard form; browser login/register/reset/invite/profile/address. |
| Commit dự kiến    | `feat(web): redesign authentication`; `feat(web): add account profile and addresses`; `feat(web): add account security`.                                                  |
| DoD/checkpoint C2 | 14/14 operations có UI/action; role-aware header đúng; token không vào query/localStorage/log; account flows desktop/mobile xanh.                                         |
| Rollback          | Giữ AuthProvider hiện hành, revert route UI/new account routes; không revoke hoặc sửa session ngoài user action đã commit.                                                |
| Evidence          | Chưa có — cần auth security assertions, browser recordings và commit SHA.                                                                                                 |

### FE-3 — Cart, wishlist và checkout conversion

| Thuộc tính        | Nội dung                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trạng thái        | **NOT STARTED**                                                                                                                                           |
| Mục tiêu          | Đưa dossier identity xuyên suốt cart/checkout và giữ authoritative preview/reconfirm cho guest/CUSTOMER.                                                  |
| Non-goal          | Không cart drawer, auto-apply voucher, optimistic inventory reservation hoặc payment gateway.                                                             |
| Dependency        | FE-1 + FE-2.                                                                                                                                              |
| Route             | `/cart`, `/wishlist`, `/checkout`; purchase action trên product/unit route.                                                                               |
| API group         | Cart 5 + Wishlist 3 + Checkout 2 — tổng 10 operations.                                                                                                    |
| Design anchor     | Exact-unit identity, warning hierarchy, persistent but non-obstructive summary, editorial two-column checkout, explicit “preview chưa giữ hàng”.          |
| State bắt buộc    | Empty/loading/error, merge retry, stale price/stock, quantity cap, preview invalid, 409 review-required, double-submit disabled, guest/customer redirect. |
| Test              | CommerceProvider unit; guest cookie/CSRF; merge; cart warnings; pickup/shipping preview/create; address copy; browser guest + CUSTOMER flows.             |
| Commit dự kiến    | `feat(web): redesign cart and wishlist`; `feat(web): redesign authoritative checkout`.                                                                    |
| DoD/checkpoint C3 | 10/10 operations có UI; guest và CUSTOMER đặt hàng đúng contract; no-reservation/reconfirm behavior không đổi; browser flow xanh.                         |
| Rollback          | Revert presentation/components, giữ CommerceProvider và checkout payload implementation hiện hành. Không cancel order đã tạo.                             |
| Evidence          | Chưa có — cần guest/customer browser traces, 409 capture và commit SHA.                                                                                   |

### FE-4 — Customer post-purchase portal

| Thuộc tính        | Nội dung                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trạng thái        | **NOT STARTED**                                                                                                                                                     |
| Mục tiêu          | Hợp nhất order, payment proof, tracking, refund, warranty và after-sales thành portal nhất quán cho CUSTOMER/guest.                                                 |
| Non-goal          | Không cho guest list dữ liệu; không evidence preview public; không suy diễn action ngoài projection.                                                                |
| Dependency        | FE-2 + FE-3.                                                                                                                                                        |
| Route             | `/orders`, `/orders/[orderNumber]`, `/warranties`, `/warranties/[warrantyCode]`, `/after-sales`, `/after-sales/new`, `/after-sales/[requestNumber]`.                |
| API group         | Orders 3 + Payment proof 1 + Customer Warranty 2 + Customer AfterSales 6 — tổng 12 operations.                                                                      |
| Design anchor     | Unified lifecycle timeline, status vocabulary, safe tracking/evidence action, warranty record và case dossier.                                                      |
| State bắt buộc    | CUSTOMER list, guest detail, invalid credential 404, cancellable/terminal, proof awaiting/reviewed/rejected, signed URL expiry, attachment limit, case transitions. |
| Test              | Guest token fragment→sessionStorage→header; ownership; safe HTTPS; multipart 413/415/503; action visibility; post-purchase browser scenarios.                       |
| Commit dự kiến    | `feat(web): redesign customer orders`; `feat(web): unify warranty and after-sales portal`.                                                                          |
| DoD/checkpoint C4 | 12/12 operations có UI; CUSTOMER/guest boundaries đúng; private storage/path không lộ; timeline/action mobile/a11y xanh.                                            |
| Rollback          | Revert portal presentation route-by-route; giữ token helpers/API adapters; không đổi order/payment/case state.                                                      |
| Evidence          | Chưa có — cần ownership tests, signed-link assertions, scenario screenshots và commit SHA.                                                                          |

### FE-5 — Backoffice catalog, media và voucher merchandising

| Thuộc tính        | Nội dung                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trạng thái        | **NOT STARTED**                                                                                                                                                 |
| Mục tiêu          | Cung cấp full product/variant/media CRUD và admin voucher lifecycle thay cho Swagger-only operations.                                                           |
| Non-goal          | Không generic JSON editor, bulk import, campaign engine hoặc bypass publish/lifecycle rules.                                                                    |
| Dependency        | FE-0 + FE-1; có thể song song FE-3.                                                                                                                             |
| Route             | `/backoffice/catalog/products`, `/new`, `/[id]`; `/backoffice/vouchers`, `/new`, `/[id]`. Variant/media là embedded workflow trong product detail.              |
| API group         | Backoffice Catalog 10 + Product/Variant Media 4 + Backoffice Voucher 8 — tổng 22 operations. Unit media thuộc FE-6.                                             |
| Design anchor     | Dense catalog table, editorial preview, typed product/variant forms, owner-aware media manager, voucher rule builder/lifecycle rail.                            |
| State bắt buộc    | Draft/published/archived, inactive/active variant, immutable fields, media upload/cleanup/delete gate, voucher DRAFT/ACTIVE/PAUSED/ARCHIVED, usages pagination. |
| Test              | DTO union/forms; role matrix; multipart; media metadata/order/delete; product publish; voucher scope/lifecycle; list/detail E2E and browser.                    |
| Commit dự kiến    | `feat(web): add catalog management`; `feat(web): add catalog media manager`; `feat(web): add voucher administration`.                                           |
| DoD/checkpoint C5 | 22/22 operations có UI; EMPLOYEE/ADMIN và ADMIN-only voucher policy đúng; public catalog phản ánh command đã commit; gates xanh.                                |
| Rollback          | Revert backoffice routes; public catalog vẫn hoạt động. Không archive/delete data để rollback UI.                                                               |
| Evidence          | Chưa có — cần operation coverage diff, media smoke, lifecycle screenshots và commit SHA.                                                                        |

### FE-6 — Inventory, inspection, location và accessory stock

| Thuộc tính        | Nội dung                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trạng thái        | **NOT STARTED**                                                                                                                                                            |
| Mục tiêu          | Biến wizard đơn lẻ thành inventory workspace đầy đủ, phủ unit lifecycle/cost/identifier/inspection và stock ledger/commands.                                               |
| Non-goal          | Không generic status/counter patch, auto-restock, repair-parts, location editor hoặc raw identifier persistence.                                                           |
| Dependency        | FE-5; tái dùng dossier vocabulary FE-1.                                                                                                                                    |
| Route             | `/backoffice/inventory/intake`, `/units`, `/units/[id]`, `/lookup`, `/inspections/[id]`, `/locations`, `/stock`, `/stock/movements`.                                       |
| API group         | Backoffice Inventory 19 + Unit Media 1 + Stock 6 — tổng 26 operations.                                                                                                     |
| Design anchor     | Inventory queue, unit operational dossier, inspection editor 18 checks, admin cost compartment, ephemeral reveal, named action rail, immutable movement ledger.            |
| State bắt buộc    | All lifecycle states, role-dependent cost, reason-required lookup/reveal, inspection draft/completed, 409 concurrency, stock insufficient, command replay, upload failure. |
| Test              | Role/projection; identifier non-persistence; inspection payload; named commands; stock arithmetic; concurrency/refetch; multipart; browser intake/list/detail/stock.       |
| Commit dự kiến    | `feat(web): add inventory workspace`; `feat(web): add inspection operations`; `feat(web): add accessory stock operations`.                                                 |
| DoD/checkpoint C6 | 26/26 operations có UI; cost không request/render cho EMPLOYEE; không direct counter/status edit; levels/movements reconcile; gates xanh.                                  |
| Rollback          | Giữ legacy intake route làm fallback đến khi C6; revert workspace UI, không sửa unit/stock state bằng SQL.                                                                 |
| Evidence          | Chưa có — cần role traces, concurrency captures, stock reconciliation và commit SHA.                                                                                       |

### FE-7 — Fulfillment, finance, warranty và after-sales operations

| Thuộc tính        | Nội dung                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trạng thái        | **NOT STARTED**                                                                                                                                                 |
| Mục tiêu          | Chuẩn hóa toàn bộ operational backoffice hiện có trên queue/detail/action/timeline/evidence primitives và tách page nguyên khối.                                |
| Non-goal          | Không đổi transaction/state machine, không carrier/payment gateway và không action do UI tự suy diễn.                                                           |
| Dependency        | FE-4 + FE-6.                                                                                                                                                    |
| Route             | Backoffice orders, payments, refunds, after-sales, warranties, warranty policies và các detail route hiện hành.                                                 |
| API group         | Orders 11 + Shipments 4 + Payments 5 + Refunds 8 + Order Refund 1 + Backoffice AfterSales 14 + Backoffice Warranty/Policy 10 — tổng 53 operations.              |
| Design anchor     | Dense queue, authoritative action rail, three-axis status, financial summary, evidence viewer, timeline, inspection/replacement/refund resolution.              |
| State bắt buộc    | Mọi `availableActions`, terminal/replay, 409 refetch, overdue, evidence unavailable/expired, CASH/bank, pickup/shipping/returned, after-sales five resolutions. |
| Test              | State/replay unit; adapter safe projection; RBAC; signed URL; multipart; full demo scenarios; browser staff commands và customer reflection.                    |
| Commit dự kiến    | `refactor(web): establish operations workspace`; feature-scoped `feat(web): redesign ... operations` commits; không gom một commit.                             |
| DoD/checkpoint C7 | 53/53 operations có UI; authoritative transitions/replay giữ nguyên; page lớn được tách; demo scenarios và gates xanh.                                          |
| Rollback          | Revert từng feature route về legacy implementation; không rollback business state hoặc xóa evidence/history.                                                    |
| Evidence          | Chưa có — cần per-scenario manifest, replay assertions, browser traces và commit SHA.                                                                           |

### FE-8 — System administration và runtime status

| Thuộc tính        | Nội dung                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Trạng thái        | **NOT STARTED**                                                                                                                                              |
| Mục tiêu          | Hoàn thiện employee/customer/settings/audit utilities và ADMIN runtime health surface.                                                                       |
| Non-goal          | Không quản lý ADMIN, impersonation, audit export, environment/secret viewer hoặc scheduler control.                                                          |
| Dependency        | FE-7 staff shell/table/form patterns.                                                                                                                        |
| Route             | `/backoffice/employees`, `/customers`, `/settings`, `/audit-logs`, `/audit-logs/[id]`, `/backoffice/system/health`.                                          |
| API group         | Employees 7 + Customers 4 + Settings 3 + Audit 2 + Health 2 — tổng 18 operations.                                                                            |
| Design anchor     | Administrative data table, detail/edit drawer, explicit destructive reason, settings version/CAS, redacted audit viewer, minimal health indicator.           |
| State bắt buộc    | Role forbidden, pending/active/disabled/suspended, SMTP delivery failed, stale settings 409, upload fail/cleanup, audit empty/redacted, live/ready degraded. |
| Test              | Exact role matrix; session revoke reflection; CAS; QR multipart; audit sanitizer/no-store/request-id; health outside `/api/v1`; admin browser smoke.         |
| Commit dự kiến    | `feat(web): redesign user administration`; `feat(web): harden settings and audit utilities`; `feat(web): add runtime health status`.                         |
| DoD/checkpoint C8 | 18/18 operations có UI/status owner; EMPLOYEE/ADMIN policy đúng; không lộ config/secret; gates xanh.                                                         |
| Rollback          | Revert route UI; giữ committed user/settings/audit state; health endpoint không bị thay đổi.                                                                 |
| Evidence          | Chưa có — cần role/CAS/redaction smoke, health capture và commit SHA.                                                                                        |

### FE-9 — Coverage, accessibility, performance và release hardening

| Thuộc tính        | Nội dung                                                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trạng thái        | **NOT STARTED**                                                                                                                                                      |
| Mục tiêu          | Chứng minh 160/160 coverage, xóa legacy có kiểm soát và đạt release quality trên desktop/mobile/keyboard.                                                            |
| Non-goal          | Không thêm capability backend mới hoặc polish che lấp lỗi contract.                                                                                                  |
| Dependency        | C1–C8 hoàn tất.                                                                                                                                                      |
| Route             | Toàn bộ route hiện hành và route mới; representative visual matrix cho mỗi surface.                                                                                  |
| API group         | Không thêm operation; assert union coverage ledger đúng bằng OpenAPI.                                                                                                |
| Design anchor     | Consistency, content normalization, stable responsive layout, no orphan legacy style, measured performance.                                                          |
| State bắt buộc    | Full loading/empty/error/permission/conflict/terminal matrix; offline/provider failure nơi contract hỗ trợ.                                                          |
| Test              | Operation coverage assertion; unit/component; Playwright desktop/mobile; keyboard/axe; visual snapshots; bundle/client boundary; performance; `pnpm verify:release`. |
| Commit dự kiến    | `test(web): enforce operation coverage`; `refactor(web): remove legacy frontend paths`; `test(web): harden frontend release`.                                        |
| DoD/checkpoint C9 | OpenAPI IDs = ledger IDs = implemented coverage manifest, đúng 160 unique; không business op Swagger-only; release gates xanh; rollback evidence đầy đủ.             |
| Rollback          | Revert cleanup/performance change riêng; không quay lại nếu làm mất security/ownership fix. Không có database rollback.                                              |
| Evidence          | Chưa có — cần final coverage report, visual/a11y/performance report, release SHA và CI URL.                                                                          |

## 8. Quality gates và checkpoint policy

### 8.1. Gate cho mọi work package

1. `pnpm format:check`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test`
5. Component accessibility tests của surface đang đổi.
6. Operation coverage assertion: OpenAPI, ledger và implementation manifest không drift.
7. `pnpm build`
8. `pnpm verify`
9. `pnpm test:browser`
10. Visual snapshots desktop/mobile của representative state.

`pnpm api:openapi` và `pnpm api:client` vẫn phải chạy khi contract artifact/generated client liên quan thay đổi. Không commit nếu gate liên quan đỏ. Mỗi commit chỉ chứa một concern; không stage `apps/web/next-env.d.ts` hoặc thay đổi ngoài scope.

### 8.2. Release gate

- `pnpm verify`
- `pnpm test:coverage`
- `pnpm test:browser`
- `pnpm verify:release`
- Operation coverage assertion 160 unique.
- Screenshot/visual matrix desktop 1440, tablet 768 và mobile 390 cho representative route.
- Keyboard-only critical journeys; accessibility scan không có serious/critical violation được chấp nhận.
- Public/storefront không lộ internal/private field; backoffice projection đúng role.

### 8.3. Evidence policy

Khi phase hoàn tất, cập nhật ngay:

- Status phase và từng ledger row tương ứng.
- Commit/release SHA.
- Command + exit status; không dán secret hoặc full environment.
- Link CI/browser artifact hoặc local artifact path dưới `.local/` không chứa credential.
- Screenshot/checkpoint và known limitation.
- Rollback rehearsal/result nếu phase đổi shell/router/shared state.

Không đánh dấu `DONE` chỉ vì component render; DoD, operation coverage và checkpoint phải cùng đạt.

## 9. Migration và rollback policy

1. Chuyển import sâu sang alias `@/` trước khi di chuyển route vào group; một commit không vừa move hàng loạt vừa đổi behavior.
2. Route group không được đổi URL. Kiểm tra duplicate route và generated Next route type sau mỗi move.
3. Không thay trực tiếp `CatalogHeader`; tạo header/shell mới song song và giữ compatibility cho route chưa migrate. Chỉ xóa khi route ownership scan bằng `rg` trả zero consumer.
4. Token/CSS Modules tồn tại song song `globals.css`; không thay trực tiếp generic class như `.button`, `.status`, `.actions` hoặc selector `h1` làm surface khác đổi ngoài ý muốn.
5. Giữ product/catalog page là Server Component. Client island không được kéo toàn page sang client nếu không có lý do đã ghi.
6. Giữ `AuthProvider`, `CommerceProvider`, guest cookie/CSRF, refresh flow, cart merge, checkout review-required và fragment credential semantics.
7. UI chỉ dùng generated client/types; runtime parser hiện hữu được thu hẹp theo feature, không tạo DTO song song mới.
8. `availableActions`, state, money, inventory/cost và permission luôn lấy từ backend. Không optimistic terminal transition hoặc auto-retry domain conflict.
9. Identifier/evidence/signed URL/token là ephemeral; không query/localStorage/log/analytics/cache hoặc error echo.
10. Media upload nằm ngoài DB transaction ở backend; UI phải xử lý 413/415/503, pending, retry có chủ đích và không giả định cleanup thành công.
11. Mỗi phase giữ fallback route/component đến khi checkpoint đạt; rollback bằng revert code concern-scoped, không sửa business state bằng SQL.
12. Khi OpenAPI đổi, CI phải phát hiện ledger mismatch. Operation mới không được merge nếu chưa có phase/route/action/test owner.
13. Migrate đúng một surface trong mỗi commit; chỉ xóa selector sau route ownership scan và browser regression của consumer cuối.
14. Stale status hoặc broken ADR link hiện hữu được ghi thành documentation debt riêng, không sửa kèm concern frontend và không chỉnh `docs/decisions`.

## 10. Risk register

| ID   | Rủi ro                                                     | Mức        | Giảm thiểu                                                  | Trigger/rollback                             |
| ---- | ---------------------------------------------------------- | ---------- | ----------------------------------------------------------- | -------------------------------------------- |
| R-01 | Route-group move làm vỡ relative import hoặc duplicate URL | Cao        | Alias-first, move theo group, build sau mỗi commit          | Revert route move, giữ legacy route          |
| R-02 | Global CSS thay đổi ngoài surface                          | Cao        | Token + CSS Module coexistence; selector ownership scan     | Revert module/import; không xóa legacy block |
| R-03 | Header mới làm mất link customer/staff/admin               | Cao        | Role-route matrix và compatibility header                   | Revert shell; giữ provider/header cũ         |
| R-04 | SSR page vô tình thành client bundle lớn                   | Trung bình | Server page + client island; bundle audit                   | Revert boundary, split island                |
| R-05 | UI suy diễn state hoặc optimistic transition sai           | Cao        | Authoritative projection/refetch; no generic status         | Disable/revert command UI, không sửa data    |
| R-06 | Token/identifier/evidence lộ qua state/URL/log             | Rất cao    | Security tests, ephemeral components, sanitizer review      | Dừng rollout; forward-fix security trước     |
| R-07 | Cost bị fetch/render cho EMPLOYEE                          | Rất cao    | Admin lazy route/tab; role + API negative tests             | Remove compartment; invalidate client state  |
| R-08 | Variant detail không có standalone GET                     | Trung bình | Fetch parent product rồi select variant; 404 an toàn        | Dùng embedded editor trong product detail    |
| R-09 | Stock command tạo cảm giác counter đã đổi khi API conflict | Cao        | Pending + authoritative refetch + ledger reconciliation     | Revert optimistic UI                         |
| R-10 | Generated client/runtime adapter drift                     | Cao        | OpenAPI/client gate và coverage manifest                    | Dừng phase, regenerate/reconcile contract    |
| R-11 | Playwright phụ thuộc text/class legacy                     | Trung bình | Semantic role/test-id có chủ đích; update cùng route commit | Revert selector change hoặc test fixture     |
| R-12 | `next/image` không hỗ trợ media host/fallback              | Trung bình | Giữ raw safe `<img>` đến FE-9 allowlist proof               | Revert image component                       |
| R-13 | Scope 160 operations tạo PR quá lớn                        | Cao        | FE-0…FE-9, feature-scoped commits, per-phase checkpoint     | Dừng ở checkpoint xanh gần nhất              |
| R-14 | “Đã có P0 UI” bị nhầm là “P1 đã làm”                       | Trung bình | Metadata/status riêng và evidence bắt buộc                  | Sửa status log; không backdate evidence      |

## 11. Status log

| Ngày       | Phase             | Trạng thái             | Thay đổi                                                                                           | Evidence/ghi chú                                                                                                                                                 |
| ---------- | ----------------- | ---------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-25 | Toàn chương trình | APPROVED / NOT STARTED | Khóa scope Post-P0/P1, baseline `801ad26`, full backend coverage                                   | OpenAPI hiện hành có 160 operations; chưa có implementation commit                                                                                               |
| 2026-08-25 | FE-0              | IN PROGRESS            | Bắt đầu token, primitive, shell và executable coverage contract                                    | Branch `feat/fe-0-design-foundation`; implementation record trong `docs/planning/2026-08-25-fe-0-frontend-foundation.md`                                         |
| 2026-08-25 | FE-0              | DONE                   | Khóa token, primitive, bốn shell, a11y contract, exact operation/route coverage và visual baseline | Code SHA `c4d2b3c`; `pnpm verify` xanh lại trên final closeout tree; `pnpm test:browser` xanh `3/3` sau `c4d2b3c`; rollback rehearsal xanh; FE-1 là bước kế tiếp |

## 12. Operation coverage ledger — 160/160

Quy ước:

- Mỗi `operationId` OpenAPI xuất hiện đúng một dòng.
- “Route/UI action” là owner bắt buộc, không khẳng định implementation đã tồn tại.
- Tất cả status khởi tạo là `NOT STARTED`, kể cả khi P0 đã có UI tối thiểu; status ở đây theo chương trình redesign P1.
- Health operations là machine probes và được quan sát qua ADMIN runtime status, không biến thành public business feature.

|   # | operationId                             | HTTP contract                                                            | Actor/access mode                           | Target route                                                   | UI action/state                                                                                  | Phase | Automated test                   | Status      |
| --: | --------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----- | -------------------------------- | ----------- |
|   1 | `getAccount`                            | `GET /api/v1/account`                                                    | CUSTOMER Bearer                             | `/account`                                                     | Đọc detail; loading, 404/permission, error                                                       | FE-2  | `browser:auth-account`           | NOT STARTED |
|   2 | `updateAccount`                         | `PATCH /api/v1/account`                                                  | CUSTOMER Bearer                             | `/account`                                                     | Chỉnh sửa bằng `updateAccount`; dirty, validation, pending, conflict                             | FE-2  | `browser:auth-account`           | NOT STARTED |
|   3 | `listAccountAddresses`                  | `GET /api/v1/account/addresses`                                          | CUSTOMER Bearer                             | `/account/addresses`                                           | Đọc collection; loading, empty, error, filter/pagination                                         | FE-2  | `browser:auth-account`           | NOT STARTED |
|   4 | `createAccountAddress`                  | `POST /api/v1/account/addresses`                                         | CUSTOMER Bearer                             | `/account/addresses`                                           | Tạo bằng `createAccountAddress`; validation, pending, success, conflict                          | FE-2  | `browser:auth-account`           | NOT STARTED |
|   5 | `archiveAccountAddress`                 | `DELETE /api/v1/account/addresses/{id}`                                  | CUSTOMER Bearer                             | `/account/addresses`                                           | Action `archiveAccountAddress`; confirm/reason, pending, success, replay/conflict                | FE-2  | `browser:auth-account`           | NOT STARTED |
|   6 | `updateAccountAddress`                  | `PATCH /api/v1/account/addresses/{id}`                                   | CUSTOMER Bearer                             | `/account/addresses`                                           | Chỉnh sửa bằng `updateAccountAddress`; dirty, validation, pending, conflict                      | FE-2  | `browser:auth-account`           | NOT STARTED |
|   7 | `changePassword`                        | `POST /api/v1/account/change-password`                                   | CUSTOMER Bearer                             | `/account/security`                                            | Chỉnh sửa bằng `changePassword`; dirty, validation, pending, conflict                            | FE-2  | `browser:auth-account`           | NOT STARTED |
|   8 | `listCustomerAfterSalesRequests`        | `GET /api/v1/after-sales`                                                | CUSTOMER Bearer                             | `/after-sales`                                                 | Đọc collection; loading, empty, error, filter/pagination                                         | FE-4  | `browser:customer-post-purchase` | NOT STARTED |
|   9 | `createAfterSalesRequest`               | `POST /api/v1/after-sales`                                               | CUSTOMER Bearer hoặc guest order credential | `/after-sales/new`                                             | Tạo bằng `createAfterSalesRequest`; validation, pending, success, conflict                       | FE-4  | `browser:customer-post-purchase` | NOT STARTED |
|  10 | `getAfterSalesRequest`                  | `GET /api/v1/after-sales/{requestNumber}`                                | CUSTOMER Bearer hoặc guest order credential | `/after-sales/[requestNumber]`                                 | Đọc detail; loading, 404/permission, error                                                       | FE-4  | `browser:customer-post-purchase` | NOT STARTED |
|  11 | `uploadAfterSalesAttachment`            | `POST /api/v1/after-sales/{requestNumber}/attachments`                   | CUSTOMER Bearer hoặc guest order credential | `/after-sales/[requestNumber]`                                 | Upload; select, validate, progress, success, 413/415/503                                         | FE-4  | `browser:customer-post-purchase` | NOT STARTED |
|  12 | `getAfterSalesAttachmentUrl`            | `GET /api/v1/after-sales/{requestNumber}/attachments/{attachmentId}/url` | CUSTOMER Bearer hoặc guest order credential | `/after-sales/[requestNumber]`                                 | Mở signed URL; pending, expired, forbidden, provider error                                       | FE-4  | `browser:customer-post-purchase` | NOT STARTED |
|  13 | `cancelAfterSalesRequest`               | `POST /api/v1/after-sales/{requestNumber}/cancel`                        | CUSTOMER Bearer hoặc guest order credential | `/after-sales/[requestNumber]`                                 | Action `cancelAfterSalesRequest`; confirm/reason, pending, success, replay/conflict              | FE-4  | `browser:customer-post-purchase` | NOT STARTED |
|  14 | `acceptEmployeeInvitation`              | `POST /api/v1/auth/accept-employee-invitation`                           | Anonymous + one-time fragment token         | `/accept-invitation`                                           | Command `acceptEmployeeInvitation`; pending, authoritative success, replay/conflict              | FE-2  | `browser:auth-account`           | NOT STARTED |
|  15 | `forgotPassword`                        | `POST /api/v1/auth/forgot-password`                                      | Anonymous                                   | `/forgot-password`                                             | Command `forgotPassword`; pending, authoritative success, replay/conflict                        | FE-2  | `browser:auth-account`           | NOT STARTED |
|  16 | `login`                                 | `POST /api/v1/auth/login`                                                | Anonymous                                   | `/login`                                                       | Command `login`; pending, authoritative success, replay/conflict                                 | FE-2  | `browser:auth-account`           | NOT STARTED |
|  17 | `logout`                                | `POST /api/v1/auth/logout`                                               | Phiên đã xác thực                           | `Storefront/customer shell`                                    | Đăng xuất; pending, success, provider error                                                      | FE-2  | `browser:auth-account`           | NOT STARTED |
|  18 | `refreshSession`                        | `POST /api/v1/auth/refresh`                                              | Refresh HttpOnly cookie                     | `Toàn web — AuthProvider`                                      | Bootstrap/refresh phiên; loading, success, anonymous fallback                                    | FE-2  | `browser:auth-account`           | NOT STARTED |
|  19 | `registerAccount`                       | `POST /api/v1/auth/register`                                             | Anonymous                                   | `/register`                                                    | Tạo bằng `registerAccount`; validation, pending, success, conflict                               | FE-2  | `browser:auth-account`           | NOT STARTED |
|  20 | `resetPassword`                         | `POST /api/v1/auth/reset-password`                                       | Anonymous + one-time fragment token         | `/reset-password`                                              | Command `resetPassword`; pending, authoritative success, replay/conflict                         | FE-2  | `browser:auth-account`           | NOT STARTED |
|  21 | `listBackofficeAfterSalesRequests`      | `GET /api/v1/backoffice/after-sales`                                     | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/after-sales`                                      | Đọc collection; loading, empty, error, filter/pagination                                         | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  22 | `getBackofficeAfterSalesRequest`        | `GET /api/v1/backoffice/after-sales/{id}`                                | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/after-sales/[id]`                                 | Đọc detail; loading, 404/permission, error                                                       | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  23 | `approveAfterSalesRequest`              | `POST /api/v1/backoffice/after-sales/{id}/approve`                       | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/after-sales/[id]`                                 | Command `approveAfterSalesRequest`; pending, authoritative success, replay/conflict              | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  24 | `assignAfterSalesRequest`               | `POST /api/v1/backoffice/after-sales/{id}/assign`                        | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/after-sales/[id]`                                 | Command `assignAfterSalesRequest`; pending, authoritative success, replay/conflict               | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  25 | `getBackofficeAfterSalesAttachmentUrl`  | `GET /api/v1/backoffice/after-sales/{id}/attachments/{attachmentId}/url` | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/after-sales/[id]`                                 | Mở signed URL; pending, expired, forbidden, provider error                                       | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  26 | `receiveAfterSalesRequest`              | `POST /api/v1/backoffice/after-sales/{id}/receive`                       | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/after-sales/[id]`                                 | Command `receiveAfterSalesRequest`; pending, authoritative success, replay/conflict              | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  27 | `recordAfterSalesInspectionSummary`     | `POST /api/v1/backoffice/after-sales/{id}/record-inspection-summary`     | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/after-sales/[id]`                                 | Command `recordAfterSalesInspectionSummary`; pending, authoritative success, replay/conflict     | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  28 | `rejectAfterSalesRequest`               | `POST /api/v1/backoffice/after-sales/{id}/reject`                        | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/after-sales/[id]`                                 | Action `rejectAfterSalesRequest`; confirm/reason, pending, success, replay/conflict              | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  29 | `resolveAfterSalesOther`                | `POST /api/v1/backoffice/after-sales/{id}/resolve-other`                 | ADMIN Bearer                                | `/backoffice/after-sales/[id]`                                 | Command `resolveAfterSalesOther`; pending, authoritative success, replay/conflict                | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  30 | `resolveAfterSalesRefunded`             | `POST /api/v1/backoffice/after-sales/{id}/resolve-refunded`              | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/after-sales/[id]`                                 | Command `resolveAfterSalesRefunded`; pending, authoritative success, replay/conflict             | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  31 | `resolveAfterSalesRepaired`             | `POST /api/v1/backoffice/after-sales/{id}/resolve-repaired`              | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/after-sales/[id]`                                 | Command `resolveAfterSalesRepaired`; pending, authoritative success, replay/conflict             | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  32 | `resolveAfterSalesReplaced`             | `POST /api/v1/backoffice/after-sales/{id}/resolve-replaced`              | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/after-sales/[id]`                                 | Command `resolveAfterSalesReplaced`; pending, authoritative success, replay/conflict             | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  33 | `resolveAfterSalesReturnedUnchanged`    | `POST /api/v1/backoffice/after-sales/{id}/resolve-returned-unchanged`    | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/after-sales/[id]`                                 | Command `resolveAfterSalesReturnedUnchanged`; pending, authoritative success, replay/conflict    | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  34 | `startAfterSalesInspection`             | `POST /api/v1/backoffice/after-sales/{id}/start-inspection`              | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/after-sales/[id]`                                 | Command `startAfterSalesInspection`; pending, authoritative success, replay/conflict             | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  35 | `listBackofficeAuditLogs`               | `GET /api/v1/backoffice/audit-logs`                                      | ADMIN Bearer                                | `/backoffice/audit-logs`                                       | Đọc collection; loading, empty, error, filter/pagination                                         | FE-8  | `browser:system-admin-health`    | NOT STARTED |
|  36 | `getBackofficeAuditLog`                 | `GET /api/v1/backoffice/audit-logs/{id}`                                 | ADMIN Bearer                                | `/backoffice/audit-logs/[id]`                                  | Đọc detail; loading, 404/permission, error                                                       | FE-8  | `browser:system-admin-health`    | NOT STARTED |
|  37 | `listBackofficeCustomers`               | `GET /api/v1/backoffice/customers`                                       | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/customers`                                        | Đọc collection; loading, empty, error, filter/pagination                                         | FE-8  | `browser:system-admin-health`    | NOT STARTED |
|  38 | `getBackofficeCustomer`                 | `GET /api/v1/backoffice/customers/{id}`                                  | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/customers`                                        | Đọc detail; loading, 404/permission, error                                                       | FE-8  | `browser:system-admin-health`    | NOT STARTED |
|  39 | `activateCustomer`                      | `POST /api/v1/backoffice/customers/{id}/activate`                        | ADMIN Bearer                                | `/backoffice/customers`                                        | Command `activateCustomer`; pending, authoritative success, replay/conflict                      | FE-8  | `browser:system-admin-health`    | NOT STARTED |
|  40 | `suspendCustomer`                       | `POST /api/v1/backoffice/customers/{id}/suspend`                         | ADMIN Bearer                                | `/backoffice/customers`                                        | Command `suspendCustomer`; pending, authoritative success, replay/conflict                       | FE-8  | `browser:system-admin-health`    | NOT STARTED |
|  41 | `listBackofficeEmployees`               | `GET /api/v1/backoffice/employees`                                       | ADMIN Bearer                                | `/backoffice/employees`                                        | Đọc collection; loading, empty, error, filter/pagination                                         | FE-8  | `browser:system-admin-health`    | NOT STARTED |
|  42 | `createBackofficeEmployee`              | `POST /api/v1/backoffice/employees`                                      | ADMIN Bearer                                | `/backoffice/employees`                                        | Tạo bằng `createBackofficeEmployee`; validation, pending, success, conflict                      | FE-8  | `browser:system-admin-health`    | NOT STARTED |
|  43 | `getBackofficeEmployee`                 | `GET /api/v1/backoffice/employees/{id}`                                  | ADMIN Bearer                                | `/backoffice/employees`                                        | Đọc detail; loading, 404/permission, error                                                       | FE-8  | `browser:system-admin-health`    | NOT STARTED |
|  44 | `updateBackofficeEmployee`              | `PATCH /api/v1/backoffice/employees/{id}`                                | ADMIN Bearer                                | `/backoffice/employees`                                        | Chỉnh sửa bằng `updateBackofficeEmployee`; dirty, validation, pending, conflict                  | FE-8  | `browser:system-admin-health`    | NOT STARTED |
|  45 | `disableEmployee`                       | `POST /api/v1/backoffice/employees/{id}/disable`                         | ADMIN Bearer                                | `/backoffice/employees`                                        | Action `disableEmployee`; confirm/reason, pending, success, replay/conflict                      | FE-8  | `browser:system-admin-health`    | NOT STARTED |
|  46 | `enableEmployee`                        | `POST /api/v1/backoffice/employees/{id}/enable`                          | ADMIN Bearer                                | `/backoffice/employees`                                        | Command `enableEmployee`; pending, authoritative success, replay/conflict                        | FE-8  | `browser:system-admin-health`    | NOT STARTED |
|  47 | `resendEmployeeInvitation`              | `POST /api/v1/backoffice/employees/{id}/resend-invitation`               | ADMIN Bearer                                | `/backoffice/employees`                                        | Command `resendEmployeeInvitation`; pending, authoritative success, replay/conflict              | FE-8  | `browser:system-admin-health`    | NOT STARTED |
|  48 | `getBackofficeInventoryInspection`      | `GET /api/v1/backoffice/inspections/{id}`                                | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/inspections/[id]`                       | Đọc detail; loading, 404/permission, error                                                       | FE-6  | `browser:inventory-stock`        | NOT STARTED |
|  49 | `updateBackofficeInventoryInspection`   | `PATCH /api/v1/backoffice/inspections/{id}`                              | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/inspections/[id]`                       | Chỉnh sửa bằng `updateBackofficeInventoryInspection`; dirty, validation, pending, conflict       | FE-6  | `browser:inventory-stock`        | NOT STARTED |
|  50 | `completeBackofficeInventoryInspection` | `POST /api/v1/backoffice/inspections/{id}/complete`                      | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/inspections/[id]`                       | Command `completeBackofficeInventoryInspection`; pending, authoritative success, replay/conflict | FE-6  | `browser:inventory-stock`        | NOT STARTED |
|  51 | `listBackofficeInventoryLocations`      | `GET /api/v1/backoffice/inventory-locations`                             | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/locations`                              | Đọc collection; loading, empty, error, filter/pagination                                         | FE-6  | `browser:inventory-stock`        | NOT STARTED |
|  52 | `listBackofficeInventoryUnits`          | `GET /api/v1/backoffice/inventory-units`                                 | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/units`                                  | Đọc collection; loading, empty, error, filter/pagination                                         | FE-6  | `browser:inventory-stock`        | NOT STARTED |
|  53 | `intakeBackofficeInventoryUnit`         | `POST /api/v1/backoffice/inventory-units`                                | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/intake`                                 | Tạo bằng `intakeBackofficeInventoryUnit`; validation, pending, success, conflict                 | FE-6  | `browser:inventory-stock`        | NOT STARTED |
|  54 | `getBackofficeInventoryUnit`            | `GET /api/v1/backoffice/inventory-units/{id}`                            | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/units/[id]`                             | Đọc detail; loading, 404/permission, error                                                       | FE-6  | `browser:inventory-stock`        | NOT STARTED |
|  55 | `updateBackofficeInventoryUnit`         | `PATCH /api/v1/backoffice/inventory-units/{id}`                          | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/units/[id]`                             | Chỉnh sửa bằng `updateBackofficeInventoryUnit`; dirty, validation, pending, conflict             | FE-6  | `browser:inventory-stock`        | NOT STARTED |
|  56 | `getBackofficeInventoryCost`            | `GET /api/v1/backoffice/inventory-units/{id}/cost`                       | ADMIN Bearer                                | `/backoffice/inventory/units/[id]`                             | Đọc detail; loading, 404/permission, error                                                       | FE-6  | `browser:inventory-stock`        | NOT STARTED |
|  57 | `updateBackofficeInventoryCost`         | `PATCH /api/v1/backoffice/inventory-units/{id}/cost`                     | ADMIN Bearer                                | `/backoffice/inventory/units/[id]`                             | Chỉnh sửa bằng `updateBackofficeInventoryCost`; dirty, validation, pending, conflict             | FE-6  | `browser:inventory-stock`        | NOT STARTED |
|  58 | `listBackofficeInventoryInspections`    | `GET /api/v1/backoffice/inventory-units/{id}/inspections`                | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/units/[id]`                             | Đọc collection; loading, empty, error, filter/pagination                                         | FE-6  | `browser:inventory-stock`        | NOT STARTED |
|  59 | `createBackofficeInventoryInspection`   | `POST /api/v1/backoffice/inventory-units/{id}/inspections`               | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/units/[id]`                             | Tạo bằng `createBackofficeInventoryInspection`; validation, pending, success, conflict           | FE-6  | `browser:inventory-stock`        | NOT STARTED |
|  60 | `makeBackofficeInventoryUnitAvailable`  | `POST /api/v1/backoffice/inventory-units/{id}/make-available`            | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/units/[id]`                             | Command `makeBackofficeInventoryUnitAvailable`; pending, authoritative success, replay/conflict  | FE-6  | `browser:inventory-stock`        | NOT STARTED |
|  61 | `uploadBackofficeInventoryUnitMedia`    | `POST /api/v1/backoffice/inventory-units/{id}/media`                     | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/units/[id]`                             | Upload; select, validate, progress, success, 413/415/503                                         | FE-6  | `browser:inventory-stock`        | NOT STARTED |
|  62 | `quarantineBackofficeInventoryUnit`     | `POST /api/v1/backoffice/inventory-units/{id}/quarantine`                | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/units/[id]`                             | Command `quarantineBackofficeInventoryUnit`; pending, authoritative success, replay/conflict     | FE-6  | `browser:inventory-stock`        | NOT STARTED |
|  63 | `revealBackofficeInventoryIdentifiers`  | `POST /api/v1/backoffice/inventory-units/{id}/reveal-identifiers`        | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/units/[id]`                             | Command `revealBackofficeInventoryIdentifiers`; pending, authoritative success, replay/conflict  | FE-6  | `browser:inventory-stock`        | NOT STARTED |
|  64 | `sendBackofficeInventoryUnitToRepair`   | `POST /api/v1/backoffice/inventory-units/{id}/send-to-repair`            | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/units/[id]`                             | Command `sendBackofficeInventoryUnitToRepair`; pending, authoritative success, replay/conflict   | FE-6  | `browser:inventory-stock`        | NOT STARTED |
|  65 | `transferBackofficeInventoryUnit`       | `POST /api/v1/backoffice/inventory-units/{id}/transfer`                  | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/units/[id]`                             | Command `transferBackofficeInventoryUnit`; pending, authoritative success, replay/conflict       | FE-6  | `browser:inventory-stock`        | NOT STARTED |
|  66 | `writeOffBackofficeInventoryUnit`       | `POST /api/v1/backoffice/inventory-units/{id}/write-off`                 | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/units/[id]`                             | Command `writeOffBackofficeInventoryUnit`; pending, authoritative success, replay/conflict       | FE-6  | `browser:inventory-stock`        | NOT STARTED |
|  67 | `lookupBackofficeInventoryIdentifier`   | `POST /api/v1/backoffice/inventory-units/lookup-identifier`              | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/lookup`                                 | Command `lookupBackofficeInventoryIdentifier`; pending, authoritative success, replay/conflict   | FE-6  | `browser:inventory-stock`        | NOT STARTED |
|  68 | `listBackofficeOrders`                  | `GET /api/v1/backoffice/orders`                                          | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/orders`                                           | Đọc collection; loading, empty, error, filter/pagination                                         | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  69 | `getBackofficeOrder`                    | `GET /api/v1/backoffice/orders/{id}`                                     | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/orders/[id]`                                      | Đọc detail; loading, 404/permission, error                                                       | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  70 | `cancelBackofficeOrder`                 | `POST /api/v1/backoffice/orders/{id}/cancel`                             | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/orders/[id]`                                      | Action `cancelBackofficeOrder`; confirm/reason, pending, success, replay/conflict                | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  71 | `completePickup`                        | `POST /api/v1/backoffice/orders/{id}/complete-pickup`                    | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/orders/[id]`                                      | Command `completePickup`; pending, authoritative success, replay/conflict                        | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  72 | `confirmPickupOrder`                    | `POST /api/v1/backoffice/orders/{id}/confirm`                            | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/orders/[id]`                                      | Command `confirmPickupOrder`; pending, authoritative success, replay/conflict                    | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  73 | `extendPickupHold`                      | `POST /api/v1/backoffice/orders/{id}/extend-pickup-hold`                 | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/orders/[id]`                                      | Command `extendPickupHold`; pending, authoritative success, replay/conflict                      | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  74 | `updateBackofficeOrderInternalNote`     | `PATCH /api/v1/backoffice/orders/{id}/internal-note`                     | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/orders/[id]`                                      | Chỉnh sửa bằng `updateBackofficeOrderInternalNote`; dirty, validation, pending, conflict         | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  75 | `markPickupReady`                       | `POST /api/v1/backoffice/orders/{id}/mark-pickup-ready`                  | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/orders/[id]`                                      | Command `markPickupReady`; pending, authoritative success, replay/conflict                       | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  76 | `overrideShippingFee`                   | `POST /api/v1/backoffice/orders/{id}/override-shipping-fee`              | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/orders/[id]`                                      | Command `overrideShippingFee`; pending, authoritative success, replay/conflict                   | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  77 | `createRefund`                          | `POST /api/v1/backoffice/orders/{id}/refunds`                            | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/orders/[id]`                                      | Tạo bằng `createRefund`; validation, pending, success, conflict                                  | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  78 | `createShipment`                        | `POST /api/v1/backoffice/orders/{id}/shipment`                           | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/orders/[id]`                                      | Tạo bằng `createShipment`; validation, pending, success, conflict                                | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  79 | `startPreparingOrder`                   | `POST /api/v1/backoffice/orders/{id}/start-preparing`                    | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/orders/[id]`                                      | Command `startPreparingOrder`; pending, authoritative success, replay/conflict                   | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  80 | `listBackofficePayments`                | `GET /api/v1/backoffice/payments`                                        | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/payments`                                         | Đọc collection; loading, empty, error, filter/pagination                                         | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  81 | `getBackofficePayment`                  | `GET /api/v1/backoffice/payments/{id}`                                   | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/payments/[id]`                                    | Đọc detail; loading, 404/permission, error                                                       | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  82 | `getPaymentEvidenceUrl`                 | `GET /api/v1/backoffice/payments/{id}/evidence-url`                      | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/payments/[id]`                                    | Mở signed URL; pending, expired, forbidden, provider error                                       | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  83 | `rejectPayment`                         | `POST /api/v1/backoffice/payments/{id}/reject`                           | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/payments/[id]`                                    | Action `rejectPayment`; confirm/reason, pending, success, replay/conflict                        | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  84 | `verifyPayment`                         | `POST /api/v1/backoffice/payments/{id}/verify`                           | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/payments/[id]`                                    | Command `verifyPayment`; pending, authoritative success, replay/conflict                         | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  85 | `deleteBackofficeProductMedia`          | `DELETE /api/v1/backoffice/product-media/{id}`                           | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/catalog/products/[id]`                            | Action `deleteBackofficeProductMedia`; confirm/reason, pending, success, replay/conflict         | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
|  86 | `updateBackofficeProductMedia`          | `PATCH /api/v1/backoffice/product-media/{id}`                            | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/catalog/products/[id]`                            | Chỉnh sửa bằng `updateBackofficeProductMedia`; dirty, validation, pending, conflict              | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
|  87 | `listBackofficeProducts`                | `GET /api/v1/backoffice/products`                                        | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/catalog/products`                                 | Đọc collection; loading, empty, error, filter/pagination                                         | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
|  88 | `createBackofficeProduct`               | `POST /api/v1/backoffice/products`                                       | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/catalog/products/new`                             | Tạo bằng `createBackofficeProduct`; validation, pending, success, conflict                       | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
|  89 | `getBackofficeProduct`                  | `GET /api/v1/backoffice/products/{id}`                                   | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/catalog/products/[id]`                            | Đọc detail; loading, 404/permission, error                                                       | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
|  90 | `updateBackofficeProduct`               | `PATCH /api/v1/backoffice/products/{id}`                                 | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/catalog/products/[id]`                            | Chỉnh sửa bằng `updateBackofficeProduct`; dirty, validation, pending, conflict                   | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
|  91 | `archiveBackofficeProduct`              | `POST /api/v1/backoffice/products/{id}/archive`                          | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/catalog/products/[id]`                            | Action `archiveBackofficeProduct`; confirm/reason, pending, success, replay/conflict             | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
|  92 | `uploadBackofficeProductMedia`          | `POST /api/v1/backoffice/products/{id}/media`                            | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/catalog/products/[id]`                            | Upload; select, validate, progress, success, 413/415/503                                         | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
|  93 | `publishBackofficeProduct`              | `POST /api/v1/backoffice/products/{id}/publish`                          | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/catalog/products/[id]`                            | Command `publishBackofficeProduct`; pending, authoritative success, replay/conflict              | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
|  94 | `createBackofficeVariant`               | `POST /api/v1/backoffice/products/{productId}/variants`                  | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/catalog/products/[id]`                            | Tạo bằng `createBackofficeVariant`; validation, pending, success, conflict                       | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
|  95 | `listBackofficeRefunds`                 | `GET /api/v1/backoffice/refunds`                                         | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/refunds`                                          | Đọc collection; loading, empty, error, filter/pagination                                         | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  96 | `getBackofficeRefund`                   | `GET /api/v1/backoffice/refunds/{id}`                                    | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/refunds/[id]`                                     | Đọc detail; loading, 404/permission, error                                                       | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  97 | `cancelRefund`                          | `POST /api/v1/backoffice/refunds/{id}/cancel`                            | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/refunds/[id]`                                     | Action `cancelRefund`; confirm/reason, pending, success, replay/conflict                         | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  98 | `completeBankTransferRefund`            | `POST /api/v1/backoffice/refunds/{id}/complete-bank-transfer`            | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/refunds/[id]`                                     | Command `completeBankTransferRefund`; pending, authoritative success, replay/conflict            | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
|  99 | `completeCashRefund`                    | `POST /api/v1/backoffice/refunds/{id}/complete-cash`                     | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/refunds/[id]`                                     | Command `completeCashRefund`; pending, authoritative success, replay/conflict                    | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
| 100 | `getRefundEvidenceUrl`                  | `GET /api/v1/backoffice/refunds/{id}/evidence-url`                       | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/refunds/[id]`                                     | Mở signed URL; pending, expired, forbidden, provider error                                       | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
| 101 | `rejectRefund`                          | `POST /api/v1/backoffice/refunds/{id}/reject`                            | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/refunds/[id]`                                     | Action `rejectRefund`; confirm/reason, pending, success, replay/conflict                         | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
| 102 | `startRefundProcessing`                 | `POST /api/v1/backoffice/refunds/{id}/start-processing`                  | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/refunds/[id]`                                     | Command `startRefundProcessing`; pending, authoritative success, replay/conflict                 | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
| 103 | `getBackofficeSettings`                 | `GET /api/v1/backoffice/settings`                                        | ADMIN Bearer                                | `/backoffice/settings`                                         | Đọc detail; loading, 404/permission, error                                                       | FE-8  | `browser:system-admin-health`    | NOT STARTED |
| 104 | `updateBackofficeSettings`              | `PATCH /api/v1/backoffice/settings`                                      | ADMIN Bearer                                | `/backoffice/settings`                                         | Chỉnh sửa bằng `updateBackofficeSettings`; dirty, validation, pending, conflict                  | FE-8  | `browser:system-admin-health`    | NOT STARTED |
| 105 | `uploadBackofficeBankQr`                | `POST /api/v1/backoffice/settings/bank-qr`                               | ADMIN Bearer                                | `/backoffice/settings`                                         | Upload; select, validate, progress, success, 413/415/503                                         | FE-8  | `browser:system-admin-health`    | NOT STARTED |
| 106 | `handOverShipment`                      | `POST /api/v1/backoffice/shipments/{id}/hand-over`                       | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/orders/[id]`                                      | Command `handOverShipment`; pending, authoritative success, replay/conflict                      | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
| 107 | `markShipmentDelivered`                 | `POST /api/v1/backoffice/shipments/{id}/mark-delivered`                  | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/orders/[id]`                                      | Command `markShipmentDelivered`; pending, authoritative success, replay/conflict                 | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
| 108 | `markShipmentFailed`                    | `POST /api/v1/backoffice/shipments/{id}/mark-failed`                     | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/orders/[id]`                                      | Command `markShipmentFailed`; pending, authoritative success, replay/conflict                    | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
| 109 | `markShipmentReturned`                  | `POST /api/v1/backoffice/shipments/{id}/mark-returned`                   | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/orders/[id]`                                      | Command `markShipmentReturned`; pending, authoritative success, replay/conflict                  | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
| 110 | `listBackofficeStockLevels`             | `GET /api/v1/backoffice/stock-levels`                                    | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/stock`                                  | Đọc collection; loading, empty, error, filter/pagination                                         | FE-6  | `browser:inventory-stock`        | NOT STARTED |
| 111 | `listBackofficeStockMovements`          | `GET /api/v1/backoffice/stock-movements`                                 | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/stock/movements`                        | Đọc collection; loading, empty, error, filter/pagination                                         | FE-6  | `browser:inventory-stock`        | NOT STARTED |
| 112 | `adjustBackofficeStock`                 | `POST /api/v1/backoffice/stock/adjust`                                   | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/stock`                                  | Chỉnh sửa bằng `adjustBackofficeStock`; dirty, validation, pending, conflict                     | FE-6  | `browser:inventory-stock`        | NOT STARTED |
| 113 | `receiveBackofficeStock`                | `POST /api/v1/backoffice/stock/receive`                                  | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/stock`                                  | Command `receiveBackofficeStock`; pending, authoritative success, replay/conflict                | FE-6  | `browser:inventory-stock`        | NOT STARTED |
| 114 | `returnBackofficeStock`                 | `POST /api/v1/backoffice/stock/return`                                   | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/stock`                                  | Command `returnBackofficeStock`; pending, authoritative success, replay/conflict                 | FE-6  | `browser:inventory-stock`        | NOT STARTED |
| 115 | `transferBackofficeStock`               | `POST /api/v1/backoffice/stock/transfer`                                 | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/inventory/stock`                                  | Command `transferBackofficeStock`; pending, authoritative success, replay/conflict               | FE-6  | `browser:inventory-stock`        | NOT STARTED |
| 116 | `updateBackofficeVariant`               | `PATCH /api/v1/backoffice/variants/{id}`                                 | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/catalog/products/[id]`                            | Chỉnh sửa bằng `updateBackofficeVariant`; dirty, validation, pending, conflict                   | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
| 117 | `activateBackofficeVariant`             | `POST /api/v1/backoffice/variants/{id}/activate`                         | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/catalog/products/[id]`                            | Command `activateBackofficeVariant`; pending, authoritative success, replay/conflict             | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
| 118 | `archiveBackofficeVariant`              | `POST /api/v1/backoffice/variants/{id}/archive`                          | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/catalog/products/[id]`                            | Action `archiveBackofficeVariant`; confirm/reason, pending, success, replay/conflict             | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
| 119 | `uploadBackofficeVariantMedia`          | `POST /api/v1/backoffice/variants/{id}/media`                            | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/catalog/products/[id]`                            | Upload; select, validate, progress, success, 413/415/503                                         | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
| 120 | `listBackofficeVouchers`                | `GET /api/v1/backoffice/vouchers`                                        | ADMIN Bearer                                | `/backoffice/vouchers`                                         | Đọc collection; loading, empty, error, filter/pagination                                         | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
| 121 | `createVoucher`                         | `POST /api/v1/backoffice/vouchers`                                       | ADMIN Bearer                                | `/backoffice/vouchers/new`                                     | Tạo bằng `createVoucher`; validation, pending, success, conflict                                 | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
| 122 | `getBackofficeVoucher`                  | `GET /api/v1/backoffice/vouchers/{id}`                                   | ADMIN Bearer                                | `/backoffice/vouchers/[id]`                                    | Đọc detail; loading, 404/permission, error                                                       | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
| 123 | `updateVoucher`                         | `PATCH /api/v1/backoffice/vouchers/{id}`                                 | ADMIN Bearer                                | `/backoffice/vouchers/[id]`                                    | Chỉnh sửa bằng `updateVoucher`; dirty, validation, pending, conflict                             | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
| 124 | `activateVoucher`                       | `POST /api/v1/backoffice/vouchers/{id}/activate`                         | ADMIN Bearer                                | `/backoffice/vouchers/[id]`                                    | Command `activateVoucher`; pending, authoritative success, replay/conflict                       | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
| 125 | `archiveVoucher`                        | `POST /api/v1/backoffice/vouchers/{id}/archive`                          | ADMIN Bearer                                | `/backoffice/vouchers/[id]`                                    | Action `archiveVoucher`; confirm/reason, pending, success, replay/conflict                       | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
| 126 | `pauseVoucher`                          | `POST /api/v1/backoffice/vouchers/{id}/pause`                            | ADMIN Bearer                                | `/backoffice/vouchers/[id]`                                    | Command `pauseVoucher`; pending, authoritative success, replay/conflict                          | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
| 127 | `listVoucherUsages`                     | `GET /api/v1/backoffice/vouchers/{id}/usages`                            | ADMIN Bearer                                | `/backoffice/vouchers/[id]`                                    | Đọc collection; loading, empty, error, filter/pagination                                         | FE-5  | `browser:catalog-voucher-admin`  | NOT STARTED |
| 128 | `listBackofficeWarranties`              | `GET /api/v1/backoffice/warranties`                                      | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/warranties`                                       | Đọc collection; loading, empty, error, filter/pagination                                         | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
| 129 | `getBackofficeWarranty`                 | `GET /api/v1/backoffice/warranties/{id}`                                 | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/warranties/[id]`                                  | Đọc detail; loading, 404/permission, error                                                       | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
| 130 | `voidWarranty`                          | `POST /api/v1/backoffice/warranties/{id}/void`                           | ADMIN Bearer                                | `/backoffice/warranties/[id]`                                  | Action `voidWarranty`; confirm/reason, pending, success, replay/conflict                         | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
| 131 | `listBackofficeWarrantyPolicies`        | `GET /api/v1/backoffice/warranty-policies`                               | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/warranty-policies`                                | Đọc collection; loading, empty, error, filter/pagination                                         | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
| 132 | `createWarrantyPolicy`                  | `POST /api/v1/backoffice/warranty-policies`                              | ADMIN Bearer                                | `/backoffice/warranty-policies`                                | Tạo bằng `createWarrantyPolicy`; validation, pending, success, conflict                          | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
| 133 | `getBackofficeWarrantyPolicy`           | `GET /api/v1/backoffice/warranty-policies/{id}`                          | EMPLOYEE hoặc ADMIN Bearer                  | `/backoffice/warranty-policies`                                | Đọc detail; loading, 404/permission, error                                                       | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
| 134 | `updateWarrantyPolicy`                  | `PATCH /api/v1/backoffice/warranty-policies/{id}`                        | ADMIN Bearer                                | `/backoffice/warranty-policies`                                | Chỉnh sửa bằng `updateWarrantyPolicy`; dirty, validation, pending, conflict                      | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
| 135 | `activateWarrantyPolicy`                | `POST /api/v1/backoffice/warranty-policies/{id}/activate`                | ADMIN Bearer                                | `/backoffice/warranty-policies`                                | Command `activateWarrantyPolicy`; pending, authoritative success, replay/conflict                | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
| 136 | `archiveWarrantyPolicy`                 | `POST /api/v1/backoffice/warranty-policies/{id}/archive`                 | ADMIN Bearer                                | `/backoffice/warranty-policies`                                | Action `archiveWarrantyPolicy`; confirm/reason, pending, success, replay/conflict                | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
| 137 | `deactivateWarrantyPolicy`              | `POST /api/v1/backoffice/warranty-policies/{id}/deactivate`              | ADMIN Bearer                                | `/backoffice/warranty-policies`                                | Command `deactivateWarrantyPolicy`; pending, authoritative success, replay/conflict              | FE-7  | `browser:operations-lifecycle`   | NOT STARTED |
| 138 | `getCart`                               | `GET /api/v1/cart`                                                       | Anonymous/guest cookie hoặc CUSTOMER Bearer | `/cart`                                                        | Đọc collection; loading, empty, error, filter/pagination                                         | FE-3  | `browser:cart-checkout`          | NOT STARTED |
| 139 | `addCartItem`                           | `POST /api/v1/cart/items`                                                | GUEST cookie/CSRF hoặc CUSTOMER Bearer      | `/products/[slug]/units/[inventoryCode] hoặc /products/[slug]` | Tạo bằng `addCartItem`; validation, pending, success, conflict                                   | FE-3  | `browser:cart-checkout`          | NOT STARTED |
| 140 | `removeCartItem`                        | `DELETE /api/v1/cart/items/{itemId}`                                     | GUEST cookie/CSRF hoặc CUSTOMER Bearer      | `/cart`                                                        | Action `removeCartItem`; confirm/reason, pending, success, replay/conflict                       | FE-3  | `browser:cart-checkout`          | NOT STARTED |
| 141 | `updateCartItem`                        | `PATCH /api/v1/cart/items/{itemId}`                                      | GUEST cookie/CSRF hoặc CUSTOMER Bearer      | `/cart`                                                        | Chỉnh sửa bằng `updateCartItem`; dirty, validation, pending, conflict                            | FE-3  | `browser:cart-checkout`          | NOT STARTED |
| 142 | `mergeCart`                             | `POST /api/v1/cart/merge`                                                | CUSTOMER Bearer + guest cookie              | `Toàn web — CommerceProvider sau login`                        | Command `mergeCart`; pending, authoritative success, replay/conflict                             | FE-3  | `browser:cart-checkout`          | NOT STARTED |
| 143 | `createCheckout`                        | `POST /api/v1/checkouts`                                                 | GUEST cookie/CSRF hoặc CUSTOMER Bearer      | `/checkout`                                                    | Tạo bằng `createCheckout`; validation, pending, success, conflict                                | FE-3  | `browser:cart-checkout`          | NOT STARTED |
| 144 | `previewCheckout`                       | `POST /api/v1/checkouts/preview`                                         | GUEST cookie/CSRF hoặc CUSTOMER Bearer      | `/checkout`                                                    | Command `previewCheckout`; pending, authoritative success, replay/conflict                       | FE-3  | `browser:cart-checkout`          | NOT STARTED |
| 145 | `listCustomerOrders`                    | `GET /api/v1/orders`                                                     | CUSTOMER Bearer                             | `/orders`                                                      | Đọc collection; loading, empty, error, filter/pagination                                         | FE-4  | `browser:customer-post-purchase` | NOT STARTED |
| 146 | `getCustomerOrder`                      | `GET /api/v1/orders/{orderNumber}`                                       | CUSTOMER Bearer hoặc guest order credential | `/orders/[orderNumber]`                                        | Đọc detail; loading, 404/permission, error                                                       | FE-4  | `browser:customer-post-purchase` | NOT STARTED |
| 147 | `cancelCustomerOrder`                   | `POST /api/v1/orders/{orderNumber}/cancel`                               | CUSTOMER Bearer hoặc guest order credential | `/orders/[orderNumber]`                                        | Action `cancelCustomerOrder`; confirm/reason, pending, success, replay/conflict                  | FE-4  | `browser:customer-post-purchase` | NOT STARTED |
| 148 | `submitPaymentProof`                    | `POST /api/v1/payments/{paymentId}/submit-proof`                         | CUSTOMER Bearer hoặc guest order credential | `/orders/[orderNumber]`                                        | Command `submitPaymentProof`; pending, authoritative success, replay/conflict                    | FE-4  | `browser:customer-post-purchase` | NOT STARTED |
| 149 | `listProducts`                          | `GET /api/v1/products`                                                   | Public                                      | `/products`                                                    | Đọc collection; loading, empty, error, filter/pagination                                         | FE-1  | `browser:storefront-discovery`   | NOT STARTED |
| 150 | `getProductBySlug`                      | `GET /api/v1/products/{slug}`                                            | Public                                      | `/products/[slug]`                                             | Đọc detail; loading, 404/permission, error                                                       | FE-1  | `browser:storefront-discovery`   | NOT STARTED |
| 151 | `getUsedIphoneByInventoryCode`          | `GET /api/v1/products/{slug}/units/{inventoryCode}`                      | Public                                      | `/products/[slug]/units/[inventoryCode]`                       | Đọc detail; loading, 404/permission, error                                                       | FE-1  | `browser:storefront-discovery`   | NOT STARTED |
| 152 | `getPublicStore`                        | `GET /api/v1/store`                                                      | Public                                      | `/store`                                                       | Đọc detail; loading, 404/permission, error                                                       | FE-1  | `browser:storefront-discovery`   | NOT STARTED |
| 153 | `listPublicVouchers`                    | `GET /api/v1/vouchers`                                                   | Public; CUSTOMER Bearer optional            | `/vouchers`                                                    | Đọc collection; loading, empty, error, filter/pagination                                         | FE-1  | `browser:storefront-discovery`   | NOT STARTED |
| 154 | `listCustomerWarranties`                | `GET /api/v1/warranties`                                                 | CUSTOMER Bearer                             | `/warranties`                                                  | Đọc collection; loading, empty, error, filter/pagination                                         | FE-4  | `browser:customer-post-purchase` | NOT STARTED |
| 155 | `getCustomerWarranty`                   | `GET /api/v1/warranties/{warrantyCode}`                                  | CUSTOMER Bearer hoặc guest order credential | `/warranties/[warrantyCode]`                                   | Đọc detail; loading, 404/permission, error                                                       | FE-4  | `browser:customer-post-purchase` | NOT STARTED |
| 156 | `getWishlist`                           | `GET /api/v1/wishlist`                                                   | CUSTOMER Bearer                             | `/wishlist`                                                    | Đọc collection; loading, empty, error, filter/pagination                                         | FE-3  | `browser:cart-checkout`          | NOT STARTED |
| 157 | `addWishlistItem`                       | `POST /api/v1/wishlist/items`                                            | CUSTOMER Bearer                             | `/products/[slug]/units/[inventoryCode] hoặc /products/[slug]` | Tạo bằng `addWishlistItem`; validation, pending, success, conflict                               | FE-3  | `browser:cart-checkout`          | NOT STARTED |
| 158 | `removeWishlistItem`                    | `DELETE /api/v1/wishlist/items/{itemId}`                                 | CUSTOMER Bearer                             | `/wishlist`                                                    | Action `removeWishlistItem`; confirm/reason, pending, success, replay/conflict                   | FE-3  | `browser:cart-checkout`          | NOT STARTED |
| 159 | `getLiveness`                           | `GET /health/live`                                                       | Public machine probe; ADMIN quan sát        | `/backoffice/system/health`                                    | Hiển thị healthy/degraded/unavailable; retry thủ công                                            | FE-8  | `browser:system-admin-health`    | NOT STARTED |
| 160 | `getReadiness`                          | `GET /health/ready`                                                      | Public machine probe; ADMIN quan sát        | `/backoffice/system/health`                                    | Hiển thị healthy/degraded/unavailable; retry thủ công                                            | FE-8  | `browser:system-admin-health`    | NOT STARTED |
