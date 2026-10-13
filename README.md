# rePhone

Ứng dụng bán iPhone theo từng mã máy, gồm cửa hàng trực tuyến, backoffice, cổng đại lý và cộng tác viên. Monorepo dùng Next.js/React, NestJS, Prisma và PostgreSQL.

## Yêu cầu

- Docker Engine/Desktop đang chạy, Docker Compose v2 có hỗ trợ `--watch`.
- Nếu chạy bằng pnpm: Node.js 24.18.x và pnpm 10.18.3 (khai báo trong `package.json`).
- Một dự án Supabase và service-role key để lưu ảnh/tệp ở môi trường dev. Key chỉ được dùng phía API, không đưa vào biến `NEXT_PUBLIC_*`.

## Cài đặt môi trường dev

Clone repo, sao chép `.env.example` thành `.env` và điền `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Có thể đổi tài khoản mẫu `SEED_*` trước lần chạy đầu.

### Chạy toàn bộ bằng Docker

```bash
docker compose --profile dev up --build -d
docker compose --profile dev logs -f dev-init api-dev web-dev
```

Chạy `pnpm docker:dev` hoặc `docker compose --profile dev up --build --watch` nếu muốn đồng bộ thay đổi mã nguồn. Lần đầu cần tải image, cài dependency, áp dụng migration và tạo dữ liệu/ảnh mẫu.

### Chạy API/web bằng pnpm

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Lệnh dev tự khởi động PostgreSQL và Mailpit trong Docker, áp dụng migration, seed phần dữ liệu còn thiếu rồi chạy API/web với hot reload. Không chạy API/web Docker và pnpm cùng lúc trên cổng 3000/4000. Khi chuyển từ Docker sang pnpm, chạy `docker compose --profile dev stop api-dev web-dev` trước.

| Dịch vụ        | Địa chỉ                                |
| -------------- | -------------------------------------- |
| Web            | http://localhost:3000                  |
| API            | http://localhost:4000/api/v1           |
| Swagger        | http://localhost:4000/docs             |
| Mailpit        | http://localhost:8025                  |
| PostgreSQL dev | localhost:5433, database `rephone_dev` |

Tài khoản mẫu mặc định: `admin@rephone.local / AdminDemo123`, `employee@rephone.local / EmployeeDemo123`, `customer@rephone.local / CustomerDemo123`. Các giá trị này chỉ dành cho dev. Seed không thay đổi mật khẩu, dữ liệu hoặc cấu hình đã tồn tại. Dừng/khởi động lại giữ dữ liệu trong volume `rephone_dev_database`.

Đại lý và cộng tác viên chạy trong cùng ứng dụng dev ở chế độ TEST. Bật/tắt chính sách nghiệp vụ tại **Backoffice → Cấu hình cửa hàng** bằng tài khoản admin.

## Database, Storage và email

| Môi trường | Database                                     | Storage                                   | Email         |
| ---------- | -------------------------------------------- | ----------------------------------------- | ------------- |
| Dev        | PostgreSQL Docker, `rephone_dev`, cổng 5433  | Supabase, 3 bucket riêng có hậu tố `-dev` | Mailpit       |
| Test       | PostgreSQL Docker, `rephone_test`, cổng 5434 | Fake provider                             | Fake provider |
| Prod       | PostgreSQL Supabase                          | Bucket production                         | SMTP thực tế  |

Dev tự tạo `rephone-public-dev` (public, ảnh sản phẩm), `rephone-private-dev` (private, chứng từ), `rephone-store-assets-dev` (public, tài nguyên cửa hàng). Seed từ chối tên bucket không có hậu tố `-dev` hoặc quyền public/private sai; không chỉnh bucket production. Chứng từ được truy cập bằng signed URL.

API, Prisma và script cùng đọc cấu hình ở root. Dev dùng `.env`; production dùng `.env.production` khi `NODE_ENV=production`. Có thể chỉ định `REPHONE_ENV_FILE`; biến môi trường được truyền trực tiếp luôn có ưu tiên cao hơn. Test bỏ qua file env local và dùng cấu hình giả lập riêng. Không dùng `.env` để trỏ dev sang Supabase.

```bash
pnpm db:migrate --name ten_migration  # tạo migration khi phát triển
pnpm db:deploy                     # áp dụng migration có sẵn
pnpm db:seed                       # dữ liệu và ảnh mẫu, không reset
pnpm db:check                      # kiểm tra migration/checksum, chỉ đọc
pnpm api:generate                  # sinh OpenAPI và TypeScript client
```

Khi đổi mật khẩu PostgreSQL của dev, phải đổi cả role trong database đã tồn tại và cấu hình kết nối. Sửa `POSTGRES_PASSWORD` không tự đổi mật khẩu trong volume.

## Kiểm thử

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm test:coverage
pnpm exec playwright install chromium firefox webkit
pnpm test:browser
pnpm test:performance
pnpm docker:test
pnpm verify
```

Các lệnh integration/E2E/coverage/browser/performance tự chuẩn bị database test, chạy trên cổng riêng và dọn container test khi kết thúc. Database test dùng tmpfs; mỗi lượt được reset, không chứa dữ liệu thật. Có thể chạy test trong khi dev đang hoạt động; chỉ chạy một bộ test dùng chung database tại một thời điểm. CI có thể truyền `TEST_DATABASE_URL` tới một PostgreSQL cục bộ có tên kết thúc bằng `_test`. Guard từ chối database dev và host từ xa, kể cả Supabase.

Browser test dùng bản build `.next-test`, performance dùng `.next-performance`; không ghi đè build dev. Báo cáo nằm trong `.local/` và `coverage/`, ngoài Git. Baseline ảnh giao diện đầy đủ được kiểm tra trên Windows; CI Linux chạy smoke nghiệp vụ.

Smoke các image production với database TLS và secret tạm, mạng cô lập:

```bash
node scripts/infra/production-smoke.mjs
```

Lệnh này chỉ dọn tài nguyên có nhãn của lượt smoke hiện tại. Nó không kết nối Supabase.

## Production

Sao chép `.env.production.example` thành `.env.production`. Điền tên miền, Supabase database/Storage, SMTP và các khóa riêng. Tên miền cần trỏ đến máy chủ; mở cổng 80/443 cho Caddy cấp HTTPS. Các cổng API/web/database không được publish trực tiếp trong profile prod.

- `DIRECT_URL`: kết nối quản trị riêng để chạy migration/cấp quyền.
- `DATABASE_URL`: role `rephone_runtime`, chỉ có quyền runtime cần thiết.
- `REPHONE_RUNTIME_DB_PASSWORD`: cùng mật khẩu với role trong `DATABASE_URL`.
- Cả hai kết nối dùng `sslmode=verify-full`. Tải CA của dự án từ **Supabase → Database → Settings → SSL Configuration**, lưu thành `secrets/supabase-prod-ca.crt`; hai URL mẫu đã trỏ tới chứng chỉ được mount trong Docker. Khi chạy lệnh database trực tiếp trên máy, thay đường dẫn `sslrootcert` bằng đường dẫn tuyệt đối tới file local. Xem [hướng dẫn TLS của Supabase](https://supabase.com/docs/guides/platform/ssl-enforcement); không tắt xác minh TLS.
- Tạo khóa base64 32 byte bằng `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Mỗi biến mã hóa/HMAC cần khóa riêng. Với database đã có dữ liệu mã hóa, phải giữ khóa gốc hoặc thực hiện chuyển đổi dữ liệu có kiểm soát trước khi thay khóa.
- Đại lý và cộng tác viên dùng LIVE. Chính sách bật/tắt nghiệp vụ lưu trong database.

Áp dụng migration và cấp role là bước chủ động trước khi triển khai (sao lưu database trước khi thay đổi schema):

```bash
docker compose --env-file .env.production --profile prod run --build --rm migrate
docker compose --env-file .env.production --profile prod run --build --rm provision-runtime
docker compose --env-file .env.production --profile prod up --build -d
```

Khởi động prod chỉ kiểm tra migration rồi chạy một API instance, web và Caddy; không tự migrate, seed hoặc reset. Với database mới, khởi tạo admin qua `pnpm db:seed` trong môi trường production đã nạp `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_DEMO_PHONE` và cấu hình cửa hàng thực tế. Seed production không tạo máy/tài khoản khách mẫu. Với database hiện hữu, bỏ qua bước seed.

## Vận hành

```bash
docker compose --profile dev ps
docker compose --profile dev logs --tail 100 api-dev
docker compose --profile dev stop
docker compose --env-file .env.production --profile prod logs -f api web gateway
```

Healthcheck API: `/health/live`, `/health/ready`; web: `/api/health`. Backup PostgreSQL bằng `pg_dump -Fc` và kiểm thử phục hồi với `pg_restore`. Giữ riêng bản sao cấu hình và khóa mã hóa. Không dùng `docker compose down -v` với volume cần giữ dữ liệu.

## Cấu trúc

- `apps/api`: API, Prisma schema/migration/seed, unit/integration/E2E test.
- `apps/web`: giao diện Next.js và asset được sử dụng.
- `packages`: API client, cấu hình TypeScript/ESLint/test dùng chung.
- `tests`: browser, performance và fixture.
- `scripts`: các entrypoint chạy/kiểm tra hiện hành.
- `infra/docker`, `compose.yaml`: image và ba profile môi trường.

License và nguồn của font/asset nằm cạnh các tài nguyên tương ứng. Không đưa secret, database dump, chứng từ thật hoặc output kiểm thử vào Git.
