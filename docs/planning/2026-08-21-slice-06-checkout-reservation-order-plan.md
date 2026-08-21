# Kế hoạch triển khai Slice 06 — Checkout, Reservation & Customer Order

## 1. Mục tiêu và Definition of Done

Triển khai checkout stateless, tạo Order nguyên tử và cổng tra cứu đơn cho CUSTOMER/guest trên branch `feat/slice-06-checkout-reservation-order`, bắt đầu từ commit Slice 05 `c4a62a6`.

Hoàn thành khi:

- Có đúng 5 operation mới: preview checkout, create checkout, customer order list, owner order detail và owner cancellation.
- Preview không ghi database; checkout atomically tạo Order/OrderItem, reservation, VoucherUsage, Payment cần thiết và convert Cart.
- Cùng source Cart chỉ tạo một Order; first success trả `201`, replay trả `200`.
- Không double-sell iPhone, oversell accessory hoặc vượt voucher quota dưới concurrency.
- Guest access token có 256-bit entropy, database chỉ lưu SHA-256 hash và raw token chỉ trả lần đầu.
- CUSTOMER/guest chỉ đọc hoặc hủy đúng Order của mình; ownership sai được che bằng `ORDER_NOT_FOUND`.
- Snapshot contact, address, pricing, voucher, warranty, settings và bank data bất biến.
- Storefront có `/checkout`, `/orders`, `/orders/[orderNumber]`, reconfirmation và guest-token flow.
- Email đặt/hủy đơn chạy sau commit; seed không reset operational state; `pnpm verify` và Supabase smoke xanh.
- `plan.md` chuyển bước tiếp theo sang Slice 07.

Không thuộc Slice 06: proof upload/review/expiry, fulfillment, shipment/COD, backoffice order/refund, refund completion, scheduler, warranty issuance, carrier API, Redis/queue, split location hoặc payment gateway.

## 2. Kiến trúc và interface

`OrdersModule` là orchestrator duy nhất, phụ thuộc một chiều vào các port transaction-aware:

```text
Orders
  ├── Cart: CheckoutCartReader
  ├── Catalog: CheckoutCatalogReader
  ├── Inventory: CheckoutInventoryGateway
  ├── Vouchers: CheckoutVoucherGateway
  ├── Payments: CheckoutPaymentGateway
  ├── Settings: CheckoutSettingsReader
  ├── Notifications: OrderNotificationService
  └── Audit: AuditWriter
```

- Tạo `PaymentsModule`, `SettingsModule`, `NotificationsModule` foundation nhưng không thêm HTTP controller ngoài contract.
- Chuyển `MAIL_PROVIDER` từ `AuthModule` sang `NotificationsModule`; Auth và Orders cùng import module này.
- Cross-module repository/port nhận `Prisma.TransactionClient`; không nested transaction hoặc `forwardRef`.
- `AuditWriter` hỗ trợ actor `USER | GUEST | SYSTEM` mà vẫn type-safe với caller hiện tại.

### API P0 — đúng 5 operation

| Method/path | Actor | Success |
|---|---|---|
| `POST /api/v1/checkouts/preview` | Guest cart hoặc CUSTOMER | `200 CheckoutPreviewDto` |
| `POST /api/v1/checkouts` | Guest cart hoặc CUSTOMER | `201 CheckoutResultDto`; replay `200` |
| `GET /api/v1/orders` | CUSTOMER | `200 OrderListItemDto[]` + pagination |
| `GET /api/v1/orders/:orderNumber` | Owner CUSTOMER hoặc guest credential | `200 OrderDetailDto` |
| `POST /api/v1/orders/:orderNumber/cancel` | Owner CUSTOMER hoặc guest credential | `200 OrderDetailDto` |

OpenAPI bổ sung `guestOrderToken` dạng header `X-Guest-Order-Token`. Bearer CUSTOMER có precedence; Bearer sai trả `401`, staff nhận `403`, không fallback guest. Guest mutation dùng cart cookie phải có exact Origin, `X-Rephone-CSRF: 1` và JSON content type. Tất cả response đặt `Cache-Control: no-store`.

Rate limit một replica: preview 60/phút theo actor, create 10/phút theo actor, guest order access 10/phút theo `IP + orderNumber`.

### DTO và storefront

- Preview chỉ nhận `fulfillmentType`, `voucherCode?`; không có quote/session row.
- Create nhận contact, inline shipping address khi SHIPPING, optional voucher/note và ba expected fields từ preview.
- Contact luôn được client gửi và snapshot; saved address chỉ được frontend copy inline, API không nhận `addressId`.
- Money tính bằng `BigInt`, persist bằng decimal string; warranty snapshot theo unit override → variant policy → product policy → settings.
- `CHECKOUT_REVIEW_REQUIRED.details[0].current` chứa preview-safe summary hiện hành; web không tự retry create.
- Guest token từ fragment được đưa vào `sessionStorage` theo order number, fragment bị xóa trước request và token chỉ gửi qua header.
- Slice 06 chỉ công bố action `CANCEL`; proof upload thuộc Slice 07.

## 3. Database, transaction và failure handling

### Forward migration và seed

Không sửa baseline hoặc thêm bảng/cột. Migration forward-only bổ sung:

- Guest cart/order digest là lowercase SHA-256 hex 64 ký tự.
- ACTIVE reservation DEPOSIT/PICKUP có deadline; REVIEW/FULFILLMENT không có deadline.
- SHIPPING tổng dương có deposit dương; tổng 0 mới có deposit 0.
- BANK_TRANSFER/DEPOSIT Payment có expected amount dương.
- Bank QR bucket/path trên StoreSettings và Payment cùng null hoặc cùng tồn tại.

Trước deploy chạy exact preflight query; có row lạ vi phạm thì dừng. Seed không được reset lifecycle/location/soldAt của unit đã tồn tại, stock counters, immutable movement hoặc completed inspection.

### Preview và location allocation

Preview chạy read-only `RepeatableRead`: resolve cart, batch-read authoritative offers/inventory/warranty/settings, chọn location, validate voucher, calculate và trả DTO. Mọi cart mutation/merge phải touch `Cart.updatedAt`.

- PICKUP chỉ dùng active STORE, stable order theo code.
- SHIPPING thử WAREHOUSE rồi STORE; candidate phải cấp trọn cart.
- Item không còn hợp lệ trả `INVENTORY_NOT_AVAILABLE`; từng item có tồn nhưng không location cấp trọn trả `CART_NOT_FULFILLABLE`.
- Shipping DTO không lộ source location; pickup chỉ trả store summary public.

### Atomic checkout

Create dùng `SerializableTransactionRunner` hiện hành (`maxWait=2s`, `timeout=5s`, tối đa ba execution):

1. Lock source Cart; replay theo unique `sourceCartId` trước mọi calculation mới.
2. Validate active/non-expired/non-empty cart và `expectedCartUpdatedAt`.
3. Re-read authoritative catalog/inventory/voucher/settings, allocate một location và calculate totals.
4. Expected mismatch trả `CHECKOUT_REVIEW_REQUIRED` trước write.
5. Sinh `RPH-YYYYMMDD-XXXXXXXX` theo business timezone và transfer content bỏ dấu gạch.
6. Tạo Order/OrderItem snapshots.
7. Lock unit/stock level theo ID tăng dần; reserve serialized hoặc conditional-increment accessory counter.
8. Lock voucher row, revalidate quota/lifecycle và tạo `VoucherUsage.RESERVED`.
9. Pickup tạo `PICKUP` hold; shipping tổng dương tạo `DEPOSIT` hold + Payment AWAITING_PROOF; shipping tổng 0 tạo CONFIRMED/PAID/FULFILLMENT không Payment.
10. Conditional Cart `ACTIVE → CONVERTED`, ghi `order.created`, commit rồi gửi email.

Lock order chung: Cart/Order root → inventory targets sorted → voucher row. Chỉ serialization/deadlock và đúng order-number collision được retry; inventory/voucher conflict không retry mù.

### Guest token và cancellation

- Token là 32 random bytes, base64url 43 ký tự; compare digest constant-time.
- First `201` trả raw token; replay qua converted cart cookie omit token.
- Detail/cancel chấp nhận đúng order token hoặc matching converted-cart cookie chưa hết hạn; sai/missing credential trả `ORDER_NOT_FOUND`.
- Cancellation Serializable: lock Order, enforce state/ownership, cancel Order/fulfillment/AWAITING_PROOF payment, release reservations/counter/voucher, tạo đúng một Refund REQUESTED nếu có verified payment chưa được cover, audit rồi gửi email sau commit.
- Replay cancellation không double release/refund/email.

## 4. Work packages và commit strategy

| WP | Nội dung | Commit | Nguồn |
|---|---|---|---|
| 0 | Tài liệu chi tiết và trạng thái in-progress | `docs(plan): detail slice 06 implementation` | Roadmap, traceability |
| 1 | Migration, constraint tests, seed safety | `feat(db): enforce checkout reservation invariants` | Database implementation, sales, catalog-inventory, system data |
| 2 | Transaction ports, Settings/Payments foundation | `refactor(api): expose checkout transaction ports` | Backend modules, checkout transaction |
| 3 | Guest identity, audit actor, redaction, rate limit | `feat(api): add secure order identity foundation` | Threat model, roles, error catalog |
| 4 | Pricing, warranty, allocation | `feat(api): add checkout pricing engine` | Order requirement, voucher, sales data |
| 5 | Preview endpoint | `feat(api): add checkout preview` | Checkout API/transaction |
| 6 | Atomic create và replay | `feat(api): create orders atomically` | Checkout/concurrency |
| 7 | Owner list/detail/access | `feat(api): add customer and guest order access` | Checkout API, pagination/response |
| 8 | Cancellation/refund obligation | `feat(api): add customer order cancellation` | Cancellation, state machines |
| 9 | Shared notifications và templates | `feat(api): send order transaction notifications` | Notifications, configuration |
| 10 | OpenAPI/client | `chore(api): generate slice 06 contracts` | OpenAPI, endpoint inventory |
| 11 | Checkout storefront | `feat(web): add checkout storefront` | Checkout API |
| 12 | Order portal và guest access | `feat(web): add customer order portal` | Roles, checkout API |
| 13 | Test/security/performance/smoke | `test(checkout): cover slice 06 invariants` | Testing strategy, NFR |
| 14 | Rollout và completion | `docs(plan): mark slice 06 complete` | Deployment, seed/demo |

Không chỉnh sửa `docs/decisions`; không stage thay đổi ngoài scope.

## 5. Test, rollout và quyết định đã khóa

### Test matrix

- Unit: money/deposit, voucher allocation, warranty precedence, location, order number/timezone, token, ownership, cancellation và notification template.
- Integration: constraints, cart timestamp, preview zero-write, transaction rollback, sourceCart uniqueness, immutable snapshot và seed safety.
- Concurrency: same-cart replay, same-unit single winner, accessory no oversell, voucher last quota và duplicate cancel.
- E2E/security: đủ 5 operation, pickup/shipping, CSRF, Bearer precedence, 201/200, forged totals, ownership 404, token/hash/redaction và cancellation.
- OpenAPI/web: security OR, response statuses, reconfirmation, saved-address copy, double-submit, fragment cleanup và owner portal.
- Regression/performance: Slice 01–05 xanh; preview/order reads p95 dưới 500 ms ở 20 concurrent users với fake mail.

Gate theo thứ tự: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db:prepare`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm api:openapi`, `pnpm api:client`, `pnpm build`, `pnpm verify`.

### Rollout/rollback

Chạy preflight, backup, `pnpm db:deploy`, deploy API/web, seed hai lần rồi smoke guest shipping và customer pickup; cả hai được cancel và đối chiếu reservation/counter/payment/audit. Không down migration hoặc xóa history. Nếu rollback code, cancel chính xác smoke order còn active bằng application command; Order thật đang active phải forward-fix thay vì sửa counter trực tiếp.

### Decision log

- Stateless preview; PostgreSQL source of truth; không cache/Redis/queue.
- Orders orchestrate qua narrow transaction ports; Settings/Payments/Notifications có module foundation riêng.
- Preview RepeatableRead; create/cancel Serializable; inventory lock trước voucher.
- Guest token fragment → sessionStorage → header; không query/localStorage.
- Email best-effort sau commit, không outbox.
- Automatic proof/pickup expiry thuộc Slice 07/08.
- Một STORE, một WAREHOUSE, một API replica; docs là nguồn sự thật.

## Tài liệu nguồn

- [Checkout/order endpoints](../api/checkout-and-customer-order-endpoints.md)
- [Checkout transaction](../architecture/checkout-transaction.md)
- [Order/deposit requirement](../requirements/order-deposit-and-fulfillment.md)
- [Order cancellation](../architecture/order-cancellation-and-refund.md)
- [Sales data](../data-model/sales.md)
- [Transaction/concurrency](../architecture/transaction-and-concurrency.md)
- [Testing strategy](../quality/testing-strategy.md)
