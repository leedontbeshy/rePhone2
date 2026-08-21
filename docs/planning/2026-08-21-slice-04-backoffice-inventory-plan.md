# Slice 04 — Backoffice Catalog & Inventory

> Trạng thái: đang triển khai  
> Ngày chốt thiết kế: 2026-08-21  
> Phụ thuộc: Slice 01–03  
> Nguồn sự thật: các contract hiện hành trong [`docs`](../readme.md)

## 1. Mục tiêu và Definition of Done

Triển khai đầy đủ backend P0 cho quản trị catalog, nhập/kiểm định iPhone, quản lý vòng đời unit, media và accessory stock. UI chỉ gồm wizard demo tối thiểu:

`Intake → Upload ảnh unit → Inspection → Complete → Make available → Public detail`

Slice hoàn thành khi:

- Đủ 40 operation backoffice trong OpenAPI và typed client.
- `EMPLOYEE` đưa được một unit từ `RECEIVED` đến `AVAILABLE`; public catalog nhìn thấy ngay sau commit.
- `ADMIN` xem/sửa cost; `EMPLOYEE` không nhận cost trong bất kỳ projection nào.
- Identifier luôn được mã hóa/masked; lookup/reveal yêu cầu reason và audit.
- Inspection, availability, lifecycle, media và stock giữ đúng invariant dưới concurrency.
- Supabase Storage upload qua backend hoạt động; seed chạy hai lần vẫn idempotent.
- `pnpm verify` và Supabase smoke test xanh.

Không thuộc Slice 04: product/stock UI đầy đủ, multi-store editor, repair order/parts, Redis/queue, carrier API, microservice, MFA, generic status patch và design system hoàn chỉnh.

## 2. Kiến trúc đã chốt

- `CatalogModule` giữ nguyên public read-only.
- `BackofficeCatalogModule` sở hữu product/variant write policy và backoffice projection.
- `InventoryModule` sở hữu unit, identifier, cost, inspection, lifecycle, location và accessory stock.
- `MediaModule` sở hữu HTTP media endpoints, byte validation, Supabase adapter và metadata; owner policy do Catalog/Inventory export và được kiểm tra trước upload lẫn trong transaction attach.
- `AuditModule` cung cấp append-only `AuditWriter`; Audit read API để Slice 12.
- Common layer cung cấp role guard, actor/request context, actor rate limiter và Serializable transaction runner.
- Dependency một chiều, không dùng `forwardRef`; PostgreSQL là source of truth, không projection/queue/cache đồng bộ.

Luồng command chuẩn:

```text
Controller
  → DTO validation + SessionGuard + RolesGuard + actor rate limit
  → Application use case
  → Domain policy
  → Serializable transaction
  → Repository + AuditWriter
  → Response DTO
```

## 3. API P0

| Nhóm | Số operation | Nội dung |
|---|---:|---|
| Product | 6 | list, create, detail, update, publish, archive |
| Variant | 4 | create, update, activate, archive |
| Media | 5 | upload product/variant/unit, update metadata, delete |
| Inventory unit | 11 | list, lookup identifier, intake, detail, update, reveal, make available, repair, quarantine, write-off, transfer |
| Cost | 2 | get, update; `ADMIN` only |
| Inspection | 5 | list, create, detail, update draft, complete |
| Location | 1 | list |
| Accessory stock | 6 | levels, movements, receive, transfer, adjust, return |

Tất cả endpoint nằm dưới `/api/v1/backoffice/*`. Backoffice DTO tách public DTO; unit list/detail chỉ chứa identifier masked và không chứa cost. OpenAPI phải mô tả đầy đủ security, multipart, pagination và error 409/413/415/422/429/503.

Nguồn: [Backoffice endpoint contract](../api/backoffice-catalog-inventory-endpoints.md), [Endpoint inventory](../api/endpoint-inventory.md), [OpenAPI/client](../api/openapi-and-client.md), [Error catalog](../api/error-catalog.md).

## 4. Quy tắc dữ liệu và transaction

### Identifier

- IMEI bỏ space/hyphen, đúng 15 số và qua Luhn; IMEI1/IMEI2 khác nhau.
- EID bỏ space và đúng 32 số; serial trim/uppercase và khớp `[A-Z0-9]{6,32}`.
- AES-256-GCM dùng nonce 12 byte, tag 16 byte; lưu base64url của `nonce || ciphertext || tag` cùng key version.
- HMAC-SHA256 dùng key riêng và prefix `IMEI:`, `SERIAL:`, `EID:`; hai IMEI slot dùng cùng prefix.
- Lock advisory theo danh sách HMAC đã sort, rồi kiểm tra duplicate chéo cả hai slot.
- Runtime luôn ghi canonical format mới, đọc tạm legacy envelope `v1:*`; seed dùng chung codec và ghi lại năm unit demo.
- Lookup/reveal chỉ trả dữ liệu sau khi audit commit; reveal trả `Cache-Control: no-store`.

### Inspection, availability và lifecycle

- Create inspection chuyển unit sang `INSPECTING` cùng transaction; chỉ một draft trên mỗi unit.
- Draft chỉ do owner hoặc `ADMIN` sửa; completed inspection bất biến.
- Complete bắt buộc đúng 18 check schema version 1 và tính `PASSED`/`PARTIAL`/`FAILED` theo checklist contract.
- Complete chuyển current atomically nhưng không tự make available.
- Make available yêu cầu current completed `PASSED`, price, active location/product/variant, identifier, owner-level unit photo và không có active reservation.
- Repair, quarantine, write-off và transfer là named command; không có generic status patch.
- Sửa identifier khi `AVAILABLE` cho `EMPLOYEE`/`ADMIN` nếu có reason + audit; chặn `IN_TRANSIT`, `SOLD`, `WRITTEN_OFF`.

### Stock và concurrency

- Chỉ accessory variant `QUANTITY`; quantity dương.
- Receipt/transfer/adjust/return khóa stock level, cập nhật counter và append movement cùng transaction.
- Transfer khóa hai row theo ID ổn định; adjust OUT không làm available âm.
- Critical use case dùng Serializable, `maxWait=2s`, `timeout=5s`, tối đa ba execution với backoff 25ms/75ms cộng jitter.
- Repository nhận transaction client từ use case; không tự mở nested transaction.

Nguồn: [Catalog/inventory model](../architecture/catalog-inventory-model.md), [Data model](../data-model/catalog-inventory.md), [Inspection checklist](../architecture/iphone-inspection-checklist.md), [State machines](../architecture/state-machines.md), [Transaction/concurrency](../architecture/transaction-and-concurrency.md).

## 5. Media, security và failure handling

- Public product media chỉ JPEG/PNG/WebP, tối đa 8 MiB; reject empty, nhiều file, MIME spoof, malformed, SVG và executable.
- Object path do server sinh theo owner với UUID và canonical extension; upload bằng service-role, `upsert=false`.
- Upload storage nằm ngoài DB transaction. Attach metadata fail thì delete object best-effort; delete fail log `storage_orphan_candidate`.
- Không xóa owner-level photo cuối cùng của unit `AVAILABLE` hoặc có active reservation.
- Audit lưu actor, namespaced action, entity, reason, request metadata và safe delta; không lưu raw identifier/HMAC/ciphertext/key/credential/signed URL.
- Upload limit 20/10 phút/actor; backoffice mutation 120/phút/actor; 429 có `Retry-After`.
- Không sửa baseline migration. Chỉ thêm forward migration nếu test/query plan chứng minh thiếu invariant hoặc index vật lý.

Nguồn: [Upload pipeline](../architecture/file-upload-pipeline.md), [Security model](../architecture/security-threat-model.md), [Configuration](../architecture/configuration.md), [Roles](../requirements/roles-and-permissions.md).

## 6. Wizard demo

Route `/backoffice/inventory/intake` dành cho `EMPLOYEE`/`ADMIN`:

1. Chọn iPhone product/variant và active location; nhập identifier, attributes và sale price.
2. Intake unit; lưu `unitId` trong URL để resume sau refresh.
3. Upload ít nhất một owner-level unit photo.
4. Tạo/resume draft inspection và nhập đủ 18 check, battery health, condition grade, repair history.
5. Cho phép UI “đánh dấu tất cả PASS”; backend vẫn validate toàn bộ contract.
6. Complete; chỉ hiển thị make-available khi kết quả `PASSED`.
7. Thành công thì hiển thị link public unit detail.

Catalog CRUD và stock command dùng Swagger/API trong Slice 04. Wizard phải xử lý loading, 409/422 theo bước, keyboard focus, label và mobile width cơ bản.

## 7. Test và quality gate

- Unit: role policy, normalization/Luhn, AES/HMAC/legacy reader, checklist, state transition, media detection, stock arithmetic.
- Integration: schema constraints, one draft/current inspection, media XOR owner, identifier cross-slot, rollback và movement/counter atomic.
- Concurrency dùng barrier/latch, không `sleep`: duplicate intake, inspection current switch, stock oversell, transfer lock order và bounded retry.
- E2E: anonymous/customer denial, employee/admin projection, cost, named commands, audit/reason và lỗi upload.
- OpenAPI: đúng 40 operation, operationId unique, security, multipart và generated client không drift.
- Web: resume, validation từng bước, retry upload, complete/available và public handoff.
- Regression: Slice 02 auth/account và Slice 03 public catalog không rò dữ liệu.

Gate theo thứ tự: `pnpm typecheck` → `pnpm test` → `pnpm test:db:prepare` → `pnpm test:integration` → `pnpm test:e2e` → `pnpm api:openapi` → `pnpm api:client` → `pnpm build` → `pnpm verify`.

Nguồn: [Testing strategy](../quality/testing-strategy.md), [Traceability](../quality/requirements-traceability.md), [NFR](../requirements/non-functional-requirements.md).

## 8. Rollout, rollback và decision log

Rollout: validate config/bucket → `pnpm db:deploy` → deploy API → chạy seed hai lần → smoke EMPLOYEE wizard, ADMIN cost/audit và accessory stock → kiểm tra log → cập nhật `plan.md`. Không chạy `db:reset`.

Rollback: quay code về commit xanh trước Slice 04; không down migration/reset database; giữ nguyên identifier canonical và media đã commit; chỉ cleanup orphan bằng exact bucket/path đã xác minh.

Quyết định đã khóa:

- UI chỉ là wizard; catalog/stock utility dùng Swagger/API.
- Tách module theo ownership, không dependency vòng.
- Staff/admin được sửa identifier ở `AVAILABLE` nếu có reason + audit.
- Crypto dual-read legacy, chỉ ghi canonical format mới, reseed năm unit demo.
- Một API replica, một STORE và một WAREHOUSE trong P0.
- `docs` là nguồn sự thật; không sửa hoặc tạo thay thế `docs/decisions` đang thiếu trong checkout.

Nguồn: [Roadmap](implementation-roadmap.md), [Seed/demo](seed-and-demo-scenarios.md), [Deployment](../operations/local-development-and-deployment.md).
