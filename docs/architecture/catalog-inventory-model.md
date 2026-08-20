# Mô hình Catalog và Inventory

## 1. Mục tiêu

Catalog/Inventory phải thể hiện được hai kiểu hàng:

- iPhone cũ: mỗi máy vật lý duy nhất, có định danh, tình trạng, giá và ảnh riêng.
- Phụ kiện: quản lý theo SKU, location và số lượng.

Thiết kế hiện hành là phiên bản lean cho đồ án, được chốt tại [ADR-0025](../decisions/0025-lean-28-table-data-model.md). Data dictionary đầy đủ nằm tại [Catalog/Inventory](../data-model/catalog-inventory.md).

## 2. Cấu trúc

```text
Product
└── ProductVariant
    ├── InventoryUnit (SERIALIZED)
    │   ├── InventoryInspection
    │   └── ProductMedia
    ├── StockLevel (QUANTITY)
    │   └── StockMovement
    └── InventoryReservation

InventoryLocation
├── InventoryUnit
└── StockLevel
```

Chín bảng thuộc domain này:

1. `Product`
2. `ProductVariant`
3. `InventoryLocation`
4. `InventoryUnit`
5. `InventoryInspection`
6. `StockLevel`
7. `StockMovement`
8. `InventoryReservation`
9. `ProductMedia`

## 3. Quy tắc lean

- Phone specs là các cột nullable trên Product; không tạo bảng spec riêng.
- IMEI 1/2, serial và EID là các nhóm cột encrypted/HMAC/suffix trên InventoryUnit.
- Inspection vẫn tách bảng vì một máy có thể kiểm tra nhiều lần.
- Checklist chức năng dùng JSONB theo fixed versioned schema; P0 không có checklist configurator. Replaced parts vẫn là JSONB đã validate.
- Reservation vẫn tách khỏi lifecycle máy vì đây là invariant chống oversell.
- Stock movement vẫn append-only để trình bày/đối soát tồn phụ kiện.
- Product media dùng một bảng với owner XOR product/variant/unit.

## 4. Invariant quan trọng

- iPhone variant dùng `SERIALIZED`; accessory dùng `QUANTITY`.
- Một iPhone chỉ có tối đa một reservation active.
- `quantityReserved` không vượt `quantityOnHand`.
- Availability = lifecycle/stock phù hợp và không bị reservation giữ.
- Unit chỉ được AVAILABLE khi có giá, định danh phù hợp và current inspection đạt yêu cầu.
- Identifier không xuất hiện dạng đầy đủ trong public DTO.
- Reserve/release/consume và cập nhật stock phải atomic.
- Mỗi Order có một `fulfillmentLocationId`; checkout không split reservation giữa STORE và WAREHOUSE.

## 5. Phần hoãn

- Bảng identifier tổng quát.
- Phone/accessory spec engine.
- Price history và inventory event sourcing.
- Repair order/part inventory.
- Multi-branch/multi-warehouse.
- Automated reconciliation dashboard.

## 6. Tài liệu liên quan

- [Data dictionary Catalog/Inventory](../data-model/catalog-inventory.md)
- [ADR-0005](../decisions/0005-dual-inventory-model.md)
- [ADR-0006](../decisions/0006-inventory-location-and-reservation.md)
- [ADR-0025](../decisions/0025-lean-28-table-data-model.md)
- [ADR-0038](../decisions/0038-single-location-order-allocation.md)
- [Checklist kiểm định iPhone](iphone-inspection-checklist.md)
- [ADR-0061](../decisions/0061-versioned-fixed-iphone-inspection-checklist.md)
