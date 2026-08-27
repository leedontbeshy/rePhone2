# iPhone model facts, accessory cards and customer header polish

> Trạng thái: **APPROVED**
> Ngày: `2026-08-27`
> Branch dự kiến: `feat/iphone-model-facts-header-polish`
> Design authority: [design.md](../../design.md)

## Understanding summary

- Đồng nhất trang chi tiết của toàn bộ 47 dòng iPhone theo bố cục canonical của iPhone 13.
- Mỗi dòng hiển thị thông tin chung cố định gồm năm ra mắt, chip, RAM, kích thước màn hình và màu chính thức.
- Dữ liệu được hardcode từ nguồn công khai đáng tin cậy, không gọi mạng khi render và không suy diễn thông số còn thiếu.
- Cân bằng chiều cao card phụ kiện và giữ các CTA trên cùng một trục.
- Thay nội dung kỹ thuật bằng tiếng Việt tự nhiên hướng tới khách hàng; rút gọn tiêu đề danh sách máy thành `Các máy đang có sẵn`.
- Tăng nhẹ cỡ chữ trên customer surface, không thay đổi mật độ của backoffice.
- Chỉ tài khoản `CUSTOMER` đã đăng nhập thấy `Bảo hành`, `Ưa thích`, `Đơn hàng` trong header desktop và mobile.

## Assumptions and non-functional requirements

- Catalog hiện có đúng 47 slug model được seed; bảng dữ liệu tĩnh phải có khóa duy nhất và bao phủ đủ tập này.
- Apple Support/Tech Specs là authority cho năm, chip, màn hình và màu; EveryMac/EveryiPhone là nguồn bổ sung cho RAM vì Apple không công bố RAM.
- Mỗi record giữ URL nguồn và ngày kiểm chứng để review được provenance. Dữ liệu chỉ gồm thông tin sản phẩm công khai, không có dữ liệu cá nhân.
- Không đổi API, OpenAPI, schema, migration, seed behavior hoặc authorization backend.
- Không thêm request runtime hoặc dependency. Lookup theo slug là thao tác cục bộ, chi phí render không đáng kể.
- Slug chưa biết dùng public product projection hiện có và bỏ qua fact không có authority; UI không tự điền hoặc đoán.
- Giữ responsive từ 320 px, keyboard navigation, focus visibility, touch target tối thiểu 44 px và không horizontal overflow.

## Approaches considered

1. **Selected — source-backed frontend fact registry:** một map readonly theo slug, có nguồn và fallback hẹp. Đúng yêu cầu hardcode, không mở rộng backend và dễ kiểm thử độ bao phủ.
2. Mở rộng API/DTO/OpenAPI: tập trung contract hơn nhưng tạo backend/client deployment work không cần thiết cho dữ liệu bất biến.
3. Backfill database: cho phép quản trị động nhưng cần migration, live-data update và mô hình màu mới; blast radius lớn hơn giá trị hiện tại.

## Final design

### Canonical model facts

Một module server-safe sở hữu registry cho 47 slug. Mỗi record có `releaseYear`, `chipset`, `ramGb`, `screenSizeInches`, `colors`, `sources.apple`, `sources.ram` và `verifiedAt`. Trang model luôn render bốn fact card theo thứ tự năm, chip, RAM, màn hình; bảng màu nằm trong một panel full-width ngay dưới grid để bố cục không lệch giữa model.

Nguồn được lưu để audit và test, không hiển thị thành thuật ngữ kỹ thuật gây nhiễu cho khách. Model ngoài registry chỉ render fact có trong public projection.

### Copy and availability heading

- Trust note: `Các máy đang hiển thị đã được kỹ thuật viên kiểm tra kỹ lưỡng trước khi đưa lên bán.`
- Offers heading: chỉ một dòng `Các máy đang có sẵn`; bỏ eyebrow và tiêu đề phụ lặp nghĩa.

### Accessory cards

Card phụ kiện là flex column; body được phép tăng chiều cao và CTA dùng auto margin để neo đáy. Không tạo placeholder cho màu trống và không áp quy tắc này lên exact-unit card.

### Typography

Tăng khoảng 1 px cho label/small/body và điều chỉnh line-height tương ứng trong `storefront`, `customer` và `auth` shell. Các customer route legacy được tinh chỉnh có chọn lọc; root font-size và backoffice token giữ nguyên.

### Authenticated customer navigation

Một constant navigation dùng chung cho desktop, mobile và legacy catalog header. Ba liên kết chỉ xuất hiện khi session đã resolve với role `CUSTOMER`; anonymous, loading, `EMPLOYEE` và `ADMIN` không thấy. Trên desktop nhóm liên kết nằm ở vùng customer action/secondary navigation để không đẩy lệch catalog navigation đang căn giữa; mobile đóng sheet sau khi chọn.

## Decision log

| Decision | Alternatives | Reason |
| --- | --- | --- |
| Frontend fact registry cho 47 slug | API extension; database backfill | Dữ liệu bất biến, không phát sinh request/migration và phù hợp yêu cầu hardcode |
| Apple + EveryMac/EveryiPhone | Chỉ Apple; dữ liệu inventory | Apple không công bố RAM; inventory color không đại diện bảng màu chính thức |
| Bốn fact card + panel màu full-width | Năm card trong grid | Giữ đúng nhịp cân bằng của reference iPhone 13 trên mọi breakpoint |
| Fallback hẹp cho slug lạ | Giá trị mặc định giả | Không tạo claim thiếu authority |
| Scoped customer typography | Tăng root font-size | Tránh làm loãng backoffice và tránh nhân rộng spacing ngoài ý muốn |
| Shared role-aware links | Sao chép menu tại ba header | Tránh drift nhãn, route và điều kiện role |

## Verification contract

- Unit test registry có đúng 47 khóa duy nhất, đủ field/source và bao phủ toàn bộ slug catalog; kiểm tra representative `iphone-15-pro` và fallback slug lạ.
- Component test xác nhận mọi known model có bốn fact card, panel màu, trust note mới và một heading `Các máy đang có sẵn`.
- Session/navigation test cho CUSTOMER, anonymous, loading, EMPLOYEE và ADMIN ở desktop/mobile/legacy header.
- Geometry assertion cho đáy card và CTA phụ kiện sai lệch không quá 1 px tại viewport desktop đại diện.
- Browser/visual QA ở 1440, 1024, 390 và 320 px; so sánh cùng viewport/state với reference, kiểm tra nav căn giữa, font dễ đọc, không overflow và axe không có finding serious/critical.
- Typecheck, lint, focused unit tests, production build và release verification phải xanh trước handoff.

## Rollback

- Registry và presenter có thể revert độc lập vì không thay database hoặc API.
- CSS typography/card rollback theo concern, không ảnh hưởng business state.
- Shared customer navigation chỉ thay presentation; backend tiếp tục là authority cho quyền truy cập route và dữ liệu.
