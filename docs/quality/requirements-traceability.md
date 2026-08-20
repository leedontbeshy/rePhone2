# Requirements traceability matrix

Ma trận này giúp đi từ yêu cầu → module → dữ liệu → API → kiểm thử. Nó không lặp contract chi tiết; link nguồn là nơi phải sửa khi behavior thay đổi.

| Capability P0 | Requirement/architecture | Module chủ | Bảng chính | API contract | Acceptance chính |
|---|---|---|---|---|---|
| Register/login/session/invite | Roles + authentication/security | Auth, Users | User, AuthSession, AuthToken | Auth/account + token transport | Register no auto-login; rotation/reuse; disable/revoke; invite one-time |
| Customer profile/address/backoffice lifecycle | Roles/guest ownership | Users | User, CustomerAddress | Auth/account + user management/settings/audit | Ownership; one default; safe staff read; admin suspend; Order snapshot bất biến |
| Public grouped catalog | Product vision + catalog model | Catalog, Inventory | Product, ProductVariant, ProductMedia, InventoryUnit/Inspection | Public catalog | Chỉ active/available; no cost/raw identifier/internal note |
| iPhone intake/inspection | Catalog model + checklist/state machine | Inventory, Media | InventoryUnit, InventoryInspection, ProductMedia | Backoffice catalog/inventory | Encrypt/HMAC; PASSED gate; one current; unit photo |
| Accessory inventory | Catalog model + transaction rules | Inventory | StockLevel, StockMovement | Backoffice catalog/inventory | Movement/counter atomic; no negative/oversell |
| Cart/wishlist | Product scope | Cart, Wishlist | Cart, CartItem, WishlistItem | Cart/wishlist | Guest cookie/CSRF; merge; no reservation; ownership |
| Voucher | Product scope + commerce model | Vouchers, Orders | Voucher, VoucherUsage | Voucher + checkout | Scope/formula/quota; reserve/release/consume concurrency |
| Checkout/order | Order/deposit requirement + checkout transaction | Orders orchestrator | Cart/Item, Order/Item, Reservation, VoucherUsage, Payment | Checkout/customer order | Server pricing; sourceCart idempotency; single location; atomic reservation |
| Deposit proof/review | Order/deposit + file pipeline + state machine | Payments, Orders, Inventory, Media | Payment, Order, Reservation | Payment proof/review | Deadline race; private evidence; verify/reject atomic |
| Pickup | Order/fulfillment + fulfillment transaction | Fulfillment, Payments, Inventory | Order/Item, Reservation, Payment, Warranty | Backoffice order/fulfillment | CASH balance; consume once; complete/warranty atomic |
| Shipping/tracking/COD | Order/fulfillment + state machine | Fulfillment, Payments, Inventory | Shipment, Order, Reservation, Payment | Backoffice order/fulfillment | One attempt; handover consume; COD; returned inspection; no redelivery |
| Cancel/refund | Cancellation + refund processing | Orders, Payments, Inventory, Vouchers | Order, Refund, Reservation, VoucherUsage | Customer order + backoffice refund | Refund obligation once; evidence before bank complete; no over-refund |
| Warranty/after-sales | Warranty requirements + state machine | Warranty, Inventory, Payments, Media | WarrantyPolicy, Warranty, AfterSalesRequest | Warranty/after-sales | Snapshot interval; one active case; receive/decision/resolution invariant |
| Employee/settings/audit | Roles + configuration/observability | Users, Settings, Audit | User/AuthToken, StoreSettings, AuditLog | User management/settings/audit | Admin-only mutations; optimistic version; snapshot; redaction |
| Upload/storage | File pipeline + threat model | Media + owning module | ProductMedia hoặc owner metadata | Upload endpoint trong từng contract | Magic byte/size/ownership/orphan/signed URL |
| Expiry/cleanup | Background jobs | Owning use cases + scheduler adapter | Payment/Order/Reservation/Cart/Auth | Không có public job API | Idempotent batch; proof-expiry race; one replica invariant |
| Email | Notifications | Notifications + owning module | Không thêm outbox table | Response delivery status ở endpoint liên quan | Only after new commit; SMTP fail không rollback; no secret |
| Runtime/quality | NFR + operations | Cross-cutting | `_prisma_migrations` + 28 domain tables | Health/OpenAPI | Clean migration/seed; link/contract drift; ready 503 DB down |

## Cách dùng khi triển khai một slice

1. Chọn hàng capability.
2. Đọc requirement/architecture và data/API nguồn được nêu.
3. Viết acceptance tests tương ứng trước/cùng use case.
4. Sau code, generate OpenAPI/client và kiểm tra projection/permission.
5. Nếu phải đổi một invariant, cập nhật toàn bộ ô nguồn liên quan, không chỉ endpoint Markdown.

## Coverage P0

Mọi nhóm trong [Endpoint inventory](../api/endpoint-inventory.md) có ít nhất một hàng ở ma trận. Mọi bảng trong [28-table data model](../data-model/readme.md) có module/use case sở hữu; không có table “để dành” bắt buộc phải có CRUD controller.

## Liên kết

- [Docs index/source precedence](../readme.md)
- [Testing strategy](testing-strategy.md)
- [Endpoint inventory](../api/endpoint-inventory.md)
- [Backend modules](../architecture/backend-modules.md)
