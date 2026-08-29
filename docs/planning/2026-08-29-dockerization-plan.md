# Kế hoạch đóng gói Docker toàn bộ rePhone

Ngày chốt: 2026-08-29

## Mục tiêu đã xác nhận

- Đóng gói cả môi trường phát triển có tự cập nhật và bản demo dùng image bất biến.
- Chạy trước mắt trên Docker Desktop/WSL2; chuẩn bị sẵn cấu hình để đưa lên một VPS có domain và HTTPS.
- Chỉ công khai một gateway; Web và API chạy trong mạng Docker nội bộ.
- Supabase tiếp tục là nguồn dữ liệu và Storage chính; PostgreSQL container chỉ dành cho kiểm thử.
- Loại bỏ phụ thuộc vào native artifact Windows để tránh lỗi Application Control với Argon2.
- Migration Supabase phải là thao tác có chủ ý; startup chỉ kiểm tra và chặn khi schema lệch.
- Chạy đúng một API replica vì scheduler và rate limiter hiện chưa phân tán.

## Giả định và ngoài phạm vi

- P0 phục vụ một máy phát triển hoặc một VPS, không yêu cầu HA, autoscaling hay nhiều API replica.
- Bản demo local dùng HTTP tại `http://localhost:3000`; bản production chỉ chạy với HTTPS.
- Registry/CI triển khai tự động và giám sát production đầy đủ chưa thuộc đợt này.
- Không self-host Supabase và không tự seed/reset database thật trong quá trình khởi động.
- Secret local nằm trong file bị Git bỏ qua; production dùng file ngoài repo hoặc secret store của nền tảng.

## Nhật ký quyết định

| Quyết định | Phương án đã loại | Lý do |
| --- | --- | --- |
| Compose nền và các file phủ `dev`, `demo`, `test`, `prod` | Một Compose nhiều profile; một workspace container | Tách mount, secret và vòng đời từng môi trường; giảm nguy cơ chạy nhầm cấu hình. |
| Tách `gateway`, `web`, `api` | Công khai trực tiếp hai cổng | Một origin giúp cookie/CORS ổn định và đổi sang domain/TLS không đổi kiến trúc. |
| Caddy làm gateway | Nginx hoặc không có proxy | Cấu hình ngắn, hỗ trợ HTTPS tự động khi lên VPS. |
| Node 24 Debian slim, build hoàn toàn trong Linux | Alpine; tái dùng artifact Windows | Tương thích glibc tốt hơn với Argon2, Prisma và Sharp. |
| Supabase là DB dev/demo/prod | PostgreSQL local làm DB dev | Khớp trạng thái dự án hiện tại; tránh hai nguồn dữ liệu. |
| PostgreSQL 17 riêng cho test | PostgreSQL 18 hiện tại | Căn major version với Supabase production. |
| Browser gọi `/api/v1`, Next server gọi `http://api:4000/api/v1` | Dùng một `localhost` URL cho cả client/server | Giữ image Web độc lập domain và sửa lỗi SSR trong container. |
| Startup chỉ kiểm tra migration | Tự migrate khi mỗi lần `up` | Tránh cấp quyền DDL thường trực và thay đổi Supabase ngoài ý muốn. |
| API runtime dùng role least-privilege | Dùng `postgres` cho cả runtime/migration | Hạn chế phạm vi ảnh hưởng khi credential runtime lộ. |
| Tắt Data API và thu hồi grant bảng nghiệp vụ | Giữ quyền mặc định hoặc thêm policy giả | Ứng dụng không dùng PostgREST/GraphQL cho dữ liệu nghiệp vụ. |

## Thiết kế cuối

### Image và mạng

- API và Web có Dockerfile nhiều stage gồm dependency, development, build và runtime.
- Build context loại `.env`, Git, `node_modules`, `.next`, `dist`, cache, log và dump.
- Runtime image chạy non-root, có init, healthcheck và dừng mềm.
- Caddy nhận request bên ngoài; `/api/v1`, `/health` sang API, phần còn lại sang Web. `/docs` chỉ route ở local, không công khai ở production.
- Demo chỉ công khai `localhost:3000`; production chỉ công khai 80/443.

### Môi trường

- `dev`: Compose Watch đồng bộ source, rebuild khi manifest/lockfile đổi, Mailpit cho email.
- `demo`: production build, không mount source, local HTTP, restart policy và schema gate.
- `test`: PostgreSQL 17, scheduler tắt, credential giả/in-memory Storage; không nhận Supabase URL/key thật.
- `prod`: image bất biến, Caddy HTTPS/domain, secret ngoài repo, CA Supabase mount read-only, một API replica.

### Dữ liệu và migration

- `DATABASE_URL` runtime dùng role `rephone_runtime`; `DIRECT_URL` chỉ có trong job migration.
- `schema-check` so migration trong image với `_prisma_migrations`; mismatch chặn API và trả hướng dẫn rõ.
- Job migration thủ công chạy `prisma migrate deploy`, kiểm tra exact status, không seed/reset.
- Hardening thu hồi quyền hiện có và default privileges của `anon`, `authenticated`, `service_role` trên schema nghiệp vụ; provision runtime role không ghi password vào migration.
- Tắt Data API trong Supabase Dashboard rồi xác minh REST bằng anon key bị từ chối; Storage vẫn được smoke riêng.

## Tiêu chí nghiệm thu

- Build sạch trong Linux và không dùng native dependency/artifact Windows.
- Dev hot reload được; demo chạy qua một URL; prod Compose hợp lệ với domain/TLS.
- SSR, đăng nhập/cookie, CORS, Storage, Mailpit và static asset đều hoạt động.
- Schema lệch chặn API; migration thủ công chạy lặp an toàn; test chỉ reset database `_test`.
- Image history, environment và client bundle không chứa secret hoặc URL Docker nội bộ.
- API chạy non-root, healthcheck đúng, dừng mềm và chỉ một scheduler phát log.
- Vai trò Data API công khai không còn truy cập được bảng nghiệp vụ.
