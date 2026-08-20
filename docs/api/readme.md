# REST API conventions

Tài liệu này là điểm bắt đầu cho API contract của rePhone. API dùng REST/OpenAPI, prefix `/api/v1` và hybrid resource/command style.

## 1. Base path và format

- Mọi business endpoint nằm dưới `/api/v1`.
- JSON field dùng `camelCase`; enum value dùng `UPPER_SNAKE_CASE` như data/state docs.
- UUID được dùng trong path cho internal resource identity; public code không thay access secret.
- Instant dùng ISO 8601 có timezone; Money dùng chuỗi số nguyên VND.
- OpenAPI là contract có thể sinh client/type và phải khớp DTO thực tế.

## 2. Resource endpoint

CRUD thông thường dùng plural noun:

```text
GET    /api/v1/backoffice/products
POST   /api/v1/backoffice/products
GET    /api/v1/backoffice/products/:id
PATCH  /api/v1/backoffice/products/:id
```

- `GET` không gây business side effect.
- `POST /resources` tạo resource mới.
- `PATCH` chỉ sửa field mutable được DTO cho phép; không dùng để vượt state machine.
- Không expose hard-delete cho order/payment/refund/shipment/warranty/audit hoặc master data đã có lịch sử.
- Không mặc định dùng `PUT` khi hệ thống không hỗ trợ replace toàn resource.

## 3. Named command endpoint

Business transition dùng `POST` với action name lower-kebab-case:

```text
POST /api/v1/checkouts
POST /api/v1/orders/:orderNumber/cancel
POST /api/v1/backoffice/orders/:id/start-preparing
POST /api/v1/payments/:paymentId/submit-proof
POST /api/v1/backoffice/payments/:id/verify
POST /api/v1/backoffice/shipments/:id/hand-over
POST /api/v1/backoffice/shipments/:id/mark-delivered
POST /api/v1/backoffice/refunds/:id/start-processing
POST /api/v1/backoffice/refunds/:id/complete-bank-transfer
```

Mỗi command:

- Có DTO riêng, chỉ nhận field cần cho use case.
- Có role/ownership và expected-state guard riêng.
- Gọi application service có tên nghiệp vụ; controller không tự set status.
- Trả trạng thái resource sau commit hoặc idempotent replay phù hợp.
- Ghi audit khi thuộc danh sách hành động nhạy cảm.
- Không được thay bằng `PATCH { status: ... }` tổng quát.

## 4. Ranh giới controller/application

- Controller parse/validate/authenticate, gọi đúng một application use case và map result.
- Application use case sở hữu transaction boundary và domain error.
- Repository/policy không biết HTTP status hoặc response body.
- Global exception filter chịu trách nhiệm map domain error sang HTTP contract.
- OpenAPI decorator/schema phải mô tả cả success và các error quan trọng.

## 5. Cache HTTP

P0 không dùng ETag/conditional GET hoặc application cache. Public media do Supabase/CDN cache; API catalog luôn đọc PostgreSQL với pagination/index. Có thể thêm `Cache-Control: no-store` cho response chứa account/order/private signed URL; endpoint public mặc định cũng không hứa cache contract cho tới P1.

## Liên kết

- [Ranh giới module backend](../architecture/backend-modules.md)
- [State machines](../architecture/state-machines.md)
- [ADR-0043](../decisions/0043-hybrid-rest-resource-and-command-api.md)
- [API response contract](response-contract.md)
- [ADR-0044](../decisions/0044-consistent-api-response-envelope.md)
- [Pagination và sorting](pagination.md)
- [ADR-0045](../decisions/0045-offset-pagination.md)
- [Filtering và search](filtering-and-search.md)
- [ADR-0046](../decisions/0046-explicit-query-filters-and-postgresql-search.md)
- [API error catalog](error-catalog.md)
- [ADR-0047](../decisions/0047-centralized-domain-error-catalog.md)
- [Endpoint inventory](endpoint-inventory.md)
- [ADR-0048](../decisions/0048-use-case-oriented-api-surface.md)
- [API route namespaces](route-namespaces.md)
- [ADR-0049](../decisions/0049-storefront-and-backoffice-route-separation.md)
- [Auth token transport](auth-token-transport.md)
- [ADR-0050](../decisions/0050-memory-access-token-and-http-only-refresh-cookie.md)
- [Auth và account endpoints](auth-and-account-endpoints.md)
- [ADR-0052](../decisions/0052-lean-auth-and-account-endpoint-set.md)
- [Public catalog endpoints](public-catalog-endpoints.md)
- [ADR-0057](../decisions/0057-grouped-product-catalog.md)
- [Cart và Wishlist endpoints](cart-and-wishlist-endpoints.md)
- [ADR-0058](../decisions/0058-http-only-guest-cart-cookie.md)
- [Checkout và customer Order endpoints](checkout-and-customer-order-endpoints.md)
- [ADR-0059](../decisions/0059-stateless-checkout-preview-and-create.md)
- [Payment proof và review endpoints](payment-proof-and-review-endpoints.md)
- [Backoffice Catalog và Inventory endpoints](backoffice-catalog-inventory-endpoints.md)
- [Backoffice Order, Fulfillment và Refund endpoints](backoffice-order-fulfillment-refund-endpoints.md)
- [Voucher endpoints](voucher-endpoints.md)
- [User management, Settings và Audit endpoints](employee-settings-audit-endpoints.md)
- [Warranty và After-sales endpoints](warranty-and-aftersales-endpoints.md)
- [OpenAPI và typed API client](openapi-and-client.md)
