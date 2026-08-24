# Refund processing và evidence

Tài liệu này mô tả workflow hoàn tiền thủ công sau khi Refund được tạo ở trạng thái `REQUESTED`. Việc chuyển tiền thực tế diễn ra ngoài rePhone; PostgreSQL lưu obligation, lifecycle và projection, còn Supabase Storage chỉ giữ private evidence của `BANK_TRANSFER` completion.

## 1. Phạm vi và policy

- P0 chỉ tạo/process Refund `BANK_TRANSFER` và `CASH`.
- `RefundMethod.OTHER` chỉ tồn tại để đọc dữ liệu legacy. Record OTHER/REQUESTED có thể reject/cancel nhưng không được start hoặc complete.
- Manual create chỉ cho Order `CANCELLED` hoặc `COMPLETED`; cancellation engine có thể tự tạo Refund cho verified amount chưa được obligation active/completed cover.
- Refund REQUESTED/PROCESSING/COMPLETED cùng giữ aggregate quota. REJECTED/CANCELLED không còn giữ quota.
- Tổng obligation giữ quota và tổng completion không được vượt verified Payment total của Order.
- `reason`, amount, method và Order/Payment relation bất biến sau khi record được tạo; sửa sai bằng terminalize obligation cũ rồi tạo record mới hợp lệ.

## 2. Bắt đầu và terminalize obligation

Start processing:

1. Require Refund REQUESTED và method BANK_TRANSFER/CASH.
2. Lock Order → Payments → Refunds theo ID tăng dần trong Serializable transaction.
3. Recheck Refund aggregate và Payment/Order relation.
4. Chuyển REQUESTED → PROCESSING, ghi `processedById`, `processingAt` và optional note 5..500.
5. Ghi AuditLog; không gọi provider trong transaction.

EMPLOYEE chỉ complete Refund mình đã start. ADMIN có thể break-glass complete nhưng không overwrite original `processedById`; AuditLog ghi actor thực sự hoàn tất. Exact start replay yêu cầu cùng actor và normalized note; khác actor/payload conflict.

Reject/cancel chỉ từ REQUESTED, yêu cầu reason 5..500 và lưu riêng `terminalReason`, `terminalById`, `terminalAt`. Không overwrite business `reason`. Exact actor+reason replay trả record hiện hành; terminal action hoặc payload khác conflict. PROCESSING chỉ có thể complete.

## 3. Private bank evidence

Bank complete nhận đúng một multipart field `file` cùng note 5..500:

1. Authorize Refund trước khi Multer đọc file.
2. Reject empty/multiple file, MIME spoof, malformed, SVG, HEIC, executable và file >10 MiB.
3. Validate JPEG/PNG/WebP bằng `sharp`, PDF bằng `pdf-lib`.
4. Tính lowercase SHA-256 trên bytes đã validate và giữ MIME/size authoritative.
5. Backend sinh private path `refunds/{refundId}/{uuid}.{ext}` và upload bằng service-role, `upsert=false`, trước database transaction.
6. Completion transaction recheck state/permission/aggregate rồi lưu bucket, object path, MIME, size và SHA-256 cùng terminal transition.

Client không nhận service credential, signed-upload target, bucket/object path hoặc digest. `CASH` complete dùng JSON note, không nhận file và mọi evidence field phải null.

Signed evidence URL chỉ dành cho EMPLOYEE/ADMIN. Backend authorize và commit audit `refund.evidence_viewed` trước khi trả URL; TTL thực tế `min(config, 300 giây)`, PDF dùng download disposition. URL/path/digest không được log, lưu AuditLog hoặc đưa vào Refund/Order DTO.

## 4. Atomic completion và projection

Completion dùng Serializable transaction và lock thống nhất:

```text
Order → Payments theo ID → Refunds theo ID
```

Transaction thực hiện:

1. Require Refund PROCESSING, đúng method, processor policy và Order/Payment relation.
2. Tính lại verified Payment total và Refund aggregate bằng BigInt.
3. Require `completedRefundTotal + currentRefund.amount <= verifiedPaymentTotal`; vượt giới hạn trả `REFUND_AMOUNT_EXCEEDS_PAID` và rollback.
4. Với BANK_TRANSFER, require đầy đủ private evidence metadata; với CASH, require evidence all-null.
5. Chuyển Refund PROCESSING → COMPLETED, lưu `completedAt`; completion note thay optional start note và trở thành operational note cuối.
6. Recompute `Order.refundedAmount` từ Refund COMPLETED và `Order.paymentStatus`:
   - nhỏ hơn verified payment total: `PARTIALLY_REFUNDED`;
   - bằng verified payment total: `REFUNDED`.
7. Không đổi Order status hoặc mở lại `balanceDue`.
8. Ghi AuditLog trong transaction; gửi `refund.completed` email sau commit, không đính evidence.

Không gọi Supabase hoặc SMTP trong database transaction. Chỉ serialization/deadlock được retry theo policy chung; domain conflict không retry.

## 5. Idempotency, race và orphan

- Refund COMPLETED/evidence immutable; không overwrite hoặc delete evidence đang được tham chiếu.
- Nếu bank Refund đã COMPLETED, cùng evidence SHA-256 + normalized note trả current trước upload; file/note khác conflict.
- Hai bank complete đồng thời có một transaction thắng. Request thua xóa exact object vừa upload và chỉ replay nếu digest/note khớp record thắng.
- Storage upload thành công nhưng DB fail phải cleanup object best-effort. Cleanup fail ghi structured event `storage_orphan_candidate`; object vẫn private và không tự trở thành evidence hợp lệ.
- Hai Refund cùng Order complete đồng thời đều lock toàn bộ aggregate; tổng completed không vượt verified amount.
- Manual create không dedupe theo payload vì hai partial Refund giống nhau có thể hợp lệ; Serializable aggregate cap là financial safety boundary.

## 6. Acceptance test tối thiểu

- OTHER không thể create/start/complete; legacy OTHER/REQUESTED reject/cancel được.
- Bank Refund thiếu/sai evidence không complete; CASH Refund có note/actor/audit và không evidence.
- Same-file replay không upload/audit/email lại; khác digest/note conflict.
- Storage fail không mở transaction; DB fail sau upload không complete Refund và gọi exact cleanup.
- Refund vượt verified Payment rollback toàn bộ; two-create/two-complete concurrency không over-refund.
- Completion cập nhật partial/full refund projection nhưng không đổi Order status/balance.
- Signed URL chỉ staff/admin, tối đa 300 giây và không lộ private metadata trong DTO/log/audit.

## Liên kết

- [Hủy Order và khởi tạo Refund](order-cancellation-and-refund.md)
- [Transaction và concurrency](transaction-and-concurrency.md)
- [Xác thực và bảo mật](authentication-and-security.md)
- [ADR-0042](../decisions/0042-refund-evidence-before-atomic-completion.md)
- [File upload pipeline](file-upload-pipeline.md)
- [ADR-0060](../decisions/0060-backend-mediated-file-uploads.md)
