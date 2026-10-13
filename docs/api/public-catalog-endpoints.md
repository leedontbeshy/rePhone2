# Public catalog endpoints

Bổ sung được yêu cầu ngày 13/10/2026: [public units và lọc RAM/khóa mạng](ui-refinement-2026-10-13.md). Nội dung bổ sung có ưu tiên cho các query/endpoint mới; quy tắc public-safe dưới đây tiếp tục áp dụng.

- Trạng thái: Accepted tại ADR-0057.
- Phạm vi: public read projection cho product, variant và iPhone unit đang bán được.

## 1. Endpoint inventory

| Method/path | Actor | Success | Mục đích |
|---|---|---|---|
| `GET /api/v1/products` | Public | `200 ProductListItemDto[]` + pagination | Duyệt/search catalog nhóm theo product |
| `GET /api/v1/products/:slug` | Public | `200 ProductDetailDto` | Xem product, variant và offer hiện hành |
| `GET /api/v1/products/:slug/units/:inventoryCode` | Public | `200 UsedIphoneDetailDto` | Xem chi tiết đúng một iPhone vật lý |

Không có public create/update và không có collection `/used-iphones` trong P0. Backoffice catalog dùng contract riêng.

## 2. Product list

### Query DTO

| Query | Type/default | Quy tắc |
|---|---|---|
| `q` | string optional | Tối đa 100; tìm `Product.name`, active `ProductVariant.displayName` và public SKU bằng escaped `ILIKE` |
| `productType` | `IPHONE \| ACCESSORY` optional | Exact enum |
| `releaseYear` | integer optional | Chỉ có ý nghĩa với iPhone |
| `storageCapacityGb` | integer optional | Product có active iPhone variant tương ứng |
| `colorName` | string optional | Exact case-insensitive trên active variant |
| `minPrice`, `maxPrice` | Money optional | Product có ít nhất một public offer trong range; min không lớn hơn max |
| `inStock` | boolean optional | `true`: có offer đang bán được; `false`: active nhưng không có offer |
| `page`, `pageSize` | `1`, `20` | Theo pagination baseline, pageSize tối đa 100 |
| `sortBy` | `createdAt` | Allowlist: `createdAt`, `name`, `fromPrice`, `releaseYear`, `generation` |
| `sortOrder` | `desc` | `asc` hoặc `desc`; luôn thêm `id` tie-breaker |

Mọi filter kết hợp bằng `AND`. Filter variant/price chỉ dùng để xác định product phù hợp; response vẫn là một card cho mỗi product. Khi sort `fromPrice`, giá null nằm cuối ở cả hai hướng.

Trang `/products` mặc định gửi `sortBy=generation&sortOrder=desc` (nút **Dòng mới nhất**): iPhone 18 → 17 → 16…; các biến thể được giữ cùng dòng theo thứ tự như trang chủ (bản thường, mini/e/Plus/Air nếu có, Pro, Pro Max). iPhone Air thuộc nhóm 17; X/XR/XS nằm giữa 11 và 8; SE 3 → 2 → 1 sau các dòng đánh số, tiếp đến tên iPhone chưa nhận diện và phụ kiện. Sắp xếp ở database trước khi phân trang, luôn có tie-breaker để các trang ổn định. `asc` đảo thứ tự các nhóm, giữ thứ tự biến thể; tên chưa nhận diện/phụ kiện vẫn ở cuối. Các kiểu sort hiện có giữ nguyên ý nghĩa.

### `ProductListItemDto`

```text
id, slug, productType, brand, name
releaseYear?, coverMedia?
price { fromPrice?, compareAtPrice? }
inStock
storageOptions[]
colorOptions[]
```

- `coverMedia`: `url`, `altText`, `width?`, `height?`; URL được dựng từ public storage metadata.
- Cặp `fromPrice/compareAtPrice` thuộc cùng offer rẻ nhất, không ghép giá từ hai unit/variant khác nhau.
- `storageOptions`/`colorOptions` lấy từ active variants; frontend không suy luận availability chỉ từ các mảng này.
- Money serialize thành chuỗi số nguyên VND.

## 3. Product detail

Field chung:

```text
id, slug, productType, brand, name, description?
releaseYear?, chipset?, ramGb?, screenSizeInches?
media[]
variants[]
```

### iPhone variant projection

```text
id, sku, displayName, storageCapacityGb?, colorName?, colorHex?
warrantySummary
availableUnits[]
```

Mỗi `availableUnits[]` là card nhẹ:

```text
inventoryCode
modelNumber?, regionCode?
simLockStatus, carrierName?, simConfiguration
price { salePrice, compareAtPrice? }
conditionGrade, batteryHealthPercent?
repairHistoryStatus
warrantyDays
thumbnail?
fulfillmentAvailability { pickup, shipping }
```

### Accessory variant projection

```text
id, sku, displayName, colorName?, colorHex?
price { salePrice, compareAtPrice? }
attributes?
warrantySummary
media[]
fulfillmentAvailability { inStock, pickup, shipping }
```

Public API không trả exact stock quantity. Availability được tính riêng tại STORE/WAREHOUSE theo policy checkout; không cộng tồn hai nơi thành một con số gây hiểu nhầm.

## 4. Used iPhone detail

`UsedIphoneDetailDto` gồm:

```text
product { id, slug, name, brand }
variant { id, sku, displayName, storageCapacityGb?, colorName?, colorHex? }
unit {
  inventoryCode
  modelNumber?, regionCode?
  simLockStatus, carrierName?, simConfiguration
  price { salePrice, compareAtPrice? }
  conditionGrade, cosmeticNotes?
  batteryHealthPercent?, batteryCycleCount?, batteryReplacementStatus
  repairHistoryStatus, repairNotes?, replacedParts?
  functionalChecks[]
  maskedIdentifiers[]
  warrantyDays
  fulfillmentAvailability { pickup, shipping }
  media[]
}
```

- `functionalChecks` là projection public đã validate từ current completed inspection; không trả raw/internal checklist metadata.
- `maskedIdentifiers` chỉ chứa loại và suffix đã mask, ví dụ IMEI kết thúc bằng bốn số; không trả ciphertext/HMAC.
- Fallback media theo thứ tự unit → variant → product.
- Không trả `locationId`; chỉ trả khả năng pickup/shipping.

## 5. Visibility và availability

### Product/variant

- Chỉ `ACTIVE` và chưa archive.
- Product hết hàng vẫn có thể xuất hiện với `inStock=false` trừ khi query yêu cầu `inStock=true`.

### iPhone unit

Unit chỉ public khi đồng thời:

1. Product và variant `ACTIVE`.
2. `lifecycleStatus = AVAILABLE`.
3. Không có `InventoryReservation` `ACTIVE`.
4. Có current completed inspection thỏa policy đưa bán.
5. Có `salePrice` và media/public information tối thiểu.

Unit không còn public trả `RESOURCE_NOT_FOUND` thay vì tiết lộ lifecycle/reservation nội bộ.

### Accessory

`inStock=true` khi có ít nhất một location hợp lệ với `quantityOnHand - quantityReserved > 0`. Pickup chỉ dùng STORE; shipping dùng location theo allocation policy hiện hành.

## 6. Error contract

- Query/path sai format: `VALIDATION_FAILED`.
- Slug/unit không tồn tại hoặc không public: `RESOURCE_NOT_FOUND`.
- Endpoint read không trả `INVENTORY_NOT_AVAILABLE`; availability race được xác nhận lại khi checkout.
- Storage URL không dựng được không làm lộ object path; media lỗi được omit/log theo projection policy.

## 7. Acceptance test tối thiểu

- List chỉ trả một record cho mỗi active product dù có nhiều unit.
- Search/filter/sort/pagination dùng cùng predicate cho data và count.
- `fromPrice` đúng offer rẻ nhất và null được sort cuối.
- Product detail không trả reserved/non-AVAILABLE unit.
- Accessory availability không vượt qua reserved quantity.
- Unit detail không lộ cost, raw identifier, location ID, inspector hoặc internal note.
- Product/variant/unit bị archive hoặc hết public visibility trả đúng projection/404.

## Liên kết

- [Filtering và search](filtering-and-search.md)
- [Pagination và sorting](pagination.md)
- [API response contract](response-contract.md)
- [Catalog/Inventory data dictionary](../data-model/catalog-inventory.md)
- [ADR-0057](../decisions/0057-grouped-product-catalog.md)
