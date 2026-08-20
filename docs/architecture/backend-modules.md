# Ranh giới module backend

## 1. Nguyên tắc tổ chức

- Module sở hữu dữ liệu và invariant của mình.
- Controller mỏng; business rule nằm trong service/policy.
- Không truy vấn bảng module khác tùy tiện chỉ vì Prisma cho phép.
- Module chỉ export application service hoặc port thực sự cần dùng.
- Không dùng `forwardRef` để che circular dependency; ưu tiên sửa boundary.
- Với module CRUD đơn giản, không tạo nhiều layer hình thức. Module phức tạp mới tách policy/state machine/repository rõ ràng.

## 2. Danh sách module

| Module | Trách nhiệm | Không chịu trách nhiệm |
|---|---|---|
| `Auth` | Đăng ký, đăng nhập, refresh, reset password, employee invitation, session | Hồ sơ khách, đơn hàng |
| `Users` | User, customer profile, employee, address, trạng thái tài khoản | Xác thực token |
| `Catalog` | Product, variant, spec, trạng thái catalog; authorize media owner product/variant | ProductMedia persistence, storage transport, số dư tồn và reservation |
| `Inventory` | Location, unit, identifier, inspection, stock level/movement, reservation | Tổng tiền đơn |
| `Cart` | Guest/account cart, merge cart, cart item | Giữ tồn |
| `Wishlist` | Danh sách yêu thích của customer | Recommendation |
| `Vouchers` | Rule, hiệu lực, phạm vi và usage | Tổng tiền cuối cùng độc lập khỏi order |
| `Orders` | Checkout, snapshot, pricing orchestration, order state | Xác minh chứng từ |
| `Payments` | Deposit/payment/refund/evidence state | Giao hàng |
| `Fulfillment` | Pickup, shipment, tracking, fulfillment state | API carrier trong MVP |
| `Warranty` | Policy, issued warranty, after-sales case | Repair order/part inventory |
| `Media` | Upload policy, StorageProvider và bảng ProductMedia; helper metadata file cho owner khác | Tự quyết định business ownership/state của Product, InventoryUnit, Payment, Refund hoặc AfterSales |
| `Notifications` | Template và gửi email | Thay đổi trạng thái nghiệp vụ |
| `Settings` | Cấu hình có kiểm soát | Secret hệ thống |
| `Audit` | Nhật ký actor/action/resource | Thay thế lịch sử domain |

## 3. Checkout orchestration

`Orders` là application orchestrator của checkout:

```text
Orders
  +-- đọc Cart
  +-- gọi Voucher policy
  +-- yêu cầu Inventory reserve
  +-- snapshot item/totals
  +-- tạo Order
  +-- khởi tạo Payment requirement khi shipping
```

Các thao tác database cần nguyên tử phải dùng cùng transaction context. `Inventory` không gọi ngược `Orders`; reference ID trong reservation không đồng nghĩa với dependency ngược ở application layer.

Trình tự và invariant chi tiết nằm trong [Checkout transaction](checkout-transaction.md).

## 4. Cấu trúc thư mục module

```text
feature/
  application/           use case và command/query nội bộ
  domain/                policy/state transition khi có
  infrastructure/        Prisma repository/provider adapter
  presentation/          controller, HTTP DTO, serializer
  feature.module.ts
```

Module nhỏ được phép gộp/bỏ thư mục không cần thiết; không tạo abstraction/file rỗng. Prisma access không được rải trong controller. Query dùng lại hoặc chứa concurrency rule phải có tên use case/repository rõ ràng.

## 5. Cross-cutting components

- Global validation pipe với whitelist và reject field không mong đợi.
- Authentication guard, role/policy guard và ownership checks.
- Exception filter với error code ổn định.
- Serialization interceptor loại field nhạy cảm.
- Request ID và structured logger.
- Rate limit cho auth, order lookup, checkout và upload evidence.
- Audit decorator/service cho hành động nhạy cảm.

## 6. Quy tắc lỗi

Error response dự kiến:

```json
{
  "error": {
    "code": "INVENTORY_NOT_AVAILABLE",
    "message": "Sản phẩm không còn khả dụng.",
    "details": [],
    "requestId": "..."
  }
}
```

- Không trả stack trace hoặc database error cho client.
- Conflict tồn kho/voucher dùng mã lỗi domain ổn định.
- Retry chỉ áp dụng cho thao tác idempotent.

Success/error envelope hiện hành được chốt tại [API response contract](../api/response-contract.md).
Stable error code và HTTP mapping nằm tại [API error catalog](../api/error-catalog.md).

API dùng resource CRUD kết hợp named command endpoint; không nhận generic status patch. Xem [REST API conventions](../api/readme.md).

## 7. Tài liệu liên quan

- [ADR-0013](../decisions/0013-backend-module-boundaries.md)
- [Đặt hàng, cọc và giao nhận](../requirements/order-deposit-and-fulfillment.md)
- [Checkout transaction](checkout-transaction.md)
- [REST API conventions](../api/readme.md)
- [API error catalog](../api/error-catalog.md)
