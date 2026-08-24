# Seed data và kịch bản demo

Seed phục vụ ba việc: tạo môi trường dev lặp lại được, cung cấp dữ liệu cho test thủ công và dựng demo đồ án. Seed không thay migration và không tạo dữ liệu bất hợp lệ để “trông nhiều hơn”.

## 1. Nguyên tắc seed

- Idempotent: chạy hai lần không nhân bản record.
- Upsert bằng stable key như email/SKU/inventoryCode/voucher code/settings key.
- Không reset/xóa dữ liệu ngoài command demo-reset có guard database name.
- Password lấy từ environment, hash Argon2id khi seed; không commit password thật.
- Dữ liệu lịch sử phức tạp dựng qua application command hoặc scenario script, không gán status cuối trực tiếp.
- Object path/media demo dùng asset hợp lệ trong bucket demo; fake adapter trong test không yêu cầu internet.

## 2. Seed environment

| Biến | Bắt buộc local demo | Ý nghĩa |
|---|---:|---|
| `SEED_ADMIN_EMAIL` | Có | Admin ACTIVE |
| `SEED_ADMIN_PASSWORD` | Có | >= policy, không dùng production |
| `SEED_EMPLOYEE_EMAIL` | Có | Employee ACTIVE cho demo |
| `SEED_EMPLOYEE_PASSWORD` | Có | Demo only |
| `SEED_CUSTOMER_EMAIL` | Có | Customer ACTIVE |
| `SEED_CUSTOMER_PASSWORD` | Có | Demo only |
| `SEED_DEMO_PHONE` | Có | Phone giả định dạng hợp lệ |
| `SEED_STORE_PHONE` | Không | Mặc định số giả `0900000000` |
| `SEED_STORE_ADDRESS` | Không | Mặc định địa chỉ ghi rõ `DEMO` |
| `SEED_BANK_NAME` | Không | Mặc định `DEMO BANK` |
| `SEED_BANK_ACCOUNT_NUMBER` | Không | Mặc định `0000000000`, không phải tài khoản thật |
| `SEED_BANK_ACCOUNT_HOLDER` | Không | Mặc định `REPHONE DEMO` |

Production seed chỉ tạo settings/reference/admin ban đầu theo secret provisioning riêng; không tự tạo customer/order demo.

## 3. Baseline master data

### Store và identity

- Một `StoreSettings` key `STORE` với defaults trong configuration.
- Hai location logic: `HCM-STORE-01` type STORE và `HCM-WH-01` type WAREHOUSE, đều ACTIVE; pickup chỉ dùng STORE.
- ADMIN, EMPLOYEE, CUSTOMER demo; một address default cho customer.
- Một WarrantyPolicy iPhone 90 ngày và phụ kiện 30 ngày.

### Catalog

Tối thiểu:

- `iPhone 13`, variants 128 GB Midnight/Blue, SERIALIZED.
- `iPhone 14 Pro`, variants 128/256 GB Space Black, SERIALIZED.
- `iPhone 15 Pro Max`, variant 256 GB Natural Titanium, SERIALIZED.
- Phụ kiện `Cáp USB-C to Lightning`, `Ốp lưng MagSafe`, `Củ sạc USB-C 20W`, mỗi sản phẩm có QUANTITY variant.

Mỗi product/variant có slug/SKU deterministic, active media và policy phù hợp. Dữ liệu không cần bao phủ mọi đời iPhone; đây là demo hành vi, không phải catalog thương mại thật.

### Inventory

- 5 iPhone AVAILABLE có current PASSED inspection, giá, masked identifiers và ảnh unit.
- 1 iPhone RECEIVED chưa inspect.
- 1 iPhone REPAIRING/PARTIAL để demo lifecycle.
- 1 iPhone SOLD gắn vào completed demo order để demo warranty/after-sales.
- Mỗi phụ kiện có stock tại store, ví dụ 20/12/15, reserved 0; receipt StockMovement giải thích số dư.

Identifier là số giả được đánh dấu test; tuyệt đối không dùng IMEI thật của người làm đồ án.

### Voucher

- `WELCOME100`: PUBLIC, FIXED 100000, minimum 3000000, quota 100.
- `IPHONE5`: ACCOUNT_ONLY, PERCENT 5, max discount 500000, scope PRODUCT_TYPE IPHONE, per customer 1.
- Một voucher DRAFT và một voucher PAUSED để demo backoffice lifecycle.

## 4. Scenario scripts

`pnpm demo:scenarios` chạy sau seed và dùng application services để dựng các case có stable marker:

| Scenario | Trạng thái cuối | Mục đích demo |
|---|---|---|
| `pickup-ready` | Order PROCESSING, Fulfillment READY, UNPAID | Employee giao máy, thu CASH, complete + warranty |
| `shipping-awaiting-proof` | PLACED, deposit AWAITING_PROOF | Guest/customer upload proof |
| `shipping-under-review` | PLACED, deposit UNDER_REVIEW | Employee verify/reject cọc |
| `shipping-in-transit` | PROCESSING, IN_TRANSIT, PARTIALLY_PAID | Nhập tracking, giao COD |
| `refund-processing` | CANCELLED, Refund PROCESSING | Admin complete bank evidence |
| `after-sales-inspecting` | Case INSPECTING, unit INSPECTING | Employee approve + repair/return resolution |

Script ghi manifest `.local/demo-manifest.json` (gitignored) chứa public IDs/codes, không token/password/raw identifier. Nếu scenario đã tồn tại, script trả lại record hiện hành hoặc rebuild trên database demo có guard; không nhân side effect.

Slice 10 cung cấp trước scenario `refund-processing` bằng command chuyên biệt. Command này chỉ chấp nhận database có tên kết thúc `_demo`/`_test`, từ chối `NODE_ENV=production`, yêu cầu API đang ready và tạo mọi chuyển trạng thái nghiệp vụ qua HTTP application command:

```powershell
$env:REFUND_PROCESSING_DEMO_CONFIRM='create-refund-processing'
pnpm demo:refund-processing
```

Kết quả là một Order pickup đã `COMPLETED/PAID` và một Refund `BANK_TRANSFER/PROCESSING`. Chạy lại trả đúng scenario hiện có; nếu marker tồn tại nhưng state đã bị đổi, script dừng để người vận hành kiểm tra thay vì ghi đè lịch sử.

## 5. Demo flow đề xuất 12–15 phút

1. Public xem product-grouped catalog, filter model/dung lượng/màu/tình trạng và mở exact used iPhone unit.
2. Guest thêm iPhone + phụ kiện, áp voucher, preview và checkout shipping.
3. Upload proof; chuyển sang Employee review và verify.
4. Employee chuẩn bị, tạo shipment/tracking, handover; Admin/Employee mark delivered và thu COD.
5. Customer xem Order COMPLETED + Warranty.
6. Backoffice mở một case after-sales seeded hoặc tạo request, receive/inspect/resolve.
7. Admin cho xem inventory movement, AuditLog, settings version và một concurrency test report ngắn.

Nếu thời gian ít, bỏ step 6–7 khỏi live flow nhưng giữ dữ liệu/test trong report.

## 6. Demo reset an toàn

- Chỉ cho phép khi `NODE_ENV != production` và database name là `rephone_demo` hoặc `rephone_test`.
- In target URL/database name rồi yêu cầu flag explicit `--confirm-demo-reset`; không dùng glob/environment chưa resolve.
- Backup nếu database đã dùng cho rehearsal quan trọng.
- Reset = drop/recreate schema hoặc migrate reset trong đúng DB, migrate deploy, seed, scenario script.

## 7. Acceptance

- Seed chạy từ database rỗng và chạy lại thành công.
- Mọi AVAILABLE unit thỏa availability invariant; stock movement cân với onHand.
- Mọi scenario state hợp lệ theo application/state machine.
- Không có secret thật/raw identifier trong repository/artifact.
- Demo flow chạy được với Mailpit và fake/test asset nếu Supabase tạm mất.

## Liên kết

- [Configuration defaults](../architecture/configuration.md)
- [Database implementation](../architecture/database-implementation.md)
- [Testing strategy](../quality/testing-strategy.md)
- [Implementation roadmap](implementation-roadmap.md)
