# Quy ước data model

## 1. Kiểu logic

| Alias | PostgreSQL/Prisma | Quy tắc |
|---|---|---|
| `Id` | UUIDv7 / `String @db.Uuid` | Primary/foreign key |
| `Instant` | `DateTime @db.Timestamptz(3)` | Lưu UTC |
| `LocalDate` | `DateTime @db.Date` | Chỉ ngày, không timezone |
| `Money` | `Decimal @db.Decimal(15,0)` | VND nguyên; API trả string |
| `Quantity` | `Int` | Check `>= 0` |
| `JsonObject` | PostgreSQL JSONB | Validate schema tại boundary |
| `ShortText` | `String @db.VarChar(255)` mặc định | Dùng cho code/name/title; override theo bảng dưới |
| `LongText` | Text | Description/note |

### String length/encoding vật lý

| Nhóm field | PostgreSQL type | Boundary rule |
|---|---|---|
| `email`, `normalizedEmail` | `varchar(320)` | Trim; normalized lowercase; validate email |
| Phone | `varchar(32)` | Lưu normalized E.164/local canonical do backend; hiển thị từ snapshot |
| Public/business code, SKU, employeeCode | `varchar(64)` | Uppercase/kebab rule theo field; unique khi data dictionary yêu cầu |
| Slug | `varchar(180)` | Lowercase kebab-case |
| Name/title/label/model/carrier/color | `varchar(255)` | Trim, reject blank |
| `colorHex` | `varchar(7)` | `#[0-9A-Fa-f]{6}` |
| MIME type | `varchar(100)` | Giá trị detected/allowlisted |
| IP address | `varchar(64)` | IPv4/IPv6 textual, không dùng làm auth factor |
| URL | `text` | API max 2048 chars, chỉ scheme cho phép |
| SHA-256/HMAC digest | `char(64)` | Lowercase hexadecimal |
| Masked identifier suffix | `varchar(8)` | Không chứa raw value đầy đủ |
| Ciphertext/object path/password hash | `text` | Không áp DB length tùy tiện; boundary/provider limit riêng |

`LongText` vẫn có max ở DTO/use case (reason/note/description theo contract); database dùng `text` để không lặp hàng chục varchar limit. Enum dùng native PostgreSQL enum do Prisma migration tạo, không lưu varchar tự do.

## 2. Field chung

- Bảng mutable: `id`, `createdAt`, `updatedAt`.
- Master data có thể archive: thêm `archivedAt` nullable hoặc status.
- Transaction/history không hard-delete và không cần `archivedAt`.
- Actor field như `createdById`, `updatedById`, `reviewedById` nullable khi action do guest/system; bảng cần phân biệt nguồn hành động phải có actor/source type rõ ràng.
- Các mã public (`orderNumber`, `warrantyCode`, `requestNumber`, `inventoryCode`) unique nhưng không phải access secret.
- `orderNumber` dùng `RPH-YYYYMMDD-XXXXXXXX`; suffix secure-random từ alphabet không có ký tự dễ nhầm. Transfer content deposit dùng cùng mã sau khi bỏ dấu gạch.

## 3. Money và total

- Không dùng float hoặc PostgreSQL money.
- Mọi amount check `>= 0` trừ field delta được định nghĩa rõ.
- Snapshot total lưu trên Order/OrderItem.
- Payment/refund hợp lệ là nguồn tính paid/refunded; projection trên Order được cập nhật và đối chiếu trong cùng transaction theo tài liệu transaction/fulfillment/refund.

## 4. Timestamp

- Tất cả instant lưu UTC bằng timestamptz.
- API dùng ISO 8601 có offset/UTC.
- `Asia/Ho_Chi_Minh` chỉ dùng khi hiển thị và tính business deadline.
- Không lưu local datetime không timezone cho trạng thái giao dịch.

## 5. Delete behavior

- FK mặc định `RESTRICT`.
- Cascade chỉ cho dữ liệu phụ chưa trở thành lịch sử độc lập, ví dụ session/token khi xóa user chưa có giao dịch trong môi trường seed/test.
- Trong nghiệp vụ thật, user bị disable; product/variant/address bị archive.
- Order, item, payment, refund, shipment, warranty, movement, reservation và audit không bị xóa qua API.

## 6. JSONB được phép

| Field | Mục đích |
|---|---|
| `ProductVariant.accessoryAttributes` | Thuộc tính phụ kiện ít truy vấn |
| `InventoryInspection.checks` | Kết quả checklist chức năng |
| `InventoryInspection.replacedParts` | Bộ phận đã thay được khai báo |
| `Voucher.scopeConfig` | Target voucher đơn giản |
| `Order.shippingAddressSnapshot` | Địa chỉ lịch sử |
| `OrderItem.configurationSnapshot` | Cấu hình/tình trạng lúc mua |
| `AfterSalesRequest.attachments` | Metadata file private |
| `AuditLog.changes`, `metadata` | Dữ liệu audit đã redacted |

Không dùng JSONB cho money total, foreign key chính, status hoặc field cần filter/index thường xuyên.

## 7. Index baseline

- Mọi foreign key được index khi dùng cho join/filter thường xuyên.
- Unique cho email normalized, slug, SKU, public code và identifier HMAC.
- Composite unique cho các cặp ownership như stock `(variantId, locationId)`.
- Partial unique/check constraint được tạo bằng SQL migration khi Prisma schema không diễn tả được.
- Index cụ thể phải dựa trên endpoint/query plan được thiết kế, không thêm hàng loạt trước.

## 8. Bảo mật

- Password/token chỉ lưu hash.
- IMEI/serial/EID lưu ciphertext + keyed HMAC + suffix đã che.
- Không log raw secret hoặc raw identifier.
- Evidence/object metadata private không chứa signed URL cố định.

Token entropy cao dùng SHA-256 lowercase hex. Identifier HMAC dùng HMAC-SHA-256 lowercase hex trên canonical input có type prefix (`IMEI:` dùng chung cho IMEI1/IMEI2, `SERIAL:`, `EID:`). Ciphertext dùng AES-256-GCM; field encrypted lưu base64url của `12-byte nonce || ciphertext || 16-byte auth tag`, còn `identifierKeyVersion` chọn key. Không dùng cùng key cho encryption và HMAC.
