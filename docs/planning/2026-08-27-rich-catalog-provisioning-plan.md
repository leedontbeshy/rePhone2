# Kế hoạch provision rich catalog trước FE-2

> Trạng thái: COMPLETE
> Ngày chốt: 2026-08-27
> Target: Supabase đang được cấu hình trong `.env`
> Phạm vi: dữ liệu minh họa phục vụ frontend; không mở rộng backend P0

## 1. Mục tiêu

- Giữ đủ 47 dòng iPhone hiện có và gắn một ảnh đại diện chính chủ Apple riêng cho từng dòng.
- Thay 44 variant placeholder `CATALOG-*` bằng 90 variant iPhone có dung lượng và màu cụ thể.
- Tạo 96 InventoryUnit mới, tất cả ở trạng thái `AVAILABLE`, phân bổ cho 24 model phổ biến từ iPhone X đến iPhone 17.
- Mỗi unit mới có một ảnh được tạo riêng, giá bán, identifier giả đã bảo vệ và inspection `COMPLETED/PASSED` đủ 18 check.
- Đủ dữ liệu để kiểm tra card, model detail, exact-unit detail và khoảng năm trang inventory ở `pageSize=20`.
- Provision trực tiếp vào Supabase hiện tại, chạy lại không nhân bản và không reset dữ liệu nghiệp vụ đã có.

Không tạo thêm unit `RECEIVED`, `INSPECTING`, `REPAIRING`, `QUARANTINED`, `WRITTEN_OFF`, dữ liệu order/customer hoặc profile tải lớn.

## 2. Quyết định đã khóa

- Giữ `pnpm db:seed` làm baseline nhỏ cho CI; rich catalog dùng command riêng `pnpm demo:catalog:rich`.
- Command rich catalog được chạy trực tiếp vào Supabase hiện tại sau dry-run và target confirmation.
- Ảnh model lấy từ Apple Support/CDN/Newsroom, tải về local rồi upload Storage; không hotlink và không dùng ảnh shop.
- 47 ảnh model phải có 47 object path và checksum khác nhau. Bốn cặp Apple Support dùng chung render phải lấy asset model-specific từ nguồn Apple khác.
- 96 ảnh unit được tạo riêng; không dùng ảnh model-card làm ảnh owner-level của unit và không dùng chung file giữa hai inventory code.
- Chỉ tạo row còn thiếu. Stable key trùng nhưng sai owner/variant phải dừng, không ghi đè.
- Hard-delete đúng 44 placeholder chỉ khi cả tập khớp fingerprint baseline và toàn bộ relation count bằng 0. Một row không an toàn làm transaction dừng toàn bộ.
- Sửa baseline seed để không tạo lại placeholder khi product đã có serialized variant thật.
- Không reset database, không down migration và không dùng SQL để chuyển business state.

## 3. Pipeline

1. Validate manifest offline: slug, SKU, inventoryCode, objectPath, MIME, dimension, SHA-256 và uniqueness.
2. Dry-run target: xác nhận database/Storage cùng Supabase project, migration ready, collision và 44 placeholder.
3. Upload asset local với `upsert=false`; object đã tồn tại chỉ được reuse khi checksum khớp.
4. Transaction master data: tạo variant/media còn thiếu, xác nhận real variant coverage và xóa 44 placeholder.
5. Tạo unit theo batch nhỏ; mỗi unit, protected serial, inspection và media metadata commit nguyên tử.
6. Postflight qua database, public API và backoffice API.
7. Chạy command lần hai để chứng minh idempotency.
8. Smoke web trên trang chủ, model detail, exact-unit detail và inventory list.

## 4. Invariant và preservation

Mỗi rich unit public phải có:

- Product, variant và location `ACTIVE`.
- `lifecycleStatus=AVAILABLE`, có `salePrice` và không có active reservation.
- Serial giả được bảo vệ bằng `IdentifierCodec`; không dùng IMEI hoặc dữ liệu cá nhân thật.
- Một current inspection `COMPLETED/PASSED`, schema version 1 và đủ đúng 18 check.
- Ít nhất một unit-owned `PUBLIC` media trong bucket cấu hình.

Rerun không được thay đổi lifecycle, location, giá, identifier, inspection, media hoặc dữ liệu liên quan của unit đã tồn tại. Product/variant/media do người dùng chỉnh được giữ nguyên và báo drift.

## 5. Failure handling và cleanup

- Storage chạy trước metadata; database không được trỏ tới object chưa xác minh.
- Object path dùng version và checksum để lần chạy sau có thể tiếp tục.
- Không auto-rollback dữ liệu đã provision thành công.
- Cleanup chỉ dùng exact run journal, đúng target fingerprint và chỉ xóa row/object chưa có business reference.
- Không dùng wildcard delete theo prefix.

## 6. Acceptance

- 47 iPhone product có 47 cover Apple khác nhau và đọc được qua public URL.
- Có 90 serialized variant thật và không còn SKU `CATALOG-*`.
- Có đúng 96 rich-owned unit `AVAILABLE`, mỗi unit có ảnh riêng và exact-unit API đọc được.
- Public catalog vẫn có 47 iPhone và ba accessory; pagination `pageSize=20` trả `20/20/10`.
- Backoffice inventory có ít nhất năm trang ở `pageSize=20` sau khi cộng dữ liệu hiện hữu.
- Chạy provisioner hai lần không tăng số rich-owned variant/unit/media/inspection.
- Chín unit, Order, Cart, Reservation và Warranty hiện hữu trên Supabase không bị thay đổi.
- Test manifest, target guard, placeholder delete, idempotency và public visibility xanh.

## 7. Commit strategy

1. `docs(demo): plan rich catalog provisioning`
2. `feat(demo): add rich catalog data manifest`
3. `chore(assets): add official iphone model media`
4. `chore(assets): add generated unit media`
5. `feat(demo): provision rich catalog safely`
6. `test(demo): cover rich catalog invariants`
7. `docs(demo): record Supabase provisioning evidence`

## 8. Evidence triển khai Supabase

Nghiệm thu ngày 2026-08-27 trên target fingerprint `b5e017eaf09a`:

- Lần apply đầu tạo 85 variant, reuse 5 variant thật có sẵn, tạo 96 unit `AVAILABLE`, reuse 143 object Storage đã upload và hard-delete đúng 44 placeholder an toàn.
- Lần apply thứ hai tạo 0 variant, 0 unit, 0 object và xóa 0 placeholder; reuse đúng 90 variant, 96 unit và 143 object. Kết quả này xác nhận provisioner idempotent.
- 47 ảnh model và 96 ảnh unit đều là WebP 1000×1000, có checksum riêng; asset fingerprint là `6ec33106fb271cb0d9fdf2aaada1ebd77dcbb48bdc075aa0f5d0e9f4b72201d5`.
- Public catalog trả 50 product với pagination `20/20/10`: 47 iPhone và ba accessory.
- Model `iphone-17` trả bốn unit `AVAILABLE`; exact-unit `RPH-IP17-256-MBL-U01` trả đầy đủ inspection, price và một unit-owned image. Public Storage HEAD trả `200 image/webp`.
- Web SSR trả `200` và chứa rich-catalog asset tại `/`, `/products/iphone-17` và `/products/iphone-17/units/RPH-IP17-256-MBL-U01`.
- Preservation guard hoàn tất mà không sửa chín unit và dữ liệu nghiệp vụ tồn tại ngoài manifest.

Run journal local, không commit và không chứa secret:

- `.local/rich-catalog/runs/2026-08-26T18-11-05-370Z.json`
- `.local/rich-catalog/runs/2026-08-26T18-12-30-405Z.json`

Quality evidence:

- `pnpm format:check`: xanh.
- ESLint trên năm file TypeScript thuộc rich-catalog: xanh.
- `pnpm typecheck`: xanh.
- `pnpm test`: xanh, gồm 103 file/604 test API và 28 file/99 test Web.
- `pnpm build`: xanh; API và 29 page Web build thành công.
- Root `pnpm lint` vẫn phát hiện 7.119 lỗi lịch sử trên generated/demo/integration files ngoài concern này; không dùng auto-fix hoặc trộn cleanup diện rộng vào rich-catalog. Các file mới/sửa của rich-catalog không còn lint error.

Nguồn nghiệp vụ: [public catalog endpoints](../api/public-catalog-endpoints.md), [catalog/inventory data model](../data-model/catalog-inventory.md), [inspection checklist](../architecture/iphone-inspection-checklist.md), [seed/demo scenarios](seed-and-demo-scenarios.md), [testing strategy](../quality/testing-strategy.md) và [deployment runbook](../operations/local-development-and-deployment.md).
