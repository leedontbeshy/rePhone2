# Data dictionary — Catalog và Inventory

## Quan hệ

```text
Product 1 ── n ProductVariant
Product/ProductVariant/InventoryUnit 1 ── n ProductMedia
ProductVariant 1 ── n InventoryUnit
ProductVariant 1 ── n StockLevel
InventoryLocation 1 ── n InventoryUnit/StockLevel
InventoryUnit 1 ── n InventoryInspection
InventoryUnit hoặc StockLevel 1 ── n InventoryReservation
ProductVariant 1 ── n StockMovement
```

## 1. Product

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `type` | ProductType | No | IPHONE, ACCESSORY |
| `brand` | ShortText | No | Default Apple |
| `name` | ShortText | No | Ví dụ iPhone 13 Pro |
| `slug` | ShortText | No | Unique |
| `description` | LongText | Yes | Nội dung catalog |
| `status` | CatalogStatus | No | DRAFT, ACTIVE, ARCHIVED |
| `releaseYear` | Int | Yes | Chỉ iPhone |
| `chipset` | ShortText | Yes | Chỉ iPhone |
| `ramGb` | Int | Yes | Chỉ iPhone |
| `screenSizeInches` | Decimal(4,2) | Yes | Chỉ iPhone |
| `warrantyPolicyId` | Id | Yes | FK WarrantyPolicy |
| `seoTitle` | ShortText | Yes | Optional |
| `seoDescription` | LongText | Yes | Optional |
| `createdAt` | Instant | No | Default now |
| `updatedAt` | Instant | No | Auto update |
| `archivedAt` | Instant | Yes | Không xóa khi đã có order |

Check: phone specs null với accessory; một số spec phone có thể null nếu chưa biết.

## 2. ProductVariant

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `productId` | Id | No | FK Product |
| `sku` | ShortText | No | Unique |
| `displayName` | ShortText | No | Tên cấu hình |
| `storageCapacityGb` | Int | Yes | Chủ yếu iPhone |
| `colorName` | ShortText | Yes | Màu hiển thị |
| `colorHex` | ShortText | Yes | Validate hex khi có |
| `inventoryMode` | InventoryMode | No | SERIALIZED hoặc QUANTITY |
| `salePrice` | Money | Yes | Bắt buộc với QUANTITY |
| `compareAtPrice` | Money | Yes | >= salePrice khi có |
| `accessoryAttributes` | JsonObject | Yes | Connector/material/compatibility đơn giản |
| `warrantyPolicyId` | Id | Yes | Override Product policy |
| `status` | CatalogStatus | No | DRAFT, ACTIVE, ARCHIVED |
| `createdAt` | Instant | No | Default now |
| `updatedAt` | Instant | No | Auto update |
| `archivedAt` | Instant | Yes | Soft archive |

Invariant: iPhone variant dùng SERIALIZED; accessory dùng QUANTITY. Inventory mode bất biến sau khi có tồn/order.

## 3. InventoryLocation

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `code` | ShortText | No | Unique |
| `name` | ShortText | No | Tên hiển thị |
| `type` | LocationType | No | STORE, WAREHOUSE |
| `status` | ActiveStatus | No | ACTIVE, INACTIVE |
| `createdAt` | Instant | No | Default now |
| `updatedAt` | Instant | No | Auto update |

Seed đúng một STORE và một WAREHOUSE trong MVP.

## 4. InventoryUnit

| Nhóm | Field chính | Quy tắc |
|---|---|---|
| Quan hệ | `id`, `variantId`, `locationId` | Variant phải SERIALIZED |
| Nội bộ | `inventoryCode` | Unique, public-safe |
| Thiết bị | `modelNumber`, `regionCode`, `simLockStatus`, `carrierName`, `simConfiguration` | Carrier bắt buộc khi locked |
| IMEI 1 | `imei1Encrypted`, `imei1Hmac`, `imei1Suffix` | HMAC unique khi có |
| IMEI 2 | `imei2Encrypted`, `imei2Hmac`, `imei2Suffix` | HMAC unique khi có |
| Serial | `serialEncrypted`, `serialHmac`, `serialSuffix` | HMAC unique khi có |
| EID | `eidEncrypted`, `eidHmac`, `eidSuffix` | HMAC unique khi có |
| Crypto | `identifierKeyVersion` | Phiên bản khóa dùng cho các identifier |
| Vòng đời | `lifecycleStatus` | State machine riêng |
| Chi phí | `acquisitionCost`, `additionalCost` | Money >= 0; admin-only |
| Giá | `salePrice`, `compareAtPrice` | Money >= 0; compare >= sale |
| Bảo hành | `warrantyDaysOverride` | Int >= 0, nullable |
| Thời gian | `receivedAt`, `soldAt`, `createdAt`, `updatedAt` | soldAt chỉ khi SOLD |

Identifier normalize trước khi encrypt/HMAC. Ít nhất một định danh IMEI/serial phải có trước khi AVAILABLE; P0 không có override.

Canonical rule:

- IMEI1/IMEI2: bỏ space/hyphen, đúng 15 chữ số và qua Luhn; hai IMEI trên cùng unit phải khác nhau.
- EID: bỏ space, đúng 32 chữ số.
- Serial: trim, uppercase, bỏ space, `A-Z0-9` dài 6..32 ký tự.
- `modelNumber`/`regionCode`: trim + uppercase; không dùng để thay unique identifier.
- Suffix chỉ giữ 4 ký tự cuối để mask public/backoffice list; plaintext chỉ giải mã ở reveal use case có audit.

`acquisitionCost` nullable để employee intake không biết giá vốn; `additionalCost` không null, default 0. P0 không cho override identifier requirement khi đưa AVAILABLE và không lưu giá vốn phụ kiện.

## 5. InventoryInspection

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `inventoryUnitId` | Id | No | FK InventoryUnit |
| `inspectionType` | InspectionType | No | INTAKE, RETURN, WARRANTY, PRE_SALE |
| `status` | InspectionStatus | No | DRAFT, COMPLETED |
| `batteryHealthPercent` | Int | Yes | 0..100 |
| `batteryCycleCount` | Int | Yes | >= 0 |
| `batteryReplacementStatus` | BatteryReplacementStatus | No | ORIGINAL, REPLACED, UNKNOWN |
| `conditionGrade` | ConditionGrade | Yes | A, B, C |
| `cosmeticNotes` | LongText | Yes | Màn/khung/lưng |
| `checks` | JsonObject | No | `{ schemaVersion, items }` theo fixed versioned checklist; full key set khi completed |
| `repairHistoryStatus` | RepairHistoryStatus | No | NONE_KNOWN, KNOWN, UNKNOWN |
| `repairNotes` | LongText | Yes | Optional |
| `replacedParts` | JsonObject | Yes | Array metadata đã validate |
| `overallResult` | InspectionResult | No | INCOMPLETE/PASSED/PARTIAL/FAILED |
| `inspectorId` | Id | No | FK User staff/admin |
| `inspectedAt` | Instant | Yes | Bắt buộc khi completed |
| `isCurrent` | Boolean | No | Tối đa một current/unit |
| `createdAt` | Instant | No | Default now |
| `updatedAt` | Instant | No | Draft có thể sửa |

Completed inspection immutable. Các check dùng trạng thái PASS, FAIL, DEGRADED, NOT_TESTED, NOT_APPLICABLE, UNKNOWN.
Backend tự tính `overallResult`; client không được ghi trực tiếp. P0 schema v1 và key registry nằm tại [Checklist kiểm định iPhone](../architecture/iphone-inspection-checklist.md).
Chỉ current `PASSED` inspection có thể thỏa gate chuyển unit `AVAILABLE`; `PARTIAL`/`FAILED` cần repair/quarantine và inspection mới.

## 6. StockLevel

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `variantId` | Id | No | Variant QUANTITY |
| `locationId` | Id | No | FK location |
| `quantityOnHand` | Quantity | No | >= 0 |
| `quantityReserved` | Quantity | No | 0 <= reserved <= onHand |
| `reorderThreshold` | Quantity | No | Default 0 |
| `updatedAt` | Instant | No | Auto update |

Unique `(variantId, locationId)`. Available = onHand - reserved.

## 7. StockMovement

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `variantId` | Id | No | FK quantity variant |
| `fromLocationId` | Id | Yes | Null khi receipt |
| `toLocationId` | Id | Yes | Null khi sale/write-off |
| `type` | StockMovementType | No | Loại nghiệp vụ |
| `quantity` | Int | No | > 0 |
| `referenceType` | ShortText | Yes | ORDER, RETURN... |
| `referenceId` | Id | Yes | ID nguồn |
| `reason` | LongText | Yes | Bắt buộc với adjustment |
| `createdById` | Id | Yes | Null với system |
| `createdAt` | Instant | No | Append-only |

Movement immutable; stock balance được cập nhật cùng transaction tạo movement.

## 8. InventoryReservation

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `orderId` | Id | No | FK Order |
| `orderItemId` | Id | No | FK OrderItem |
| `inventoryUnitId` | Id | Yes | Serialized target |
| `stockLevelId` | Id | Yes | Quantity target |
| `quantity` | Int | No | > 0; unit target = 1 |
| `status` | ReservationStatus | No | ACTIVE, RELEASED, EXPIRED, CONSUMED |
| `holdReason` | ReservationReason | No | DEPOSIT, REVIEW, PICKUP, FULFILLMENT |
| `expiresAt` | Instant | Yes | Deadline khi chờ proof/pickup; null khi shipping payment đang review |
| `createdAt` | Instant | No | Default now |
| `releasedAt` | Instant | Yes | Theo status |
| `consumedAt` | Instant | Yes | Theo status |

XOR unit/stock level. Partial unique bảo đảm một active reservation trên unit. Shipping reservation chuyển `holdReason` từ `DEPOSIT` sang `REVIEW` và bỏ `expiresAt` khi proof hợp lệ được submit đúng hạn.

## 9. ProductMedia

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `productId` | Id | Yes | Owner level 1 |
| `variantId` | Id | Yes | Owner level 2 |
| `inventoryUnitId` | Id | Yes | Ảnh thật máy |
| `bucket` | ShortText | No | Supabase bucket |
| `objectPath` | LongText | No | Unique trong bucket |
| `visibility` | MediaVisibility | No | PUBLIC, PRIVATE |
| `mimeType` | ShortText | No | Allowlist ảnh |
| `width`, `height` | Int | Yes | > 0 khi có |
| `fileSize` | Int | No | > 0 |
| `sortOrder` | Int | No | Default 0 |
| `altText` | ShortText | Yes | Accessibility |
| `createdAt` | Instant | No | Default now |

XOR đúng một owner. Không lưu signed URL. Fallback ảnh: unit → variant → product.

## Enum baseline

- `ProductType`: IPHONE, ACCESSORY.
- `CatalogStatus`: DRAFT, ACTIVE, ARCHIVED.
- `InventoryMode`: SERIALIZED, QUANTITY.
- `LocationType`: STORE, WAREHOUSE.
- `ActiveStatus`: ACTIVE, INACTIVE.
- `SimLockStatus`: UNLOCKED, CARRIER_LOCKED, UNKNOWN.
- `SimConfiguration`: SINGLE_PHYSICAL, DUAL_PHYSICAL, PHYSICAL_AND_ESIM, ESIM_ONLY, UNKNOWN.
- `InventoryLifecycleStatus`: RECEIVED, INSPECTING, AVAILABLE, IN_TRANSIT, SOLD, REPAIRING, QUARANTINED, WRITTEN_OFF.
- `InspectionType`: INTAKE, RETURN, WARRANTY, PRE_SALE.
- `InspectionStatus`: DRAFT, COMPLETED.
- `BatteryReplacementStatus`: ORIGINAL, REPLACED, UNKNOWN.
- `ConditionGrade`: A, B, C.
- `RepairHistoryStatus`: NONE_KNOWN, KNOWN, UNKNOWN.
- `InspectionResult`: INCOMPLETE, PASSED, PARTIAL, FAILED.
- `StockMovementType`: RECEIPT, SALE, RETURN, TRANSFER, ADJUSTMENT_IN, ADJUSTMENT_OUT, WRITE_OFF.
- `ReservationStatus`: ACTIVE, RELEASED, EXPIRED, CONSUMED.
- `ReservationReason`: DEPOSIT, REVIEW, PICKUP, FULFILLMENT.
- `MediaVisibility`: PUBLIC, PRIVATE.

Giá trị check item `PASS`, `FAIL`, `DEGRADED`, `NOT_TESTED`, `NOT_APPLICABLE`, `UNKNOWN` nằm trong JSON checklist đã version hóa, không tạo PostgreSQL enum riêng.
