# FE-05 — Quản trị danh mục và mã ưu đãi

> Ngày chốt: 2026-08-28  
> Trạng thái: DONE
> Nhánh: `codex/feat-fe-05-catalog-vouchers`

## 1. Mục tiêu đã chốt

FE-05 bổ sung sáu màn hình backoffice cho quản trị sản phẩm, biến thể, hình ảnh và mã ưu đãi. Giao diện phải thay thế việc thao tác qua Swagger, nhưng không thay đổi state machine hoặc quyền hiện có của backend.

- Nhân viên và quản trị viên được dùng ba màn hình Catalog.
- Chỉ quản trị viên được dùng ba màn hình Mã ưu đãi.
- Biến thể và hình ảnh nằm trong trang chi tiết sản phẩm; không tạo route riêng ngoài contract.
- Form dùng trường có kiểu, selector theo tên và lựa chọn nghiệp vụ; không yêu cầu người dùng nhập UUID hoặc JSON.
- Sáu route FE-05 dùng `BackofficeShell`; các trang backoffice cũ chưa được chuyển shell trong phase này.

## 2. Màn hình và nguồn hình ảnh

| Route | Nguồn hình ảnh đã duyệt |
| --- | --- |
| `/backoffice/catalog/products` | `docs/assets/ui/fe-05/catalog-list-desktop.png` |
| `/backoffice/catalog/products/new` | `docs/assets/ui/fe-05/catalog-create-desktop.png` |
| `/backoffice/catalog/products/[id]` | `docs/assets/ui/fe-05/catalog-detail-desktop.png` |
| `/backoffice/vouchers` | `docs/assets/ui/fe-05/vouchers-list-desktop.png` |
| `/backoffice/vouchers/new` | `docs/assets/ui/fe-05/voucher-create-desktop.png` |
| `/backoffice/vouchers/[id]` | `docs/assets/ui/fe-05/voucher-detail-desktop.png` |

Hướng được chọn là phương án 3: danh sách dạng visual board hai cột trên desktop, hàng ngang có hình ảnh hoặc mã nhận diện, metadata căn thẳng hàng, trạng thái dễ quét và mật độ vừa phải. Đây là nguồn sự thật về nhịp bố cục và thứ bậc thị giác; dữ liệu minh họa trong ảnh không thay thế dữ liệu backend.

## 3. Quyết định giao diện

- Giữ token rePhone hiện có: canvas sáng, surface trắng, chữ navy, primary teal, border mảnh, radius 8–10 px và shadow tiết chế.
- Sidebar rộng khoảng 240 px, topbar khoảng 64 px; mobile chuyển sang điều hướng gọn và nội dung xếp một cột.
- Catalog list dùng board hai cột ở desktop, một cột ở tablet/mobile; filter và phân trang vẫn do server làm nguồn dữ liệu.
- Product form tách thông tin cơ bản, thông số theo loại, bảo hành và nội dung tìm kiếm. Product detail nhúng danh sách biến thể và media manager.
- Voucher form dùng rule builder có điều kiện cho kiểu giảm, phạm vi, thời gian, hạn mức và đối tượng nhìn thấy. Detail có lifecycle rail và lịch sử sử dụng phân trang.
- Copy backoffice dùng tiếng Việt tự nhiên như “Danh mục”, “Biến thể”, “Tải ảnh”, “Mã ưu đãi”. Không hiển thị enum tiếng Anh, UUID, JSON hoặc thuật ngữ triển khai.
- Mọi command terminal hoặc thay đổi trạng thái quan trọng đều có dialog xác nhận; pause/archive yêu cầu lý do đúng contract.

## 4. Điều chỉnh contract cần thiết

Các thay đổi sau chỉ hoàn thiện projection/OpenAPI cho UI, không nới lỏng nghiệp vụ:

1. Trả media của từng biến thể trong product detail để có thể quản lý lại sau khi tải trang.
2. Mô tả `scopeConfig` của mã ưu đãi bằng schema có các trường `productType`, `productIds`, `variantIds`; service vẫn xác thực strict theo `scopeType`.
3. Client upload phải nhận `Blob`/`File` thay vì buộc cast chuỗi.
4. `UpdateProductDto.brand` phải optional đúng runtime partial update.
5. Lịch sử dùng mã ưu đãi cần mã đơn và thông tin khách hàng thân thiện để UI không hiển thị UUID thô.

Sau mỗi command, UI refetch dữ liệu authoritative. Không tự retry publish, archive, activate hoặc pause khi nhận conflict.

## 5. Giả định và giới hạn

- Quy mô mục tiêu 20–50 người dùng đồng thời; mọi list tiếp tục phân trang phía server.
- Responsive bắt buộc 360–1440 px; desktop ưu tiên mật độ, mobile ưu tiên thứ tự tác vụ.
- Upload chỉ nhận JPEG, PNG hoặc WebP, tối đa 8 MiB và hiển thị lỗi 413/415/503 bằng tiếng Việt.
- Không làm bulk import, campaign engine, generic JSON editor, unit media hoặc inventory workflow của FE-06.
- Không chuyển toàn bộ backoffice legacy sang shell mới trong FE-05.

## 6. Lịch sử triển khai

Chuỗi commit FE-05 đã có đến thời điểm đóng phase:

1. `4c58920` — căn lại coverage ledger sau FE-04.
2. `d252557` — mở hồ sơ quản trị catalog và mã ưu đãi.
3. `48da379`, `a65ef3c` — bổ sung projection quản trị và gửi upload bằng binary body.
4. `79f1deb`, `6751495`, `c08a0fe` — dựng workspace cùng data layer voucher và catalog.
5. `8f82e8d`, `9362bf4`, `d439974`, `ae33e5f` — hoàn thiện nền trình bày, danh sách, rule builder, lifecycle và usage history của mã ưu đãi.
6. `2343cf4`, `b273866`, `465bdfb`, `d919a45` — hoàn thiện nền trình bày, catalog board, tạo sản phẩm, lifecycle, biến thể và media.
7. `5b4bbe9`, `8453753`, `73bafee`, `afb950d`, `545b25a`, `7bfd52a` — ghi nhận route delivery và sửa các vấn đề phát hiện khi kiểm tra hành vi.
8. `0425da6` — bổ sung bốn browser scenario tự động cho FE-05.
9. `75af7cc`, `2f225fa`, `164b688`, `b734ff9` — giữ tương phản CTA, hoàn thiện responsive, chuẩn hóa định dạng và sửa luồng focus tải ảnh.

## 7. Kết quả nghiệm thu

- FE-05 được đóng ở trạng thái `DONE`; cả 22/22 operation trong manifest và `plan-fe.md` được đánh dấu `DONE`.
- Sáu route catalog/voucher đã có UI; phân quyền giữ Catalog cho EMPLOYEE/ADMIN và giới hạn Mã ưu đãi cho ADMIN.
- Adapter và component tests hiện có bao phủ product/variant/media command, voucher rule/lifecycle/usage, copy tiếng Việt, phân trang, quyền điều hướng và responsive contract.
- `pnpm --filter @rephone/web test`: 59 test files, 257/257 tests đạt.
- `pnpm --filter @rephone/api test`: 105 test files, 612/612 tests đạt ở lần chạy độc lập.
- Browser QA thủ công được thực hiện bằng in-app browser trên sáu route ở bố cục desktop và mobile, tập trung vào điều hướng, phân quyền, form, lifecycle chính và overflow.
- `tests/browser/catalog-voucher-admin.spec.ts` có bốn scenario tự động từ commit `0425da6`, nhưng Playwright CLI không được chạy trong lượt đóng phase này; không ghi nhận kết quả Playwright.
- PostgreSQL/Docker integration chưa chạy trong lượt đóng phase này, nên hồ sơ không tuyên bố integration, E2E cơ sở dữ liệu hoặc coverage backend đã đạt.
