# Refund processing và evidence

Tài liệu này mô tả quy trình hoàn tiền thủ công sau khi Refund đã được tạo ở trạng thái `REQUESTED`. Việc chuyển tiền thực tế diễn ra ngoài rePhone; database chỉ ghi workflow và bằng chứng.

## 1. Bắt đầu xử lý

- Staff/admin gọi command `startRefundProcessing` trên Refund `REQUESTED`.
- Conditional transition chuyển Refund `REQUESTED → PROCESSING`, ghi `processedById` và `processingAt`.
- `amount`, `method`, `reason`, Order/Payment relation trở thành immutable khi bắt đầu processing.
- Action được audit; không có network call trong transaction.

## 2. Upload evidence

Đối với refund chuyển khoản:

1. Frontend gửi multipart file trực tiếp tới NestJS trong complete command.
2. Backend authorize Refund `PROCESSING`, kiểm tra size/magic bytes/MIME và sinh private object path.
3. Backend upload qua `StorageProvider` trước khi mở completion transaction.
4. Transaction kiểm tra lại state/permission, lưu bucket/objectPath và complete Refund.

Client không nhận service credential, signed-upload target hoặc được gửi bucket/objectPath. MIME, kích thước và extension theo file upload policy.

## 3. Complete Refund

Trước database transaction, backend đã upload object bằng path do chính backend sinh và có metadata đã validate. Network call tới Supabase kết thúc trước khi mở transaction.

Sau đó một Serializable transaction thực hiện:

1. Require Refund `PROCESSING`, đúng processor/permission và Order/Payment relation hợp lệ.
2. Tính lại verified payment total và completed refund total từ database.
3. Require `completedRefundTotal + Refund.amount <= verifiedPaymentTotal`.
4. Với `BANK_TRANSFER`, require evidence metadata đã được xác thực; với `CASH`, evidence ảnh optional nhưng completion note/audit vẫn bắt buộc.
5. Conditional update Refund `PROCESSING → COMPLETED`, lưu evidence metadata, `completedAt` và processor.
6. Tính lại `Order.refundedAmount` và `Order.paymentStatus` từ Refund `COMPLETED`:
   - nhỏ hơn verified payment total: `PARTIALLY_REFUNDED`;
   - bằng verified payment total: `REFUNDED`.
7. Ghi AuditLog với amount/method/reference đã redacted.

Không gửi email hoặc gọi Supabase trong transaction. Email hoàn tiền chạy sau commit.

## 4. File mồ côi và tính bất biến

- Upload thành công nhưng complete transaction thất bại có thể để lại private object mồ côi.
- MVP chấp nhận cleanup thủ công hoặc job P1; object private không tự trở thành evidence hợp lệ.
- Refund `COMPLETED` và evidence path của nó immutable. Sửa sai bằng record/audit nghiệp vụ mới, không ghi đè lịch sử.
- Không xóa evidence đang được Refund completed tham chiếu.

## 5. Idempotency và concurrency

- Complete request lặp với cùng Refund/evidence trả trạng thái completed hiện tại, không cộng projection lần hai.
- Request lặp với evidence khác sau completed bị conflict.
- Hai nhân viên complete đồng thời: conditional transition chỉ cho một transaction thắng.
- Amount/projection không lấy từ client ngoài Refund amount đã lưu.
- Chỉ serialization conflict được retry theo ADR-0031.

## 6. Acceptance test tối thiểu

- Bank refund không có/không đúng evidence không thể completed.
- Cash refund completed không bắt buộc ảnh nhưng có actor/note/audit.
- Refund vượt verified payment rollback toàn bộ.
- Hai completion đồng thời không double `refundedAmount`.
- Completed Refund cập nhật payment summary đúng partial/full refund.
- Supabase lỗi xảy ra trước khi mở database transaction.
- Database lỗi sau upload không làm Refund completed và object còn private để cleanup.

## Liên kết

- [Hủy Order và khởi tạo Refund](order-cancellation-and-refund.md)
- [Transaction và concurrency](transaction-and-concurrency.md)
- [Xác thực và bảo mật](authentication-and-security.md)
- [ADR-0042](../decisions/0042-refund-evidence-before-atomic-completion.md)
- [File upload pipeline](file-upload-pipeline.md)
- [ADR-0060](../decisions/0060-backend-mediated-file-uploads.md)
