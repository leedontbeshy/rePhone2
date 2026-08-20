# rePhone Lean Data Model

Đây là mục lục của full ERD P0 đã chốt tại [ADR-0025](../decisions/0025-lean-28-table-data-model.md). Mô hình gồm 28 bảng, tối ưu cho đồ án tốt nghiệp/portfolio nhưng vẫn giữ các invariant quan trọng về quyền, tồn kho và tiền.

## Nhóm bảng

| Domain | Số bảng | Tài liệu |
|---|---:|---|
| Identity/Auth | 4 | [Identity và Auth](identity-auth.md) |
| Catalog/Inventory | 9 | [Catalog và Inventory](catalog-inventory.md) |
| Cart/Wishlist/Voucher | 5 | [Commerce](commerce.md) |
| Order/Payment/Fulfillment | 5 | [Sales](sales.md) |
| Warranty/After-sales | 3 | [After-sales](after-sales.md) |
| Settings/Audit | 2 | [System](system.md) |

## Quan hệ tổng quát

```text
User
├── CustomerAddress
├── AuthSession / AuthToken
├── Cart / WishlistItem
└── Order

Product
└── ProductVariant
    ├── InventoryUnit ── InventoryInspection
    ├── StockLevel ── StockMovement
    ├── InventoryReservation
    └── ProductMedia

Cart ── CartItem
Cart ── 0..1 Order
Voucher ── VoucherUsage ── Order

Order
├── OrderItem ── Warranty
├── Payment / Refund
├── Shipment
└── InventoryReservation

WarrantyPolicy ── Warranty ── AfterSalesRequest

StoreSettings
AuditLog

InventoryLocation ── Order (fulfillment source)
```

## Nguyên tắc

- [Quy ước kiểu dữ liệu và constraint](conventions.md) áp dụng cho mọi bảng.
- Foreign key dùng để truy vết, snapshot dùng để bảo toàn lịch sử.
- JSONB chỉ xuất hiện tại các field được liệt kê và phải được validate ở API.
- Không thêm bảng mới nếu chưa cập nhật ERD, data dictionary và ADR khi đó là thay đổi kiến trúc.
- Enum/state transition chi tiết được khóa trong tài liệu state machine P0 tiếp theo.

## Trạng thái

- Entity list: Accepted.
- Logical fields/relations: baseline cho data dictionary.
- State transitions: Accepted tại [State machines](../architecture/state-machines.md).
- Exact Prisma schema/migration SQL: quy tắc triển khai đã chốt tại [Database implementation](../architecture/database-implementation.md); file schema/migration sẽ được tạo trong bước code.
