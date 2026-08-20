# File upload pipeline

Tài liệu này là baseline P0 cho ảnh product và evidence payment/refund/after-sales. Mọi upload đi qua NestJS theo ADR-0060; Supabase Storage chỉ là provider phía sau `StorageProvider`.

## 1. Loại file và giới hạn

| Nhóm | Visibility | MIME allowlist | Max/file |
|---|---|---|---:|
| Product media | PUBLIC | `image/jpeg`, `image/png`, `image/webp` | 8 MiB |
| Store bank QR | PUBLIC | JPEG, PNG, WebP | 5 MiB |
| Payment proof | PRIVATE | JPEG, PNG, WebP, PDF | 10 MiB |
| Refund evidence | PRIVATE | JPEG, PNG, WebP, PDF | 10 MiB |
| After-sales attachment | PRIVATE | JPEG, PNG, WebP, PDF | 10 MiB |

- Một request một file; client upload tuần tự hoặc giới hạn concurrency.
- File rỗng, vượt size, MIME không khớp magic bytes hoặc format malformed bị từ chối trước storage upload.
- SVG không thuộc P0 vì active content/script risk; HEIC không thuộc P0 để tránh pipeline convert/browser compatibility.
- Chỉ metadata cần thiết được lưu: bucket, objectPath, detected mimeType, fileSize và image width/height khi đọc được.

## 2. Luồng upload chung

```text
Request multipart
  → authenticate + authorize owner/state
  → Multer memory buffer với hard size limit
  → detect magic bytes / validate format
  → generate bucket + objectPath
  → StorageProvider.upload()
  → database transaction attach metadata / transition state
  → success response
```

1. Kiểm tra actor/ownership và resource state sơ bộ trước khi nhận/xử lý file tốn tài nguyên.
2. Parse đúng một multipart field `file`; reject unknown field nhạy cảm theo endpoint DTO.
3. Không tin `Content-Type`, extension hoặc filename; phát hiện loại file từ bytes.
4. Sinh UUID object name và extension canonical từ MIME.
5. Upload với `upsert=false`; object path collision không ghi đè.
6. Mở transaction ngắn để kiểm tra lại state/ownership rồi lưu metadata/chạy command.
7. Nếu bước 6 thất bại, gọi delete object best-effort ngoài transaction và log requestId/object scope đã redacted.

## 3. Bucket và object path

Baseline logical:

```text
rephone-public/products/{productId}/{uuid}.{ext}
rephone-public/variants/{variantId}/{uuid}.{ext}
rephone-public/units/{inventoryUnitId}/{uuid}.{ext}
rephone-store-assets/bank-qr/{uuid}.{ext}

rephone-private/payments/{paymentId}/{uuid}.{ext}
rephone-private/refunds/{refundId}/{uuid}.{ext}
rephone-private/after-sales/{requestId}/{uuid}.{ext}
```

- Tên bucket/path là config; client không được lựa chọn hoặc gửi object path.
- ProductMedia owner XOR quyết định prefix product/variant/unit.
- Private path không phải authorization boundary; mọi read vẫn kiểm tra quyền.
- Không dùng email, phone, order number, IMEI hoặc filename người dùng trong path.

Bucket policy P0:

- `rephone-public` và `rephone-store-assets`: public read, không public/anon write; Nest service-role là writer.
- `rephone-private`: không public/anon read/write/list; Nest service-role upload/delete và chỉ cấp signed read URL sau authorization.
- Frontend không dùng Supabase key/API trực tiếp trong upload flow; service-role key chỉ ở API environment.

## 4. Command-specific behavior

### Product media

- Staff/admin authorize owner active/draft phù hợp, upload public object rồi tạo `ProductMedia` trong transaction.
- Xóa/reorder media là command riêng; không upsert/overwrite object cũ.
- Database create lỗi thì xóa object best-effort.

### Store bank QR

- Admin-only upload; backend validate expected settings version trước và sau upload.
- Object mới được gắn vào StoreSettings bằng optimistic transaction; Payment mới snapshot path này.
- Không xóa QR cũ khi còn khả năng được Payment tham chiếu; cleanup reference-aware thuộc P1/manual.

### Payment proof

- Customer/guest authorize đúng Order/Payment; Payment phải `AWAITING_PROOF` và chưa qua deadline.
- Upload private object trước, sau đó transaction recheck deadline/state, lưu evidence và chuyển Payment/Reservation sang review.
- Transaction thất bại hoặc deadline vừa qua thì delete object best-effort; không có business proof record.

### Refund evidence

- Staff/admin upload evidence trong complete command cho Refund `PROCESSING`.
- Sau upload, completion transaction lưu path và chuyển `COMPLETED` atomically với projection tiền.
- CASH có thể complete không file theo contract; BANK_TRANSFER bắt buộc file.

### After-sales

- Owner customer hoặc staff authorize request; attachment chỉ được attach khi request/state cho phép.
- JSONB attachment metadata không chứa signed URL.

## 5. Read/download

- Public media DTO dựng CDN/public URL từ config + object path; browser không qua NestJS để tải bytes.
- Private evidence endpoint authorize rồi trả signed read URL tối đa 5 phút hoặc redirect có kiểm soát.
- Signed read URL không lưu database/cache lâu dài và không xuất hiện trong audit metadata/log.
- Private PDF dùng download disposition; client không coi nội dung upload là trusted HTML.

## 6. Failure và cleanup

- Supabase lỗi trước database transaction: trả `STORAGE_UNAVAILABLE`, không có DB write.
- DB/state lỗi sau upload: business command fail, object delete best-effort.
- Delete lỗi: log structured event `storage_orphan_candidate`; object vẫn private.
- Cleanup tự động/orphan registry không thuộc P0; vận hành local/demo có checklist cleanup thủ công.
- Không xóa object đang được record lịch sử completed/sold/order tham chiếu.

## 7. Acceptance test tối thiểu

- Reject quá size, empty, MIME giả, SVG/executable và nhiều file.
- Không dùng original filename/path từ client.
- Unauthorized/state-invalid request không tạo object/DB metadata.
- Storage fail không mở/commit business transaction.
- DB fail sau upload gọi delete best-effort và không transition resource.
- Payment deadline race sau upload không chuyển UNDER_REVIEW.
- Private read không đúng owner/role trả not found/forbidden phù hợp và không cấp signed URL.
- Product public DTO không chứa bucket credential/private path.

## Liên kết

- [Xác thực và bảo mật](authentication-and-security.md)
- [Refund processing](refund-processing.md)
- [ADR-0010](../decisions/0010-supabase-storage.md)
- [ADR-0060](../decisions/0060-backend-mediated-file-uploads.md)
