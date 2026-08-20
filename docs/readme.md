# rePhone — Tài liệu dự án

Đây là điểm bắt đầu duy nhất cho toàn bộ tài liệu của rePhone. Bộ tài liệu hiện hành đã đủ để scaffold và triển khai backend/core P0; khi cần biết behavior, field, endpoint, constraint, test hay cách chạy, bắt đầu từ bản đồ dưới đây thay vì suy đoán từ code rời rạc.

## Trạng thái hiện tại

- Giai đoạn: backend/core ready for implementation.
- Thời gian dự kiến: 1 tháng.
- Trạng thái UI/UX: đã có định hướng sơ bộ nhưng tạm hoãn chi tiết.
- Trạng thái code: chưa khởi tạo ứng dụng; contract/schema/runbook đã sẵn sàng cho scaffold.
- Ngày cập nhật gần nhất: 2026-08-18.

## Bản đồ tài liệu

### Yêu cầu sản phẩm

- [Tầm nhìn và phạm vi](requirements/product-vision-and-scope.md)
- [Vai trò và phân quyền](requirements/roles-and-permissions.md)
- [Đặt hàng, cọc và giao nhận](requirements/order-deposit-and-fulfillment.md)
- [Bảo hành và hậu mãi](requirements/warranty-and-aftersales.md)
- [Yêu cầu phi chức năng](requirements/non-functional-requirements.md)

### Kiến trúc

- [Kiến trúc tổng thể](architecture/system-architecture.md)
- [Ranh giới module backend](architecture/backend-modules.md)
- [Mô hình Catalog và Inventory](architecture/catalog-inventory-model.md)
- [Xác thực và bảo mật](architecture/authentication-and-security.md)
- [State machines](architecture/state-machines.md)
- [Transaction và concurrency](architecture/transaction-and-concurrency.md)
- [Checkout transaction](architecture/checkout-transaction.md)
- [Hủy Order và khởi tạo Refund](architecture/order-cancellation-and-refund.md)
- [Fulfillment transactions](architecture/fulfillment-transactions.md)
- [Refund processing và evidence](architecture/refund-processing.md)
- [File upload pipeline](architecture/file-upload-pipeline.md)
- [Checklist kiểm định iPhone](architecture/iphone-inspection-checklist.md)
- [Database implementation với PostgreSQL/Prisma](architecture/database-implementation.md)
- [Configuration và environment schema](architecture/configuration.md)
- [Background jobs](architecture/background-jobs.md)
- [Transactional notifications](architecture/notifications.md)
- [Observability và health](architecture/observability.md)
- [Security threat model](architecture/security-threat-model.md)

### Mô hình dữ liệu

- [Lean ERD và mục lục data dictionary](data-model/readme.md)
- [Quy ước kiểu dữ liệu và constraint](data-model/conventions.md)
- [Identity/Auth](data-model/identity-auth.md)
- [Catalog/Inventory](data-model/catalog-inventory.md)
- [Cart/Wishlist/Voucher](data-model/commerce.md)
- [Order/Payment/Fulfillment](data-model/sales.md)
- [Warranty/After-sales](data-model/after-sales.md)
- [Settings/Audit](data-model/system.md)

### API contract

- [REST API conventions](api/readme.md)
- [API response contract](api/response-contract.md)
- [Pagination và sorting](api/pagination.md)
- [Filtering và search](api/filtering-and-search.md)
- [API error catalog](api/error-catalog.md)
- [Endpoint inventory](api/endpoint-inventory.md)
- [API route namespaces](api/route-namespaces.md)
- [Auth token transport](api/auth-token-transport.md)
- [Auth và account endpoints](api/auth-and-account-endpoints.md)
- [Public catalog endpoints](api/public-catalog-endpoints.md)
- [Cart và Wishlist endpoints](api/cart-and-wishlist-endpoints.md)
- [Checkout và customer Order endpoints](api/checkout-and-customer-order-endpoints.md)
- [Payment proof và review endpoints](api/payment-proof-and-review-endpoints.md)
- [Backoffice Catalog và Inventory endpoints](api/backoffice-catalog-inventory-endpoints.md)
- [Backoffice Order, Fulfillment và Refund endpoints](api/backoffice-order-fulfillment-refund-endpoints.md)
- [Voucher endpoints](api/voucher-endpoints.md)
- [User management, Settings và Audit endpoints](api/employee-settings-audit-endpoints.md)
- [Warranty và After-sales endpoints](api/warranty-and-aftersales-endpoints.md)
- [OpenAPI và typed API client](api/openapi-and-client.md)

### Phát triển và vận hành

- [Toolchain và cấu trúc monorepo](development/toolchain-and-monorepo.md)
- [Local development, demo deployment và runbook](operations/local-development-and-deployment.md)
- [Testing strategy và acceptance matrix](quality/testing-strategy.md)
- [Requirements traceability matrix](quality/requirements-traceability.md)
- [Documentation consistency audit](quality/documentation-consistency-audit.md)

### Lịch sử quyết định kiến trúc

- [Decision log và danh sách ADR](decisions/readme.md)
- [Mẫu ADR](decisions/adr-template.md)

`docs/decisions` là lịch sử đã đóng băng của giai đoạn brainstorm trước; không sửa/thêm/xóa trong đợt hoàn thiện hiện tại. Behavior triển khai hiện hành được hợp nhất ở requirements/architecture/data-model/api/quality/operations.

### Kế hoạch

- [Documentation readiness](planning/documentation-backlog.md)
- [Lộ trình triển khai 4 tuần](planning/implementation-roadmap.md)
- [Seed data và kịch bản demo](planning/seed-and-demo-scenarios.md)

## Đọc gì trước khi code

| Việc cần làm | Thứ tự đọc tối thiểu |
|---|---|
| Scaffold repository | Toolchain → Configuration → Local development → System architecture |
| Tạo database | Data model index/conventions → 6 data dictionary files → Database implementation → State machines |
| Viết một API slice | Requirement liên quan → Backend modules → Endpoint contract → Error/response/OpenAPI → Testing strategy |
| Checkout/payment/fulfillment | Order requirement → State machines → Transaction/checkout/fulfillment/refund docs → API contracts |
| Auth/security | Roles → Authentication/security → Token transport/auth endpoints → Threat model |
| Chuẩn bị demo | Roadmap → Seed/scenarios → Runbook → Release/security checklist |

## Nguồn sự thật khi có trùng nội dung

| Câu hỏi | Nguồn ưu tiên |
|---|---|
| P0 có/không có feature gì | `requirements/product-vision-and-scope.md` |
| Ai được làm gì | `requirements/roles-and-permissions.md` + endpoint contract cụ thể |
| Status/transition hợp lệ | `architecture/state-machines.md`, rồi transaction use-case liên quan |
| Bảng/field/relation | `data-model/*.md`; constraint vật lý ở database implementation |
| Path/request/response/error | Contract trong `api/`; stable error registry ở `api/error-catalog.md` |
| Version/package/cấu trúc repo | `development/toolchain-and-monorepo.md` |
| Environment/default/runtime | `architecture/configuration.md` |
| Test bắt buộc | `quality/testing-strategy.md` |
| Cách chạy/deploy/backup | `operations/local-development-and-deployment.md` |

ADR trong `docs/decisions` giải thích lịch sử lựa chọn. Nếu câu chữ ADR cũ ít chi tiết hơn tài liệu hiện hành, không dùng ADR để thay contract triển khai đã hợp nhất; không được thay đổi business scope đã chốt nếu chưa chủ động cập nhật toàn bộ docs liên quan.

## Quy ước cập nhật tài liệu

1. Không thay đổi file trong `docs/decisions`; đây là lịch sử đóng băng theo yêu cầu dự án.
2. Tài liệu nghiệp vụ giải thích hệ thống cần làm gì; kiến trúc giải thích các phần phối hợp; data/API/test/runbook khóa cách triển khai và kiểm chứng.
3. Thay field/status/path/error/default phải tìm và cập nhật mọi tài liệu hiện hành liên quan trong cùng thay đổi.
4. Khi code, OpenAPI, migration, test và tài liệu khác nhau, thay đổi chưa hoàn tất.
5. Mục ngoài P0 phải ghi rõ Deferred/P1/P2, không mô tả như behavior đang có.
6. Link mới phải dùng relative path hợp lệ và được kiểm tra trước release.

## Thuật ngữ chính

| Thuật ngữ | Ý nghĩa |
|---|---|
| Catalog product | Mẫu/dòng sản phẩm dùng để tổ chức catalog |
| Product variant | Cấu hình có SKU, ví dụ dung lượng và màu |
| Inventory unit | Một iPhone vật lý duy nhất |
| Stock level | Số dư tồn kho của một biến thể phụ kiện tại một vị trí |
| Reservation | Bản ghi giữ tồn kho cho một đơn trong một khoảng thời gian |
| Deposit | Khoản cọc bắt buộc đối với đơn giao hàng |
| Evidence | Ảnh/chứng từ private dùng để xác minh thanh toán hoặc hoàn tiền |
| Snapshot | Dữ liệu được sao chép vào đơn để không bị thay đổi theo catalog sau này |
