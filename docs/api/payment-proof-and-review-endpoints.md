# Payment proof và review endpoints

- Trạng thái: Accepted theo ADR-0034, ADR-0035 và ADR-0060.
- Phạm vi: shipping deposit bằng bank transfer thủ công; customer/guest submit proof, staff/admin review.

## 1. Endpoint inventory

### Customer/guest

| Method/path | Actor | Content type | Success |
|---|---|---|---|
| `POST /api/v1/payments/:paymentId/submit-proof` | Owner CUSTOMER hoặc guest Order credential | `multipart/form-data` với một field `file` | `200 PaymentPublicDto` |

Payment hiện hành được đọc trong `OrderDetailDto`; không có public payment list toàn hệ thống.

### Backoffice

| Method/path | Actor | Request | Success |
|---|---|---|---|
| `GET /api/v1/backoffice/payments` | EMPLOYEE/ADMIN | Filter/pagination | `200 PaymentReviewListItemDto[]` |
| `GET /api/v1/backoffice/payments/:id` | EMPLOYEE/ADMIN | — | `200 PaymentReviewDetailDto` |
| `GET /api/v1/backoffice/payments/:id/evidence-url` | EMPLOYEE/ADMIN | — | `200 { url, expiresAt }` |
| `POST /api/v1/backoffice/payments/:id/verify` | EMPLOYEE/ADMIN | `receivedAmount`, `note?` | `200 PaymentReviewResultDto` |
| `POST /api/v1/backoffice/payments/:id/reject` | EMPLOYEE/ADMIN | `reason` | `200 PaymentReviewResultDto` |

Không có generic `PATCH payment.status` và không overwrite attempt đã rejected/verified.

## 2. Submit proof

### Preconditions

- Caller sở hữu Order chứa Payment bằng customer Bearer hoặc `X-Guest-Order-Token`/matching converted-cart credential.
- Payment là `DEPOSIT`, method `BANK_TRANSFER`, status `AWAITING_PROOF`.
- Server time phải `now < Payment.expiresAt`; tại đúng deadline (`now >= expiresAt`) proof đã hết hạn.
- Order/fulfillment chưa terminal.

### Upload/transaction flow

1. Authorize ownership/state sơ bộ trước khi xử lý file.
2. Nhận đúng một `file`; JPEG/PNG/WebP/PDF, tối đa 10 MiB.
3. Validate bytes/MIME và upload private Supabase path do backend sinh.
4. Mở Serializable transaction, recheck Payment/deadline/Order/reservation.
5. Lưu `evidenceBucket/objectPath`, `submittedAt`, `customerDeclaredAt = now`.
6. Chuyển Payment `AWAITING_PROOF → UNDER_REVIEW`.
7. Chuyển reservation `holdReason DEPOSIT → REVIEW` và `expiresAt = null`.
8. Commit rồi trả public projection; storage/notification không chạy trong transaction.

Nếu transaction fail sau upload, backend delete object best-effort. Không có record proof hợp lệ nếu bước 4–7 rollback.

### Retry/concurrency

- Request đến khi Payment đã `UNDER_REVIEW` trả current `PaymentPublicDto`, không thay evidence.
- Hai submit đồng thời có tối đa một object được attach; request thua xóa object vừa upload best-effort và trả current state.
- Payment đã terminal trả `PAYMENT_ALREADY_REVIEWED`; không cho thay proof.
- Deadline qua trước transaction trả `PAYMENT_PROOF_DEADLINE_PASSED`; expiration/cancellation command release resource theo state policy.

## 3. `PaymentPublicDto`

```text
id, orderNumber
purpose, method, status
expectedAmount
transferContent?
bankTransferInstructions? { bankName, accountNumber, accountHolder, qrUrl?, transferContent }
expiresAt?
submittedAt?
reviewOverdue
reviewSlaDueAt?
rejectionReason?
```

- Không trả evidence bucket/path, signed URL, reviewer ID, internal note hoặc received amount trước khi review xong.
- `reviewSlaDueAt = submittedAt + reviewWindowMinutesSnapshot` và `reviewOverdue` tính động, không thêm dueAt DB column; default snapshot là 1440 phút.
- Sau verify, public Order detail phản ánh paidAmount/balance/status; `receivedAmount` có thể trả trong authorized payment summary.

## 4. Backoffice list/detail

### Query DTO

```text
status?, purpose?, method?, reviewOverdue?,
orderNumber?, submittedFrom?, submittedTo?,
page=1, pageSize=20, sortBy=submittedAt, sortOrder=asc
```

- Status mặc định cho màn review: `UNDER_REVIEW`.
- Sort allowlist: `submittedAt`, `expiresAt`, `createdAt`, `expectedAmount`; tie-breaker `id`.
- `reviewOverdue=true` dùng `submittedAt + reviewWindowMinutesSnapshot < now` và status UNDER_REVIEW.
- Search orderNumber là exact/prefix public code, không search evidence path/customer PII mặc định.

### Detail projection

Bao gồm Payment fields cần review, Order/customer contact summary, expected/deposit/grand total, transfer content, timeline và public item summary. Không trả raw device identifier, cost hoặc storage object path.

Evidence URL endpoint authorize mỗi lần và trả signed read URL tối đa 5 phút. Hành động xem evidence được log/audit theo payment review context; URL không được log.

## 5. Verify deposit

Request:

```json
{
  "receivedAmount": "500000",
  "note": "Khách chuyển dư 10000 đồng"
}
```

- `receivedAmount` là Money string dương và phải `>= Order.depositRequired`.
- Nếu khác `Payment.expectedAmount`, `note` 5..500 ký tự bắt buộc; nếu bằng thì note optional.
- Backend không nhận status/order total/projection từ client.

Serializable transaction atomically:

1. Require Payment `UNDER_REVIEW`, evidence hợp lệ và Order/Reservation đúng state.
2. Conditional transition Payment → `VERIFIED`, ghi received amount/reviewer/time/note.
3. Tính lại `Order.paidAmount`, `paymentStatus`, `balanceDue`.
4. Chuyển Order `PLACED → CONFIRMED`, ghi `confirmedAt`.
5. Chuyển reservation reason `REVIEW → FULFILLMENT`.
6. Ghi AuditLog redacted.

Transaction retry theo bounded Serializable policy. Verify lặp sau thành công trả current result; actor cạnh tranh sau terminal nhận current/`PAYMENT_ALREADY_REVIEWED` theo command replay context, không cập nhật lần hai.

## 6. Reject deposit

Request `{ "reason": "Ảnh biên lai không khớp giao dịch" }`, reason 5..500 ký tự.

Serializable transaction atomically:

1. Require Payment `UNDER_REVIEW`.
2. Payment → `REJECTED`, ghi reviewer/time/reason.
3. Cancel Order/Fulfillment theo shipping-deposit policy.
4. Release mọi active reservation và VoucherUsage đúng một lần.
5. Ghi AuditLog.

Reject không xóa private evidence; record terminal giữ làm lịch sử. Email thông báo chạy sau commit.

## 7. Deadline expiration

- Scheduled command tìm Payment `AWAITING_PROOF` có `expiresAt <= now` theo batch.
- Mỗi item dùng conditional/idempotent transaction: Payment → `EXPIRED`, cancel Order/Fulfillment, release reservation/voucher.
- Job không expire Payment `UNDER_REVIEW`.
- Request submit và expire tranh nhau được phân xử bởi database state/deadline; không có trạng thái nửa vời.
- Job endpoint nội bộ không public; scheduler design chi tiết thuộc background-job documentation.

## 8. Error contract

| Code | Khi dùng |
|---|---|
| `ORDER_NOT_FOUND` | Customer/guest không sở hữu Payment/Order hoặc token sai |
| `RESOURCE_NOT_FOUND` | Backoffice Payment không tồn tại |
| `PAYMENT_PROOF_DEADLINE_PASSED` | Submit sau deadline |
| `PAYMENT_ALREADY_REVIEWED` | Payment đã terminal/không thể submit-review lại |
| `DEPOSIT_AMOUNT_INSUFFICIENT` | Verify amount nhỏ hơn deposit required |
| `EVIDENCE_REQUIRED` | Review cần evidence nhưng record thiếu |
| `EVIDENCE_INVALID` | File/object metadata không hợp lệ cho Payment |
| `FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE` | Upload vi phạm file policy |
| `INVALID_STATE_TRANSITION` | Order/reservation/payment combination không còn hợp lệ |

## 9. Acceptance test tối thiểu

- Owner customer/guest submit đúng hạn chuyển Payment/Reservation atomically.
- Non-owner và guest token sai không biết Payment tồn tại.
- MIME giả/quá size/storage fail không tạo state change.
- Deadline race và hai submit đồng thời chỉ attach một evidence.
- Under-review quá 24h chỉ được đánh dấu overdue, không auto-cancel.
- Verify thiếu cọc bị từ chối; chuyển dư bắt buộc note.
- Verify cập nhật Payment/Order/reservation/projection/audit trong một commit.
- Reject/expire release inventory/voucher đúng một lần và giữ evidence lịch sử.
- Signed evidence URL chỉ staff/admin nhận, TTL tối đa 5 phút và URL không vào log.

## Liên kết

- [File upload pipeline](../architecture/file-upload-pipeline.md)
- [Checkout và customer Order endpoints](checkout-and-customer-order-endpoints.md)
- [State machines](../architecture/state-machines.md)
- [ADR-0034](../decisions/0034-shipping-deposit-reservation-lifetime.md)
- [ADR-0035](../decisions/0035-atomic-deposit-verification-and-order-confirmation.md)
- [ADR-0060](../decisions/0060-backend-mediated-file-uploads.md)
