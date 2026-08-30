# Backoffice overview và system health endpoints

Tài liệu này khóa hai read model cho trang tổng quan vận hành và chẩn đoán hệ thống. Cả hai response dùng success envelope `{ "data": ... }` theo [response contract](response-contract.md), không trả Prisma model, secret, URL provider hoặc dữ liệu nhận diện khách hàng vượt quá mục đích vận hành.

## 1. Operations overview

| Method/path | Actor | Success | Cache |
|---|---|---|---|
| `GET /api/v1/backoffice/overview` | `EMPLOYEE`, `ADMIN` | `200 OperationsOverviewDto` | `no-store` |

Endpoint thực hiện một snapshot aggregate ở backend; browser không gọi ghép các endpoint list để tự tính dashboard. Snapshot gồm:

```text
generatedAt
metrics { activeOrders, paymentsUnderReview, openAfterSales, lowStockLevels }
priorities[] { key, count, oldestAt, href }
recentOrders[] { id, orderNumber, customerName, status,
                 fulfillmentStatus, paymentStatus, grandTotal, placedAt }
```

`recentOrders` tối đa năm đơn mới nhất, sắp xếp `placedAt DESC, id DESC`. `customerName` là snapshot tên khách hàng đã thuộc projection đơn vận hành; response không có email, phone, địa chỉ, payment evidence hay internal note.

### Định nghĩa metric và ưu tiên

| Field/key | Định nghĩa |
|---|---|
| `activeOrders` | Số Order có `status` là `PLACED`, `CONFIRMED` hoặc `PROCESSING`. |
| `paymentsUnderReview` | Số Payment có `status = UNDER_REVIEW`. |
| `openAfterSales` | Số AfterSalesRequest có `status` là `REQUESTED`, `RECEIVED`, `INSPECTING` hoặc `APPROVED`. |
| `lowStockLevels` | Số StockLevel có `quantityOnHand - quantityReserved <= reorderThreshold`. |
| `PAYMENT_REVIEW_OVERDUE` | Payment `UNDER_REVIEW` đã quá `submittedAt + reviewWindowMinutesSnapshot`. |
| `PICKUP_OVERDUE` | Order pickup quá `pickupHoldUntil`, chưa completed/cancelled và fulfillment chưa ở trạng thái kết thúc. |
| `REFUND_REQUESTED` | Refund có `status = REQUESTED`. |
| `AFTER_SALES_REQUESTED` | AfterSalesRequest có `status = REQUESTED`. |

Mỗi priority có `count`, `oldestAt` (hoặc `null` khi không có record) và `href` là deep link canonical đến danh sách đã lọc. Không đưa doanh thu, xu hướng hay dự đoán vào response nếu database không có metric nguồn tương ứng.

## 2. Detailed system health

| Method/path | Actor | Success | Cache |
|---|---|---|---|
| `GET /api/v1/backoffice/system/health` | `ADMIN` | `200 SystemHealthDetailDto` | `Cache-Control: no-store` |

Endpoint chạy các probe độc lập song song với timeout tối đa 2 giây/probe. Đây không phải public liveness/readiness endpoint: `/health/live` và `/health/ready` vẫn giữ response tối giản, không bọc business envelope.

```text
state, checkedAt, durationMs
api { state, reason, latencyMs, uptimeSeconds, version }
database { state, reason, latencyMs, appliedMigrationCount, incompleteMigrationCount }
storage { state, reason, latencyMs }
mail { state, reason, latencyMs }
```

- `state` tổng thể là `healthy` khi database, storage và mail đều `healthy`; `unavailable` khi database không đáp ứng; còn lại là `degraded`.
- Dependency state dùng `healthy`, `degraded`, `unavailable` hoặc `not_configured`; reason code ổn định gồm `ok`, `timeout`, `unavailable`, `no_applied_migration`, `incomplete_migration`, `not_configured`.
- API phản ánh process đang trả snapshot; database là query read-only và kiểm tra migration; storage là metadata probe read-only; mail là transport verification không gửi mail.
- Storage hoặc mail không khả dụng/không cấu hình chỉ làm snapshot detailed `degraded`; không thay đổi contract hay status của `/health/ready`.

Response tuyệt đối không chứa provider URL/project reference, bucket/object name, SMTP host/user, credential/key, connection string, biến môi trường, raw error/SQL/stack trace, địa chỉ nội bộ hoặc dữ liệu khách hàng.

## 3. Authorization, errors và acceptance

- Cả hai endpoint yêu cầu access token/session hợp lệ; anonymous/customer nhận `401` hoặc `403` theo auth boundary. Employee được đọc overview nhưng nhận `403 FORBIDDEN` khi gọi detailed system health.
- Backoffice rate limit vẫn áp dụng. Các lỗi business/infrastructure dùng error envelope chuẩn; không leak detail từ provider khi probe lỗi.
- Success response không cache để dashboard/health không hiển thị snapshot cũ từ HTTP intermediary. UI có thể giữ projection thành công gần nhất trong bộ nhớ khi refresh lỗi, nhưng không dùng nó làm bằng chứng health mới.

Acceptance tối thiểu: role guard cho cả hai endpoint; `no-store` được assert; overview metric đúng với trạng thái database; recent order bị giới hạn năm; health DTO không chứa sensitive key/value và probe failure không làm public readiness thay đổi.

## Liên kết

- [API response contract](response-contract.md)
- [API route namespaces](route-namespaces.md)
- [Observability và health](../architecture/observability.md)
- [Settings/Audit endpoints](employee-settings-audit-endpoints.md)
