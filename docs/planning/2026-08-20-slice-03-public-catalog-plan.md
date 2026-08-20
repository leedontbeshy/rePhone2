# Kế hoạch triển khai Slice 03 — Public Catalog

> Trạng thái: Đã xác nhận thiết kế ngày 2026-08-20  
> Phạm vi: Slice 03 trong [`plan.md`](../../plan.md)  
> Nguồn sự thật: contract trong `docs`; tài liệu này chỉ tổng hợp thiết kế, thứ tự triển khai và tiêu chí bàn giao.  
> Không sửa hoặc thay thế quyết định trong `docs/decisions`.

## 1. Mục tiêu và kết quả bàn giao

Slice 03 cung cấp public catalog đọc trực tiếp từ PostgreSQL seed, gồm:

1. Danh sách product nhóm theo product, có search, filter, sort và offset pagination ổn định.
2. Product detail với active variants và offer phù hợp cho iPhone/phụ kiện.
3. Chi tiết chính xác một iPhone vật lý bằng `slug` + `inventoryCode`.
4. Public projection không lộ giá vốn, raw identifier, ciphertext/HMAC, location ID, inspector hoặc ghi chú nội bộ.
5. OpenAPI và typed client khớp ba endpoint public.
6. Storefront UI tối thiểu cho catalog, product detail và used-iPhone unit detail.
7. Catalog seed/demo idempotent, demo media hợp lệ và smoke test được trên Supabase.

Definition of Done cấp slice:

- Ba endpoint public đúng contract và đọc được từ database seed.
- Visibility/availability, grouped result, price projection, filter và pagination có integration/E2E test.
- Public DTO snapshot không có field nội bộ/nhạy cảm.
- OpenAPI/client generate deterministic; API client và web production build thành công.
- `pnpm verify` xanh; seed chạy hai lần; Supabase API/UI smoke qua.

Nguồn: [Public catalog endpoints](../api/public-catalog-endpoints.md), [Catalog model](../architecture/catalog-inventory-model.md), [Roadmap](implementation-roadmap.md), [Traceability matrix](../quality/requirements-traceability.md).

## 2. Phạm vi P0 và deferred

### 2.1 Trong Slice 03

- `GET /api/v1/products`.
- `GET /api/v1/products/:slug`.
- `GET /api/v1/products/:slug/units/:inventoryCode`.
- Product-grouped list; search `ILIKE`; explicit typed filters; stable sorting/pagination.
- Public availability cho serialized iPhone và quantity accessory.
- Price, warranty, media, inspection và masked-identifier projection.
- Catalog demo seed, public media demo assets và Supabase smoke.
- UI `/products`, `/products/[slug]`, `/products/[slug]/units/[inventoryCode]`.

### 2.2 Không thuộc Slice 03

- Backoffice product/variant/media CRUD, publish/archive commands.
- iPhone intake, inspection mutation, lifecycle transition, identifier reveal.
- Accessory receipt/transfer/adjust/return và stock movement commands.
- Cart/wishlist/voucher/checkout CTA hoạt động.
- Generic filter language, multi-value filter hoặc relevance ranking.
- `pg_trgm`, Elasticsearch/Meilisearch, Redis/cache, queue hoặc materialized view mặc định.
- SEO nâng cao, animation, design system đầy đủ, product review/recommendation.
- Multi-store/multi-warehouse allocation.

Các mutation catalog/inventory và lifecycle demo phức tạp được giữ cho Slice 04; cart CTA được nối ở Slice 05.

Nguồn: [Product vision/scope](../requirements/product-vision-and-scope.md), [Endpoint inventory](../api/endpoint-inventory.md), [Backoffice catalog/inventory API](../api/backoffice-catalog-inventory-endpoints.md).

## 3. Hiện trạng và dependency gate

### 3.1 Đã có

- Prisma schema và migration baseline cho `Product`, `ProductVariant`, `ProductMedia`, `InventoryUnit`, `InventoryInspection`, `StockLevel`, `InventoryReservation`, `InventoryLocation`.
- Baseline index/constraint cho catalog, unit lifecycle, current inspection, stock quantity, media owner XOR và active reservation.
- Global validation, response envelope, exception filter, request ID, logging, Prisma module và OpenAPI/client pipeline từ Slice 01.
- Auth/account và web auth foundation từ Slice 02; ba endpoint catalog vẫn là public và không phụ thuộc session.
- Seed identity, store settings, STORE/WAREHOUSE và warranty policy.

### 3.2 Còn thiếu

- Chưa có `CatalogModule`, public catalog controller/use case/repository/presenter.
- Chưa có catalog/inventory/media seed phục vụ public browse.
- Chưa có public media URL builder hoặc Supabase demo-asset upload script.
- Chưa có catalog OpenAPI paths/client types/UI/tests.

### 3.3 Gate trước khi code

- Slice 02 phải đã merge hoặc nhánh Slice 03 phải chứa toàn bộ foundation mới nhất và có `pnpm verify` xanh.
- Tạo nhánh `feat/slice-03-public-catalog` từ `main` đã cập nhật; không tiếp tục commit Slice 03 trên nhánh Slice 02.
- Xác nhận test PostgreSQL chạy và Supabase target chỉ dùng ở bước deploy/smoke cuối.
- Không tạo migration/index mới chỉ vì query dự kiến; benchmark baseline trước.

Nguồn: [Toolchain](../development/toolchain-and-monorepo.md), [Database implementation](../architecture/database-implementation.md), [Testing strategy](../quality/testing-strategy.md).

## 4. Assumptions và non-functional requirements

### 4.1 Assumptions đã xác nhận

- P0 là modular monolith, một store logic + một warehouse logic và một người phát triển chính.
- Quy mô mục tiêu 20–50 người dùng đồng thời, dữ liệu tối đa vài chục nghìn record liên quan.
- API catalog hướng tới p95 dưới 500 ms trong môi trường demo hợp lý; đây không phải production SLA.
- PostgreSQL là nguồn search/availability duy nhất; không có search index ngoài database.
- Schema/index baseline đủ để bắt đầu; migration chỉ được tạo khi benchmark hoặc contract chứng minh cần.
- Accessory active variant vẫn có thể hiển thị giá khi hết hàng; `inStock=false` phản ánh stock thực tế.
- iPhone không có public unit thì product vẫn có thể xuất hiện nhưng `fromPrice=null`, `inStock=false`.
- UI tối thiểu thuộc Slice 03; visual polish/design system đầy đủ deferred.
- Public media lấy từ Supabase public bucket; lỗi URL/metadata làm omit media và ghi log an toàn.

### 4.2 Quality attributes

- **Security/privacy:** public serializer dùng allow-list; không đọc/decrypt identifier; không trả storage object path.
- **Consistency:** list count và data dùng chung predicate và cùng một SQL statement/snapshot.
- **Performance:** server-side pagination; không materialize toàn catalog trong Node.js; đo query plan trước khi thêm index.
- **Reliability:** page vượt range trả `200` + empty array; media lỗi không làm hỏng product response; database lỗi dùng global error envelope.
- **Maintenance:** controller mỏng; repository cô lập SQL; row mapping được runtime-validate; generated artifact không sửa tay.
- **Accessibility:** semantic heading/form label/alt text/focus state và responsive cơ bản cho UI demo.

Nguồn: [Non-functional requirements](../requirements/non-functional-requirements.md), [Response contract](../api/response-contract.md), [Filtering/search](../api/filtering-and-search.md), [Pagination](../api/pagination.md).

## 5. Decision log

| ID | Quyết định | Phương án đã cân nhắc | Lý do chọn |
|---|---|---|---|
| D-01 | Slice 03 bao gồm UI storefront tối thiểu | Chỉ backend/OpenAPI rồi để UI tuần 4 | Có vertical slice demo end-to-end và phát hiện contract/client drift sớm. |
| D-02 | SQL-first public read repository | Prisma relation query + aggregate trong Node; database view/materialized view | Grouping, `fromPrice`, count và stable pagination chính xác mà không thêm read-model lifecycle. |
| D-03 | `CatalogModule` sở hữu HTTP/read orchestration | Đặt controller trong Inventory; một module chung CatalogInventory | Catalog là public use case chủ; Inventory vẫn sở hữu mọi mutation/invariant. |
| D-04 | Read repository được join read-only qua Catalog/Inventory/Media tables | Cross-module service chain cho từng relation | Public projection là cross-domain read model; một query tránh N+1 nhưng không cấp quyền ghi chéo module. |
| D-05 | List count/data dùng một parameterized SQL statement với shared CTE | Hai Prisma query riêng; transaction `REPEATABLE READ` | Loại drift predicate/snapshot và giữ page aggregation ở database. |
| D-06 | Accessory OOS vẫn hiện variant/price; iPhone chỉ hiện exact public unit | Ẩn toàn bộ product OOS; coi mọi priced row là in-stock | Khớp contract product có thể hết hàng và dual inventory model. |
| D-07 | Media URL dựng từ configured public storage metadata | Lưu URL/signed URL trong DB; proxy bytes qua API | Không lưu URL hết hạn/object path trong DTO và để CDN phục vụ ảnh. |
| D-08 | Checklist/identifier projection dùng allow-list phòng thủ | Serialize JSON/Prisma model trực tiếp | Ngăn field nội bộ hoặc schema tương lai vô tình lọt public API. |
| D-09 | Chỉ thêm index/trigram sau benchmark | Bật `pg_trgm` ngay; index mọi filter | Dataset P0 nhỏ và docs yêu cầu evidence trước migration tối ưu. |
| D-10 | Seed Slice 03 chỉ dựng public catalog hợp lệ | Seed đầy đủ SOLD/order/after-sales trước module chủ | Không bypass state machine/use case của slice sau. |

## 6. Kiến trúc và module boundary

```text
HTTP /api/v1/products
        |
        v
CatalogController
        |
        +-- ListPublicProductsQuery
        +-- GetPublicProductDetailQuery
        +-- GetPublicUsedIphoneDetailQuery
                  |
                  v
        PublicCatalogReadRepository
          +-- parameterized SQL/CTE
          +-- read-only joins Catalog/Inventory/Media
                  |
                  v
             PostgreSQL

Use case result
        |
        +-- CatalogPresenter
        +-- PublicMediaUrlBuilder
        +-- WarrantyResolver
        v
Public DTO -> response envelope -> OpenAPI/client -> Next storefront
```

### 6.1 Backend components

- `CatalogModule`: controller và providers của public catalog.
- `CatalogController`: path/query validation, Swagger metadata, gọi query use case.
- `ListPublicProductsQuery`: normalize input và trả `{ items, pagination }`.
- `GetPublicProductDetailQuery`: lookup public product theo slug và dựng variant/offer projection.
- `GetPublicUsedIphoneDetailQuery`: lookup exact public unit theo cả slug + inventory code.
- `PublicCatalogReadRepository`: mọi SQL/Prisma read phức tạp; không có `create/update/delete`.
- `CatalogPresenter`: Money string, optional/null convention, media/checklist/identifier allow-list.
- `PublicMediaUrlBuilder`: chỉ tạo URL cho `PUBLIC` media trong configured public bucket.
- `WarrantyResolver`: variant policy → product policy → store default.
- Runtime row schemas: kiểm tra shape của raw query trước khi đưa sang presenter.

### 6.2 Quy tắc dependency

- `CatalogModule` import `PrismaModule` và config cần cho public media URL.
- Không import `AuthModule`; controller public không gắn Bearer/cookie security.
- Không gọi ngược từ Inventory vào Catalog.
- Không export repository trừ khi slice sau có use case thật cần đọc cùng projection.
- Không dùng `forwardRef`; nếu xuất hiện circular dependency phải sửa boundary.

Nguồn: [Backend modules](../architecture/backend-modules.md), [Catalog model](../architecture/catalog-inventory-model.md), [OpenAPI/client](../api/openapi-and-client.md).

## 7. Public visibility và projection contract

### 7.1 Product/variant

- Product: `status = ACTIVE` và `archivedAt IS NULL`.
- Variant được trả: `status = ACTIVE` và `archivedAt IS NULL`.
- Mỗi list item đại diện đúng một Product dù có nhiều variant/unit.
- `storageOptions`/`colorOptions` lấy từ active variants, unique và sort deterministic; chúng không đại diện availability.

### 7.2 iPhone unit public

Unit chỉ public khi đồng thời:

1. Product và variant active/unarchived.
2. Variant là `SERIALIZED`, product là `IPHONE`.
3. `lifecycleStatus = AVAILABLE`.
4. Location `ACTIVE`.
5. Không tồn tại reservation `ACTIVE` trên unit.
6. `salePrice IS NOT NULL`.
7. Có public unit photo đủ metadata tối thiểu.
8. Có đúng current inspection `COMPLETED`, `overallResult = PASSED`.

Nếu mất bất kỳ gate nào, unit không xuất hiện trong product detail và exact detail trả `RESOURCE_NOT_FOUND`.

### 7.3 Accessory availability

- Product là `ACCESSORY`, variant là `QUANTITY`, variant có sale price.
- `inStock=true` nếu có ít nhất một active location với `quantityOnHand - quantityReserved > 0`.
- Pickup chỉ xét STORE; shipping xét location theo single-location allocation policy hiện hành.
- Không cộng/tung exact stock quantity ra public DTO.

### 7.4 Price semantics

- iPhone `fromPrice`: giá nhỏ nhất trong các public unit.
- Accessory `fromPrice`: giá nhỏ nhất trong active priced variants, kể cả hiện OOS.
- `compareAtPrice` luôn lấy từ cùng offer thắng `fromPrice`.
- Money đọc/cast thành text trước khi rời repository; không chuyển qua floating point.
- Sort `fromPrice` đặt null cuối ở cả hai chiều.

### 7.5 Redaction và fallback

- Không select/serialize acquisition/additional cost, encrypted/HMAC identifier, location ID, inspector, internal checklist metadata hoặc raw object path.
- `maskedIdentifiers` chỉ gồm identifier type và suffix mask.
- `functionalChecks` chỉ gồm registry/schema v1 public-safe.
- Media fallback: unit → variant → product; từng collection sort theo `sortOrder`, sau đó `id`.
- URL không dựng được: omit media item, log metadata an toàn; không trả object path trong error.

Nguồn: [Public catalog endpoints](../api/public-catalog-endpoints.md), [Catalog data dictionary](../data-model/catalog-inventory.md), [Roles/permissions](../requirements/roles-and-permissions.md), [File pipeline](../architecture/file-upload-pipeline.md).

## 8. SQL/query design

### 8.1 Input normalization

- `q`: trim, normalize whitespace, empty thành undefined; max 100.
- Escape `\\`, `%`, `_`; dùng `ILIKE ... ESCAPE '\\'`.
- `releaseYear`, `storageCapacityGb`, `page`, `pageSize`: strict integer và range contract.
- `colorName`: trim, exact case-insensitive; không tự parse multi-value.
- `minPrice/maxPrice`: chuỗi digit-only, parse bằng PostgreSQL numeric/Decimal-safe; reject min > max.
- `inStock`: chỉ literal `true` hoặc `false`.
- Repeated/unknown query parameter bị validation từ chối.
- `sortBy` map qua allowlist constant; không interpolate raw field/expression từ client.

### 8.2 List CTE pipeline

Đề xuất pipeline một statement:

1. `active_products` — public product fields.
2. `active_variants` — public variant fields và options.
3. `public_iphone_units` — exact visibility predicate + unit price.
4. `accessory_offers` — priced variant + pickup/shipping stock flags.
5. `product_rollup` — một row/product, `fromPrice`, paired compare price, inStock, options, cover media.
6. `matching_products` — áp search/filter/range/inStock.
7. `ordered_page` — allowlisted sort + `id` tie-breaker + offset/limit.
8. Final select — trả một row gồm `totalItems` và JSON array page; Money đã cast text.

Repository validate row/result JSON bằng schema trước presenter. Page vượt range vẫn giữ `totalItems` thật và `items=[]`.

### 8.3 Detail queries

- Product detail lookup phải include product visibility trong `WHERE`, không lookup rồi mới branch để tránh enumeration trạng thái.
- iPhone detail lấy active variants và public units; accessory detail lấy active variants kể cả OOS với location availability flags.
- Exact unit detail match `product.slug`, `unit.inventoryCode` và toàn bộ unit visibility trong cùng query.
- Không dùng broad `include` rồi serialize Prisma object; projection select field allow-list ngay từ query.

### 8.4 Performance policy

- Chạy `EXPLAIN (ANALYZE, BUFFERS)` với fixture gần seed-scale và benchmark mở rộng.
- Kiểm tra scan/join trên status/type, productId/status, unit variant/lifecycle/location, current inspection, active reservation, stock location và media owner/sort.
- Chỉ tạo migration B-tree/trigram khi query plan/latency cho thấy baseline không đạt mục tiêu.
- Nếu thêm index: migration additive, có integration test plan và ghi lý do trong commit/plan; không sửa migration baseline đã deploy.

Nguồn: [Filtering/search](../api/filtering-and-search.md), [Pagination](../api/pagination.md), [Database implementation](../architecture/database-implementation.md), [NFR](../requirements/non-functional-requirements.md).

## 9. API, OpenAPI và frontend contract

### 9.1 Operations

| Method/path | operationId | Success | Errors chính |
|---|---|---|---|
| `GET /api/v1/products` | `listProducts` | `200` collection + pagination | `VALIDATION_FAILED`, `INTERNAL_ERROR` |
| `GET /api/v1/products/:slug` | `getProductBySlug` | `200 ProductDetailDto` | `VALIDATION_FAILED`, `RESOURCE_NOT_FOUND`, `INTERNAL_ERROR` |
| `GET /api/v1/products/:slug/units/:inventoryCode` | `getUsedIphoneByInventoryCode` | `200 UsedIphoneDetailDto` | `VALIDATION_FAILED`, `RESOURCE_NOT_FOUND`, `INTERNAL_ERROR` |

OpenAPI phải mô tả explicit query/path parameters, defaults, enum/limits, concrete response envelope và error envelope. Không khai báo Bearer/cookie security cho ba operation.

### 9.2 UI routes

- `/products`: server-rendered initial fetch; URL query string là source of truth; filter đổi thì reset `page=1`.
- `/products/[slug]`: common product info; branch typed projection cho iPhone/accessory.
- `/products/[slug]/units/[inventoryCode]`: exact unit details, public checks, masked identifier, warranty và fulfillment availability.
- Trang chủ thêm entry point vào catalog.
- UI dùng generated API client/types; không định nghĩa DTO song song.
- Back/forward giữ filter; empty/error/loading state an toàn; semantic HTML và responsive cơ bản.
- CTA cart có thể hiển thị disabled/coming-next-slice nhưng không gọi endpoint chưa tồn tại.

Nguồn: [Public catalog endpoints](../api/public-catalog-endpoints.md), [Response contract](../api/response-contract.md), [OpenAPI/client](../api/openapi-and-client.md), [Testing strategy](../quality/testing-strategy.md).

## 10. Kế hoạch task và commit

Mỗi task chỉ bắt đầu khi dependency của nó xanh. Tên commit là đề xuất conventional commit; có thể tách nhỏ hơn nếu diff lớn, nhưng không gộp các concern không liên quan.

### Task 01 — Chốt branch và contract test skeleton

**Dependency:** Slice 02 merged/available; baseline verify xanh.

**Thực hiện**

- Tạo `feat/slice-03-public-catalog` từ main cập nhật.
- Commit tài liệu kế hoạch này.
- Tạo test matrix/skeleton cho list/detail/unit và fixture builder tối thiểu, chưa tạo controller rỗng.
- Ghi expected public field allow-list để dùng cho snapshot chống rò dữ liệu.

**Test/gate:** docs links hợp lệ; test skeleton compile/được skip có lý do ngắn nếu chưa có endpoint.

**DoD:** branch độc lập, scope/acceptance rõ, không có source stub vô nghĩa.

**Commit:** `docs(catalog): record slice 03 implementation plan`

Nguồn: [Roadmap](implementation-roadmap.md), [Traceability](../quality/requirements-traceability.md), [Testing strategy](../quality/testing-strategy.md).

### Task 02 — Public DTO, query validation và presenter policy

**Dependency:** Task 01.

**Thực hiện**

- Tạo list query DTO, slug/inventory-code path DTO và response DTO.
- Implement strict parser/validator cho boolean, money, page, pageSize, enum, range và repeated/unknown query.
- Implement Money/public optional serializer, masked identifier, checklist v1 allow-list, warranty summary và media DTO.
- Unit test tất cả normalization, invalid input và redaction policy.

**Database/migration:** không.

**OpenAPI:** DTO có đầy đủ decorators/type/format/example; chưa cần route artifact.

**DoD:** unit tests xanh; không DTO nào import/extend Prisma model.

**Commit:** `feat(catalog): define public catalog contracts`

Nguồn: [Public catalog API](../api/public-catalog-endpoints.md), [Filtering/search](../api/filtering-and-search.md), [Pagination](../api/pagination.md), [Response contract](../api/response-contract.md).

### Task 03 — Media URL và safe projection helpers

**Dependency:** Task 02.

**Thực hiện**

- Implement `PublicMediaUrlBuilder` từ Supabase URL + configured public bucket.
- Reject/omit media sai visibility/bucket/path/metadata; URL-encode path theo segment.
- Implement deterministic media sorting/fallback.
- Log failure bằng safe identifiers/request context, không log raw object path nếu có thể chứa data nhạy cảm.
- Unit test Unicode/space/path encoding, invalid bucket, missing metadata và fallback.

**Database/migration:** không.

**DoD:** public DTO chỉ chứa URL/alt/dimensions; không chứa bucket/objectPath.

**Commit:** `feat(media): add safe public catalog projections`

Nguồn: [File pipeline](../architecture/file-upload-pipeline.md), [Catalog data](../data-model/catalog-inventory.md), [Security threat model](../architecture/security-threat-model.md).

### Task 04 — Grouped catalog list repository

**Dependency:** Tasks 02–03.

**Thực hiện**

- Implement parameterized list CTE pipeline và runtime row/result schema.
- Implement shared product/unit/accessory visibility fragments.
- Implement search fields `Product.name`, active `Variant.displayName`, public SKU.
- Implement all filters, paired price projection, null-last sorting, tie-breaker, total/page metadata.
- Không fetch/decrypt identifier hoặc cost columns.

**Database/migration:** baseline only; capture query plan, chưa thêm index.

**Test:** PostgreSQL integration cho grouped result, search escaping, filters, range, OOS, reservation, sort/tie, pagination và empty page.

**DoD:** list repository trả đúng result cho fixture matrix; SQL input đều parameterized.

**Commit:** `feat(catalog): implement grouped public product queries`

Nguồn: [Public catalog API](../api/public-catalog-endpoints.md), [Filtering/search](../api/filtering-and-search.md), [Pagination](../api/pagination.md), [Catalog model](../architecture/catalog-inventory-model.md).

### Task 05 — Product detail và exact unit repository

**Dependency:** Task 04.

**Thực hiện**

- Implement product detail theo slug với active variants và correct iPhone/accessory projection.
- Implement exact used-iPhone detail bằng slug + inventory code + complete visibility predicate.
- Implement inspection/checklist, warranty, availability và media fallback mapping.
- Dùng not-found semantics cho non-public/reserved/archived/mismatched slug.

**Database/migration:** không.

**Test:** integration cho unavailable/reserved/DRAFT/ARCHIVED, accessory OOS, fallback media và no-sensitive-field projection.

**DoD:** detail không N+1 không kiểm soát; exact unit mất visibility trả null/not-found result từ repository.

**Commit:** `feat(catalog): add product and used iphone detail queries`

Nguồn: [Public catalog API](../api/public-catalog-endpoints.md), [Catalog data](../data-model/catalog-inventory.md), [Roles/permissions](../requirements/roles-and-permissions.md).

### Task 06 — CatalogModule, controller và error mapping

**Dependency:** Tasks 02–05.

**Thực hiện**

- Wire `CatalogModule` vào `AppModule`.
- Implement ba query use case và controller routes.
- Map repository not-found sang `RESOURCE_NOT_FOUND`; validation dùng global contract.
- Bảo đảm collection envelope có pagination và không double-wrap.
- Thêm request-scoped logging cần thiết cho projection/media failure.

**Test:** API E2E success/validation/404/envelope; public access không token.

**DoD:** ba route hoạt động trên test database, controller không chứa SQL/business predicate.

**Commit:** `feat(api): expose public catalog endpoints`

Nguồn: [Endpoint inventory](../api/endpoint-inventory.md), [Response contract](../api/response-contract.md), [Error catalog](../api/error-catalog.md), [Backend modules](../architecture/backend-modules.md).

### Task 07 — Catalog seed và deterministic fixtures

**Dependency:** Task 05; có thể làm song song Task 06 sau khi row contract ổn định.

**Thực hiện**

- Mở rộng seed với catalog tối thiểu trong seed scenario contract.
- Upsert theo stable slug/SKU/inventoryCode/objectPath; seed hai lần không nhân record/inspection/media/stock.
- Tạo available iPhone với fake identifier được normalize, AES-256-GCM/HMAC và suffix; không commit plaintext thật.
- Seed current PASSED inspection/checklist v1, unit media metadata và accessory stock.
- Seed negative visibility cases dùng cho demo/test nhưng không tạo order/SOLD/after-sales trước module chủ.
- Tách fixture builder test khỏi production/demo seed để tránh global fixture ngầm.

**Database/migration:** không nếu baseline đủ.

**Test:** seed from-zero + seed twice; assert mọi AVAILABLE unit thỏa gate và stock invariant.

**DoD:** API list/detail/unit trả dữ liệu demo sau seed; production seed không tạo demo catalog.

**Commit:** `feat(seed): add public catalog demo data`

Nguồn: [Seed/demo scenarios](seed-and-demo-scenarios.md), [Catalog data](../data-model/catalog-inventory.md), [Testing strategy](../quality/testing-strategy.md).

### Task 08 — Demo assets và Supabase public bucket

**Dependency:** Task 07.

**Thực hiện**

- Chuẩn bị bộ ảnh demo hợp lệ, dung lượng nhỏ, có provenance/license rõ; không dùng ảnh chứa dữ liệu nhạy cảm.
- Tạo script upload idempotent tới exact configured public bucket/path với `upsert=false` hoặc checksum-safe replay.
- Script không xóa object ngoài prefix demo đã xác định và không log service-role key.
- Xác nhận public URL trả ảnh đúng MIME; seed metadata khớp file size/dimensions.
- Fake/test adapter không phụ thuộc internet.

**Test:** unit adapter/path policy; manual/provider smoke ở Supabase.

**DoD:** mọi seeded public media URL hợp lệ hoặc có fallback rõ; script replay an toàn.

**Commit:** `feat(storage): add catalog demo asset workflow`

Nguồn: [File pipeline](../architecture/file-upload-pipeline.md), [Seed/demo scenarios](seed-and-demo-scenarios.md), [Security threat model](../architecture/security-threat-model.md), [Deployment runbook](../operations/local-development-and-deployment.md).

### Task 09 — OpenAPI và typed client

**Dependency:** Task 06.

**Thực hiện**

- Hoàn thiện operationId, tags, parameters, success/error envelopes và public security metadata.
- Generate deterministic `apps/api/openapi/openapi.json`.
- Generate `packages/api-client/src/schema.d.ts` và build client.
- Thêm contract smoke cho route coverage/operationId uniqueness và Money string.

**Test/gate:** artifact generation không để diff sau lần generate thứ hai; API client tests/typecheck xanh.

**DoD:** web có typed operations cho cả ba endpoint, không dùng handwritten response interface.

**Commit:** `feat(openapi): publish public catalog contracts`

Nguồn: [OpenAPI/client](../api/openapi-and-client.md), [Public catalog API](../api/public-catalog-endpoints.md), [Response contract](../api/response-contract.md).

### Task 10 — Storefront catalog UI

**Dependency:** Task 09 và seeded/fake API fixture.

**Thực hiện**

- Implement `/products` với URL-driven search/filter/sort/page và product cards.
- Implement product detail, iPhone available-unit cards và accessory availability.
- Implement exact used-iPhone detail với media, pin, condition, repair, checks, masked identifier, warranty và fulfillment flags.
- Thêm entry point từ homepage; giữ auth provider không ảnh hưởng public fetch.
- Thêm empty/error states, semantic labels/headings, keyboard focus và responsive layout cơ bản.
- Không tạo business availability logic hoặc DTO bản sao ở web.

**Test:** URL/query mapping, typed rendering, empty/error state; web typecheck/lint/build; browser smoke ba route.

**DoD:** clean browser có thể browse list → product → exact unit; back/forward/filter hoạt động.

**Commit:** `feat(web): add public catalog storefront`

Nguồn: [Public catalog API](../api/public-catalog-endpoints.md), [OpenAPI/client](../api/openapi-and-client.md), [NFR](../requirements/non-functional-requirements.md).

### Task 11 — Security, performance và regression hardening

**Dependency:** Tasks 04–10.

**Thực hiện**

- Chạy projection snapshot/forbidden-key scan trên mọi response shape.
- Benchmark list/detail bằng expanded fixture; lưu summary query plan trong test/report.
- Nếu cần index, tạo additive migration mới + integration test; không sửa baseline migration.
- Kiểm tra SQL injection/wildcard escape, query abuse, page overflow, null sorting và media failure.
- Kiểm tra N+1/query count ở detail và log redaction.

**Test/gate:** unit → integration → E2E → contract → web; critical catalog branch coverage đạt strategy hoặc có giải thích.

**DoD:** không known visibility/redaction blocker; p95 demo target hợp lý; migration decision có evidence.

**Commit:** `test(catalog): harden public projection and query performance`  
Nếu cần migration: `perf(db): index public catalog queries`

Nguồn: [Testing strategy](../quality/testing-strategy.md), [NFR](../requirements/non-functional-requirements.md), [Security threat model](../architecture/security-threat-model.md).

### Task 12 — Deploy, smoke và bàn giao

**Dependency:** tất cả task trước.

**Thực hiện**

- Chạy `pnpm verify` trên working tree sạch.
- Deploy migration additive nếu có; migration no-op là hợp lệ nếu baseline đủ.
- Upload demo assets vào đúng Supabase project/bucket rồi chạy demo seed với env tạm thời an toàn.
- Chạy seed lần hai và đối chiếu count/stable keys.
- Smoke API list/filter/detail/unit, media URL và UI navigation.
- Kiểm tra Git clean; push từng conventional commit; mở PR với test/deploy evidence.

**DoD:** Supabase có catalog tables/data/media đúng target; ba endpoint/UI smoke qua; branch đồng bộ remote.

**Commit:** không tạo “misc/final dump”; chỉ commit artifact/fix thật phát sinh theo concern.

Nguồn: [Deployment runbook](../operations/local-development-and-deployment.md), [Testing strategy](../quality/testing-strategy.md), [Roadmap](implementation-roadmap.md).

## 11. Test matrix bắt buộc

| Nhóm | Case chính | Layer |
|---|---|---|
| Product visibility | DRAFT/ARCHIVED không xuất hiện; ACTIVE OOS vẫn list | Integration + E2E |
| Grouping | N variant/unit vẫn đúng một card/product | Integration |
| iPhone visibility | AVAILABLE + price + unit photo + current PASSED + active location + no reservation | Integration |
| Negative unit | RESERVED/non-AVAILABLE/no photo/no price/no PASSED/inactive location không public | Integration + E2E |
| Accessory stock | `onHand-reserved`; pickup STORE; shipping policy; không lộ exact quantity | Integration + snapshot |
| Search | case-insensitive; whitespace normalize; `%/_/\\` escaped; field allow-list | Unit + Integration |
| Filters | type/year/storage/color/price/inStock kết hợp AND | Integration + E2E |
| Money | string VND; paired compare price; large value không float | Unit + Contract |
| Sorting | allowlist; id tie-breaker; null-last cả asc/desc | Integration |
| Pagination | defaults, 0/101 invalid, last/empty/out-of-range, totalPages | Unit + Integration + E2E |
| Product detail | only active variants/public offers; accessory OOS projection | Integration + E2E |
| Exact unit | slug+code match; mất visibility/mismatched slug → 404 | Integration + E2E |
| Media | public bucket only; sort/fallback; invalid URL omit/log | Unit + Integration |
| Inspection | checklist v1 allow-list; no raw/internal metadata | Unit + snapshot |
| Identifier/security | suffix mask only; forbidden keys absent recursively | Unit + E2E snapshot |
| OpenAPI/client | three routes, unique operationIds, typed schemas | Contract + build |
| UI | list→product→unit; filters/back-forward; empty/error | Web test + browser smoke |
| Seed | from-zero, replay idempotent, AVAILABLE/stock invariant | Integration + Supabase smoke |
| Performance | query plan/latency at expanded fixture scale | Manual/pre-PR benchmark |

## 12. Failure handling và security checklist

- Query/path invalid trả `VALIDATION_FAILED`; không để raw Zod/Prisma/PostgreSQL error ra ngoài.
- Slug/code không public trả `RESOURCE_NOT_FOUND`; không tiết lộ trạng thái inventory/reservation.
- Chỉ interpolate SQL fragment từ internal allowlist; mọi client value parameterized.
- Search escape wildcard và giới hạn length/page/pageSize trước database.
- Repository không select cost, ciphertext, HMAC, location ID hoặc inspector nếu response không cần.
- Presenter có recursive forbidden-key test cho mọi public DTO.
- Media URL failure không chứa bucket/path trong response/log nhạy cảm và không fail toàn product.
- Không log query body chứa search data ở level không cần thiết; request ID vẫn xuyên suốt.
- Public endpoint không yêu cầu auth nhưng vẫn chịu request/body/query limits và reverse-proxy rate protection khi hosted.
- Không cache contract ở P0; checkout slice sau luôn xác nhận lại availability.
- Database unavailable đi qua global error mapping; readiness phản ánh DB riêng.

Nguồn: [Security threat model](../architecture/security-threat-model.md), [Response contract](../api/response-contract.md), [Observability](../architecture/observability.md).

## 13. Quality gates và checkpoint

### Checkpoint A — Query foundation

- DTO/presenter/media policies unit-test xanh.
- Grouped list integration test qua trên PostgreSQL thật.
- Không migration tối ưu thiếu benchmark.

### Checkpoint B — API contract

- List/detail/unit E2E xanh.
- Visibility và redaction matrix đủ.
- OpenAPI/client generate deterministic.

### Checkpoint C — Demo storefront

- Seed hai lần thành công.
- UI list→product→unit hoạt động với typed client.
- Public media/fallback hiển thị đúng.

### Final gate

- Format và lint 0 warning.
- Typecheck toàn monorepo.
- API/client/web unit tests.
- Migration-from-zero và seed replay.
- PostgreSQL integration + API E2E.
- OpenAPI/client drift check.
- API/client/web production build.
- `pnpm verify` xanh.
- Supabase data/media/API/UI smoke xanh.
- Git working tree sạch, commits tách theo concern và remote đồng bộ.

## 14. Deployment và rollback

### 14.1 Deploy order

1. Xác nhận exact Supabase project/database/bucket target bằng read-only check.
2. `prisma migrate deploy`; nếu không có migration mới, ghi nhận baseline no-op.
3. Upload demo assets idempotently vào exact demo prefix.
4. Chạy seed với demo env tạm thời; production không tạo demo catalog.
5. Chạy seed lần hai và đối chiếu stable count/key.
6. Deploy API, smoke health + catalog endpoints.
7. Deploy web, smoke list/detail/unit và media.

### 14.2 Rollback

- API/web: redeploy commit trước của từng service; schema/index additive giữ backward-compatible.
- Index migration có vấn đề: tạo corrective migration drop đúng tên index sau khi xác nhận target; không sửa migration đã apply.
- Demo assets: giữ nguyên nếu vô hại; chỉ xóa exact configured demo prefix bằng script có target guard.
- Seed data không reset production database. Nếu demo data cần ẩn, archive/deactivate exact stable records hoặc dùng corrective script có guard/review.
- Không dùng `prisma migrate reset`, recursive delete hoặc broad bucket cleanup trên Supabase target.

Nguồn: [Deployment runbook](../operations/local-development-and-deployment.md), [Database implementation](../architecture/database-implementation.md), [Seed/demo scenarios](seed-and-demo-scenarios.md).

## 15. Cắt scope khi trễ

Cắt theo thứ tự:

1. Animation, skeleton, visual polish và browser automation rộng.
2. Filter UI nâng cao; vẫn giữ toàn bộ API filter contract và query-string thủ công.
3. Demo catalog mở rộng ngoài bộ tối thiểu.
4. Product SEO metadata/render polish.
5. Optional provider smoke trong CI; giữ manual pre-demo smoke.

Không cắt:

- Public visibility/availability predicate.
- Redaction/cost/identifier/location protection.
- Grouped result, paired price, stable pagination và validation.
- List/detail/unit API, OpenAPI/client và database-backed seed.
- Integration/E2E cho negative visibility và public projection.
- Migration-from-zero, seed replay và full quality gate.

## 16. Nghiệm thu cuối

Kịch bản nghiệm thu:

1. Từ database sạch: migrate, upload demo assets và seed hai lần.
2. Mở `/products`, search `iphone`, filter model/dung lượng/màu/giá/in-stock và đổi sort/page.
3. Xác nhận mỗi product chỉ có một card; OOS/null price hiển thị đúng contract.
4. Mở iPhone product detail, chỉ thấy unit public.
5. Mở exact unit detail, xem ảnh, pin, tình trạng, checks, warranty và identifier đã mask.
6. Dùng direct API/query fixture để chứng minh reserved/non-AVAILABLE/DRAFT/ARCHIVED không lọt và trả 404 phù hợp.
7. Mở accessory detail, xác nhận pickup/shipping theo location nhưng không lộ exact quantity.
8. Kiểm tra network response không chứa forbidden fields.
9. Chạy `pnpm verify` và đối chiếu OpenAPI/client không drift.

Slice 03 chỉ được đánh dấu hoàn tất khi toàn bộ mục không-cắt ở trên đạt và không còn known P0 blocker.

## 17. Nhóm tài liệu nguồn

- [Root implementation plan](../../plan.md)
- [Implementation roadmap](implementation-roadmap.md)
- [Seed/demo scenarios](seed-and-demo-scenarios.md)
- [Public catalog endpoints](../api/public-catalog-endpoints.md)
- [Filtering/search](../api/filtering-and-search.md)
- [Pagination/sorting](../api/pagination.md)
- [Response contract](../api/response-contract.md)
- [OpenAPI/client](../api/openapi-and-client.md)
- [Endpoint inventory](../api/endpoint-inventory.md)
- [Catalog/inventory architecture](../architecture/catalog-inventory-model.md)
- [Backend modules](../architecture/backend-modules.md)
- [File upload pipeline](../architecture/file-upload-pipeline.md)
- [Database implementation](../architecture/database-implementation.md)
- [Security threat model](../architecture/security-threat-model.md)
- [Catalog/inventory data dictionary](../data-model/catalog-inventory.md)
- [Product scope](../requirements/product-vision-and-scope.md)
- [Roles/permissions](../requirements/roles-and-permissions.md)
- [Non-functional requirements](../requirements/non-functional-requirements.md)
- [Testing strategy](../quality/testing-strategy.md)
- [Requirements traceability](../quality/requirements-traceability.md)
- [Local/deployment runbook](../operations/local-development-and-deployment.md)
