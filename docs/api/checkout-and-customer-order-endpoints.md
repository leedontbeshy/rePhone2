# Checkout và customer Order endpoints

- Trạng thái: Accepted tại ADR-0059.
- Phạm vi: pricing preview, tạo Order từ Cart, customer order list/detail và customer/guest cancel.

## 1. Endpoint inventory

| Method/path | Actor | Success | Mục đích |
|---|---|---|---|
| `POST /api/v1/checkouts/preview` | Guest cart hoặc CUSTOMER | `200 CheckoutPreviewDto` | Tính pricing/availability hiện hành, không ghi dữ liệu |
| `POST /api/v1/checkouts` | Guest cart hoặc CUSTOMER | `201 CheckoutResultDto`; replay `200` | Atomically tạo Order từ active Cart |
| `GET /api/v1/orders` | CUSTOMER | `200 OrderListItemDto[]` + pagination | Danh sách đơn của chính customer |
| `GET /api/v1/orders/:orderNumber` | Owner CUSTOMER hoặc guest credential | `200 OrderDetailDto` | Xem đơn thuộc quyền sở hữu |
| `POST /api/v1/orders/:orderNumber/cancel` | Owner CUSTOMER hoặc guest credential | `200 OrderDetailDto` | Hủy đơn theo state/cancellation policy |

Staff/admin dùng `/api/v1/backoffice/orders/*`, không dùng projection customer này để vận hành.

## 2. Checkout identity

- CUSTOMER: Bearer access token, backend lấy active Cart theo `customerId`.
- Guest: HttpOnly `rephone_guest_cart`, backend lookup `guestTokenHash`.
- Client không gửi `cartId`; cart ID không phải access secret.
- Request có Bearer CUSTOMER thì checkout customer cart. Guest cart phải merge trước bằng `/cart/merge` nếu muốn gộp.
- Customer/guest chỉ có một active cart và mỗi cart tạo tối đa một Order.
- Guest preview/create/cancel qua cart cookie phải qua exact Origin và `X-Rephone-CSRF: 1`; Bearer customer request không dựa cookie auth.

## 3. Preview

### Request

```json
{
  "fulfillmentType": "SHIPPING",
  "voucherCode": "RPHONE100K"
}
```

- `fulfillmentType`: `PICKUP` hoặc `SHIPPING`.
- `voucherCode` optional, normalize uppercase/trim; một voucher/order.
- Không nhận address/contact vì fixed shipping fee và allocation P0 không phụ thuộc địa chỉ.

### `CheckoutPreviewDto`

```text
cartUpdatedAt
fulfillmentType
items[] { cartItemId, target summary, quantity, unitPrice, lineSubtotal, discountAmount, lineTotal }
pricing {
  subtotal
  itemDiscountAmount
  voucherDiscountAmount
  shippingFee
  grandTotal
  depositRequired
  balanceDue
}
voucher? { code, name, discountAmount }
fulfillmentSummary { type, pickupStore? }
warnings[]
calculatedAt
```

- Money là chuỗi số nguyên VND.
- P0 `itemDiscountAmount = 0`; `discountAmount` trên item là phần voucher được backend phân bổ, tổng luôn bằng `voucherDiscountAmount`.
- Preview chỉ thành công khi cart hiện có thể cấp trọn từ một location theo fulfillment type.
- Preview không có `quoteId`, `expiresAt` hoặc chữ ký khóa giá.

## 4. Create checkout

### Request chung

```text
fulfillmentType
contact { fullName, email, phone }
shippingAddress? { receiverName, phone, addressLine, ward, district, province, postalCode? }
voucherCode?
customerNote?
expectedCartUpdatedAt
expectedGrandTotal
expectedDepositRequired
```

- `contact` bắt buộc cho cả guest/customer và được snapshot; backend không âm thầm lấy profile làm dữ liệu Order.
- SHIPPING bắt buộc `shippingAddress`; PICKUP phải omit field này và backend dùng STORE duy nhất.
- Customer chọn saved address thì frontend copy thành inline snapshot; create không nhận `addressId`.
- `customerNote` optional, tối đa 500 ký tự.
- Expected values lấy từ preview gần nhất nhưng không authoritative.

### Transaction/result

- Flow transaction tuân [Checkout transaction](../architecture/checkout-transaction.md).
- First success trả `201`; request lặp của cùng cart trả `200` với cùng Order.
- CUSTOMER result chỉ có `order`.
- Guest first result có `order` và `guestAccessToken` raw đúng một lần; database chỉ lưu hash.
- Guest replay qua converted cart cookie trả `order`, omit `guestAccessToken` vì token cũ không thể phục hồi từ hash.
- Email guest chứa frontend URL dạng `/orders/{orderNumber}#token=...`; frontend đọc fragment, xóa khỏi address bar và gửi token qua header khi gọi API.

## 5. Guest Order access

- API nhận raw token qua `X-Guest-Order-Token`, không nhận query parameter.
- Token tối thiểu 256-bit; database lưu hash tại Order.
- Token chỉ cấp quyền detail/cancel cho đúng một Order và không cấp list.
- Matching converted guest cart cookie cũng được dùng cho idempotent checkout replay và detail/cancel ngắn hạn.
- Order number không phải secret. Token sai, thiếu hoặc không khớp trả `ORDER_NOT_FOUND` để chống enumeration.
- Không log header/token hoặc đưa token vào analytics, error details và server-rendered HTML.

## 6. Customer Order list

Query:

```text
status?, fulfillmentType?, page=1, pageSize=20,
sortBy=placedAt, sortOrder=desc
```

- Chỉ list Order có `customerId` là caller; guest không có list endpoint.
- Sort allowlist: `placedAt`, `grandTotal`, `status`; tie-breaker `id`.
- `OrderListItemDto`: orderNumber, statuses ba trục, fulfillmentType, item summary/thumbnail, grandTotal, depositRequired, balanceDue, placedAt, tracking summary nếu có.

## 7. `OrderDetailDto`

```text
id, orderNumber
status, fulfillmentStatus, paymentStatus, fulfillmentType
contact snapshot
shippingAddress? / pickup summary?
items[] snapshot
pricing breakdown
voucherCode?
paymentAttempts[] public summary
refunds[] public summary
shipment? { carrierName, trackingCode, trackingUrl?, status, timestamps }
customerNote?
placedAt, confirmedAt?, completedAt?, cancelledAt?
cancelReason?
availableActions[]
```

- Không trả `internalNote`, cost, raw identifier, evidence object path, reviewer/internal actor hoặc source location ID.
- Item dùng snapshot nên vẫn đọc được khi catalog/unit đã archive.
- `availableActions` là hint theo state hiện hành; backend vẫn kiểm tra guard lại khi command chạy.

## 8. Cancel Order

Request:

```json
{ "reason": "Tôi thay đổi nhu cầu mua hàng" }
```

- Reason bắt buộc, trim, 5..500 ký tự.
- Customer/guest chỉ hủy Order của mình trước `IN_TRANSIT` và không tự hủy khi deposit proof `UNDER_REVIEW`.
- Command atomically cancel Order, release reservation/voucher và tạo Refund `REQUESTED` nếu đã thu tiền.
- Request lặp với Order đã `CANCELLED` trả current projection, không double release/refund.
- State không cho hủy trả `INVALID_STATE_TRANSITION`.

## 9. Error contract

| Code | Khi dùng |
|---|---|
| `CART_EMPTY` | Không có active cart/item để preview/create |
| `CART_NOT_ACTIVE` | Cart đã terminal và không có checkout replay phù hợp |
| `CART_NOT_FULFILLABLE` | Không một location hợp lệ nào cấp được toàn cart |
| `INVENTORY_NOT_AVAILABLE` | Unit/quantity thay đổi trước create |
| `VOUCHER_NOT_APPLICABLE` | Code/rule/scope/minimum không hợp lệ |
| `CHECKOUT_REVIEW_REQUIRED` | Cart timestamp hoặc expected total/deposit khác hiện hành |
| `ORDER_NOT_FOUND` | Không tồn tại hoặc caller không sở hữu/không có guest credential đúng |
| `INVALID_STATE_TRANSITION` | Cancel không hợp lệ theo state hiện hành |
| `CSRF_VALIDATION_FAILED` | Guest cookie mutation thiếu/sai Origin hoặc custom header |

`CHECKOUT_REVIEW_REQUIRED.details` chỉ trả preview-safe pricing/cart summary mới, không lộ stock/location/quota nội bộ.

## 10. Acceptance test tối thiểu

- Preview không tạo/đổi bất kỳ record nào và không giữ tồn.
- Preview/create cho pickup và shipping tính đúng fixed fee/deposit/voucher.
- Cart/tổng tiền thay đổi giữa preview-create trả 409 và không có write.
- First create trả 201; retry cùng cart trả 200 cùng order, không double reserve/voucher/payment.
- Guest raw token chỉ trả first success, hash-only DB; token sai thấy 404.
- Customer không list/detail/cancel order người khác; guest không list order.
- Inline address/contact được snapshot và sửa profile/address sau đó không đổi Order.
- Cancel lặp không double release/refund; under-review/in-transit bị chặn đúng policy.

## Liên kết

- [Checkout transaction](../architecture/checkout-transaction.md)
- [Cart và Wishlist endpoints](cart-and-wishlist-endpoints.md)
- [Order/Payment/Fulfillment data dictionary](../data-model/sales.md)
- [Order cancellation transaction](../architecture/order-cancellation-and-refund.md)
- [ADR-0059](../decisions/0059-stateless-checkout-preview-and-create.md)
