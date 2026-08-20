# API route namespaces

API tách rõ shared auth, storefront và backoffice dưới `/api/v1`. Namespace là lớp tổ chức/attack-surface rõ ràng; authorization guard vẫn là nguồn thực thi quyền, không dựa riêng vào path.

## 1. Shared authentication/account

```text
/api/v1/auth/*
/api/v1/account/*
```

- Auth endpoint phục vụ public/customer/staff/admin theo policy từng action.
- `account` là self-service projection của identity hiện tại, không dùng để quản lý employee khác.

## 2. Storefront

```text
/api/v1/products/*
/api/v1/store
/api/v1/vouchers
/api/v1/cart/*
/api/v1/wishlist/*
/api/v1/checkouts
/api/v1/orders/*
/api/v1/payments/*       customer/guest proof actions được phép
/api/v1/warranties/*
/api/v1/after-sales/*
```

- Products/store/vouchers trả projection public-safe.
- Cart/checkout/order/payment/warranty/after-sales luôn kiểm tra customer/guest ownership.
- Staff gọi storefront route không làm response tự xuất hiện internal note, cost, raw identifier hoặc evidence metadata.
- Guest access token là credential riêng, không phải order number/UUID.

## 3. Backoffice

```text
/api/v1/backoffice/products/*
/api/v1/backoffice/variants/*
/api/v1/backoffice/product-media/*
/api/v1/backoffice/inventory-units/*
/api/v1/backoffice/inspections/*
/api/v1/backoffice/inventory-locations
/api/v1/backoffice/stock-levels
/api/v1/backoffice/stock-movements
/api/v1/backoffice/stock/*
/api/v1/backoffice/orders/*
/api/v1/backoffice/payments/*
/api/v1/backoffice/shipments/*
/api/v1/backoffice/refunds/*
/api/v1/backoffice/warranty-policies/*
/api/v1/backoffice/warranties/*
/api/v1/backoffice/after-sales/*
/api/v1/backoffice/vouchers/*
/api/v1/backoffice/employees/*
/api/v1/backoffice/customers/*
/api/v1/backoffice/settings
/api/v1/backoffice/settings/bank-qr
/api/v1/backoffice/audit-logs/*
```

- Mọi route backoffice require authenticated employee/admin trước policy chi tiết.
- Admin dùng chung route với employee và được policy cho thêm capability/field; không tạo namespace `/admin` song song.
- Admin-only gồm employee management, customer suspend/activate, voucher management, settings, audit và cost field; customer list/detail cho phép employee read-only.
- Employee không nhận field admin-only chỉ vì endpoint chung; serializer/query projection enforce field permission.

## 4. Controller và application reuse

- Storefront/backoffice có thể dùng controller và DTO khác nhau nhưng gọi chung application/query service khi invariant giống nhau.
- Không copy business transition chỉ để phục vụ namespace khác.
- Query projection được đặt tên theo audience, ví dụ `PublicProductDetail`, `CustomerOrderDetail`, `BackofficeOrderDetail`.
- OpenAPI tag tách `Storefront/*` và `Backoffice/*`; security requirement được mô tả trên từng operation.

## 5. Quy tắc path

- Plural noun cho resource collection; named command lower-kebab-case.
- Không encode role vào resource ID hoặc query parameter.
- Không dùng một route với response schema thay đổi tùy role.
- Không tạo `/staff` và `/admin` duplicate tree.
- Endpoint health/docs không thuộc business `/api/v1`: `/health/live`, `/health/ready`; Swagger UI `/docs` chỉ bật development.

## 6. Acceptance test tối thiểu

- Anonymous/customer không truy cập được bất kỳ `/backoffice/*` route nào.
- Employee không truy cập admin-only action/field.
- Admin dùng cùng backoffice route và nhận đúng capability được phép.
- Staff gọi storefront route vẫn chỉ nhận public/customer-safe projection.
- Customer/guest không đọc order của người khác bằng cách đổi ID/order number.
- OpenAPI thể hiện response schema riêng cho storefront/backoffice.

## Liên kết

- [Endpoint inventory](endpoint-inventory.md)
- [Vai trò và phân quyền](../requirements/roles-and-permissions.md)
- [ADR-0049](../decisions/0049-storefront-and-backoffice-route-separation.md)
