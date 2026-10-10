# Cộng tác viên rePhone — triển khai và kiểm thử

## Phạm vi v1

Một cấp, chỉ iPhone bán lẻ. Cộng tác viên chia sẻ link; rePhone bán, thu tiền,
giao hàng và bảo hành. Cộng tác viên không thu tiền khách và không mua theo giá sỉ.
AI, đa cấp, phụ kiện, đơn đại lý và chuyển tiền ngân hàng tự động nằm ngoài v1.

| Trước | Sau khi bổ sung affiliate |
| --- | --- |
| Bán lẻ và đại lý bán lại theo giá sỉ | Thêm cộng tác viên giới thiệu khách mua tại rePhone |
| Đơn không lưu nguồn giới thiệu | Checkout chốt một nguồn giới thiệu và hoa hồng từng iPhone |
| Đại lý tự thu tiền, hưởng chênh lệch | Cộng tác viên chỉ nhận hoa hồng từ rePhone |
| Hoàn tiền chỉ có tổng tiền đơn | Đơn affiliate có phân bổ tiền hoàn theo dòng hàng / phí / tiền thừa |
| Không có số dư hoa hồng | Theo dõi đang chờ, tạm giữ, khả dụng, đang rút và đã chi |
| Không có vận hành chi hoa hồng | Admin duyệt hồ sơ, ngân hàng, cấu hình tỷ lệ và đối soát chứng từ chi |

Module `affiliate-core` chứa công thức, runtime và đối soát dùng trong giao dịch.
Module `affiliates` cung cấp portal, quản trị, lưu hồ sơ, ngân hàng, truy vấn và chi trả.
Sổ chi cộng tác viên tách khỏi Payment/Refund của bán lẻ và sổ tiền đại lý.

## Database và bộ chạy thử

Máy mới có thể dùng `docker compose -f compose.local.yaml up --build -d --wait` mà không cần Node/Supabase.
Xem [README](../../README.md) để cài đặt, sao lưu và chuyển dữ liệu. Docker local dùng volume riêng
`rephone-local_database`, không phải PostgreSQL cổng 5433 của bộ chạy Node dưới đây. Admin phải mở
chương trình và xét duyệt hồ sơ trên database mới; seed không tự sao chép các hồ sơ từ máy cũ.

Nhánh triển khai: `feat/affiliate-v1`.
Database kiểm thử: **127.0.0.1:5433/rephone_test**.
Không chạy migration này lên Supabase hoặc `rephone_dealer_sandbox` để thử tính năng.

```powershell
pnpm test:db:up
pnpm affiliate:test:prepare
pnpm affiliate:test
```

`prepare` triển khai migration, seed dữ liệu mẫu còn thiếu và build API.
Không xóa dữ liệu sẵn có, không tự mở chương trình hoặc ghi đè chính sách đã lưu.
`start` dùng cấu hình cố định cho database local, không kế thừa URL database hoặc khóa
nhà cung cấp từ `.env`. Web có thư mục build riêng `.next-affiliate-test`.
Tắt bộ chạy bằng Ctrl+C. Không chạy E2E reset database đồng thời với phiên thử thủ công.

- Admin: <http://localhost:3001/backoffice/affiliates>
- Cộng tác viên: <http://localhost:3001/affiliate>
- Cửa hàng: <http://localhost:3001/products>
- Hộp thư giả lập: <http://localhost:4001/__test/mail>
- API: `http://localhost:4001/api/v1`

Tài khoản demo local:

| Vai trò | Email | Mật khẩu |
| --- | --- | --- |
| Quản trị | admin@rephone.local | AdminDemo123 |
| Cộng tác viên | customer@rephone.local | CustomerDemo123 |
| Nhân viên | employee@rephone.local | EmployeeDemo123 |

Dùng trình duyệt / cửa sổ riêng cho admin, cộng tác viên và khách mua.
Đăng ký tài khoản khách khác hoặc mua dưới dạng khách; không dùng thông tin cộng tác viên
để tạo đơn vì cơ chế chống tự giới thiệu sẽ loại hoa hồng.
Hộp thư chỉ nằm trong bộ nhớ của server test, tải lại trang hộp thư sau khi gửi.
Chứng từ test lưu trong `.local/affiliate/storage`; URL xem được cấp ngẫu nhiên, hết hạn sau 5 phút.

## Luồng thử thủ công

1. **Mở chương trình:** admin vào Cấu hình, nhập ví dụ 3%, dự phòng 100.000đ,
   lợi nhuận tối thiểu 100.000đ, bật chương trình và lưu. Đây là cấu hình demo,
   không phải đề xuất tỷ lệ cho hoạt động thật.
2. **Đăng ký:** khách hàng vào Cộng tác viên, nhập tên, điện thoại, kênh chia sẻ,
   chấp nhận điều khoản. Hồ sơ ở trạng thái chờ; chưa được tạo giới thiệu hợp lệ.
3. **Duyệt:** admin mở Hồ sơ & ngân hàng, chọn Hoạt động, nhập lý do và lưu.
4. **Tạo link:** cộng tác viên mở Link giới thiệu, tìm một iPhone, sao chép link.
   Máy thiếu giá vốn hoặc không còn dư lợi nhuận sẽ có hoa hồng dự kiến bằng 0.
5. **Ghi nhận:** mở link trong trình duyệt của khách mua; hệ thống ghi nhận rồi tự
   mở đúng trang máy, không cần bấm qua trang thông báo. Mua iPhone bằng
   tên/email/điện thoại khác cộng tác viên.
6. **Checkout:** kiểm tra Tổng quan cộng tác viên xuất hiện đúng một hoa hồng.
   Gửi lại checkout hoặc tải lại trang không được tạo bản ghi mới.
7. **Hoàn tất đơn:** dùng luồng nhận tại cửa hàng hoặc giao hàng sẵn có, xác minh
   thu đủ tiền. Hoa hồng vẫn chờ 14 ngày tính từ mốc muộn hơn giữa hoàn tất và đủ tiền.
   Các E2E dựng mốc thời gian quá hạn trên database test để kiểm tra bước này mà không chờ thực tế.
8. **Ngân hàng:** cộng tác viên nhập ngân hàng, số tài khoản, tên chủ tài khoản
   và mật khẩu hiện tại. Mở hộp thư giả lập, sao chép link xác nhận vào trình duyệt
   của cộng tác viên và bấm xác nhận.
9. **Xác minh:** admin mở thông tin ngân hàng để đối chiếu rồi xác minh.
   Tài khoản đầu tiên có hiệu lực ngay; tài khoản thay thế chờ 24 giờ.
10. **Rút:** khi có ít nhất 200.000đ khả dụng, bấm Rút toàn bộ. Chỉ một yêu cầu
    đang mở được phép tồn tại; các dòng hoa hồng được dành cho yêu cầu đó.
11. **Chi thử:** admin mở tài khoản nhận được chốt theo yêu cầu, chọn bắt đầu
    chuyển tiền. Ghi nhận giao dịch demo bằng mã tham chiếu, thời điểm và ảnh/PDF
    chứng từ giả lập. Không chuyển tiền thật trong môi trường này.
12. **Đối soát:** nếu chưa rõ ngân hàng đã chuyển hay chưa, chọn Cần đối soát.
    Không giải phóng số tiền chỉ vì thao tác bị timeout. Chỉ hủy khi đã xác nhận
    chưa chuyển, hoặc ghi nhận đã chi khi có chứng từ thực nhận tương ứng.

## Các trường hợp cần kiểm tra thêm

### Giao diện và điều hướng

- Khi chưa đăng nhập, `/affiliate` và `/dealer` là trang giới thiệu chương trình không có thanh bên. Bố cục gồm giới thiệu ngắn, thông tin chính, ba bước tham gia và câu hỏi thường gặp. Nút đăng ký chuyển tới login và giữ địa chỉ quay lại.
- Đổi giữa đăng nhập và tạo tài khoản phải giữ `returnTo` hợp lệ, không nhận địa chỉ website bên ngoài.
- Tài khoản có hồ sơ affiliate (kể cả đang chờ duyệt) có mục Cộng tác viên trong menu tài khoản và `/account`; tài khoản chưa có hồ sơ không có mục riêng này.
- `/account`, `/account/security`, `/account/addresses`, `/orders`, `/wishlist`, `/warranties`, `/after-sales` tự chuyển login khi chưa đăng nhập. Luồng guest checkout và liên kết xem đơn/bảo hành có quyền khách vẫn hoạt động như trước.
- Link `/r/{code}?to=...` tự mở đúng máy. API ghi nhận lỗi hoặc quá 3 giây vẫn phải mở trang đích; đường dẫn ngoài rePhone bị thay bằng `/products`.
- Kiểm tra các ô tên/điện thoại cùng hàng, cùng chiều cao; màn hình nhỏ xếp thành một cột, không tràn ngang.

### Nghiệp vụ và tiền

- Khách mở link A rồi link B hợp lệ: đơn mới thuộc B. Link sai không xóa cookie cũ.
- Link quá 30 ngày, hồ sơ tạm ngừng, tự mua: không có hoa hồng mới.
- Đơn đại lý, phụ kiện: không sinh hoa hồng affiliate.
- Voucher giảm tiền iPhone: căn cứ hoa hồng dùng tiền sau giảm giá.
- Hoa hồng yêu cầu 200.000đ nhưng dư lợi nhuận 150.000đ: chỉ ghi nhận 150.000đ.
- Đổi cấu hình chương trình sau checkout: không đổi snapshot đơn đã đặt.
- Hoàn iPhone: hoa hồng chưa chi giảm theo phần tiền còn lại và mức bảo vệ gốc.
- Hoàn phí giao, phụ kiện, tiền chuyển thừa: không cắt hoa hồng iPhone.
- Hoàn đang xử lý hoặc hậu mãi chưa kết thúc: tạm giữ hoa hồng.
- Khách hoàn máy sau khi hoa hồng đã trả: ghi chi phí rePhone chịu, không tạo nợ cộng tác viên.
- Yêu cầu chi đã xử lý gặp hoàn tiền: chuyển Cần đối soát, giữ nguyên khoản dành chi.
- Tắt chương trình: dừng đăng ký/giới thiệu mới, vẫn xử lý nghĩa vụ cũ.
- Lỗi gửi email: tài khoản ngân hàng vẫn lưu một lần; gửi lại cùng thông tin sau 60 giây.
- Chỉ admin được xem số ngân hàng đầy đủ/chứng từ; mỗi lần xem có audit.

## Kiểm thử tự động

Mọi lệnh liên quan database phải đặt ba biến về cùng đích local trước khi chạy:

```powershell
$env:TEST_DATABASE_URL='postgresql://rephone:rephone@127.0.0.1:5433/rephone_test'
$env:DATABASE_URL=$env:TEST_DATABASE_URL
$env:DIRECT_URL=$env:TEST_DATABASE_URL
pnpm --filter @rephone/api exec vitest run --config vitest.e2e.config.ts test/e2e/affiliates.e2e.spec.ts
pnpm --filter @rephone/api exec vitest run --config vitest.config.ts src/modules/affiliate-core/affiliate.policy.spec.ts
```

E2E reset dữ liệu trong `rephone_test` giữa từng ca, dùng PostgreSQL và HTTP thật.
Các ca kiểm thử bao gồm phân quyền, cookie/CSRF, checkout retry, chống tự giới thiệu,
ngân hàng/email, giữ tiền đồng thời, hoàn tiền đồng thời, chi trả lặp và hấp thụ tổn thất sau chi.

## Cấu hình vận hành

### Kết quả kiểm tra bản triển khai

Ngày 10/10/2026, trên database local: 18 E2E affiliate đã qua; hai bộ E2E
checkout và đại lý (33 ca) đã qua trong lượt hồi quy. Các bộ unit chọn lọc
về công thức, hoàn tiền, giao diện đơn hàng và điều hướng đăng nhập đã qua.
API và web đã build thành công; OpenAPI và client đã được cập nhật.

Đã thao tác trên trình duyệt: mở chương trình, khách đăng ký, admin duyệt,
tìm iPhone, sao chép link, ghi nhận link, thêm ngân hàng, nhận email giả lập,
xác nhận email và admin xác minh. Chi trả, retry và hoàn tiền được kiểm tra
bằng E2E HTTP/PostgreSQL; chưa thực hiện chuyển khoản thật.

Dữ liệu demo hiện có chương trình mở ở mức 3%, dự phòng 100.000đ và lợi nhuận
tối thiểu 100.000đ. Tài khoản `customer@rephone.local` đã có hồ sơ cộng tác viên
và ngân hàng giả lập được duyệt. Cài mới vẫn mặc định đóng; `prepare` giữ nguyên
cấu hình đã lưu. Có thể đăng ký khách khác để thử lại bước đăng ký từ đầu.

### Biến môi trường

`AFFILIATE_ENABLED` là điều kiện sẵn sàng của môi trường. Nút bật/tắt kinh doanh
nằm trong chính sách lưu ở database. Mặc định không có tỷ lệ và chương trình đóng.
`AFFILIATE_ENVIRONMENT=TEST` chỉ cho phép database local có hậu tố `_test`.
LIVE yêu cầu `AFFILIATE_ENCRYPTION_KEY` riêng, base64 32 byte. Khóa này mã hóa số
tài khoản ngân hàng; mất/thay khóa không có quy trình chuyển đổi sẽ không đọc được dữ liệu cũ.
Cookie HttpOnly/SameSite=Lax, Secure khi API dùng HTTPS. Chạy web và API cùng site
để cookie hoạt động theo thiết kế; v1 không hỗ trợ theo dõi xuyên thiết bị.

Job mỗi phút cập nhật tối đa 100 đơn trong một lượt, tiếp tục bằng con trỏ ở lượt sau.
Yêu cầu rút và bắt đầu chi luôn kiểm tra lại nguồn tiền trong transaction có khóa,
không phụ thuộc việc job đã chạy. Lịch sử chi và snapshot không được sửa; mọi điều
chỉnh hoa hồng có bản ghi riêng. Lịch sử thanh toán không được thay bằng số dư âm.

Trước khi vận hành thật cần chốt quy trình xét duyệt cộng tác viên, người đối soát
ngân hàng và các điều khoản kinh doanh áp dụng. Bộ chạy test không phải cấu hình production.
