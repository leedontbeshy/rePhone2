# Cart và Wishlist endpoints

- Trạng thái: Accepted theo ADR-0058 và lean commerce model.
- Phạm vi: guest/customer cart không giữ tồn; một wishlist cho mỗi customer.

## 1. Cart endpoints

| Method/path | Actor | Request | Success |
|---|---|---|---|
| `GET /api/v1/cart` | Guest cookie hoặc authenticated customer | — | `200 CartDto`; guest chưa có cart nhận projection rỗng |
| `POST /api/v1/cart/items` | Guest/customer | Discriminated target + desired quantity | `201` khi tạo item, `200` khi target đã có và được set lại |
| `PATCH /api/v1/cart/items/:itemId` | Cart owner | `quantity` | `200 CartDto`; chỉ accessory, quantity 1..99 |
| `DELETE /api/v1/cart/items/:itemId` | Cart owner | — | `204` |
| `POST /api/v1/cart/merge` | Authenticated CUSTOMER + optional guest cookie | — | `200 CartDto`; claim/merge atomically, clear guest cookie |

Cart customer được nhận diện bằng Bearer access token. Khi request có cả access token và guest cookie, endpoint thường thao tác customer cart; chỉ command `/merge` được phép đọc cả hai identity.

## 2. Add/set item request

Request dùng một trong hai shape:

```json
{
  "itemType": "IPHONE",
  "inventoryCode": "RPH-U-000123"
}
```

```json
{
  "itemType": "ACCESSORY",
  "variantId": "0198...",
  "quantity": 2
}
```

- `IPHONE`: `inventoryCode` bắt buộc, không nhận `variantId/quantity`; quantity nội bộ luôn 1.
- `ACCESSORY`: `variantId` và quantity 1..99 bắt buộc, không nhận `inventoryCode`.
- POST mang semantics “đặt target vào cart với desired quantity”, không cộng dồn. Gửi lại cùng request cho cùng cart có cùng logical result.
- Chỉ target thuộc product/variant public hợp lệ mới được thêm. Cart không tạo reservation và availability vẫn phải kiểm tra lại khi đọc/checkout.

## 3. `CartDto`

```text
id?
status
expiresAt?
items[]
estimatedSubtotal
warnings[]
```

Mỗi item:

```text
id, itemType, quantity
target { productId, productSlug, productName, variantId, variantName, inventoryCode? }
media?
priceAtAddition
currentUnitPrice?
estimatedLineTotal?
availabilityStatus
warnings[]
```

- `id` có thể null ở projection cart rỗng chưa persist.
- `estimatedSubtotal` chỉ cộng item còn price/availability hợp lệ; không gồm voucher, ship, deposit và không phải checkout quote.
- `priceAtAddition` chỉ giúp phát hiện đổi giá. Checkout luôn dùng current price phía backend.
- `availabilityStatus`: `AVAILABLE`, `OUT_OF_STOCK`, `RESERVED_OR_SOLD`, `INACTIVE`.
- Warning baseline: `PRICE_CHANGED`, `QUANTITY_NOT_AVAILABLE`, `ITEM_UNAVAILABLE`, `QUANTITY_CAPPED_ON_MERGE`.

## 4. Guest cart lifecycle

- Token raw 256-bit base64url ở cookie `rephone_guest_cart`; database lưu hash.
- Guest Cart tạo khi mutation đầu tiên thành công, `expiresAt = createdAt + 30 ngày`.
- GET không cookie trả cart rỗng và không gây side effect.
- Khi token/cart hết hạn, GET trả rỗng; mutation kế tiếp lazily chuyển cart cũ `EXPIRED`, tạo cart/token mới trong cùng transaction.
- Cart `CONVERTED`, `ABANDONED` hoặc `EXPIRED` không nhận mutation.
- Guest checkout giữ cookie của cart `CONVERTED` để hỗ trợ retry. GET xem như cart rỗng; mutation mua sắm tiếp theo tạo cart/token mới và thay cookie. P0 job/lazy path đánh dấu EXPIRED; hard-delete cart lịch sử là P1 và không quyết định tính hợp lệ.

## 5. Merge sau login

Frontend gọi `POST /cart/merge` sau login thành công:

1. Lock/đọc guest cart và active customer cart trong transaction.
2. Nếu không có guest cart hợp lệ, trả customer cart hiện hành hoặc projection rỗng.
3. Nếu customer chưa có cart, đổi owner guest → customer và xóa guest token hash.
4. Nếu đã có customer cart, merge từng target; accessory cộng quantity tối đa 99, iPhone trùng được deduplicate.
5. Guest cart nguồn chuyển `ABANDONED`; customer cart giữ `ACTIVE`.
6. Commit rồi clear guest cookie.

Merge không reserve tồn và không âm thầm xóa item unavailable. Warning buộc frontend cho customer xem lại trước checkout.

## 6. Wishlist endpoints

| Method/path | Actor | Request | Success |
|---|---|---|---|
| `GET /api/v1/wishlist` | CUSTOMER | — | `200 WishlistItemDto[]` |
| `POST /api/v1/wishlist/items` | CUSTOMER | Cùng discriminated target như cart, không có quantity | `201`; target đã tồn tại trả `200` cùng item |
| `DELETE /api/v1/wishlist/items/:itemId` | Owner CUSTOMER | — | `204` khi xóa item đang sở hữu |

- iPhone wishlist trỏ đúng một `InventoryUnit`; phụ kiện trỏ `ProductVariant`.
- Guest không có wishlist trong P0.
- Sold/inactive item vẫn giữ record và trả `availabilityStatus` để customer biết sản phẩm không còn mua được.
- `WishlistItemDto` dùng public-safe product/variant/unit projection, price hiện hành nếu còn và media fallback.
- Item không tồn tại, đã xóa hoặc không thuộc caller đều trả `RESOURCE_NOT_FOUND`; gọi lặp không gây side effect nhưng response sau lần đầu là 404 theo chính sách che ownership.

## 7. Ownership, error và security

- Non-owner item/cart được che bằng `RESOURCE_NOT_FOUND`.
- Cart không active: `CART_NOT_ACTIVE` khi mutation nhắm cart stale đã nhận diện được.
- Target public không tồn tại: `RESOURCE_NOT_FOUND`.
- Quantity/shape sai: `VALIDATION_FAILED`.
- Serialized item bị PATCH quantity: `CART_ITEM_QUANTITY_FIXED`.
- Cookie mutation sai Origin/custom header: `CSRF_VALIDATION_FAILED`.
- Cookie mutation kiểm tra Origin/CORS và custom CSRF header; customer mutation vẫn dùng Bearer.
- Không log raw guest cart cookie/token.

## 8. Acceptance test tối thiểu

- GET guest chưa có cookie không tạo database record.
- Mutation đầu tạo đúng một Cart/token dù request đồng thời.
- Raw token không lưu database/log; cookie có đúng flags production.
- Cùng target POST lại set desired quantity, không nhân đôi item.
- Cart có cùng iPhone ở nhiều guest/customer khác nhau nhưng không tạo reservation.
- Merge claim/merge/deduplicate/cap chạy atomically và retry không nhân đôi.
- Cart read hiển thị price/availability warning; checkout vẫn tính lại toàn bộ.
- Guest không truy cập wishlist; customer không đọc/xóa wishlist item người khác.

## Liên kết

- [Cart/Wishlist/Voucher data dictionary](../data-model/commerce.md)
- [Public catalog endpoints](public-catalog-endpoints.md)
- [Auth token transport](auth-token-transport.md)
- [ADR-0058](../decisions/0058-http-only-guest-cart-cookie.md)
