# Endpoint inventory

- Trạng thái: Ready for implementation (P0 contract complete).
- Phạm vi: use-case surface, storefront/backoffice separation, token transport và path/DTO/permission/error của toàn bộ nhóm P0 đã được mô tả trong các contract liên kết.

Tài liệu này sẽ là bảng kiểm duy nhất của API surface P0. Một endpoint chỉ sẵn sàng triển khai khi có actor, request DTO, response DTO, success status, error code chính và application use case tương ứng.

## 1. Nguyên tắc đã chốt

- 28 bảng không tạo thành 28 CRUD controller.
- Resource/history hỗ trợ invariant được thao tác qua use case chủ sở hữu, ví dụ Reservation qua checkout/fulfillment và VoucherUsage qua checkout/cancel/complete.
- API trả DTO/projection, không serialize Prisma model trực tiếp.
- Customer/guest endpoint luôn kiểm tra ownership; staff/admin endpoint kiểm tra role và field-level permission.
- Transition dùng named command, không generic status patch.
- Chỉ endpoint cần cho demo end-to-end hoặc quản trị dữ liệu tối thiểu mới là P0.
- P1/P2 không được scaffold lẫn vào P0 chỉ vì model đã tồn tại.

## 2. Nhóm năng lực P0

| Nhóm | Actor | Use case cần bao phủ | Không expose trực tiếp |
|---|---|---|---|
| Auth/account | Public, customer, staff/admin | Register, login/refresh/logout, reset password, employee invitation, profile/address; verify email là P1 | Session/token hash |
| Public catalog | Public | Product-grouped list/search/filter, product detail với available units, nested used-iPhone unit detail | Cost, raw identifier/location, internal inspection note |
| Catalog management | Staff/admin | Create/update/publish/archive product/variant/media | Generic spec/JSON/status mutation |
| Inventory | Staff/admin | iPhone intake/inspection/lifecycle/transfer; accessory receipt/transfer/adjust/return; admin-only iPhone cost | Direct counter/lifecycle patch |
| Cart | Customer/guest | View, set/update/remove item; explicit guest→customer merge | Reservation/raw guest token |
| Wishlist | Customer | View/add/remove exact iPhone unit hoặc accessory variant | Guest wishlist |
| Voucher | Customer/guest, admin | Public discovery/apply qua checkout; admin create/update/lifecycle/usage read | Direct VoucherUsage mutation |
| Checkout/Order | Customer/guest, staff/admin | Stateless preview, atomic checkout, owner list/detail/cancel; staff processing commands | Checkout session, direct total/status mutation |
| Payment | Customer/guest, staff/admin | Backend-mediated proof submit; staff review/evidence URL/verify/reject; cash/COD through finalization | Raw object path, generic status mutation |
| Fulfillment | Staff/admin, customer read | Pickup confirm/prepare/ready/complete; shipment create/handoff/delivered/failed/returned; tracking read | Carrier API, redelivery P0 |
| Refund | Staff/admin, customer read | Query/create/start processing/complete bank-or-cash/reject/cancel/evidence read | Direct refunded projection mutation |
| Warranty/after-sales | Customer/guest, staff/admin | Owner warranty/case/attachment; policy/warranty query; receive/inspect/approve/reject/typed resolution | Repair parts/order, accessory direct replacement |
| Employees | Admin | List/create/update/invite/resend/disable/enable employee | Admin-account management, permission editor/custom roles |
| Customers | Staff/admin | Safe list/detail; admin suspend/activate | Saved address, impersonation, role/email mutation |
| Settings/Audit | Public store read, Admin manage | Store info; versioned settings/bank QR; audit list/detail; safe system-health snapshot | Secret/provider credentials, audit mutation |
| Operations overview | Employee/Admin | Aggregate công việc cần ưu tiên, metric vận hành và đơn gần đây | Doanh thu/growth tự suy diễn, PII customer, gọi ghép nhiều list endpoint từ browser |

Mỗi nhóm trong bảng có contract chi tiết được liên kết ở cuối file và trong [API index](readme.md). Khi code phát hiện thiếu một use case P0, phải cập nhật contract trước hoặc cùng commit; không tự mở generic CRUD/status mutation.

## 3. Internal-only data

Không có public/general CRUD controller riêng cho:

- `AuthSession`, `AuthToken`.
- `InventoryReservation`, `StockMovement`, `VoucherUsage` mutation ngoài owning use case.
- Payment/Refund projection fields trên Order.
- Warranty issuance.
- `AuditLog` create/update/delete.
- StoreSettings history thông qua AuditLog.

Các record này vẫn có thể xuất hiện trong authorized read projection khi thực sự cần vận hành.

## 4. Tiêu chí thêm endpoint

Endpoint mới phải trả lời được:

1. Actor/use case nào cần nó trong MVP?
2. Module/application service nào sở hữu invariant?
3. Vì sao endpoint hiện có không đáp ứng?
4. Request/response/error/permission contract là gì?
5. Có làm lộ field hoặc cho phép bypass state machine không?
6. Nó là P0 hay có thể hoãn P1/P2?

## 5. Thứ tự triển khai khuyến nghị

1. Auth/account endpoints và token transport.
2. Public catalog và backoffice inventory intake/inspection.
3. Cart/wishlist/voucher, checkout và customer Order.
4. Payment proof review, fulfillment và refund.
5. Warranty/after-sales, employee, settings/audit/jobs.

## Liên kết

- [REST API conventions](readme.md)
- [Vai trò và phân quyền](../requirements/roles-and-permissions.md)
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
- [Backoffice overview và system health endpoints](backoffice-overview-system-health-endpoints.md)
- [Warranty và After-sales endpoints](warranty-and-aftersales-endpoints.md)
- [OpenAPI và typed client](openapi-and-client.md)
