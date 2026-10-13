# Backoffice Catalog và Inventory endpoints

Bổ sung ngày 13/10/2026: [cờ máy nổi bật và lookup mã máy](ui-refinement-2026-10-13.md), sử dụng quyền cập nhật inventory hiện có.

Tài liệu này là contract P0 để staff/admin tạo catalog, nhập và kiểm định iPhone, quản lý tồn phụ kiện và media. Public projection nằm tại [Public catalog endpoints](public-catalog-endpoints.md).

## 1. Quyền và nguyên tắc

- Mọi route dưới `/api/v1/backoffice/*` yêu cầu `EMPLOYEE` hoặc `ADMIN`, trừ subresource cost/settings được ghi admin-only.
- Không expose generic status/lifecycle patch; publish/archive/complete/transfer/adjust là named command.
- Employee được quản lý catalog, giá bán, inspection và tồn. Chỉ ADMIN xem/sửa giá vốn iPhone.
- Full IMEI/serial/EID chỉ trả qua command reveal có reason và AuditLog; list/detail bình thường chỉ trả suffix đã mask.
- Product/variant/unit đã có Order/history không hard-delete.
- Money là chuỗi số nguyên VND; quantity là integer.

## 2. Product endpoints

| Method/path | Actor | Request chính | Success |
|---|---|---|---|
| `GET /api/v1/backoffice/products` | Staff/Admin | Filter/pagination | `200 BackofficeProductListItemDto[]` |
| `POST /api/v1/backoffice/products` | Staff/Admin | Product create DTO | `201 BackofficeProductDetailDto` |
| `GET /api/v1/backoffice/products/:id` | Staff/Admin | — | `200 BackofficeProductDetailDto` |
| `PATCH /api/v1/backoffice/products/:id` | Staff/Admin | Mutable product fields | `200 BackofficeProductDetailDto` |
| `POST /api/v1/backoffice/products/:id/publish` | Staff/Admin | — | `200 BackofficeProductDetailDto` |
| `POST /api/v1/backoffice/products/:id/archive` | Staff/Admin | `reason` | `200 BackofficeProductDetailDto` |

### Create/update fields

```text
type, brand, name, slug, description?
releaseYear?, chipset?, ramGb?, screenSizeInches?
warrantyPolicyId?
seoTitle?, seoDescription?
```

- Create luôn ở `DRAFT`; client không gửi status/archivedAt.
- `type` chỉ `IPHONE` hoặc `ACCESSORY`; phone spec phải null với accessory.
- `slug` lowercase kebab-case, unique; đổi slug khi ACTIVE được phép nhưng cần warning vì URL thay đổi. P0 không lưu redirect history.
- `type` bất biến sau khi có variant; archive là terminal trong P0, không có restore endpoint.
- Publish yêu cầu ít nhất một active variant và dữ liệu bắt buộc hợp lệ. Product ACTIVE chưa có sellable stock vẫn public với `inStock=false`.
- Archive ẩn toàn bộ product khỏi public nhưng không tự đổi status/history của variant/unit.

### List query

```text
q?, type?, status?, releaseYear?,
page=1, pageSize=20, sortBy=updatedAt, sortOrder=desc
```

Search trên name/slug và SKU/displayName variant. Sort allowlist: `createdAt`, `updatedAt`, `name`, `releaseYear`.

## 3. Variant endpoints

| Method/path | Actor | Request chính | Success |
|---|---|---|---|
| `POST /api/v1/backoffice/products/:productId/variants` | Staff/Admin | Variant create DTO | `201 BackofficeVariantDto` |
| `PATCH /api/v1/backoffice/variants/:id` | Staff/Admin | Mutable variant fields | `200 BackofficeVariantDto` |
| `POST /api/v1/backoffice/variants/:id/activate` | Staff/Admin | — | `200 BackofficeVariantDto` |
| `POST /api/v1/backoffice/variants/:id/archive` | Staff/Admin | `reason` | `200 BackofficeVariantDto` |

Create/update fields:

```text
sku, displayName
storageCapacityGb?, colorName?, colorHex?
salePrice?, compareAtPrice?
accessoryAttributes?
warrantyPolicyId?
```

- Create `DRAFT`; `inventoryMode` do backend suy ra: IPHONE → `SERIALIZED`, ACCESSORY → `QUANTITY`.
- iPhone variant có storage/color, `salePrice = null`; giá bán nằm trên từng InventoryUnit.
- Accessory variant có `salePrice`, có thể có color/attributes; `storageCapacityGb = null`.
- `sku` unique và bất biến sau khi có stock/order. Inventory mode luôn bất biến.
- Activate yêu cầu parent chưa archive, SKU/displayName hợp lệ và accessory có sale price.
- `compareAtPrice >= salePrice` tại nơi có salePrice.
- Archive chặn receipt/cart mới nhưng không xóa StockLevel/Unit/Order history.

## 4. Product media

| Method/path | Actor | Content/request | Success |
|---|---|---|---|
| `POST /api/v1/backoffice/products/:id/media` | Staff/Admin | Multipart `file`, `altText?`, `sortOrder?` | `201 ProductMediaDto` |
| `POST /api/v1/backoffice/variants/:id/media` | Staff/Admin | Multipart như trên | `201 ProductMediaDto` |
| `POST /api/v1/backoffice/inventory-units/:id/media` | Staff/Admin | Multipart như trên | `201 ProductMediaDto` |
| `PATCH /api/v1/backoffice/product-media/:id` | Staff/Admin | `altText?`, `sortOrder?` | `200 ProductMediaDto` |
| `DELETE /api/v1/backoffice/product-media/:id` | Staff/Admin | — | `204` |

- Upload theo [File upload pipeline](../architecture/file-upload-pipeline.md), một ảnh JPEG/PNG/WebP tối đa 8 MiB.
- Backend quyết định owner XOR, bucket/path và visibility PUBLIC.
- Delete database record rồi xóa object best-effort sau commit; object delete lỗi được log là orphan candidate.
- Không được xóa ảnh unit cuối cùng khi unit đang AVAILABLE hoặc có active reservation; upload ảnh thay thế trước rồi mới xóa.
- Unit cần tối thiểu một ảnh owner-level trước khi chuyển AVAILABLE; fallback media không thay yêu cầu “ảnh thật từng máy”.

## 5. iPhone InventoryUnit endpoints

| Method/path | Actor | Request chính | Success |
|---|---|---|---|
| `GET /api/v1/backoffice/inventory-units` | Staff/Admin | Filter/pagination | `200 InventoryUnitListItemDto[]` |
| `POST /api/v1/backoffice/inventory-units/lookup-identifier` | Staff/Admin | `type`, `value` | `200 InventoryUnitListItemDto` + audit tự động |
| `POST /api/v1/backoffice/inventory-units` | Staff/Admin | Intake DTO | `201 InventoryUnitDetailDto` |
| `GET /api/v1/backoffice/inventory-units/:id` | Staff/Admin | — | `200 InventoryUnitDetailDto` |
| `PATCH /api/v1/backoffice/inventory-units/:id` | Staff/Admin | Mutable non-state fields | `200 InventoryUnitDetailDto` |
| `POST /api/v1/backoffice/inventory-units/:id/reveal-identifiers` | Staff/Admin | `reason` | `200 DecryptedIdentifiersDto` + audit |
| `POST /api/v1/backoffice/inventory-units/:id/make-available` | Staff/Admin | — | `200 InventoryUnitDetailDto` |
| `POST /api/v1/backoffice/inventory-units/:id/send-to-repair` | Staff/Admin | `reason` | `200 InventoryUnitDetailDto` |
| `POST /api/v1/backoffice/inventory-units/:id/quarantine` | Staff/Admin | `reason` | `200 InventoryUnitDetailDto` |
| `POST /api/v1/backoffice/inventory-units/:id/write-off` | Staff/Admin | `reason` | `200 InventoryUnitDetailDto` |
| `POST /api/v1/backoffice/inventory-units/:id/transfer` | Staff/Admin | `toLocationId`, `reason?` | `200 InventoryUnitDetailDto` |

### Intake DTO

```text
variantId, locationId
modelNumber?, regionCode?
simLockStatus, carrierName?, simConfiguration
imei1?, imei2?, serial?, eid?
salePrice?, compareAtPrice?, warrantyDaysOverride?
```

- Variant phải active/draft IPHONE `SERIALIZED`; location ACTIVE.
- Backend sinh `inventoryCode` dạng `RPH-U-XXXXXXXX` bằng alphabet random không gây nhầm; client không truyền.
- Identifier được normalize rồi encrypt + HMAC + suffix trong application service. Intake/update lock theo HMAC và kiểm tra IMEI trên cả hai slot để không lọt duplicate chéo IMEI1/IMEI2; plaintext không được log.
- `carrierName` bắt buộc khi `CARRIER_LOCKED`, phải null khi `UNLOCKED`.
- Intake tạo lifecycle `RECEIVED`; chưa public.
- Identifier có thể bổ sung/sửa trước AVAILABLE. Sửa identifier khi đã AVAILABLE trở lên cần admin hoặc staff policy + reason/audit; SOLD chỉ sửa qua data-correction admin flow ngoài P0.
- Sale price staff/admin được sửa khi chưa SOLD/WRITTEN_OFF; compare-at phải không nhỏ hơn sale price.

### List/detail projection

Không có acquisition/additional cost. Trả product/variant/location summary, inventory code, lifecycle, sale price, masked suffix, current inspection summary, reservation summary an toàn, media count và timestamps.

List query:

```text
q?, productId?, variantId?, locationId?, lifecycleStatus?,
conditionGrade?, simLockStatus?, minBatteryHealth?,
page=1, pageSize=20, sortBy=receivedAt, sortOrder=desc
```

`q` tìm product/variant/inventoryCode/SKU. Exact identifier lookup nhận `type = IMEI | SERIAL | EID`, canonicalize giá trị, tính HMAC và tìm đúng cột/các slot IMEI. Hệ thống tự audit actor, thời gian, loại mã và kết quả `FOUND/NOT_FOUND` nhưng không ghi plaintext. Response chỉ là projection đã mask và không echo plaintext; không đi qua generic q.

### Availability gate

`make-available` dùng Serializable transaction và yêu cầu:

1. Unit đang `INSPECTING` sau một intake/reinspection hợp lệ.
2. Có current `COMPLETED` inspection với `overallResult = PASSED`.
3. Có sale price, location ACTIVE và product/variant ACTIVE.
4. Có ít nhất một identifier IMEI/serial hợp lệ.
5. Có ít nhất một ảnh thật owner-level của unit.
6. Không có active reservation và không SOLD/WRITTEN_OFF.

`PARTIAL`/`FAILED` không được AVAILABLE trong P0; staff phải repair/quarantine rồi tạo inspection mới. Grade B/C và battery health thấp vẫn có thể PASSED vì đó là tình trạng được công khai, không phải lỗi chức năng.

### Lifecycle command

- `send-to-repair`: `INSPECTING/QUARANTINED → REPAIRING`, reason bắt buộc.
- `quarantine`: `RECEIVED/INSPECTING/REPAIRING → QUARANTINED`, reason bắt buộc.
- `write-off`: từ RECEIVED/INSPECTING/AVAILABLE/REPAIRING/QUARANTINED và không reservation; admin-only nếu unit đã có giá vốn, reason bắt buộc; terminal.
- Transfer chỉ khi không reservation và không `IN_TRANSIT/SOLD/WRITTEN_OFF`; update location và ghi AuditLog trong transaction.
- Return/hậu mãi đưa unit về INSPECTING qua owning workflow, không gọi generic lifecycle patch.

## 6. Giá vốn iPhone — admin-only subresource

| Method/path | Actor | Request/response |
|---|---|---|
| `GET /api/v1/backoffice/inventory-units/:id/cost` | ADMIN | `200 { acquisitionCost?, additionalCost, totalCost }` |
| `PATCH /api/v1/backoffice/inventory-units/:id/cost` | ADMIN | `acquisitionCost?`, `additionalCost`, `reason` → current cost projection |

- `acquisitionCost` nullable để employee có thể intake mà không biết cost; `additionalCost` default `0`.
- `totalCost = acquisitionCost + additionalCost` khi acquisition có giá trị; không lưu total.
- Update cost audit before/after và reason; employee nhận 403, endpoint detail thường không có field cost.
- P0 không theo dõi giá vốn phụ kiện vì lean data model không có field; không suy diễn từ sale price.

## 7. Inspection endpoints

| Method/path | Actor | Request | Success |
|---|---|---|---|
| `GET /api/v1/backoffice/inventory-units/:id/inspections` | Staff/Admin | Pagination | `200 InspectionSummaryDto[]` |
| `POST /api/v1/backoffice/inventory-units/:id/inspections` | Staff/Admin | `inspectionType` | `201 InspectionDetailDto` DRAFT |
| `GET /api/v1/backoffice/inspections/:id` | Staff/Admin | — | `200 InspectionDetailDto` |
| `PATCH /api/v1/backoffice/inspections/:id` | Draft owner/Admin | Draft mutable fields/checks | `200 InspectionDetailDto` |
| `POST /api/v1/backoffice/inspections/:id/complete` | Draft owner/Admin | — | `200 InspectionDetailDto` |

- Create inspection từ RECEIVED/AVAILABLE/REPAIRING/QUARANTINED (hoặc tiếp tục INSPECTING) atomically chuyển unit sang `INSPECTING`; AVAILABLE yêu cầu không active reservation. Chỉ một DRAFT active/unit trong P0.
- Draft DTO gồm battery, condition, cosmetic, repair history/replaced parts và partial checks payload version 1.
- Complete yêu cầu đủ 18 checks, note cho non-pass, batteryHealthPercent, conditionGrade và repair history status.
- Backend tự tính result và atomically đổi current inspection; completed record immutable.
- Chỉ `PASSED` thỏa availability gate; complete không tự chuyển AVAILABLE.
- Exact JSON schema và versioning tại [Checklist kiểm định iPhone](../architecture/iphone-inspection-checklist.md).

## 8. InventoryLocation và accessory stock

### Location

| Method/path | Actor | Success |
|---|---|---|
| `GET /api/v1/backoffice/inventory-locations` | Staff/Admin | Hai location seed STORE/WAREHOUSE |

P0 không có create/delete location API. Tên/trạng thái được quản lý bằng seed/config migration, không biến MVP thành multi-location editor.

### Stock query/commands

| Method/path | Actor | Request | Success |
|---|---|---|---|
| `GET /api/v1/backoffice/stock-levels` | Staff/Admin | variant/location/lowStock + pagination | `200 StockLevelDto[]` |
| `GET /api/v1/backoffice/stock-movements` | Staff/Admin | variant/location/type/date/reference filters | `200 StockMovementDto[]` |
| `POST /api/v1/backoffice/stock/receive` | Staff/Admin | `variantId`, `locationId`, `quantity`, `reason?` | `200 StockCommandResultDto` |
| `POST /api/v1/backoffice/stock/transfer` | Staff/Admin | `variantId`, `fromLocationId`, `toLocationId`, `quantity`, `reason?` | `200 StockCommandResultDto` |
| `POST /api/v1/backoffice/stock/adjust` | Staff/Admin | `variantId`, `locationId`, `direction`, `quantity`, `reason` | `200 StockCommandResultDto` |
| `POST /api/v1/backoffice/stock/return` | Staff/Admin | `variantId`, `locationId`, `quantity`, `referenceType`, `referenceId`, `reason` | `200 StockCommandResultDto` |

- Variant phải ACCESSORY `QUANTITY`; quantity > 0.
- Receipt tạo/lock StockLevel, tăng onHand và append `RECEIPT` movement atomically.
- Transfer lock hai stock level theo ID order ổn định, giảm nguồn/tăng đích và append một `TRANSFER` movement có cả from/to.
- Adjustment direction IN/OUT map `ADJUSTMENT_IN/OUT`; reason bắt buộc; OUT không làm onHand thấp hơn reserved.
- Return chỉ dùng sau kiểm tra hàng hoàn, tăng onHand và append `RETURN` với reference.
- Không có endpoint sửa trực tiếp `quantityOnHand`, `quantityReserved` hoặc StockMovement.

## 9. Error contract

| Code | Khi dùng |
|---|---|
| `RESOURCE_NOT_FOUND` | Resource không tồn tại/không trong scope |
| `DUPLICATE_RESOURCE` | Slug/SKU/identifier/business key trùng |
| `INVALID_STATE_TRANSITION` | Publish/archive/lifecycle/inspection command sai state |
| `INVENTORY_INSPECTION_REQUIRED` | Thiếu current completed PASSED inspection |
| `INVENTORY_AVAILABILITY_REQUIREMENTS_NOT_MET` | Thiếu price/identifier/unit photo hoặc catalog/location chưa active |
| `INVENTORY_NOT_AVAILABLE` | Transfer/adjust/command xung đột reservation/tồn |
| `CONCURRENT_MODIFICATION` | Serializable conflict sau bounded retry |
| `FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE` | Media vi phạm upload policy |
| `FORBIDDEN` | Employee gọi cost/admin-only action |

Availability gate lỗi trả structured details chỉ gồm các requirement public-safe, không trả raw identifier/cost.

## 10. Acceptance test tối thiểu

- Product/variant type-mode invariant và publish/archive visibility đúng.
- Employee không đọc/update cost; admin cost update có audit.
- Intake encrypt/HMAC identifier, phát hiện duplicate và không log plaintext.
- Exact identifier lookup dùng HMAC, tự audit loại mã/kết quả và không echo plaintext.
- Reveal identifier bắt buộc reason/audit; response không cache.
- Inspection complete tính result/current atomically và record completed không sửa được.
- Unit thiếu PASSED inspection/price/identifier/unit photo không thể AVAILABLE.
- Hai command stock đồng thời không làm onHand/reserved âm hoặc mất movement.
- Transfer lock order tránh deadlock phổ biến và rollback cả hai location khi lỗi.
- Media upload/delete không tin filename/path và xử lý orphan best-effort.
- Không có API direct patch lifecycle/counter/status.

## Liên kết

- [Catalog/Inventory data dictionary](../data-model/catalog-inventory.md)
- [Mô hình Catalog và Inventory](../architecture/catalog-inventory-model.md)
- [Checklist kiểm định iPhone](../architecture/iphone-inspection-checklist.md)
- [File upload pipeline](../architecture/file-upload-pipeline.md)
- [API error catalog](error-catalog.md)
