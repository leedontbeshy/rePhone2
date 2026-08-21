# Slice 05 — Cart, Wishlist & Voucher

> Trạng thái: 🚧 Đang triển khai  
> Ngày chốt thiết kế: 2026-08-21  
> Base commit: `fa4a22b`  
> Phụ thuộc: Slice 02–04  
> Nguồn sự thật: các contract hiện hành trong [`docs`](../readme.md)

## 1. Mục tiêu và Definition of Done

Slice 05 cho phép guest/customer chuẩn bị ý định mua, quản lý wishlist và khám phá voucher. Cart không giữ tồn; voucher apply/preview và mọi mutation `VoucherUsage` thuộc Slice 06.

Hoàn thành khi:

- OpenAPI và generated client có đúng 17 operation mới.
- Guest tạo cart bằng cookie HttpOnly; PostgreSQL chỉ lưu SHA-256 hash của token.
- Customer có cart riêng và merge guest cart sau login không nhân item.
- iPhone luôn quantity 1; accessory quantity trong khoảng 1–99.
- Cart luôn phản ánh giá/tồn hiện hành và cảnh báo item stale.
- Wishlist customer-only; tài nguyên không thuộc owner được che bằng 404.
- Voucher fixed/percent/scope/lifecycle được tính deterministic, không dùng floating point.
- Admin quản lý voucher; employee bị chặn.
- Seed bốn voucher chạy liên tiếp hai lần vẫn idempotent.
- Storefront có CTA add/wishlist, `/cart`, `/wishlist`, `/vouchers` và header badge.
- `pnpm verify` cùng Supabase smoke test đều xanh.
- [`plan.md`](../../plan.md) đánh dấu Slice 05 hoàn thành và chuyển bước tiếp theo sang Slice 06.

Không thuộc Slice 05: checkout preview/create, reservation, mutation `VoucherUsage`, shipping/deposit, cart drawer, admin voucher UI, Redis/queue và campaign engine.

## 2. Kiến trúc và module boundary

- `CartModule` sở hữu `Cart`, `CartItem`, guest cookie, projection, mutation và merge.
- `WishlistModule` sở hữu `WishlistItem` và customer ownership.
- `VouchersModule` sở hữu voucher rule, scope, lifecycle, discovery, admin API và pure discount allocator.
- `CatalogModule` export `CommerceOfferReader` để đọc batch public target, giá, media và availability cho Cart/Wishlist.
- `AuthModule` export optional-session resolver: thiếu Bearer là guest; Bearer sai vẫn 401; role không phải `CUSTOMER` không được fallback thành guest.
- Slice 06 sẽ dùng dependency `Orders → Cart + Vouchers + Inventory`; không tạo dependency ngược hoặc `forwardRef`.

Repository nhận transaction client từ application service. Cart mutation/merge chạy trong Serializable transaction khi bảo vệ active-cart/item uniqueness. Projection Cart/Wishlist đọc offer theo batch để tránh N+1.

Nguồn: [Backend modules](../architecture/backend-modules.md), [Auth transport](../api/auth-token-transport.md), [Transaction/concurrency](../architecture/transaction-and-concurrency.md), [Cart/Wishlist API](../api/cart-and-wishlist-endpoints.md), [Voucher API](../api/voucher-endpoints.md).

## 3. Guest identity, cookie và security

- Raw token gồm 32 byte random, encode base64url; database chỉ lưu SHA-256 hex trong `guestTokenHash`.
- Cookie `rephone_guest_cart`: `HttpOnly`, `SameSite=Lax`, path `/api/v1`, TTL 30 ngày và `Secure` ngoài localhost.
- `GET /cart` không có cookie hoặc cookie hết hạn trả cart rỗng, không tạo row/cookie.
- Mutation guest thành công đầu tiên mới set cookie.
- Guest mutation yêu cầu Origin hợp lệ, `X-Rephone-CSRF: 1` và JSON content type.
- Customer Bearer có precedence; chỉ `/cart/merge` đọc đồng thời customer identity và guest cookie.
- Chỉ clear guest cookie sau khi merge commit thành công.
- Frontend serialize lần add đầu khi chưa có cookie; database/transaction vẫn bảo vệ request đồng thời cùng guest hash hoặc customer ID.
- Cart/Wishlist response dùng `Cache-Control: no-store`; raw token/hash không vào DTO, audit hoặc log.

Nguồn: [Authentication/security](../architecture/authentication-and-security.md), [Security threat model](../architecture/security-threat-model.md), [Roles](../requirements/roles-and-permissions.md), [Error catalog](../api/error-catalog.md).

## 4. Forward migration và invariant

Không sửa baseline migration. Tạo forward migration để:

- Enforce `cart_items.quantity BETWEEN 1 AND 99`; serialized item vẫn bắt buộc quantity 1.
- Enforce voucher `FIXED` có `maxDiscountAmount IS NULL`.
- Enforce voucher `PERCENT` là số nguyên 1–100; cap nếu có phải lớn hơn 0.
- Giữ nguyên owner XOR, partial unique active cart/item/wishlist và usage timestamp constraint hiện có.
- Enforce product type ↔ inventory mode, variant/unit consistency và scope target existence trong application transaction.

Trước deploy phải query chính xác row vi phạm constraint mới. Nếu có dữ liệu ngoài fixture đã biết thì dừng rollout, không tự sửa dữ liệu.

Nguồn: [Commerce data model](../data-model/commerce.md), [Database implementation](../architecture/database-implementation.md), [Local development/deployment](../operations/local-development-and-deployment.md).

## 5. Cart, merge và wishlist policy

- Add request là discriminated union `IPHONE` hoặc `ACCESSORY`.
- `POST` lặp lại cùng target có semantics set desired quantity, không cộng dồn.
- `priceAtAddition` chỉ snapshot khi tạo item và giữ nguyên đến khi item bị xóa.
- iPhone add bằng `inventoryCode`; accessory bằng `variantId + quantity`.
- Target mới phải thuộc active public catalog và đúng inventory mode.
- Item đã sold/inactive/out-of-stock không bị tự xóa. Projection trả `PRICE_CHANGED`, `QUANTITY_NOT_AVAILABLE`, `ITEM_UNAVAILABLE` hoặc `QUANTITY_CAPPED_ON_MERGE`.
- `estimatedSubtotal` chỉ cộng item có current price và availability hợp lệ.
- Merge claim guest cart nếu customer chưa có active cart; nếu đã có thì dedupe iPhone, cộng accessory tối đa 99 và chuyển source cart thành `ABANDONED`.
- Merge retry/concurrent replay trả cùng customer cart, không tạo item phụ.
- Wishlist chỉ cho `CUSTOMER`, dùng exact iPhone unit hoặc accessory variant; stale item vẫn hiển thị và có thể remove.

Nguồn: [Cart/Wishlist endpoints](../api/cart-and-wishlist-endpoints.md), [Catalog/inventory model](../architecture/catalog-inventory-model.md), [Commerce data](../data-model/commerce.md).

## 6. Voucher policy

- Code trim/uppercase, 1–64 ký tự và bất biến; create luôn `DRAFT`.
- `DRAFT` sửa mọi rule trừ code.
- `ACTIVE` chỉ sửa name/description; muốn sửa rule phải pause.
- `PAUSED` chưa có usage được sửa rule; đã có usage chỉ sửa name/description hoặc kéo dài `endsAt`.
- `ARCHIVED` là terminal.
- Pause/archive yêu cầu reason 5–500 ký tự và ghi `AuditLog`.
- `PUBLIC` không có per-customer limit; `ACCOUNT_ONLY` chỉ dành `CUSTOMER`.
- Scope gồm `ORDER`, `PRODUCT_TYPE`, `PRODUCTS`, `VARIANTS`; JSON reject unknown, duplicate hoặc empty target.
- `FIXED` và `PERCENT` dùng Decimal/BigInt; phần dư VND phân bổ theo `CartItem.id`.
- Quota projection tính `RESERVED + CONSUMED`; race reserve lượt cuối thuộc Slice 06.

Nguồn: [Voucher endpoints](../api/voucher-endpoints.md), [Commerce data](../data-model/commerce.md), [State machines](../architecture/state-machines.md), [Observability/audit](../architecture/observability.md).

## 7. API P0 — 17 operations

| Nhóm | Số operation | Nội dung |
|---|---:|---|
| Cart | 5 | get, add, update, remove, merge |
| Wishlist | 3 | get, add, remove |
| Public voucher | 1 | discovery |
| Admin voucher | 8 | list, create, detail, update, activate, pause, archive, usage list |

Cart input:

```text
IPHONE:    { itemType, inventoryCode }
ACCESSORY: { itemType, variantId, quantity }
```

`CartDto` gồm `id?`, `status`, `expiresAt?`, `items`, `estimatedSubtotal`, `warnings`; item chỉ chứa public-safe target/media, snapshot/current price, line total, availability và warnings.

OpenAPI thêm security scheme `rephone_guest_cart`. GET cart cho anonymous/Bearer/cookie; mutation cho Bearer hoặc guest cookie với CSRF; merge/wishlist/admin dùng Bearer; public voucher optional Bearer. Contract phải mô tả `Set-Cookie` và response 400/401/403/404/409/422/429.

Nguồn: [Endpoint inventory](../api/endpoint-inventory.md), [OpenAPI/client](../api/openapi-and-client.md), [Cart/Wishlist endpoints](../api/cart-and-wishlist-endpoints.md), [Voucher endpoints](../api/voucher-endpoints.md).

## 8. Storefront tối thiểu

- `CommerceProvider` nằm dưới `AuthProvider`, dùng typed client với `credentials: include`.
- Header có link `/cart` và badge tổng quantity; `CUSTOMER` có `/wishlist`.
- Exact iPhone page có add cart/wishlist.
- Accessory variant có quantity selector 1–99 và add cart/wishlist.
- `/cart` hiển thị media, target, snapshot/current price, warnings, line/subtotal, accessory quantity, remove và empty/error state.
- Sau login CUSTOMER, frontend gọi merge một lần; lỗi merge giữ session và hiện retry banner.
- `/wishlist` customer-only; sold/inactive item vẫn hiển thị trạng thái và cho remove.
- `/vouchers` cho guest thấy `PUBLIC`, customer thấy `PUBLIC + ACCOUNT_ONLY`; chưa lưu/apply voucher vào cart.
- UI có loading, disable chống double submit, focus lỗi, label, `aria-live` và mobile width cơ bản.

Nguồn: [Toolchain/monorepo](../development/toolchain-and-monorepo.md), [Non-functional requirements](../requirements/non-functional-requirements.md), [Storefront contracts](../api/cart-and-wishlist-endpoints.md).

## 9. Work packages và commit strategy

| WP | Nội dung | Commit |
|---|---|---|
| 0 | Plan chi tiết và đánh dấu đang triển khai | `docs(plan): detail slice 05 implementation` |
| 1 | Forward migration và integration test constraint | `feat(db): enforce slice 05 commerce invariants` |
| 2 | Optional session, guest identity, cookie/CSRF, cookie OpenAPI và rate limit | `feat(api): add guest commerce identity foundation` |
| 3 | Cart get/add/update/remove/merge, projection và warning | `feat(api): add guest and customer cart workflows` |
| 4 | Wishlist get/add/remove và ownership | `feat(api): add customer wishlist workflows` |
| 5 | Voucher rule, public/admin API, lifecycle, audit và usage read | `feat(api): add voucher policy and management` |
| 6 | Seed bốn voucher demo idempotent | `feat(seed): add slice 05 demo vouchers` |
| 7 | Generate OpenAPI/client và assert 17 operations | `chore(api): generate slice 05 contracts` |
| 8 | CommerceProvider, CTA, badge và cart page | `feat(web): add cart storefront` |
| 9 | Wishlist page và voucher discovery | `feat(web): add wishlist and voucher discovery` |
| 10 | Concurrency/security/performance/regression | `test(commerce): cover slice 05 invariants` |
| 11 | Deploy/smoke, nghiệm thu và cập nhật plan | `docs(plan): mark slice 05 complete` |

Mỗi work package chỉ commit khi gate liên quan xanh và push riêng lên `origin/feat/slice-05-cart-wishlist-voucher`. Không sửa `docs/decisions`.

## 10. Test matrix và quality gates

| Lớp | Coverage bắt buộc |
|---|---|
| Unit | token/hash/cookie, DTO union, cart projection/subtotal/warning, merge/cap/dedupe, voucher formula/scope/allocation/mutability, optional auth và conditional CSRF |
| Integration | owner XOR, one-active-cart, item/wishlist unique, quantity/cost/voucher constraints, usage timestamp và merge rollback |
| Concurrency | customer/guest first-add, desired quantity, merge deterministic và voucher lifecycle; dùng barrier, không `sleep` |
| E2E | GET guest không side effect, cookie/redaction, Bearer precedence, CSRF, cart CRUD/merge/stale, wishlist ownership, voucher visibility và admin-only lifecycle |
| Contract/Web | đúng 17 operation mới, operationId unique, security OR metadata, generated client không drift; CTA/routes/login merge |
| Regression | Slice 02–04 tiếp tục xanh; cart không tạo reservation hoặc sửa inventory |
| Performance | cart projection, wishlist và voucher list p95 dưới 500 ms ở 20–50 user đồng thời |

Gate bắt buộc theo thứ tự:

1. `pnpm typecheck`
2. `pnpm test`
3. `pnpm test:db:prepare`
4. `pnpm test:integration`
5. `pnpm test:e2e`
6. `pnpm api:openapi`
7. `pnpm api:client`
8. `pnpm build`
9. `pnpm verify`

Nguồn: [Testing strategy](../quality/testing-strategy.md), [Requirements traceability](../quality/requirements-traceability.md), [Non-functional requirements](../requirements/non-functional-requirements.md).

## 11. Rollout, rollback và checkpoint

Rollout Supabase:

1. Preflight migration và query row vi phạm constraint mới.
2. Chạy `pnpm db:deploy`; không reset/down migration.
3. Deploy API/Web Slice 05.
4. Seed hai lần; xác nhận bốn voucher stable không nhân bản.
5. Smoke guest cart add/update/remove và cookie/hash.
6. Smoke CUSTOMER login merge và wishlist.
7. So sánh guest/customer voucher discovery.
8. Smoke ADMIN lifecycle/usage read và xác nhận EMPLOYEE nhận 403.
9. Kiểm tra log không có raw cookie/hash/token và cart không tạo reservation.
10. Chạy `pnpm verify`, cập nhật plan và push commit nghiệm thu.

Rollback application về commit Slice 04; giữ additive/tightened constraint và dữ liệu Cart/Wishlist/Voucher. Cookie guest cũ không cấp quyền ngoài cart và tự hết hạn. Không chạy down migration hoặc `db:reset`.

Checkpoint:

- C1: migration + identity foundation xanh.
- C2: cart/wishlist API và concurrency invariant xanh.
- C3: voucher API/seed + 17 OpenAPI operations xanh.
- C4: storefront + full verify + Supabase smoke xanh.

Nguồn: [Local development/deployment](../operations/local-development-and-deployment.md), [Seed/demo scenarios](seed-and-demo-scenarios.md), [Database implementation](../architecture/database-implementation.md).

## 12. Assumptions và decision log đã khóa

- UI dùng cart page, không cart drawer.
- Admin voucher thao tác qua Swagger/API.
- Voucher discovery thuộc Slice 05; apply/preview thật thuộc Slice 06.
- Dùng ba module domain riêng, không tạo `CommerceModule` tổng.
- PostgreSQL là source of truth; không Redis/queue/cache.
- Cart không reserve tồn và không tin price/availability snapshot.
- Quota reservation/concurrency thuộc checkout Slice 06.
- Seed voucher nhưng không seed cart/wishlist.
- P0 dùng một API replica, tải mục tiêu 20–50 user đồng thời.
- Commit/push từng concern; `docs` tiếp tục là nguồn sự thật.
