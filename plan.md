# rePhone P0 — Kế hoạch triển khai chi tiết

> Trạng thái: ✅ Slice 11 — Warranty và after-sales đã hoàn thành; bước tiếp theo là Slice 12 — Settings, audit, jobs, email, UI và demo hardening<br>
> Kế hoạch chi tiết: [Slice 11 implementation plan](docs/planning/2026-08-25-slice-11-warranty-aftersales-plan.md)<br>
> Thời lượng mục tiêu: 4 tuần / 20 ngày làm việc<br>
> Nguồn sự thật: toàn bộ tài liệu hiện hành trong [`docs`](docs/readme.md)<br>
> Phạm vi: backend/core P0, typed API client, frontend tối thiểu cho demo và hardening

## 1. Cách sử dụng kế hoạch

`plan.md` là tài liệu điều phối thứ tự thực hiện và tiêu chí bàn giao. File này không thay thế requirement, data dictionary, API contract hay state machine. Khi có khác biệt, áp dụng thứ tự ưu tiên trong [docs index](docs/readme.md#nguồn-sự-thật-khi-có-trùng-nội-dung).

Quy trình cho mỗi vertical slice:

1. Đọc nhóm tài liệu nguồn được liên kết trong slice.
2. Chốt acceptance cases trước khi viết implementation.
3. Thực hiện migration/constraint, domain policy, application use case và endpoint theo cùng slice.
4. Viết unit, integration và API e2e tương ứng; không hoãn test invariant sang cuối dự án.
5. Generate OpenAPI và typed client; kiểm tra web không phụ thuộc DTO nội bộ hoặc Prisma type.
6. Chạy Definition of Done của slice rồi mới mở dependency kế tiếp.
7. Nếu implementation buộc thay đổi contract, cập nhật tất cả tài liệu hiện hành liên quan trong cùng thay đổi; không sửa `docs/decisions`.

## 2. Mục tiêu, phạm vi và tiêu chí thành công

### 2.1 Mục tiêu

- Xây website thương mại điện tử cho một cửa hàng bán iPhone cũ và phụ kiện.
- Chứng minh được tính minh bạch của từng iPhone: ảnh thật, kiểm định, pin, ngoại hình, lịch sử đã biết, giá và bảo hành riêng.
- Hoàn thiện các luồng storefront, customer portal và backoffice cần cho demo đồ án/portfolio.
- Ưu tiên khả năng giải thích kiến trúc, tính đúng đắn dữ liệu, test và tài liệu hơn độ rộng tính năng production.

### 2.2 Phạm vi P0

- Ba role cố định `ADMIN`, `EMPLOYEE`, `CUSTOMER`; `GUEST` là access mode, không phải role database.
- Public catalog, tìm kiếm/lọc, chi tiết product/variant và exact used-iPhone unit.
- Cart guest/customer, cart merge, wishlist customer và một voucher trên mỗi order.
- Checkout `PICKUP` hoặc `SHIPPING`, reservation, cọc thủ công, proof review, CASH/COD.
- Backoffice catalog, iPhone intake/inspection, accessory stock/movement, order, payment, fulfillment và refund.
- Warranty issuance, warranty lookup và after-sales workflow cơ bản.
- Employee/customer lifecycle, StoreSettings, AuditLog, scheduled jobs và transactional email.
- Local Compose, migration/seed lặp lại được, OpenAPI/generated client, automated tests và demo rehearsal.

### 2.3 Ngoài phạm vi P0

- SePay/webhook/đối soát ngân hàng tự động.
- Carrier quote/create/tracking API, redelivery hoặc nhiều shipment attempt.
- Redis, queue, durable outbox, microservice hoặc multi-replica scheduler coordination.
- Multi-store, multi-tenant, marketplace hoặc split allocation giữa nhiều location.
- Customer email verification, MFA, custom permission editor hoặc quản lý admin account.
- Repair order, technician, repair parts, BI/analytics hoặc search engine chuyên dụng.
- Mobile app, UI design system đầy đủ, dark mode, animation phức tạp và browser coverage rộng.

### 2.4 Tiêu chí thành công

- Không thể bán trùng một `InventoryUnit`, oversell phụ kiện hoặc vượt quota voucher dưới concurrency.
- Pricing, payment, refund, balance và inventory projection nhất quán sau mọi terminal flow.
- Customer/guest chỉ truy cập dữ liệu thuộc sở hữu; staff/admin tuân thủ role và field-level policy.
- Raw identifier, ciphertext, token hash, credential và private object path không xuất hiện trong public DTO/log/git.
- Database rỗng migrate được lên schema 28 model; seed chạy hai lần không nhân dữ liệu.
- P0 endpoint inventory được triển khai, OpenAPI/client không drift và critical test suite chạy xanh.
- Demo 12–15 phút chạy được từ clean environment và không có known P0 blocker.

### 2.5 NFR khóa cho P0

- Quy mô mục tiêu: 20–50 người dùng đồng thời, vài chục nghìn bản ghi nghiệp vụ.
- API thông thường hướng tới p95 dưới 500 ms trong môi trường demo/local, không tính upload/provider ngoài.
- Ưu tiên consistency của tồn kho và tiền hơn availability.
- Một API instance chạy scheduler trong P0; không cam kết production SLA/HA.
- Database lưu UTC; business timezone `Asia/Ho_Chi_Minh`; tiền là VND nguyên.

Nguồn: [Product vision/scope](docs/requirements/product-vision-and-scope.md), [NFR](docs/requirements/non-functional-requirements.md), [Documentation readiness](docs/planning/documentation-backlog.md).

## 3. Baseline kiến trúc và contract

### 3.1 Topology

```text
Browser
  ├── Next.js Web
  │     ├── Storefront
  │     ├── Customer portal
  │     └── Staff/Admin backoffice tối thiểu
  └── /api/v1 → NestJS modular monolith
                  ├── Prisma → PostgreSQL
                  ├── Supabase Storage adapter
                  ├── SMTP/Mailpit adapter
                  └── Single-instance scheduled jobs
```

### 3.2 Cấu trúc repository mục tiêu

```text
apps/
  api/
    prisma/{migrations,schema.prisma,seed.ts}
    src/{common,config,generated/prisma,modules}
    test/{integration,e2e}
  web/
    app/
    components/
    features/
    lib/
    public/
packages/
  api-client/
  eslint-config/
  typescript-config/
  test-config/
infra/docker/
docs/
compose.yaml
package.json
pnpm-workspace.yaml
turbo.json
```

- Không tạo `packages/ui` trước khi có component thực sự cần chia sẻ.
- Web chỉ dùng contract từ `packages/api-client`; không import Prisma hoặc DTO trong `apps/api`.
- Controller không gọi Prisma trực tiếp; application use case sở hữu transaction boundary.
- Module nhỏ không bắt buộc đủ bốn layer nếu việc tách layer không đem lại testability.

### 3.3 Module ownership

| Module | Trách nhiệm chính | Dependency/cộng tác chính |
|---|---|---|
| Auth | Login, register, session, token, reset, invitation | Users, Notifications, Audit |
| Users | Profile, address, employee/customer lifecycle | Auth, Audit |
| Catalog | Product, variant, spec, catalog status | Media, Inventory read projection |
| Inventory | Unit, inspection, identifier, stock, movement, reservation | Catalog, Orders, Warranty |
| Cart / Wishlist | Guest/customer cart, merge và favorites | Catalog/Inventory availability read |
| Vouchers | Rule, validity, quota và usage policy | Orders |
| Orders | Pricing/checkout orchestration, snapshot và order state | Cart, Inventory, Vouchers, Payments |
| Payments | Payment, proof và refund/evidence state | Orders, Media, Audit |
| Fulfillment | Pickup, shipment, tracking và delivery state | Inventory, Payments, Warranty |
| Warranty | Policy, issued warranty và after-sales | Inventory, Payments, Media |
| Media | Upload policy, storage adapter và product media | Owning business modules |
| Settings / Audit | Runtime business settings và immutable audit | Cross-cutting |
| Notifications | Template và gửi mail sau commit | Auth, Orders, Payments |

Nguồn: [System architecture](docs/architecture/system-architecture.md), [Backend modules](docs/architecture/backend-modules.md), [Toolchain/monorepo](docs/development/toolchain-and-monorepo.md).

## 4. Nguyên tắc triển khai vertical slice

### 4.1 Thứ tự dependency

```text
01 Foundation/DB
 ├─→ 02 Auth/Account ─→ 05 Cart/Wishlist/Voucher
 └─→ 03 Public Catalog ─→ 04 Backoffice Inventory
                              └───────────────┐
05 Commerce ─────────────────────────────────┴─→ 06 Checkout/Order
                                                   └→ 07 Deposit Review
                                                        ├→ 08 Pickup
                                                        └→ 09 Shipping
                                                             └→ 10 Cancel/Refund
                                                                  └→ 11 Warranty/After-sales
                                                                       └→ 12 System/UI/Hardening
```

### 4.2 Definition of Done chung cho một slice

- [ ] Requirement/architecture/data/API/test sources đã được đọc và không còn contract cần tự suy đoán.
- [ ] Migration/constraint/index của slice chạy từ database rỗng và có integration test khi cần.
- [ ] Domain rule/state transition có unit test; controller chỉ gọi named application use case.
- [ ] Permission, ownership, validation, error code và serializer đúng contract.
- [ ] Transaction/concurrency/idempotency test tồn tại nếu slice thay đổi state, money hoặc inventory.
- [ ] Audit, log, notification và provider behavior được assert nếu use case yêu cầu.
- [ ] OpenAPI được generate; operationId không trùng; generated client build được.
- [ ] Frontend chỉ được nối sau khi API contract của slice ổn định.
- [ ] `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, test liên quan và build đều xanh.
- [ ] Docs hiện hành và traceability không drift với implementation.

## 5. Lịch triển khai 4 tuần

| Tuần | Ngày | Trọng tâm | Slice | Checkpoint |
|---|---|---|---|---|
| 1 | 1–2 | Workspace, config, Compose, API foundation, health | 01 | App và DB khởi động sạch |
| 1 | 2–3 | 28-model schema, migration, constraint, seed/test DB | 01 | Migration-from-zero + seed hai lần |
| 1 | 3–4 | Auth/account/RBAC/session | 02 | Register/login/refresh/logout/invite |
| 1 | 4–5 | Public catalog và generated client | 03 | Login + browse catalog từ DB |
| 2 | 6–8 | Catalog management, iPhone/accessory inventory | 04 | Intake → inspect → available |
| 2 | 8–9 | Cart, wishlist, voucher | 05 | Guest cart + merge + validation |
| 2 | 9–10 | Checkout, reservation, order read/cancel | 06 | Pickup/shipping checkout an toàn |
| 3 | 11–12 | Proof upload/review/expiry | 07 | Deposit verify/reject/race pass |
| 3 | 12–13 | Pickup fulfillment | 08 | CASH completion + warranty |
| 3 | 13–14 | Shipping/COD/tracking | 09 | Handover/delivered/returned |
| 3 | 14 | Cancel/refund/evidence | 10 | Refund obligation + completion |
| 3 | 15 | Warranty/after-sales | 11 | Một case hậu mãi end-to-end |
| 4 | 16–17 | Settings/audit/jobs/email/employee operations | 12 | Cross-cutting flow hoàn chỉnh |
| 4 | 17–18 | Frontend demo flow + scenarios | 12 | Rehearsal 12–15 phút |
| 4 | 18 | Provider/deployment/backup smoke | 12 | Demo topology sẵn sàng |
| 4 | 19–20 | Buffer: blocker, flaky test, drift, report | 12 | Release checklist qua |

Không dùng lịch trên để bỏ qua DoD khi một slice chưa ổn. Nếu trễ, áp dụng chính sách cắt scope tại mục 11.

## 6. Kế hoạch chi tiết theo 12 vertical slice

### Slice 01 — Foundation, health và database baseline

**Mục tiêu:** clean clone có thể cài dependency, khởi động infra, validate config, migrate/seed và nhận health response.

**Phụ thuộc:** không có.

**Database và migration**

- [ ] Scaffold Prisma 7 ESM với `prisma-client`, output `apps/api/src/generated/prisma` và `@prisma/adapter-pg`.
- [ ] Chuyển 28 entity, enum, relation, delete behavior, money/timestamp/map naming từ data dictionary vào `schema.prisma`.
- [ ] Tạo baseline migration; bổ sung SQL check, partial unique index và constraint Prisma không diễn tả được.
- [ ] Tạo index P0 cho catalog, inventory, order, payment/refund, reservation, shipment, warranty, after-sales và audit.
- [ ] Tạo Compose `postgres`, `postgres-test`, `mailpit`; test script từ chối database không kết thúc bằng `_test`.
- [ ] Tạo seed framework idempotent và reset guard chỉ cho `rephone_dev`, `rephone_test`, `rephone_demo`.

**Application và runtime**

- [ ] Scaffold root workspace, Turbo pipeline và exact baseline versions trong lockfile.
- [ ] Tạo typed config bằng Zod; fail-fast mà không in secret value.
- [ ] Tạo request ID, Pino structured logging/redaction, validation pipe, exception filter và response envelope.
- [ ] Tạo `/health/live` và `/health/ready`; readiness trả 503 khi DB không sẵn sàng.
- [ ] Tạo StorageProvider và MailProvider interface với fake/test adapter; chưa cần upload use case.

**API/OpenAPI/UI**

- [ ] Khóa prefix `/api/v1`, Swagger chỉ bật development và command sinh static `openapi.json`.
- [ ] Scaffold `packages/api-client` với `openapi-typescript` + `openapi-fetch`.
- [ ] Tạo Next.js shell và API client runtime; chưa tạo UI feature rỗng.

**Test bắt buộc**

- [ ] Unit test config schema, secret placeholder rejection, response/error serialization và redaction.
- [ ] Integration test migration-from-zero, schema có đúng 28 model và representative constraints.
- [ ] API e2e health ready/live, request ID và error envelope.
- [ ] Seed từ database rỗng và chạy lại lần hai không tạo duplicate.

**Hoàn thành khi:** `pnpm verify` có thể chạy; Compose health xanh; migration/seed tái tạo được; API/Web build được.

Nguồn: [Data model index](docs/data-model/readme.md), [Data conventions](docs/data-model/conventions.md), [Database implementation](docs/architecture/database-implementation.md), [Configuration](docs/architecture/configuration.md), [Observability](docs/architecture/observability.md), [Local runbook](docs/operations/local-development-and-deployment.md).

### Slice 02 — Customer auth, account và session security

**Mục tiêu:** customer đăng ký/login; session rotation/revoke đúng; employee invitation foundation và ownership account hoạt động.

**Phụ thuộc:** Slice 01.

**Database và migration**

- [ ] Hoàn thiện `User`, `CustomerAddress`, `AuthSession`, `AuthToken` constraint/index.
- [ ] Enforce normalized email unique, one active default address và token/session digest lifecycle.
- [ ] Giữ refresh generation cũ đã revoke để phát hiện reuse và revoke family.

**Domain/application**

- [ ] Password Argon2id, policy 8–128 ký tự có chữ và số; không trim trước hash.
- [ ] Register CUSTOMER `ACTIVE` nhưng không tự tạo session.
- [ ] Login, refresh rotation, reuse detection, logout current, change/reset password và revoke all sessions.
- [ ] Employee create/invite/accept/resend foundation với one-time token.
- [ ] Profile/address CRUD theo ownership; default-address transition nguyên tử.
- [ ] Auth guard verify JWT rồi kiểm tra session chưa revoke/expired và user còn `ACTIVE`.

**API/OpenAPI/UI**

- [ ] Triển khai toàn bộ P0 auth/account endpoints theo contract.
- [ ] Access token trả trong body và chỉ giữ memory; raw refresh token chỉ ở cookie `rephone_refresh`.
- [ ] Refresh/logout kiểm tra origin và `X-Rephone-CSRF: 1`; mutation khác dùng Bearer token.
- [ ] UI tối thiểu: register, login, logout và session refresh handler; address UI có thể nối ở tuần 4.

**Test bắt buộc**

- [ ] Register không auto-login; login sai dùng lỗi generic chống enumeration.
- [ ] Refresh đồng thời chỉ tạo một successor hợp lệ; reuse revoke family.
- [ ] Logout/disable/change-password có hiệu lực với access request kế tiếp.
- [ ] Reset/invite one-time, đúng TTL và DB chỉ lưu digest.
- [ ] Customer A không đọc/sửa profile/address của customer B.
- [ ] Cookie flags, origin/CSRF và rate limit auth đúng môi trường.

**Hoàn thành khi:** auth flow và account ownership e2e xanh; public DTO không lộ token/session digest.

Nguồn: [Roles/permissions](docs/requirements/roles-and-permissions.md), [Authentication/security](docs/architecture/authentication-and-security.md), [Token transport](docs/api/auth-token-transport.md), [Auth/account endpoints](docs/api/auth-and-account-endpoints.md), [Identity data](docs/data-model/identity-auth.md).

### Slice 03 — Public catalog

> Trạng thái: ✅ Hoàn thành và đã đồng bộ lên nhánh `feat/slice-03-public-catalog`.<br>
> Kế hoạch chi tiết: [Slice 03 — Public Catalog](docs/planning/2026-08-20-slice-03-public-catalog-plan.md).

**Mục tiêu:** public browse/search/filter product và exact used-iPhone unit bằng projection an toàn.

**Phụ thuộc:** Slice 01; có thể chạy song song cuối Slice 02 sau khi common auth/error ổn định.

**Database và query**

- [x] Hoàn thiện read model cho `Product`, `ProductVariant`, `ProductMedia`, `InventoryUnit`, `InventoryInspection`, `StockLevel`.
- [x] Viết query product-grouped, stable pagination/sorting và visibility/availability predicate dùng lại được.
- [x] Chỉ thêm trigram/index mới sau benchmark seed-scale; benchmark xác nhận index baseline đáp ứng P0 nên không tạo migration tối ưu mới.

**Domain/application**

- [x] Phân biệt product type IPHONE/ACCESSORY và inventory mode SERIALIZED/QUANTITY.
- [x] Public iPhone chỉ hiện unit `AVAILABLE` thỏa active catalog/location, price, unit photo và current PASSED inspection.
- [x] Accessory availability suy ra từ `quantityOnHand - quantityReserved`.
- [x] Serializer mask identifier suffix; loại cost, raw identifier, location nội bộ và inspection note.

**API/OpenAPI/UI**

- [x] Product list/search/filter/sort/pagination.
- [x] Product detail với iPhone variants/available units hoặc accessory variants.
- [x] Exact used-iPhone unit detail bằng public inventory code/path contract.
- [x] Generate typed catalog client; UI catalog/detail đã nối ngay trong Slice 03.

**Test bắt buộc**

- [x] DRAFT/ARCHIVED product, inactive variant và unavailable unit không lọt public result.
- [x] Filter model/dung lượng/màu/tình trạng, search và stable ordering đúng contract.
- [x] Pagination meta và giới hạn page/pageSize đúng.
- [x] Public DTO snapshot không chứa field internal/secret.

**Kết quả nghiệm thu ngày 2026-08-20:**

- Supabase project `evuggdjbhykxvcxobmsn` không còn migration pending; seed chạy lặp lại không nhân dữ liệu.
- Catalog demo có 6 product `ACTIVE`, 8 variant `ACTIVE`, 5 unit `AVAILABLE`, 14 media PNG và không còn metadata SVG legacy.
- Bucket public `rephone-public` có đủ 14/14 object; từng URL trả `200 image/png` và uploader replay an toàn.
- Ba API list/detail/exact-unit, filter kết hợp và bốn route UI production smoke đều trả HTTP 200; public projection không lộ field cấm.
- Benchmark concurrency 10 đạt p95: list 55,88 ms; filtered list 57,57 ms; product detail 116,70 ms; exact unit 76,11 ms, đều dưới mục tiêu 500 ms.
- `pnpm verify` xanh: format, lint, typecheck, 22 API unit test, 5 integration test, 18 API E2E, OpenAPI/client generation và production build.
- Implementation đã nghiệm thu tại commit `5792677`; các commit Slice 03 được tách theo concern và đồng bộ remote, không còn known blocker thuộc slice.

**Hoàn thành khi:** ✅ Đạt — public catalog đọc từ database seed; client types build; query và storefront đáp ứng mục tiêu demo.

Nguồn: [Catalog model](docs/architecture/catalog-inventory-model.md), [Public catalog endpoints](docs/api/public-catalog-endpoints.md), [Filtering/search](docs/api/filtering-and-search.md), [Pagination](docs/api/pagination.md), [Catalog data](docs/data-model/catalog-inventory.md).

### Slice 04 — Backoffice catalog và inventory intake/inspection

> Kế hoạch triển khai đã chốt: [Slice 04 — Backoffice Catalog & Inventory](docs/planning/2026-08-21-slice-04-backoffice-inventory-plan.md)
>
> Trạng thái: ✅ Hoàn thành và đã đồng bộ lên nhánh `feat/slice-04-backoffice-inventory`.

**Mục tiêu:** staff tạo/publish catalog, nhập/kiểm định iPhone và quản lý accessory stock mà không bypass invariant.

**Phụ thuộc:** Slice 01, 02 và 03.

**Database và migration**

- [x] Hoàn thiện constraint cho product/variant/media, identifier HMAC, one current/draft inspection, StockLevel và StockMovement.
- [x] Dùng transaction advisory lock theo HMAC đã sort để chống cùng IMEI xuất hiện ở hai slot dưới concurrency.
- [x] ProductMedia enforce đúng một owner và unique `(bucket, objectPath)`.

**Domain/application**

- [x] Product/variant create/update/publish/archive và media ownership command.
- [x] iPhone intake với AES-256-GCM, HMAC-SHA-256, key version, masked projection và admin-only cost.
- [x] Inspection DRAFT partial; COMPLETED immutable; current switch trong một transaction.
- [x] Availability command riêng; không tự chuyển AVAILABLE chỉ vì inspection PASSED.
- [x] Unit lifecycle/reinspection/transfer/write-off bằng named command.
- [x] Accessory receipt/transfer/adjust/return tạo StockMovement và counter atomically.
- [x] Identifier reveal chỉ cho staff/admin hợp lệ và luôn ghi audit.

**API/OpenAPI/UI**

- [x] Triển khai backoffice catalog, variant, media, unit, inspection và stock movement endpoints P0.
- [x] Upload product/unit media qua backend; kiểm tra magic byte, size, count và object ownership.
- [x] UI demo tối thiểu: intake → draft inspection → complete → make available; các CRUD tiện ích khác có thể dùng API/Swagger.

**Test bắt buộc**

- [x] Invalid product/type/inventory-mode combination bị reject.
- [x] PARTIAL/FAILED inspection không cho AVAILABLE; completed inspection không sửa được.
- [x] Duplicate IMEI/serial/EID, kể cả cross-slot concurrency, bị chặn.
- [x] Receipt/transfer/adjust/return cân bằng counter/movement và không âm.
- [x] EMPLOYEE không xem/sửa cost; reveal identifier có audit; public projection vẫn masked.

**Kết quả nghiệm thu ngày 2026-08-21:**

- OpenAPI/generated client có đúng 40 operation backoffice, security metadata, multipart schema và các response 409/413/415/422/429/503; không drift sau generate.
- Supabase không có migration pending nên rollout database là no-op; seed chạy liên tiếp hai lần vẫn idempotent và giữ stable demo IDs.
- Smoke thật tạo unit `RPH-U-CKMN282D`, upload PNG owner-level lên Supabase Storage, complete inspection `PASSED`, chuyển `AVAILABLE` và đọc được ngay qua public catalog.
- ADMIN đọc/cập nhật cost và tạo audit an toàn; EMPLOYEE/public projection không lộ cost, raw identifier, HMAC hay ciphertext.
- Stock smoke commit đủ `RECEIPT`, `TRANSFER`, `ADJUSTMENT_OUT`, `RETURN`; counter/movement được đối chiếu sau commit.
- `pnpm verify` xanh: format, lint, typecheck, 37 unit test, 8 integration test, 26 API E2E, OpenAPI/client generation và production build.
- Không phát sinh forward migration, không dùng `db:reset`, không sửa `docs/decisions` và không còn known blocker thuộc Slice 04.

**Hoàn thành khi:** ✅ Đạt — employee đưa một máy RECEIVED qua inspection đến AVAILABLE; PostgreSQL và Supabase Storage phản ánh dữ liệu ngay cho public catalog.

Nguồn: [Backoffice catalog/inventory API](docs/api/backoffice-catalog-inventory-endpoints.md), [Inspection checklist](docs/architecture/iphone-inspection-checklist.md), [File pipeline](docs/architecture/file-upload-pipeline.md), [State machines](docs/architecture/state-machines.md), [Catalog/inventory data](docs/data-model/catalog-inventory.md).

### Slice 05 — Cart, wishlist và voucher

> ✅ Hoàn thành và đã đồng bộ lên branch `feat/slice-05-cart-wishlist-voucher`. Thiết kế và biên bản triển khai: [Slice 05 implementation plan](docs/planning/2026-08-21-slice-05-cart-wishlist-voucher-plan.md).

**Mục tiêu:** guest/customer chuẩn bị ý định mua nhưng chưa giữ tồn; voucher được validate deterministic.

**Phụ thuộc:** Slice 02 và 03; voucher admin mutation cần RBAC Slice 02.

**Database và migration**

- [x] Enforce Cart owner XOR, một ACTIVE cart/customer hoặc guest hash, cart expiry và item uniqueness.
- [x] Serialized CartItem luôn quantity 1; accessory item unique theo variant.
- [x] Wishlist partial unique theo exact unit hoặc accessory variant.
- [x] Voucher time/discount/quota constraint; VoucherUsage chỉ do owning order use case mutate.

**Domain/application**

- [x] Guest token random trong HttpOnly cookie `rephone_guest_cart`; DB chỉ lưu SHA-256 hash.
- [x] Cart get/add/set/remove; không tạo reservation và không tin availability/price cũ.
- [x] Guest → customer merge deterministic, không nhân serialized item.
- [x] Wishlist customer-only với ownership.
- [x] Voucher fixed/percent, minimum, max discount, visibility, scope, total/per-customer quota và lifecycle.

**API/OpenAPI/UI**

- [x] Cart, merge và wishlist endpoints theo storefront contract.
- [x] Voucher public discovery và admin management endpoints; apply cuối cùng thuộc preview/checkout.
- [x] UI demo: CTA iPhone/accessory, cart page, quantity accessory, remove item, warning stale, wishlist, voucher discovery và header badge; không có cart drawer hoặc voucher apply trong Slice 05.

**Test bắt buộc**

- [x] Guest cookie không cấp quyền order và merge không nhân item.
- [x] Serialized quantity khác 1 bị reject; unavailable item trả conflict/warning đúng.
- [x] Customer A không đọc/sửa cart/wishlist của B.
- [x] Voucher date/scope/minimum/visibility/formula và lifecycle đúng.
- [x] Money allocation VND deterministic; không dùng floating point.

**Kết quả nghiệm thu ngày 2026-08-21:**

- OpenAPI/generated client có đúng 17 operation mới, operationId unique, security OR cho Bearer/cookie, schema discriminated union và response contract không drift.
- Forward migration `20260821153000_slice05_commerce_invariants` được preflight với 0 row vi phạm và deploy thành công lên Supabase; không reset hoặc down migration.
- Seed chạy liên tiếp hai lần, giữ đúng bốn voucher stable `WELCOME100`, `IPHONE5`, `DEMO-DRAFT`, `DEMO-PAUSED` và không nhân bản.
- Supabase HTTP smoke xanh cho guest cookie/hash, cart set/update/remove, customer merge, wishlist, voucher visibility, ADMIN lifecycle/usage read, EMPLOYEE 403 và invariant không tạo reservation; dữ liệu smoke được dọn theo exact ID/hash.
- Storefront production smoke trả HTTP 200 cho `/products`, exact accessory detail, `/cart`, `/wishlist`, `/vouchers`; credentialed CORS trả đúng origin và header commerce/CTA có trong HTML.
- `pnpm verify` xanh: 46 API unit test, 10 integration test, 36 API E2E, OpenAPI/client generation và API/Web production build.
- Các concern được commit/push riêng lên remote; không sửa `docs/decisions` và không còn known blocker thuộc Slice 05.

**Hoàn thành khi:** ✅ Đạt — guest/customer tạo cart hợp lệ, merge sau login, quản lý wishlist và khám phá voucher theo visibility; cart không reserve tồn và Slice 06 có thể bắt đầu.

Nguồn: [Cart/Wishlist endpoints](docs/api/cart-and-wishlist-endpoints.md), [Voucher endpoints](docs/api/voucher-endpoints.md), [Commerce data](docs/data-model/commerce.md), [Roles](docs/requirements/roles-and-permissions.md).

### Slice 06 — Checkout, reservation và customer order

> ✅ Hoàn thành và đã đồng bộ lên branch `feat/slice-06-checkout-reservation-order`. Thiết kế và biên bản triển khai: [Slice 06 implementation plan](docs/planning/2026-08-21-slice-06-checkout-reservation-order-plan.md).

**Mục tiêu:** preview stateless và checkout atomic tạo đúng một order, reservation và snapshot với server pricing.

**Phụ thuộc:** Slice 04 và 05.

**Database và migration**

- [x] Hoàn thiện `Order`, `OrderItem`, `InventoryReservation`, `VoucherUsage` và shipping-deposit `Payment` constraints.
- [x] `Order.sourceCartId` unique; guest access token chỉ lưu hash.
- [x] Partial unique active reservation/unit; `quantityReserved <= quantityOnHand`.
- [x] Order total, fulfillment-specific field và money projection constraints.

**Domain/application**

- [x] Preview đọc cart, availability, price, location, voucher và settings nhưng không ghi reservation.
- [x] Checkout tính lại toàn bộ amount trong `Serializable`; so sánh `expectedGrandTotal` và shipping `expectedDepositRequired` trước write.
- [x] Chọn một location duy nhất: pickup dùng STORE; shipping thử WAREHOUSE rồi STORE, không split.
- [x] Reserve iPhone/accessory/voucher, snapshot order items/totals/warranty/bank data và convert cart trong cùng transaction.
- [x] Pickup tạo hold; shipping tạo deposit AWAITING_PROOF và proof deadline; zero-total không tạo Payment 0 đồng.
- [x] Replay cùng cart trả order chiến thắng sau ownership check.
- [x] Customer/guest list/detail/access link và cancel command theo policy.

**API/OpenAPI/UI**

- [x] Preview, create checkout, customer order list/detail, guest order access và cancel endpoints.
- [x] Response pricing/review conflict đủ để web yêu cầu xác nhận lại.
- [x] UI demo: checkout pickup/shipping, contact/address, order success và guest access flow.

**Test bắt buộc**

- [x] Forged price/discount/shipping/deposit không được tin.
- [x] Stale expected amount trả `CHECKOUT_REVIEW_REQUIRED` và không có write.
- [x] Hai checkout cùng iPhone: đúng một thành công.
- [x] N checkout phụ kiện cuối tồn: tổng reserved không vượt onHand.
- [x] N checkout voucher quota cuối: usage không vượt limit.
- [x] Replay cùng cart trả cùng order; một order chỉ dùng một location.
- [x] Snapshot không đổi khi catalog/settings thay đổi sau checkout.

**Nghiệm thu:**

- Forward migration `20260821180000_slice06_checkout_invariants` đã qua preflight và được deploy lên Supabase; không reset/down migration.
- Seed Supabase chạy liên tiếp hai lần vẫn idempotent và không reset operational state.
- Smoke thật đã qua guest SHIPPING create/replay/token/detail/cancel và CUSTOMER PICKUP list/detail/cancel; hai order smoke đều được hủy bằng application command, reservation/payment/voucher được giải phóng đúng và audit có actor `GUEST`/`USER`.
- OpenAPI/generated client có đúng 5 operation mới và `guestOrderToken`; web production build có `/checkout`, `/orders`, `/orders/[orderNumber]`.
- `pnpm verify` xanh: 57 unit test, 11 integration test, 42 API E2E, OpenAPI/client generation và API/Web production build.
- Các concern được commit/push riêng; không sửa `docs/decisions` và không còn known blocker thuộc Slice 06.

**Hoàn thành khi:** ✅ Đạt — guest/customer checkout pickup và shipping an toàn dưới concurrency; order read/ownership đúng; Slice 07 có thể bắt đầu.

Nguồn: [Order/deposit requirement](docs/requirements/order-deposit-and-fulfillment.md), [Checkout transaction](docs/architecture/checkout-transaction.md), [Transaction/concurrency](docs/architecture/transaction-and-concurrency.md), [Checkout/order endpoints](docs/api/checkout-and-customer-order-endpoints.md), [Sales data](docs/data-model/sales.md).

### Slice 07 — Deposit proof, review và expiry

> ✅ Hoàn thành và đã đồng bộ lên nhánh `feat/slice-07-deposit-proof-review-expiry`. Chi tiết tại [Slice 07 implementation plan](docs/planning/2026-08-22-slice-07-deposit-proof-review-expiry-plan.md).

**Mục tiêu:** shipping deposit đi từ chờ proof đến verified/rejected/expired mà không release reservation sai.

**Phụ thuộc:** Slice 06 và Media foundation Slice 04.

**Database và migration**

- [x] Hoàn thiện Payment proof metadata, status/timestamp và bank snapshot constraints/index.
- [x] Reservation hỗ trợ proof deadline, `REVIEW` hold không expiry và `FULFILLMENT` hold.

**Domain/application**

- [x] Submit proof trước deadline: upload/validate private object, sau đó transaction Payment → UNDER_REVIEW và reservation → REVIEW.
- [x] Verify dùng conditional transition trong `Serializable`; `receivedAmount >= depositRequired`, khác expected cần note.
- [x] Verify atomically cập nhật payment projection, Order PLACED → CONFIRMED và reservation → FULFILLMENT.
- [x] Reject/expire atomically terminalize payment, cancel order/fulfillment và release reservation/voucher.
- [x] Review SLA quá hạn chỉ đánh dấu/hiển thị overdue; không auto-cancel UNDER_REVIEW.
- [x] Email chạy sau commit; provider fail không rollback transaction.

**API/OpenAPI/UI**

- [x] Customer/guest proof submission và authorized evidence read.
- [x] Backoffice payment queue/detail/evidence/verify/reject.
- [x] UI demo: upload proof và employee review; private signed URL TTL 5 phút.

**Test bắt buộc**

- [x] Reject MIME giả, magic byte sai, oversize, executable/SVG và unauthorized evidence access.
- [x] Proof submit vs expiry race tạo đúng một kết quả nhất quán.
- [x] Hai staff verify/reject đồng thời chỉ có một terminal effect/audit.
- [x] Underpayment không verify; overpayment có note và projection đúng.
- [x] UNDER_REVIEW quá SLA không bị expiry job release.

**Nghiệm thu:**

- Forward migration `20260822100000_slice07_payment_evidence_invariants` đã qua preflight và deploy lên Supabase; kiểm tra lại không còn migration pending hoặc row vi phạm.
- Bucket `rephone-private` đã được tạo với `public=false`, giới hạn 10 MiB và allowlist JPEG/PNG/WebP/PDF.
- Supabase smoke thật đã qua CUSTOMER upload → staff signed read → verify/replay → cancel/refund và guest upload → reject/replay; reseed hai lần khi `UNDER_REVIEW` không đổi payment/order/reservation/stock.
- Scheduler đã expire idempotently một payment quá hạn, release nghiệp vụ và gửi email sau commit; log có run ID, không lộ token/evidence path/signed URL.
- OpenAPI/generated client có đúng 87 operation duy nhất, gồm 6 operation Slice 07 với UUID path params, multipart và security metadata đúng.
- `pnpm verify` xanh: 79 unit test, 16 integration test, 54 API E2E, OpenAPI/client generation và API/Web production build.
- Các concern đã được commit/push riêng; không sửa `docs/decisions` và không còn known blocker thuộc Slice 07.

**Hoàn thành khi:** ✅ Đạt — proof/review/expiry flow chạy end-to-end, không có trạng thái lai giữa Payment/Order/Reservation/VoucherUsage; Slice 08 có thể bắt đầu.

Nguồn: [Payment proof/review API](docs/api/payment-proof-and-review-endpoints.md), [File pipeline](docs/architecture/file-upload-pipeline.md), [Background jobs](docs/architecture/background-jobs.md), [State machines](docs/architecture/state-machines.md), [Notifications](docs/architecture/notifications.md).

### Slice 08 — Pickup fulfillment

> ✅ **COMPLETE** — đã triển khai đủ contract tại [Slice 08 implementation plan](docs/planning/2026-08-22-slice-08-pickup-fulfillment-plan.md), rollout Supabase và nghiệm thu ngày 2026-08-23. Bước tiếp theo là Slice 09.

**Mục tiêu:** pickup đi từ PENDING đến COMPLETED, thu CASH nếu cần, consume tồn/voucher và phát hành warranty đúng một lần.

**Phụ thuộc:** Slice 06–07; internal Warranty issuer là một phần Slice 08, còn Warranty/after-sales API đầy đủ thuộc Slice 11.

**Database và migration**

- [x] Hoàn thiện pickup hold/expiry invariant và fulfillment projection trên Order bằng forward migration, không sửa baseline.
- [x] CASH Payment, stock movement và warranty uniqueness/graph constraints bảo vệ atomic completion.

**Domain/application**

- [x] Staff confirm pickup Order PLACED → CONFIRMED.
- [x] Start preparation dùng chung PICKUP/SHIPPING; mark ready và extend hold có reason/audit.
- [x] Complete pickup trong `Serializable`: tạo+verify CASH cho balance > 0, consume reservation, xuất stock, unit → SOLD, voucher → CONSUMED, fulfillment/order → COMPLETED và issue warranty.
- [x] Zero balance không tạo Payment nhưng payment summary vẫn PAID.
- [x] Expire pickup idempotently cancel và release khi chưa completed.

**API/OpenAPI/UI**

- [x] Đúng tám Backoffice Order operation: list, detail, internal-note và confirm/prepare/ready/extend/complete; OpenAPI tăng từ 87 lên đúng 95 operation duy nhất.
- [x] Backoffice queue/detail vận hành pickup với filter, overdue signal, internal note và năm action; customer order detail phản ánh fulfillment/payment/warranty projection.
- [x] Supabase smoke tạo fixture qua checkout và application commands; permanent scenario framework vẫn thuộc Slice 12.

**Test bắt buộc**

- [x] Invalid transition và expired hold bị reject.
- [x] Complete replay chỉ tạo một CASH Payment, StockMovement và Warranty.
- [x] Payment/inventory/voucher/order projection cùng commit hoặc cùng rollback.
- [x] CUSTOMER không gọi backoffice command; EMPLOYEE/ADMIN permission đúng.

**Bằng chứng nghiệm thu:** `pnpm verify` xanh; migration-from-zero áp dụng đủ 6 migration; 114 API unit test, 13 Web test, 2 generated-client test, 27 integration test và 63 API E2E test đều qua. Supabase preflight có 17/17 invariant query trả 0; seed chạy hai lần không đổi operational state. Smoke thật đã complete order `RPH-20260823-L4AHFLHT`, expire order `RPH-20260823-DR3976HX` và xác nhận replay không nhân Payment/Reservation/StockMovement/VoucherUsage/Warranty/Audit.

**Hoàn thành khi:** ✅ Đạt — pickup happy path và expiry/cancel failure path chạy end-to-end với invariant query sau commit; Slice 09 có thể bắt đầu.

Nguồn: [Fulfillment transactions](docs/architecture/fulfillment-transactions.md), [Backoffice fulfillment API](docs/api/backoffice-order-fulfillment-refund-endpoints.md), [Order requirement](docs/requirements/order-deposit-and-fulfillment.md), [State machines](docs/architecture/state-machines.md).

### Slice 09 — Shipping, tracking, COD và return

> ✅ **COMPLETE** — đã triển khai đủ contract tại [Slice 09 shipping fulfillment plan](docs/planning/2026-08-23-slice-09-shipping-fulfillment-plan.md), rollout Supabase và nghiệm thu ngày 2026-08-23. Bước tiếp theo là Slice 10.

**Mục tiêu:** confirmed shipping order được chuẩn bị, bàn giao, giao COD hoặc trả hàng mà không consume tồn hai lần.

**Phụ thuộc:** Slice 07–08.

**Database và migration**

- [x] Hoàn thiện Shipment unique one-per-order, `attemptNumber = 1`, tracking và status timestamp constraints.
- [x] Shipping fee override fields/reason/audit và recomputed totals constraints.

**Domain/application**

- [x] Override shipping fee chỉ trước proof; không tăng deposit snapshot, giảm nếu vượt grand total mới.
- [x] Start preparation và create Shipment.
- [x] Handover trong transaction consume reservation đúng một lần, unit → IN_TRANSIT và fulfillment → IN_TRANSIT.
- [x] Delivered tạo+verify COD cho balance > 0, unit → SOLD, consume voucher, issue warranty và complete order atomically.
- [x] Failed giữ unit IN_TRANSIT; returned ghi location/note/time và chuyển iPhone → INSPECTING.
- [x] Không tạo redelivery/attempt thứ hai trong P0.

**API/OpenAPI/UI**

- [x] Shipping fee override, shipment create, handover, delivered, failed và returned endpoints.
- [x] Customer tracking projection chỉ chứa carrier/tracking data an toàn.
- [x] UI demo: employee nhập tracking → handover → delivered; failure/return có thể trình diễn qua smoke flow.

**Test bắt buộc**

- [x] Deposit chưa verified không thể handover.
- [x] Handover replay không consume tồn lần hai.
- [x] Delivered replay không tạo COD/warranty/movement trùng.
- [x] Failed → returned đưa iPhone về INSPECTING; accessory không tự tăng sellable stock.
- [x] Không cancel khi IN_TRANSIT; không tạo shipment attempt thứ hai.

**Bằng chứng nghiệm thu:** OpenAPI có đúng 101 operation; `pnpm verify` xanh với 150 API unit test, 21 Web test, 2 generated-client test, 35 integration test và 72 API E2E test. Migration-from-zero áp dụng đủ 8 migration. Supabase preflight có 18/18 invariant query trả 0; seed chạy hai lần không đổi operational state. Smoke thật đã complete order `RPH-20260823-RBFQ57UL`, đưa order `RPH-20260823-NYKVUJMC` qua FAILED → RETURNED, xác nhận replay không nhân side effect và nhận đủ 10 lifecycle email qua Mailpit.

**Hoàn thành khi:** ✅ Đạt — shipping/COD happy path và failed/returned path giữ đúng state/inventory/payment invariant; Slice 10 có thể bắt đầu.

Nguồn: [Fulfillment transactions](docs/architecture/fulfillment-transactions.md), [Backoffice fulfillment API](docs/api/backoffice-order-fulfillment-refund-endpoints.md), [Order/deposit requirement](docs/requirements/order-deposit-and-fulfillment.md), [Sales data](docs/data-model/sales.md).

### Slice 10 — Order cancellation và refund

> ✅ **COMPLETE** — đã triển khai đủ contract tại [Slice 10 implementation plan](docs/planning/2026-08-24-slice-10-order-cancellation-refund-plan.md), rollout Supabase và nghiệm thu ngày 2026-08-24. OpenAPI đạt `101 → 111`; bước tiếp theo là Slice 11.

**Mục tiêu:** cancel release đúng tài nguyên; tiền đã thu tạo nghĩa vụ refund và chỉ complete an toàn.

**Phụ thuộc:** Slice 07–09.

**Database và migration**

- [x] Hoàn thiện Refund amount/status/timestamp/actor/evidence constraints; evidence lưu MIME/size/SHA-256 và có queue/processing index.
- [x] Enforce Payment/Order alignment bằng composite relation; không auto-backfill dữ liệu lạ.
- [x] Enforce tổng nghĩa vụ active/completed không vượt verified payment chưa hoàn bằng transaction policy.

**Domain/application**

- [x] Customer/guest cancel theo ownership qua shared cancellation engine, không khi proof UNDER_REVIEW hoặc fulfillment IN_TRANSIT.
- [x] Staff cancel pre-handover hoặc sau SHIPPING/RETURNED; không auto-restock hàng returned.
- [x] Manual Refund chỉ cho Order CANCELLED/COMPLETED; P0 chỉ tạo BANK_TRANSFER/CASH, OTHER là legacy read-only.
- [x] Refund create/start/reject/cancel bằng named command và audit; PROCESSING chỉ có thể complete.
- [x] Bank evidence upload trước completion transaction và exact replay bằng SHA-256; CASH refund không có evidence và bắt buộc note/audit.
- [x] Complete atomically terminalize Refund, recompute `refundedAmount`/`paymentStatus` và giữ nguyên Order status/`balanceDue`.
- [x] Terminal refund immutable; sửa sai bằng record mới hợp lệ.

**API/OpenAPI/UI**

- [x] Customer/guest cancel và refund read projection public-safe.
- [x] Đủ đúng 10 backoffice operation refund/cancellation; OpenAPI tăng `101 → 111` và generated client không drift.
- [x] Backoffice refund query/create/process/evidence/complete/reject/cancel với private signed URL tối đa 300 giây.
- [x] UI `/backoffice/refunds`, detail/action, Order cancellation/manual refund và customer refund timeline.
- [x] UI demo dùng scenario `refund-processing` để trình diễn evidence + completion.

**Test bắt buộc**

- [x] Cancel chưa thu tiền release đúng và không tạo Refund.
- [x] Cancel đã verify deposit tạo đúng một refund obligation.
- [x] Hai cancel/review replay không nhân side effect.
- [x] Bank refund thiếu evidence không complete; completed refunds không vượt verified payment.
- [x] Exact evidence replay không upload/audit/email lại; evidence khác conflict và concurrent loser được cleanup.
- [x] Private refund evidence yêu cầu ownership/role và không lộ object path.

**Bằng chứng nghiệm thu:** OpenAPI có đúng 111 operation; generated client không drift. `pnpm verify` xanh với 186 API unit test, 27 Web test, 2 generated-client test, 41 integration test và 77 API E2E test. Migration-from-zero áp dụng đủ 9 migration. Supabase preflight trước/sau rollout đều sạch; seed chạy hai lần giữ nguyên operational state. Full smoke đã hoàn tất BANK_TRANSFER refund `01a033c6-4e6a-760f-8962-07477b809209` và CASH refund `01a033c6-ac19-707c-b4f6-338a3eb54ea3`, kiểm tra exact evidence replay, signed URL, RBAC, no-store, aggregate cap, audit idempotency và public redaction.

**Hoàn thành khi:** ✅ Đạt — cancellation/refund happy và failure paths cập nhật Order/Payment/Inventory/Voucher nhất quán; Slice 11 có thể bắt đầu.

Nguồn: [Cancellation/refund transaction](docs/architecture/order-cancellation-and-refund.md), [Refund processing](docs/architecture/refund-processing.md), [Backoffice refund API](docs/api/backoffice-order-fulfillment-refund-endpoints.md), [Sales data](docs/data-model/sales.md).

### Slice 11 — Warranty và after-sales

> ✅ **COMPLETE** — đã triển khai đủ contract tại [Slice 11 implementation plan](docs/planning/2026-08-25-slice-11-warranty-aftersales-plan.md), rollout Supabase và nghiệm thu ngày 2026-08-25. OpenAPI đạt `111 → 143`; bước tiếp theo là Slice 12.

**Mục tiêu:** completed order phát hành warranty snapshot và customer/staff xử lý case hậu mãi theo state machine.

**Phụ thuộc:** Slice 08–10.

**Database và migration**

- [x] Hoàn thiện `WarrantyPolicy`, `Warranty`, `AfterSalesRequest` relations/constraints/index.
- [x] Unique Warranty/OrderItem; one active after-sales case/OrderItem; actor/time/note theo status.
- [x] Replacement unit khác original unit và warranty interval `[startAt,endAt)`.

**Domain/application**

- [x] Issue warranty trong terminal fulfillment transaction với duration/terms snapshot.
- [x] Expiry tính động `now >= endAt`; không lưu status EXPIRED.
- [x] Customer/guest tạo/xem/cancel REQUESTED case theo ownership/access token.
- [x] Staff receive: iPhone SOLD → INSPECTING; start inspection, approve/reject và typed resolution.
- [x] Reject/repaired/returned unchanged đưa unit INSPECTING → SOLD khi trả khách.
- [x] Replace chỉ cho iPhone với replacement unit hợp lệ; accessory dùng refund + order mới.
- [x] REFUNDED resolution chỉ RESOLVED sau khi Refund COMPLETED.
- [x] Attachment luôn private và command nhạy cảm có reason/audit.

**API/OpenAPI/UI**

- [x] Storefront warranty/case/attachment endpoints.
- [x] Backoffice policy, warranty query, receive/inspect/decision/resolution endpoints.
- [x] UI demo dùng scenario `after-sales-inspecting` hoặc tạo case trực tiếp từ completed order.

**Test bắt buộc**

- [x] Warranty startAt/endAt và snapshot đúng thời điểm completion.
- [x] Warranty hết hạn/void không tạo WARRANTY case; P0 không override.
- [x] Tối đa một active case/order item.
- [x] Inventory transition đúng cho receive, reject, repair, return và replace.
- [x] REFUNDED không resolve trước Refund COMPLETED; ownership/attachment authorization đúng.

**Bằng chứng nghiệm thu:** OpenAPI/generated client có đúng 143 operation duy nhất (`111 → 143`, thêm đúng 32 operation Slice 11); operationId, security metadata, multipart schema và typed client không drift. `pnpm verify` xanh với 246 API unit test, 46 Web test, 2 generated-client test, 48 integration test và 81 API E2E test; migration-from-zero áp dụng đủ 10 migration. Supabase preflight trước/sau smoke có 20/20 invariant query trả 0; seed chạy hai lần không thay đổi fingerprint của case `INSPECTING`, Order, Warranty, attachment metadata hoặc audit count. Full smoke đi qua completed Order → Warranty → WARRANTY case → private attachment → receive/start-inspection/summary → approve → `REPAIRED`, xác nhận exact replay không nhân side effect, signed URL tối đa 300 giây, RBAC/no-store và public projection không lộ private storage metadata. Guarded scenario `after-sales-inspecting` được tạo/reuse qua application commands và dừng đúng tại `INSPECTING`.

**Hoàn thành khi:** ✅ Đạt — completed Order phát hành Warranty snapshot đúng một lần; customer/guest và staff đưa case đến REJECTED hoặc RESOLVED mà inventory, refund, attachment và audit invariant vẫn đúng; Slice 12 có thể bắt đầu.

Nguồn: [Warranty requirement](docs/requirements/warranty-and-aftersales.md), [Warranty/after-sales API](docs/api/warranty-and-aftersales-endpoints.md), [After-sales data](docs/data-model/after-sales.md), [State machines](docs/architecture/state-machines.md).

### Slice 12 — Settings, audit, jobs, email, UI và demo hardening

**Mục tiêu:** hoàn tất API surface còn lại, nối UI demo, vận hành/release và bằng chứng kỹ thuật.

**Phụ thuộc:** Slice 01–11.

**Database và application**

- [ ] StoreSettings singleton key `STORE`, optimistic version và mutable field policy.
- [ ] Employee list/create/update/invite/resend/disable/enable; customer safe read và admin suspend/activate.
- [ ] AuditLog append-only cho account, identifier, price/cost, inventory, payment, refund, hold, shipping fee và settings.
- [ ] Jobs: reservation/payment expiry, guest cart/auth token cleanup theo batch, overlap guard và idempotent handler.
- [ ] Transactional email templates theo event matrix; tối đa hai adapter attempts, không có outbox P0.
- [ ] Observability/redaction/health hoàn thiện; scheduler chỉ bật một API instance.

**API/OpenAPI/UI**

- [ ] Employee/customer/settings/audit endpoint groups hoàn tất và permission đúng.
- [ ] OpenAPI bao phủ toàn bộ P0 endpoint inventory; generated client sạch drift.
- [ ] Storefront UI: catalog/detail, cart/voucher, checkout, proof, order/tracking và warranty.
- [ ] Backoffice UI tối thiểu: inventory inspection, payment review, pickup/shipping, refund và after-sales.
- [ ] Settings/audit/employee utility chỉ cần UI nếu nằm trong live demo; API vẫn phải đúng P0 contract.
- [ ] Responsive/accessibility cơ bản: keyboard focus, label/form error, semantic landmark và usable mobile width.

**Hardening và vận hành**

- [ ] Seed master data và `pnpm demo:scenarios` tạo các scenario ổn định.
- [ ] Provider smoke với Supabase test bucket/Mailpit; core tests tiếp tục dùng fake adapter.
- [ ] Benchmark query/index ở seed scale; không thêm index theo cảm tính.
- [ ] Clean clone rehearsal, migration/seed, full `pnpm verify`, demo Compose và hosted smoke nếu cần.
- [ ] Backup/restore rehearsal; kiểm tra release/rollback runbook.
- [ ] Chụp ERD/architecture/demo evidence và hoàn thiện README/script video nếu phục vụ báo cáo.

**Test bắt buộc**

- [ ] Admin-only settings/employee/audit mutation/read; employee chỉ thấy customer safe projection.
- [ ] Disable/suspend revoke access ngay nhưng không sửa lịch sử Order/AfterSales.
- [ ] Settings optimistic version conflict; bank snapshot cũ không đổi theo settings mới.
- [ ] Job chạy lại không nhân side effect; proof-vs-expiry race vẫn pass.
- [ ] SMTP fail không rollback business commit; log không lộ email body nhạy cảm/token.
- [ ] Browser smoke cho catalog → cart → checkout → proof/review → fulfillment → completed order.

**Hoàn thành khi:** full P0 acceptance, demo rehearsal và release checklist đều qua; không còn known blocker.

Nguồn: [Employee/settings/audit API](docs/api/employee-settings-audit-endpoints.md), [System data](docs/data-model/system.md), [Background jobs](docs/architecture/background-jobs.md), [Notifications](docs/architecture/notifications.md), [Observability](docs/architecture/observability.md), [Seed/demo](docs/planning/seed-and-demo-scenarios.md), [Runbook](docs/operations/local-development-and-deployment.md).

## 7. Data flow, transaction và failure handling

### 7.1 Request flow chuẩn

1. Nhận hoặc sinh `X-Request-Id` và đưa vào log/response.
2. Parse authentication nếu endpoint cần danh tính; kiểm tra JWT, session và account status.
3. Chạy role guard, ownership và use-case policy.
4. Transform/validate DTO với whitelist và reject field không mong đợi.
5. Application use case thực hiện read/write và transaction cần thiết.
6. Serializer tạo public/backoffice DTO; Prisma `Decimal` và model không đi thẳng ra JSON.
7. Exception filter map lỗi sang stable error catalog, không trả SQL/stack trace.
8. Sau commit mới gửi email hoặc thực hiện side effect không cần nằm trong transaction.

### 7.2 Transaction baseline

- Dùng Prisma interactive transaction `Serializable` cho checkout, reservation terminal commands, voucher usage, payment/refund projection, fulfillment finalization và inspection completion.
- Timeout transaction 5 giây; max wait lấy connection 2 giây.
- Retry toàn bộ callback tối đa ba lần thực thi; backoff `25 ms`, `75 ms` cộng jitter `0..25 ms`.
- Chỉ retry serialization/deadlock/P2034 tương đương; không retry validation, permission hay business conflict.
- Hết retry trả `409 CONCURRENT_MODIFICATION` và log request ID/use case/attempt, không log input nhạy cảm.
- Repository tham gia cùng command phải nhận cùng transaction client; không mở nested independent transaction.

### 7.3 External side effects

- Storage upload/validation xảy ra trước metadata transaction; object chưa được reference không có giá trị nghiệp vụ và được cleanup thủ công/P1.
- Không gọi Supabase, SMTP, SePay hoặc carrier trong database transaction.
- Email chạy sau commit; thất bại được log/trả delivery status phù hợp nhưng không rollback nghiệp vụ.
- Signed URL private chỉ sinh sau authorization, TTL 300 giây và không persist vào database.

### 7.4 Error/failure policy

- Invalid transition: domain conflict, không có partial write.
- Constraint/concurrent conflict: map sang stable error code phù hợp, không lộ constraint name.
- Provider storage fail trước metadata commit: use case fail rõ ràng, không tạo business reference.
- SMTP fail sau commit: business state giữ nguyên, hỗ trợ resend/manual recovery theo contract.
- Database down: readiness 503 và mutation dừng; liveness vẫn phản ánh process.
- Scheduler/job retry: handler idempotent, batch bounded và không dùng `sleep`/in-memory truth để bảo vệ invariant.

Nguồn: [Transaction/concurrency](docs/architecture/transaction-and-concurrency.md), [Response contract](docs/api/response-contract.md), [Error catalog](docs/api/error-catalog.md), [Security threat model](docs/architecture/security-threat-model.md).

## 8. API, OpenAPI và typed client

- Base path `/api/v1`; tách shared auth/account, storefront và backoffice namespace.
- Resource CRUD chỉ dùng nơi phù hợp; transition dùng named command, không nhận generic status patch.
- Single resource/command và collection/error tuân thủ envelope chung.
- Money trả digit string; time trả ISO-8601 UTC; enum dùng stable uppercase values.
- Mỗi operation có operationId duy nhất, auth/actor, request/response DTO, success status và stable error codes.
- OpenAPI sinh từ Nest metadata thành artifact; generated client là output build có drift check.
- Web request đi qua một client runtime xử lý base URL, access token memory, refresh và normalized error; không rải raw `fetch`.
- Endpoint mới chỉ thêm khi có actor/use case P0, module owner, contract và test; không expose direct mutation cho Session, Token, Reservation, StockMovement, VoucherUsage, Warranty issuance hoặc AuditLog.

Nguồn: [REST conventions](docs/api/readme.md), [Route namespaces](docs/api/route-namespaces.md), [Endpoint inventory](docs/api/endpoint-inventory.md), [OpenAPI/client](docs/api/openapi-and-client.md).

## 9. Kế hoạch kiểm thử và quality gates

### 9.1 Test layers

| Layer | Công cụ | Phạm vi | Thời điểm |
|---|---|---|---|
| Unit | Vitest | Policy, pricing, voucher, state machine, serializer, config | Mỗi slice |
| Integration | Vitest + PostgreSQL 18 | Prisma, SQL constraint/index, migration, transaction | Mỗi slice có DB write |
| API e2e | Vitest + Supertest | HTTP contract, auth, permission, vertical flow | Mỗi endpoint group |
| Contract | OpenAPI generation/validation | operationId, route coverage, client drift | Mỗi slice + CI |
| Browser smoke | Playwright | Critical demo happy path | Tuần 4 |

### 9.2 Concurrency suite bắt buộc

- [ ] Hai checkout cùng InventoryUnit: đúng một order/reservation thành công.
- [ ] N checkout phụ kiện cuối tồn: reserved không vượt onHand.
- [ ] N checkout voucher quota cuối: usage không vượt total/per-customer limit.
- [ ] Hai review cùng Payment: chỉ một terminal transition/audit/projection effect.
- [ ] Submit proof cạnh tranh expiry: UNDER_REVIEW giữ reservation hoặc EXPIRED/CANCELLED release; không trạng thái lai.
- [ ] Complete fulfillment replay: một movement/payment/warranty effect.
- [ ] Hai refresh đồng thời: không tạo hai session chain hợp lệ.

### 9.3 Security/permission suite tối thiểu

- [ ] CUSTOMER/GUEST không vào backoffice; EMPLOYEE không quản lý voucher/settings/employee/cost.
- [ ] Ownership isolation cho address, cart, order, warranty, after-sales và private evidence.
- [ ] Access request sau logout/disable/suspend/change-password bị từ chối.
- [ ] Token/password/raw identifier/private object path không có trong log/DTO.
- [ ] MIME spoof, oversize, SVG/executable và unauthorized signed URL bị từ chối.
- [ ] Auth/checkout/order lookup/upload rate limit đúng baseline.

### 9.4 CI gate

```text
frozen install
  → format:check
  → lint (0 warning)
  → typecheck
  → unit
  → migration-from-zero
  → integration/e2e/concurrency
  → OpenAPI/client drift
  → build
```

- Global API coverage tối thiểu 75% statements/branches cho code tự viết.
- Critical policy/pricing/state/transaction service đạt 90% branch hoặc có acceptance case giải thích ngoại lệ.
- Không retry test flaky tự động; sửa clock, barrier, fixture hoặc isolation để deterministic.

Nguồn: [Testing strategy](docs/quality/testing-strategy.md), [Traceability matrix](docs/quality/requirements-traceability.md), [Documentation audit](docs/quality/documentation-consistency-audit.md).

## 10. Seed, demo flow và checkpoint tuần

### 10.1 Seed/scenario bắt buộc

- Idempotent master data: StoreSettings, STORE/WAREHOUSE, ADMIN/EMPLOYEE/CUSTOMER, address, warranty policies.
- Catalog demo: iPhone 13/14 Pro/15 Pro Max và ba accessory groups theo tài liệu seed.
- Inventory: 5 AVAILABLE, 1 RECEIVED, 1 REPAIRING/PARTIAL, 1 SOLD; accessory StockLevel có receipt movement.
- Voucher: `WELCOME100`, `IPHONE5`, một DRAFT và một PAUSED.
- Scenario: `pickup-ready`, `shipping-awaiting-proof`, `shipping-under-review`, `shipping-in-transit`, `refund-processing`, `after-sales-inspecting`.
- Scenario phức tạp phải đi qua application command, không gán thẳng terminal status.

### 10.2 Checkpoint

| Mốc | Demo bắt buộc | Gate |
|---|---|---|
| Cuối tuần 1 | Setup → migrate/seed → login → browse catalog | Foundation/auth/catalog tests + build |
| Cuối tuần 2 | Intake/inspection máy → cart/voucher → pickup/shipping checkout | Inventory/checkout concurrency suite |
| Cuối tuần 3 | Proof/review → pickup hoặc shipping → refund → warranty case | Full lifecycle API e2e |
| Cuối tuần 4 | Full UI rehearsal 12–15 phút + audit/health | `pnpm verify`, clean clone, release checklist |

### 10.3 Demo 12–15 phút

1. Public filter catalog và mở exact used iPhone.
2. Guest thêm iPhone + accessory, áp voucher, preview và checkout shipping.
3. Guest upload proof; employee review và verify.
4. Employee prepare, create tracking, handover và mark delivered/COD.
5. Customer/guest xem Order COMPLETED và Warranty.
6. Mở seeded after-sales case và thực hiện decision/resolution.
7. Nếu còn thời gian, cho xem AuditLog, inventory movement, settings version và concurrency report.

Nguồn: [Seed/demo scenarios](docs/planning/seed-and-demo-scenarios.md), [Implementation roadmap](docs/planning/implementation-roadmap.md).

## 11. Deployment, rollback và chính sách cắt scope

### 11.1 Local và demo topology

- Development: web/API trên host; PostgreSQL/Mailpit trong Compose.
- Test: PostgreSQL riêng port 5433/database `rephone_test`; scheduler disabled.
- Demo profile: containerized web/API, migration deploy trước API start.
- Hosted demo tùy chọn: HTTPS proxy/platform, một API instance, private PostgreSQL, Supabase Storage và SMTP.

### 11.2 Release order

1. Clean checkout: frozen install và full `pnpm verify`.
2. Backup hiện tại; xác nhận `DIRECT_URL` đúng target.
3. Chạy migration trên database rỗng và staging backup copy.
4. Deploy migration một lần, sau đó API rồi Web.
5. Smoke live/ready, login, catalog, checkout, mail và storage.
6. Kiểm tra scheduler chỉ một instance và log không lộ secret.
7. Ghi release/commit SHA và migration đã chạy.

### 11.3 Rollback

- Code-only failure: rollback image/commit nếu schema vẫn backward-compatible.
- Không tự chạy down migration.
- Data/destructive migration failure: restore backup vào database mới, xác minh health/invariant rồi mới đổi connection.
- Storage/SMTP down: core readiness vẫn đúng theo policy; use case provider trả/log lỗi rõ.
- Suspected secret leak: rotate credential/key, revoke session/token; identifier key rotation phải giữ version cũ để đọc dữ liệu lịch sử.

### 11.4 Cắt scope khi trễ

Cắt theo thứ tự:

1. Animation, visual polish và browser automation rộng.
2. Email template phụ, SEO và dashboard statistic.
3. Backoffice CRUD tiện ích không nằm trong live demo.
4. Accessory warranty UI; giữ API/data đúng.
5. Hosted demo nếu local rehearsal đáp ứng tiêu chí đồ án.

Không cắt:

- Auth, ownership, RBAC và secret handling.
- Inspection/availability và identifier protection.
- Atomic checkout/reservation/voucher/payment/fulfillment/refund.
- Migration-from-zero, critical concurrency/security tests và OpenAPI drift gate.
- Clean seed/demo và invariant validation.

Nguồn: [Local/deployment runbook](docs/operations/local-development-and-deployment.md), [Roadmap scope cuts](docs/planning/implementation-roadmap.md#8-cắt-scope-khi-thiếu-thời-gian).

## 12. Nghiệm thu P0 cuối cùng

- [ ] Toàn bộ nhóm use case trong endpoint inventory có implementation và OpenAPI contract.
- [ ] 28 Prisma model, relation, constraint và index baseline đúng data dictionary.
- [ ] Migration từ database rỗng, seed hai lần và demo scenario đều thành công.
- [ ] Unit/integration/API e2e/concurrency/security suites bắt buộc chạy xanh.
- [ ] Customer/guest/staff/admin không có known permission hoặc ownership bypass.
- [ ] Money/inventory/voucher/warranty projection được kiểm tra sau terminal flow.
- [ ] Không có secret, raw identifier, token hash, ciphertext hoặc private path trong git/log/public DTO.
- [ ] OpenAPI, generated client, code, test và docs không drift.
- [ ] Local setup/runbook chạy từ clean clone; backup/restore rehearsal hoàn tất.
- [ ] Demo 12–15 phút chạy ổn định; buffer cuối chỉ còn sửa blocker.
- [ ] Relative Markdown links trong tài liệu hiện hành hợp lệ; `docs/decisions` không thay đổi.

## 13. Assumptions và decision log

### 13.1 Assumptions

- Một developer chính làm toàn thời gian trong bốn tuần.
- Repository bắt đầu từ bộ tài liệu, chưa có application code cần migration tương thích ngược.
- Baseline version trong toolchain document được pin cho tháng triển khai; không tự nâng major.
- Một cửa hàng và một kho là hai location logic; mỗi order chỉ lấy từ một location.
- Hosted deployment không bắt buộc; local/demo Compose là acceptance P0.
- Supabase/SMTP credential thật có thể cấp muộn; fake adapters không cản core implementation/test.
- Detailed UI/UX chưa khóa; frontend chỉ cần rõ ràng, responsive cơ bản và đủ luồng demo.

### 13.2 Decision log

| Quyết định | Phương án đã loại | Lý do |
|---|---|---|
| Vertical slice theo dependency | Schema/API breadth-first; demo-flow-first | Mỗi tuần có flow chạy được, test invariant sớm và giảm contract drift |
| Modular monolith | Microservice | Phù hợp một developer/một tháng và boundary vẫn rõ |
| PostgreSQL là concurrency truth | Redis lock/in-memory lock | Giữ correctness đơn giản, test được và không thêm hạ tầng P0 |
| REST + OpenAPI generated client | Shared DTO package/manual fetch | Tránh web phụ thuộc implementation và phát hiện contract drift |
| Access memory + refresh HttpOnly cookie | LocalStorage token | Giảm token exposure và hỗ trợ revoke/rotation |
| Backend-mediated upload | Browser direct upload | Giữ role/ownership/magic-byte policy trong một trust boundary |
| External side effect sau commit | Provider call trong transaction | Transaction ngắn và provider fail không làm lệch database state |
| UI demo tối thiểu | Full design system | Dành thời gian cho P0 invariant, test và end-to-end completion |
| Manual deposit/shipping/refund | SePay/carrier automation | Đúng scope P0 và không phụ thuộc provider ngoài |
| Một API replica có scheduler | Distributed scheduler/queue | Đủ cho demo; handler vẫn idempotent để nâng cấp sau |

## 14. Tài liệu điều hướng chính

- [Docs index và source precedence](docs/readme.md)
- [Implementation roadmap](docs/planning/implementation-roadmap.md)
- [Requirements traceability](docs/quality/requirements-traceability.md)
- [Endpoint inventory](docs/api/endpoint-inventory.md)
- [Testing strategy](docs/quality/testing-strategy.md)
- [Database implementation](docs/architecture/database-implementation.md)
- [State machines](docs/architecture/state-machines.md)
- [Transaction/concurrency](docs/architecture/transaction-and-concurrency.md)
- [Security threat model](docs/architecture/security-threat-model.md)
- [Seed/demo scenarios](docs/planning/seed-and-demo-scenarios.md)
- [Local/deployment runbook](docs/operations/local-development-and-deployment.md)
