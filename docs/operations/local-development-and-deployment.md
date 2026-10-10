# Chạy rePhone bằng Docker và triển khai VPS

Docker đóng gói Web, API và công cụ migration. **Clone trên máy mới, không dùng Supabase:** bắt đầu với [README gốc](../../README.md), mục Docker local (`compose.local.yaml`). Stack đó có PostgreSQL và file upload riêng, tự migrate/seed dữ liệu demo và không đọc credential máy cũ.

Các chế độ dev/demo/prod dưới đây dùng Supabase PostgreSQL/Storage và Caddy gateway. Không có bước khởi động nào tự seed, reset hoặc migrate dữ liệu thật.

## 1. Kiến trúc chạy

| Môi trường | Thành phần | Cổng công khai | Dữ liệu |
| --- | --- | --- | --- |
| `local` | PostgreSQL, init, API với provider local, Next dev | Web `localhost:3001`, API `localhost:4001` | Database và uploads trong volume `rephone-local`; dealer/affiliate TEST |
| `dev` | Caddy, Next dev, Nest watch, Mailpit | Web/API chung `localhost:3000`; Mailpit `localhost:8025` | Supabase |
| `demo` | Caddy, image Next standalone, Nest đã build, Mailpit | Web/API chung `localhost:3000` | Supabase |
| `test` | API operations + PostgreSQL 17.6 | PostgreSQL test chỉ bind `127.0.0.1:5433` | Volume test riêng |
| `prod` | Caddy HTTPS, Next standalone, Nest runtime | Chỉ 80/443 | Supabase |

Caddy giữ cùng origin: browser gọi `/api/v1`, còn Next server gọi `http://api:4000/api/v1`. API và Web không publish cổng trực tiếp. API có thêm mạng outbound để kết nối Supabase/SMTP; mạng nội bộ vẫn tách khỏi Internet inbound.

Các file chính:

- `compose.yaml`: network, volume và PostgreSQL test.
- `compose.local.yaml`: stack độc lập cho máy mới, không ghép với `compose.yaml`.
- `compose.dev.yaml`: hot reload bằng Compose Watch.
- `compose.demo.yaml`: image bất biến chạy local HTTP.
- `compose.test.yaml`: unit, integration và E2E trong Linux.
- `compose.prod.yaml`: image registry, Caddy HTTPS và giới hạn một API replica.
- `infra/docker/api.Dockerfile`: development, operations, demo và runtime API.
- `infra/docker/web.Dockerfile`: development, build và Next standalone runtime.

## 2. Chuẩn bị

Yêu cầu Docker Desktop/Engine có Compose mới, Git và Node 24.18 nếu chạy lệnh ngoài container.

```powershell
corepack enable
pnpm install --frozen-lockfile
Copy-Item .env.docker.example .env.docker
```

Điền `.env.docker` nhưng không commit file này. Hai URL database dùng Supavisor session port 5432 khi máy không có IPv6:

```text
DATABASE_URL=postgresql://rephone_runtime.<project-ref>:<runtime-password>@<pooler>:5432/postgres?uselibpqcompat=true&sslmode=require
DIRECT_URL=postgresql://postgres.<project-ref>:<admin-password>@<pooler>:5432/postgres?uselibpqcompat=true&sslmode=require
```

- `DATABASE_URL` là tài khoản ít quyền của API.
- `DIRECT_URL` chỉ được truyền vào job migration/provision, không vào API đang chạy.
- `REPHONE_RUNTIME_DB_PASSWORD` phải trùng password đã URL-encode trong `DATABASE_URL` và dài ít nhất 24 ký tự.
- `sslmode` phải xuất hiện đúng một lần. Job từ chối URL remote không yêu cầu TLS trước khi gửi credential.
- `sslmode=require` mã hóa đường truyền nhưng không xác thực CA. Production dùng `verify-full` theo mục 7.
- Database hiện có phải giữ nguyên hai `IDENTIFIER_*`; đổi trực tiếp sẽ làm IMEI/số sê-ri/EID cũ không đọc hoặc tìm được.

Các script `docker:*` truyền rõ `--env-file .env.docker`; file này phải tự chứa đủ cấu hình Docker và không phụ thuộc `.env` chạy host. API chỉ nhận allow-list cấu hình runtime; Web không nhận database, JWT, SMTP password hay Supabase service-role key. `DIRECT_URL`, password cấp role và password seed không được truyền vào API/schema-check.

## 3. Khởi tạo quyền database một lần

Đây là thay đổi có chủ ý trên Supabase, không chạy tự động khi `up`.

1. Backup database và Storage cần thiết.
2. Trong Supabase Dashboard, tắt Data API hoặc loại schema `public` khỏi exposed schemas. Bước này bắt buộc vì ứng dụng chỉ truy cập dữ liệu nghiệp vụ qua NestJS/Prisma.
3. Điền URL TLS và password runtime trong `.env.docker`.
4. Chạy migration bằng tài khoản quản trị.
5. Tạo/cập nhật tài khoản runtime và kiểm chứng quyền bằng chính tài khoản đó.
6. Chạy schema gate bằng tài khoản runtime.

```powershell
pnpm docker:db:migrate
pnpm docker:db:provision-runtime
pnpm docker:db:check
```

Migration thu hồi quyền bảng, sequence và function của `anon`, `authenticated`, `service_role`; role `rephone_app` chỉ có DML nghiệp vụ và chỉ đọc `_prisma_migrations`. Provision sẽ dừng nếu role có membership/thuộc tính lạ, nếu runtime có thể tạo bảng, sửa lịch sử migration, hoặc nếu quyền mặc định của function còn hở.

Sau đó gọi REST/Data API bằng anon key để xác nhận bảng `public` bị từ chối, rồi smoke Supabase Storage riêng qua API. Migration chỉ sửa default ACL của owner đang migrate; tắt Data API vẫn là lớp bảo vệ bắt buộc cho object tương lai do `supabase_admin` tạo.

## 4. Phát triển hằng ngày

```powershell
pnpm docker:dev
```

Truy cập:

- rePhone: `http://localhost:3000`
- API readiness qua gateway: `http://localhost:3000/health/ready`
- Swagger local: `http://localhost:3000/docs`
- Mailpit: `http://localhost:8025`

Compose Watch đồng bộ source và rebuild khi manifest, lockfile, Prisma hoặc package dùng chung đổi. Khi đổi `.env`/`.env.docker`, dừng và tạo lại container vì restart không nạp lại environment:

```powershell
pnpm docker:dev:down
pnpm docker:dev
```

Không dùng `down -v`; volume PostgreSQL test và dữ liệu Caddy được giữ mặc định.

## 5. Bản demo bất biến

```powershell
pnpm docker:demo
pnpm docker:demo:logs
```

Demo build hoàn toàn trong Debian Linux nên không nạp file Argon2 bị Windows Application Control chặn. Demo vẫn chạy `NODE_ENV=development` để dùng HTTP/cookie local, nhưng chạy mã Nest đã compile và Next standalone, không mount source.

Dừng mà không xóa volume:

```powershell
pnpm docker:demo:down
```

API chỉ khởi động sau khi `schema-check` so đủ tên và SHA-256 của mọi `migration.sql`. Schema pending, migration lỗi, file migration bị sửa hoặc database có migration lạ đều chặn startup.

## 6. Kiểm thử Linux/PostgreSQL 17

```powershell
pnpm docker:test
```

Job tạo lại riêng schema `rephone_test`, deploy toàn bộ migration rồi chạy unit, integration và E2E trong image operations. `TEST_DATABASE_URL` trỏ tới `postgres-test:5432`; job không gọi Docker lồng bên trong container và không thể reset Supabase.

Các kiểm tra host vẫn dùng được:

```powershell
pnpm test:db:prepare
pnpm verify
```

## 7. Build image và triển khai VPS

Build ba image từ đúng commit/tag:

```powershell
docker build -f infra/docker/api.Dockerfile --target api-runtime -t <registry>/rephone-api:<tag> .
docker build -f infra/docker/api.Dockerfile --target api-operations -t <registry>/rephone-api-ops:<tag> .
docker build -f infra/docker/web.Dockerfile --target web-runtime -t <registry>/rephone-web:<tag> .
```

Khi build Web, truyền các `NEXT_PUBLIC_*` bằng `--build-arg` nếu khác mặc định. Metadata hướng dẫn đại lý cũng được đóng vào Web lúc build: truyền `API_PUBLIC_URL=https://<domain>`, `DEALER_ENVIRONMENT=LIVE`, `DEALER_SANDBOX_WEB_URL` và `DEALER_SANDBOX_API_URL` nếu có sandbox. Thay biến runtime của image Web đã build không thay được các giá trị này. Không truyền secret bằng build arg. Push cả ba image rồi tạo file environment production ngoài repository với `API_IMAGE`, `API_OPS_IMAGE`, `WEB_IMAGE` cùng tag bất biến.

Compose dev/demo/prod đã truyền cấu hình dealer và affiliate cho API. Bật `DEALER_ENABLED`/`AFFILIATE_ENABLED` cần khóa riêng `DEALER_ENCRYPTION_KEY`/`AFFILIATE_ENCRYPTION_KEY` ở LIVE; giữ các khóa khi chuyển máy hoặc khôi phục dữ liệu. Nút bật kinh doanh ở backoffice vẫn là bước riêng. Production cố định cả hai môi trường thành LIVE; không đưa endpoint mô phỏng TEST vào production.

Production bắt buộc có file CA Supabase trên VPS. Compose mount file do `SUPABASE_DB_CA_FILE` chỉ định vào `/run/secrets/supabase-db-ca.crt`; cả hai URL trong container dùng:

```text
sslmode=verify-full&sslrootcert=/run/secrets/supabase-db-ca.crt
```

Kiểm tra cấu hình trước khi thay đổi database:

```powershell
docker compose --env-file .env.production -f compose.yaml -f compose.prod.yaml config --quiet
docker compose --env-file .env.production -f compose.yaml -f compose.prod.yaml pull
```

Thứ tự release:

```powershell
docker compose --env-file .env.production -f compose.yaml -f compose.prod.yaml --profile tools run --rm migrate
docker compose --env-file .env.production -f compose.yaml -f compose.prod.yaml --profile tools run --rm provision-runtime
docker compose --env-file .env.production -f compose.yaml -f compose.prod.yaml run --rm schema-check
docker compose --env-file .env.production -f compose.yaml -f compose.prod.yaml up -d --wait
```

Production chỉ publish 80/443, Caddy tự cấp HTTPS, Swagger không được route công khai, container chạy non-root và `DIRECT_URL` không tồn tại trong API runtime. Giữ đúng một API replica vì scheduler hiện chưa có distributed lock.

## 8. Smoke sau release

Tối thiểu kiểm tra:

1. `/api/health` trả 204 từ Web và `/health/ready` trả thành công từ API.
2. Trang chủ/cửa hàng render server-side, asset tải đủ và client gọi cùng origin `/api/v1`.
3. Đăng nhập, refresh cookie, đăng xuất và chặn trang backoffice cho khách.
4. Đọc catalog, một thao tác giỏ hàng an toàn, upload/download một fixture Storage có thể xóa.
5. Gửi email thử qua provider hoặc Mailpit.
6. REST/Data API với anon key không đọc được bảng nghiệp vụ.
7. Log/image history/client bundle không chứa URL nội bộ hoặc secret.
8. Chỉ một API instance phát log scheduler.

## 9. Backup và khôi phục

Database backup không chứa Supabase Storage object. Export database và object/manifest Storage thành hai phần, mã hóa file backup và không commit.

`rephone_app` và `rephone_runtime` là cluster role, không đi theo `pg_dump` database thông thường. Quy trình khôi phục khuyến nghị vào Supabase project mới:

1. Tắt Data API/exposed `public` trên target.
2. Dùng image/schema cùng phiên bản backup, chạy migration trên database rỗng để bootstrap role và schema.
3. Chạy `provision-runtime`.
4. Restore **data-only**, loại dữ liệu bảng `_prisma_migrations` để giữ lịch sử vừa được tạo trên target.
5. Restore Storage object/manifest riêng.
6. Chạy `schema-check`, invariant test, đối chiếu count/tổng tiền và smoke bằng runtime role.
7. Chỉ đổi DNS/connection sau khi mọi kiểm tra qua.

Không restore full dump vào cluster mới trước khi tạo cluster roles; ACL trong dump có thể tham chiếu role chưa tồn tại. Nếu backup thuộc schema cũ, khôi phục vào staging với image cùng phiên bản trước, sau đó mới chạy forward migration.

## 10. Rollback và xử lý sự cố

- Lỗi code, schema vẫn tương thích: quay lại cả API/Web image tag trước.
- Migration forward-only: không tự chạy down migration. Khi có lỗi dữ liệu, restore vào database mới rồi smoke trước khi chuyển kết nối.
- Schema gate lỗi: không bỏ qua gate hoặc cấp DDL cho runtime; xem `pending`, `incomplete`, `unknownApplied`, `checksumMismatch` rồi xử lý bằng job operations.
- Database/Storage/SMTP lỗi: giữ readiness và log rõ; không reset/seed để “thử lại”.
- Lộ runtime password: đổi bằng `provision-runtime`, cập nhật `DATABASE_URL`, recreate API/schema-check.
- Lộ JWT secret: rotate và chấp nhận revoke phiên hiện tại.
- Lộ identifier key: cần keyring/rotation dữ liệu; không thay thẳng environment.

## 11. Gate còn lại trước production thật

Tại ngày 2026-08-29, môi trường hiện có còn ba điều kiện cần hoàn tất trước go-live:

- URL Supabase trong `.env` host chưa yêu cầu TLS; Docker guard sẽ từ chối cho tới khi `.env.docker` có cấu hình mã hóa.
- Migration hardening và thay đổi Data API chưa được áp lên project Supabase thật; phải backup, tắt Data API, migrate/provision và smoke theo mục 3.
- 105 identifier hiện có dùng key mẫu `key_version=1`. Production cố ý từ chối key mẫu; cần triển khai keyring hoặc migration giải mã–mã hóa lại trước khi bật `NODE_ENV=production`. Demo local vẫn phải giữ key cũ để đọc dữ liệu.

## Liên kết

- [Configuration](../architecture/configuration.md)
- [Database implementation](../architecture/database-implementation.md)
- [Docker architecture decision](../planning/2026-08-29-dockerization-plan.md)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api)
