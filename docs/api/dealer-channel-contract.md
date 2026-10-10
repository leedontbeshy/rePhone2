# Dealer API contract — v1.0

Đã triển khai trên `codex/dealer-portal`. Schema chính xác nằm ở `apps/api/openapi/openapi.json`, client ở `packages/api-client/src/schema.d.ts`. Prefix chung `/api/v1`, response `{data}`, error envelope chuẩn của rePhone. Operation đại lý có prefix `Dealer`, giữ nguyên 162 operation bán lẻ.

## Credential và dữ liệu

`X-Dealer-Api-Key: rp_test_…` hoặc `rp_live_…`, chỉ server-to-server; request có Origin/Sec-Fetch-Site bị từ chối. Portal dùng session CUSTOMER. DealerId lấy từ credential, không nhận tenant override. Key raw hiện một lần, lưu hash, hết hạn 90 ngày, tối đa hai key active. Quota chung mỗi đại lý: 60 read/phút, 10 write/phút, 5 proof/10 phút; HTTP 429 kèm Retry-After.

VND là chuỗi số nguyên, ID UUID, instant ISO UTC. Không xuất giá vốn, dự phòng/lãi tối thiểu, full IMEI, private object path hoặc bank evidence. `orders:read` thấy tổng hợp tiền; chỉ key có `payments:read` nhận paymentRequests/hướng dẫn ngân hàng và refunds chi tiết. Session chủ đại lý có quyền đầy đủ.

`paidAmount` = phân bổ sau reversal; `refundObligationAmount` gồm REQUESTED/PROCESSING/COMPLETED; `fundedAmount = paidAmount − refundObligationAmount`. `fullyFunded` còn kiểm tra hold đối soát. Dùng `fundingShortfall` để đánh giá điều kiện xuất hàng, không dùng `balanceDue` tương thích đơn bán lẻ.

## API đối tác

| Method/path dưới `/dealer` | Scope | Hành vi |
|---|---|---|
| GET `/catalog?page=1&pageSize=20&q=…&sort=price-asc&condition=A` | catalog:read | Máy khả dụng, giá/tham chiếu, cấu hình, bảo hành, ảnh công khai, revision, hasMore |
| POST `/orders/preview` | orders:write | Tính giá/phí và fingerprint, không giữ máy |
| POST `/orders` | orders:write | Idempotency-Key, externalOrderId, previewFingerprint, inventoryUnitId, contact, shippingAddress; một máy/đơn |
| GET `/orders?page=1&q=…` | orders:read | Chỉ đơn mình; q tìm orderNumber/externalOrderId |
| GET `/orders/{id}` | orders:read | Snapshot/trạng thái/version/tracking/funding/deadline |
| POST `/orders/{id}/cancel` | orders:write | reason; guard tiền/chứng từ/vận chuyển; refund nếu có |
| GET `/orders/{id}/payment-requests` | payments:read | Nghĩa vụ, hướng dẫn chuyển khoản và lịch sử proof |
| POST `/payment-requests/{id}/proofs` | payments:write | Multipart file private, không ghi nhận tiền |
| GET `/refunds` | payments:read | Các khoản hoàn gần nhất, không bank evidence |
| GET, POST `/after-sales` | after-sales:read/write | Danh sách/tạo case theo orderItemId; POST cần Idempotency-Key |
| GET `/after-sales/{id}` | after-sales:read | Tiến độ, assessment, kết quả, gia hạn bảo hành |
| POST `/after-sales/{id}/cancel` | after-sales:write | Hủy REQUESTED |
| POST `/after-sales/{id}/attachments` | after-sales:write | File private, tối đa năm file/case |
| GET `/after-sales/{id}/attachments/{attachmentId}` | after-sales:read | Signed URL sau ownership check |
| GET `/orders/{id}/warranties` | after-sales:read | Phiếu khách: bên bán/kiểm định/bảo hành/hỗ trợ, không giá sỉ |

Idempotency-Key dài 16–128 ký tự ASCII hiển thị. Cùng payload/key replay resource, khác payload trả 409 CONCURRENT_MODIFICATION. `dealerId + externalOrderId` unique lâu dài. Không đổi key sau timeout khi chưa xác định kết quả. Tạo đơn trả `{order,replayed}`. Stale preview hoặc vùng giao cần quote trả CHECKOUT_REVIEW_REQUIRED; thiếu tồn trả INVENTORY_NOT_AVAILABLE.

Body preview gồm inventoryUnitId, shippingAddress, shippingQuoteId tùy chọn. Create thêm externalOrderId, previewFingerprint, contact `{fullName,email,phone}`, note và linkedOriginalOrderId tùy chọn. shippingAddress gồm receiverName, phone, addressLine, ward, district, province. Trường/giới hạn chính xác lấy từ OpenAPI.

Catalog tìm `q` theo tên dòng máy, tên phiên bản, SKU và inventoryCode; bỏ khoảng trắng thừa, không phân biệt hoa thường; hỗ trợ `256GB` và `256 GB`. Tất cả từ tìm kiếm phải xuất hiện. `condition` tùy chọn A/B/C, `sort` là newest (mặc định), price-asc, price-desc. Lọc điều kiện tồn/giá trước khi phân trang; chi tiết đọc theo lô trong một snapshot transaction. `pageSize` 1–100, dùng `hasMore` để đọc tiếp. `image` có thể null; không dùng URL ảnh riêng tư làm fallback. Giá preview/create vẫn tính lại, không tin danh sách đã cache.

## Portal và backoffice

`GET /backoffice/dealers/configuration` luôn cho staff đọc trạng thái hạ tầng (`enabled`), mở nhận đăng ký/đơn mới (`open`), `pricingReady`, `version` và môi trường; không trả bí mật. ADMIN dùng `POST /backoffice/dealers/configuration` với `{open, expectedVersion, reason}` để thay đổi cổng, có audit và chống ghi đè phiên bản. Đóng không chặn đơn cũ, đối chiếu tiền hoặc hậu mãi. Không sửa môi trường bằng request. `GET /backoffice/dealers/inventory/{id}/pricing` ADMIN-only trả giá sàn, giá tự tính/override và trạng thái chào bán; dữ liệu nội bộ này không thuộc Dealer API.

`/dealer-portal`: configuration/profile/application; bank-accounts/confirm; api-keys/revoke; webhooks/test/disable và webhook-deliveries/replay. Tạo key, đổi bank, đổi webhook yêu cầu mật khẩu hiện tại. Bank cần email token + ADMIN verify, tài khoản thay thế chờ 24 giờ, refund cũ giữ snapshot.

`POST /dealer-portal/bank-accounts` trả tài khoản đã lưu cùng `emailDelivery`: `SENT`, `FAILED`, `EXISTING` (trùng tài khoản chờ xác nhận) hoặc `NOT_REQUIRED` (đã xác nhận). Lỗi gửi email không làm thất bại thao tác lưu. Gửi lại cùng ngân hàng, số tài khoản đầy đủ và chủ tài khoản sẽ dùng lại bản chưa bị khóa, kể cả các yêu cầu đồng thời. Không đối chiếu chỉ bằng bốn số cuối.

`POST /dealer-portal/bank-accounts/{id}/resend-confirmation` nhận `currentPassword`, chỉ chủ hồ sơ được gửi lại cho tài khoản chưa xác nhận và chưa bị khóa. Không tạo tài khoản mới; xoay token 30 phút, cách lần gửi trước ít nhất 60 giây (429 nếu quá sớm). Token cũ hết hiệu lực. Kết quả `emailDelivery` là `SENT` hoặc `FAILED`; không trả token hoặc số tài khoản đầy đủ.

`/backoffice/dealers`: hồ sơ/status/risk, pricing/override, shipping-quotes, orders/cancel/return-settlement, proofs/evidence/reject, receipts/assign/corrections, allocations/reverse, refunds/actions/destination/rebind/complete, bank verify/disable, after-sales/assessment/backup-intake, reconciliation/resolve và release hold. Sensitive money/config/bank actions ADMIN-only. Refund/correction/backup intake cần Idempotency-Key. Full refund nhiều nguồn trả `{refunds,totalAmount}`, mỗi Refund đúng một nguồn.

TEST có `/backoffice/dealers/sandbox/orders/{id}/simulate`, action PAYMENT/DELIVER/FAIL/RETURN/CANCEL/REFUND. Route không đăng ký trên LIVE. OpenAPI chuẩn sinh ở LIVE/disabled không chứa simulator; configuration trả simulationEnabled.

## Webhook

```json
{
  "eventId": "UUID", "eventType": "order.updated",
  "resourceType": "order", "resourceId": "UUID", "resourceVersion": 7,
  "occurredAt": "2026-10-09T08:30:00Z", "environment": "TEST",
  "data": { "status": "PROCESSING" }
}
```

Headers: X-Rephone-Event-Id; X-Rephone-Timestamp (Unix giây); X-Rephone-Signature dạng `keyId:hexHmac[,previousKeyId:hexHmac]`. HMAC-SHA256 trên `timestamp.rawBody`, không stringify lại JSON. Consumer kiểm tra ±5 phút, constant-time comparison, đúng environment, dedupe eventId. Với projection trạng thái: bỏ resourceVersion cũ; gap/không chắc thì GET resource. Không dùng webhook làm nguồn tiền cuối cùng.

Outbox ghi cùng commit, callback có thể trùng/sai thứ tự. Tick 15 giây, lease 60 giây, tối đa bốn delivery/tick và một đang chạy/endpoint. Bảy lần thử tổng cộng: ngay lần đầu rồi chờ 1m/5m/15m/1h/6h/24h sau lỗi trước. Timeout 5 giây, 2xx thành công. Replay giữ eventId/body, ký timestamp mới. Rotate cùng URL có overlap 24 giờ. Lưu mã HTTP/lỗi tổng quát, không lưu response body đối tác.

Chỉ HTTPS public cổng 443 trên domain đã duyệt. Kiểm DNS mỗi kết nối, chặn private/loopback/link-local/metadata/mixed DNS, pin IP đã kiểm tra vào TLS, không redirect. Security lock suppress callbacks; business suspension giữ events đơn cũ. Portal có history/test/replay/disable.

## Quản lý thay đổi

Người tích hợp nhánh sở hữu schema/API/migration. Trình tự: schema/command → DTO/Swagger → `pnpm api:openapi` → `pnpm api:client` → consumer/tests. Không sửa tay artifact. Xem [runbook](../operations/dealer-channel.md), [spec](../requirements/dealer-channel.md) và [invariant registry](../quality/dealer-invariants.md).
