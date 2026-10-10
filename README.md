# rePhone

Ứng dụng bán iPhone cũ và phụ kiện, có quản trị kho theo từng máy, đặt hàng, thanh toán,
giao hàng, hậu mãi, cổng đại lý/API và cộng tác viên affiliate một cấp.

Monorepo sử dụng **Next.js 16 / React 19**, **NestJS 11**, **Prisma 7**, **PostgreSQL 17**,
**pnpm 10.18.3** và **Node.js 24.18.x**. Phiên bản Node được ghi trong `.nvmrc`.

## 1. Clone trên máy mới: chọn cách chạy

| Nhu cầu                                                        | Cách chạy                                                                   | Cần cấu hình Supabase? |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------- |
| Clone về, chạy thử và sửa tiếp toàn bộ giao diện/nghiệp vụ     | **Docker local** — mục 2, khuyến nghị                                       | Không                  |
| Sửa frontend/backend bằng công cụ Node trên máy, thử affiliate | **Node + PostgreSQL Docker** — mục 3                                        | Không                  |
| Thử tích hợp API đại lý trong sandbox riêng                    | **Dealer sandbox** — mục 4                                                  | Không                  |
| Làm việc với database/Storage Supabase đã có                   | **Docker dev/demo** hoặc **Node local** — mục 5                             | Có                     |
| Triển khai công khai bằng HTTPS                                | [Hướng dẫn triển khai](docs/operations/local-development-and-deployment.md) | Có                     |

Docker local và sandbox chỉ phục vụ phát triển: email được giữ trong hộp thư thử,
tài khoản/ngân hàng demo không đại diện giao dịch thật. Không dùng các cấu hình này để mở website công khai.

```sh
git clone https://github.com/leedontbeshy/rePhone2.git
cd rePhone2
git switch main
```

Chạy mọi lệnh dưới đây từ **thư mục gốc repository**, trừ khi có ghi khác.

## 2. Chạy toàn bộ bằng Docker local — không cần `.env`

### Chuẩn bị

- Git; Docker Desktop chạy **Linux containers** (Windows dùng WSL2), hoặc Docker Engine + Compose trên Linux.
- Docker Compose hỗ trợ `watch` (2.22 trở lên); kiểm tra bằng `docker compose version`.
- Lần build đầu cần Internet để tải image và dependency. Nên dành khoảng 6–8 GB RAM cho Docker khi build cả Web/API.
- Không cần cài Node, pnpm, PostgreSQL hoặc Supabase trên máy để dùng cách này.

### Chạy lần đầu

```sh
docker compose -f compose.local.yaml up --build -d --wait
docker compose -f compose.local.yaml ps -a
```

Lệnh sẽ:

1. Tạo PostgreSQL riêng cho project `rephone-local`.
2. Chạy toàn bộ migration, gồm đại lý và affiliate.
3. Bổ sung tài khoản, cửa hàng, sản phẩm/máy demo còn thiếu; giữ chính sách và dữ liệu đã có.
4. Chạy API với email/Storage local và Next.js ở chế độ phát triển.

Service `init` có trạng thái **Exited (0)** là bình thường: đây là tác vụ khởi tạo đã xong.
API/Web chỉ khởi động khi database và bước khởi tạo thành công.

| Địa chỉ                                       | Công dụng                                                      |
| --------------------------------------------- | -------------------------------------------------------------- |
| <http://localhost:3001>                       | Website                                                        |
| <http://localhost:3001/backoffice>            | Quản trị                                                       |
| <http://localhost:3001/affiliate>             | Cổng cộng tác viên                                             |
| <http://localhost:3001/backoffice/affiliates> | Duyệt hồ sơ, chính sách và chi hoa hồng                        |
| <http://localhost:3001/dealer>                | Cổng đại lý TEST                                               |
| <http://localhost:3001/backoffice/dealers>    | Quản trị đại lý                                                |
| <http://localhost:4001/docs>                  | Swagger API                                                    |
| <http://localhost:4001/__test/mail>           | Hộp thư giả lập, gồm email xác nhận ngân hàng/đặt lại mật khẩu |
| <http://localhost:4001/health/ready>          | Kiểm tra API/database sẵn sàng                                 |

**Tài khoản có sẵn trên database mới:**

| Vai trò    | Email                    | Mật khẩu          |
| ---------- | ------------------------ | ----------------- |
| Admin      | `admin@rephone.local`    | `AdminDemo123`    |
| Nhân viên  | `employee@rephone.local` | `EmployeeDemo123` |
| Khách hàng | `customer@rephone.local` | `CustomerDemo123` |

Tài khoản khách **chưa tự trở thành CTV/đại lý**. Đăng ký hồ sơ, sau đó dùng admin xét duyệt.
Backend đã sẵn sàng cho cả hai kênh TEST, nhưng admin vẫn cần bật chương trình và cấu hình
giá/hoa hồng ở trang quản trị. Seed không tự mở kênh kinh doanh hay ghi đè chính sách đã lưu.

### Sửa code và chạy những lần sau

```sh
# Đồng bộ giao diện; tự rebuild API khi source thay đổi. Dừng theo dõi bằng Ctrl+C.
docker compose -f compose.local.yaml watch

# Sau khi git pull, thay dependency, cấu hình hoặc migration:
docker compose -f compose.local.yaml up --build -d --wait

# Xem log:
docker compose -f compose.local.yaml logs --follow --tail 100

# Tắt container, giữ database và file đã tải lên:
docker compose -f compose.local.yaml down
```

Thay đổi Prisma/migration cần chạy lại `up --build` để service `init` áp dụng migration;
`watch` một mình không triển khai migration. Thay Dockerfile/Compose cũng chạy lại lệnh này.

Nếu máy có pnpm, các lệnh tương đương là `pnpm docker:local`, `pnpm docker:local:watch`,
`pnpm docker:local:logs`, `pnpm docker:local:down`.

**Dữ liệu nằm ở đâu?**

- Database: named volume `rephone-local_database`, database `rephone_test`; không publish cổng PostgreSQL ra host.
- Ảnh/chứng từ tải lên: volume `rephone-local_uploads`.
- Ảnh sản phẩm demo: có sẵn trong repository.
- Email thử: trong bộ nhớ API, mất khi API khởi động lại.
- Không kết nối Supabase, không đọc credential từ `.env` hoặc `.env.docker`.
- Khác với `rephone_test` trên cổng host 5433 ở mục 3: hai nơi có tên database giống nhau nhưng thuộc **hai container/volume khác nhau**.

Không dùng `down -v` nếu muốn giữ dữ liệu: tùy chọn `-v` xóa các volume của stack.

Nếu 3001/4001 đang bị chiếm, dừng phiên Node cũ hoặc chọn cổng khác trước khi chạy:

```powershell
# PowerShell; giữ các biến này trong cùng terminal khi dùng Compose.
$env:LOCAL_WEB_PORT='3101'
$env:LOCAL_API_PORT='4101'
docker compose -f compose.local.yaml up --build -d --wait
```

Trên Bash: `export LOCAL_WEB_PORT=3101 LOCAL_API_PORT=4101`.
Đổi cổng sẽ đổi địa chỉ truy cập/email/link mới; các link đã sao chép trước đó vẫn chứa cổng cũ.

## 3. Chạy bằng Node trên máy + database Docker

Phù hợp khi cần debugger/IDE và thay code nhanh. Cài Node đúng `.nvmrc`, Docker và pnpm:

```sh
node --version
npm install --global pnpm@10.18.3
pnpm install --frozen-lockfile
docker compose --profile test up -d --wait postgres-test
pnpm affiliate:test:prepare
pnpm affiliate:test
```

- Website `http://localhost:3001`, API `http://localhost:4001/api/v1`.
- Database cố định `127.0.0.1:5433/rephone_test`.
- File đã tải lên nằm tại `.local/affiliate/storage`; thư thử tại `http://localhost:4001/__test/mail`.
- Không cần `.env`, Supabase hoặc SMTP thật. Launcher cung cấp cấu hình test riêng.
- Affiliate sẵn sàng; admin vẫn cần bật chương trình, duyệt hồ sơ, xác minh ngân hàng.
- Launcher này tắt backend đại lý; dùng Docker local ở mục 2 để thử cả hai kênh, hoặc sandbox riêng ở mục 4.
- `prepare` migrate/seed bổ sung/build API, **không reset database**.
- Frontend tự tải lại khi sửa. Backend chạy bản đã build: sau khi sửa API, Ctrl+C,
  chạy lại `pnpm affiliate:test:prepare`, rồi `pnpm affiliate:test`.
- Không chạy đồng thời Docker local và launcher Node trên cùng cổng 3001/4001.

Nếu muốn pnpm qua Corepack, có thể dùng `corepack enable` và `corepack prepare pnpm@10.18.3 --activate`
khi máy đã có Corepack; cách cài pnpm bằng npm ở trên không phụ thuộc Corepack.

## 4. Sandbox đại lý riêng

Sau bước cài Node/pnpm/dependency ở mục 3:

```sh
pnpm dealer:sandbox:prepare
pnpm dealer:sandbox
```

| Thành phần                       | Địa chỉ / dữ liệu                                   |
| -------------------------------- | --------------------------------------------------- |
| Cổng đại lý                      | `http://127.0.0.1:3002/dealer`                      |
| API                              | `http://127.0.0.1:4002/api/v1`                      |
| Database                         | `127.0.0.1:5433/rephone_dealer_sandbox`             |
| Đại lý demo                      | `dealer@sandbox.rephone.local` / `DealerSandbox123` |
| Admin demo                       | `admin@sandbox.rephone.local` / `AdminSandbox123`   |
| Cấu hình/khóa tạo riêng trên máy | `.local/dealer-sandbox/environment.json`            |

API key TEST được tạo trong cổng sandbox, chỉ dùng với API của chính sandbox đó.
Key LIVE không dùng cho TEST và ngược lại. Database này tách khỏi affiliate test và Docker local.
Web sandbox là bản sao local được tạo khi start; sau khi sửa frontend, khởi động lại launcher để cập nhật.

Xem thêm [nghiệp vụ/vận hành đại lý](docs/operations/dealer-channel.md) và [hướng dẫn API trên web](http://127.0.0.1:3002/dealer/api-guide).

## 5. Dùng database và Storage Supabase đã có

Chỉ chọn phần này khi thực sự muốn kết nối project Supabase đó. Clone repository không tự mang theo
`.env`, `.env.docker`, khóa mã hóa hay dữ liệu database.

### 5.1. Docker dev/demo với Supabase

Tạo `.env.docker` từ mẫu (Bash dùng `cp` thay `Copy-Item`):

```powershell
Copy-Item .env.docker.example .env.docker
```

Điền đủ các giá trị sau:

| Nhóm             | Cấu hình                                                                         |
| ---------------- | -------------------------------------------------------------------------------- |
| Database runtime | `DATABASE_URL` dùng role `rephone_runtime`, kết nối Supabase có TLS              |
| Migration        | `DIRECT_URL` dùng tài khoản có quyền DDL; chỉ đưa vào job migrate/provision      |
| Quyền runtime    | `REPHONE_RUNTIME_DB_PASSWORD`, trùng mật khẩu đã URL-encode trong `DATABASE_URL` |
| Đăng nhập        | `JWT_ACCESS_SECRET`                                                              |
| Định danh máy    | Giữ đúng `IDENTIFIER_ENCRYPTION_KEY`, `IDENTIFIER_HMAC_KEY` của database hiện có |
| Storage          | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, ba bucket tương ứng                 |
| Đại lý           | `DEALER_ENABLED`, `DEALER_ENVIRONMENT=LIVE`, `DEALER_ENCRYPTION_KEY`             |
| Affiliate        | `AFFILIATE_ENABLED`, `AFFILIATE_ENVIRONMENT=LIVE`, `AFFILIATE_ENCRYPTION_KEY`    |

`LIVE` ở đây mô tả môi trường nghiệp vụ kết nối database này, không có nghĩa máy local đã được public.
Không đặt affiliate TEST lên Supabase: TEST chỉ chấp nhận database local có hậu tố `_test`.
Hai khóa dealer/affiliate LIVE phải riêng, base64 32 byte; đừng tạo lại khóa khi đổi máy nếu cần đọc dữ liệu cũ.
Với **database mới**, có thể tạo từng khóa bằng:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Các bước migrate/provision dưới đây **thay đổi database trong `.env.docker`**. Với database dùng chung,
sao lưu trước và thực hiện theo [runbook triển khai](docs/operations/local-development-and-deployment.md).
Nếu database đã cập nhật đầy đủ và role đã có, chỉ cần schema-check rồi chạy ứng dụng.

```sh
# Không cần pnpm trên host:
docker compose --env-file .env.docker -f compose.yaml -f compose.demo.yaml --profile tools run --build --rm migrate
docker compose --env-file .env.docker -f compose.yaml -f compose.demo.yaml --profile tools run --build --rm provision-runtime
docker compose --env-file .env.docker -f compose.yaml -f compose.demo.yaml run --build --rm schema-check

# Chọn MỘT trong hai chế độ:
docker compose --env-file .env.docker -f compose.yaml -f compose.dev.yaml up --build --watch
# Hoặc bản đã build để demo:
docker compose --env-file .env.docker -f compose.yaml -f compose.demo.yaml up --build -d --wait
```

Web/API cùng origin tại `http://localhost:3000`, Swagger `http://localhost:3000/docs`.
Dev có Mailpit `http://localhost:8025`; demo giữ Mailpit nội bộ, không publish hộp thư.
Các lệnh pnpm tương ứng: `docker:db:migrate`, `docker:db:provision-runtime`, `docker:db:check`,
`docker:dev`, `docker:demo`, `docker:demo:down`.

Nếu là **database phát triển mới** cần dữ liệu mẫu, chạy rõ ràng, không chạy trên dữ liệu thật:

```sh
docker compose --env-file .env.docker -f compose.yaml -f compose.demo.yaml --profile tools run --build --rm seed
docker compose --env-file .env.docker -f compose.yaml -f compose.demo.yaml --profile tools run --rm seed pnpm --filter @rephone/api storage:seed:catalog
```

Bước thứ hai tải ảnh mẫu lên bucket public đã cấu hình. Bucket public catalog và store-assets cần đọc công khai;
bucket chứng từ phải private. Seed dùng các `SEED_*` trong `.env.docker`; không tự đặt lại mật khẩu user đã có.

### 5.2. Chạy Web/API trên host với Supabase

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env
```

Điền `.env` với database, Storage và các khóa như mục 5.1; dùng địa chỉ host:

```dotenv
API_PORT=4000
API_PUBLIC_URL=http://localhost:4000
WEB_PUBLIC_URL=http://localhost:3000
WEB_ORIGIN=http://localhost:3000
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
API_INTERNAL_BASE_URL=http://localhost:4000/api/v1
```

Database mới cần `pnpm db:deploy`, cấp role runtime, sau đó `pnpm db:seed` nếu là dữ liệu phát triển.
Database hiện có chỉ cần áp dụng migration còn thiếu theo runbook; đừng reset để xử lý lỗi schema.
Nếu `.env` dùng SMTP local, khởi động Mailpit, rồi chạy ứng dụng:

```sh
docker compose --env-file .env.docker.example -f compose.yaml -f compose.dev.yaml up -d --no-deps mailpit
pnpm dev
```

Đây là Web 3000/API 4000. Không chạy `pnpm dev` đồng thời `pnpm docker:dev` vì cùng dùng cổng 3000.
Lỗi Argon2 bị chính sách Windows chặn có thể tránh bằng Docker local/dev (dependency chạy trong Linux).

## 6. Mang công việc sang máy khác

### Code và cấu hình

1. Commit và push nhánh đang làm **trước khi rời máy**. Code chưa push sẽ không có trong bản clone mới.
2. Trên máy mới clone/switch đúng nhánh, rồi dùng mục 2 hoặc 3.
3. Nếu dùng Supabase cũ, chuyển `.env`/`.env.docker` qua kênh riêng an toàn, giữ nguyên khóa mã hóa.
   Không commit những file này. Dữ liệu đã ở Supabase không cần chép database local.
4. Nếu cần tiếp tục đúng dữ liệu test trên máy nhà, chuyển cả database và file upload như dưới đây.
   Chỉ chạy seed trên máy mới sẽ tạo dữ liệu demo ban đầu, **không có đơn/hồ sơ đã nhập trên máy nhà**.

### Sao lưu Docker local (mục 2)

Ví dụ PowerShell. Dừng Web/API để database và chứng từ không đổi trong lúc sao lưu:

```powershell
New-Item -ItemType Directory -Force .local/transfer
docker compose -f compose.local.yaml stop web api
docker compose -f compose.local.yaml exec -T postgres-test pg_dump -U rephone -d rephone_test --no-owner --no-acl -Fc -f /tmp/rephone_test.dump
docker compose -f compose.local.yaml cp postgres-test:/tmp/rephone_test.dump .local/transfer/rephone_test.dump
docker compose -f compose.local.yaml cp api:/workspace/.local/affiliate/storage .local/transfer/storage
docker compose -f compose.local.yaml start api web
```

Chép thư mục `.local/transfer` sang máy mới bằng ổ riêng/kênh riêng. Không đẩy dump và chứng từ lên Git.
`pg_dump` ghi file bên trong container rồi copy ra, tránh lỗi hỏng file nhị phân do redirect của PowerShell cũ.

### Sao lưu phiên affiliate Node đang dùng (mục 3)

Dừng `pnpm affiliate:test` bằng Ctrl+C, giữ PostgreSQL đang chạy:

```powershell
New-Item -ItemType Directory -Force .local/transfer
docker compose --profile test exec -T postgres-test pg_dump -U rephone -d rephone_test --no-owner --no-acl -Fc -f /tmp/rephone_test.dump
docker compose --profile test cp postgres-test:/tmp/rephone_test.dump .local/transfer/rephone_test.dump
Copy-Item .local/affiliate/storage -Destination .local/transfer/storage -Recurse
```

Nếu chưa tải file nào và chưa có thư mục storage, bỏ qua lệnh copy cuối. Dùng thư mục transfer mới/rỗng cho mỗi lần sao lưu.
Backup này có thể khôi phục vào Docker local trên máy mới để chuyển hẳn cách chạy.

### Khôi phục vào Docker local trên máy mới

**Chỉ thực hiện trên database local của máy mới muốn thay thế.** `--clean` thay thế dữ liệu demo đã tạo
bằng bản sao lưu; không dùng lệnh này với database Supabase. Dùng cùng phiên bản code với backup trước,
sau đó mới cập nhật code/migrate nếu cần.

```powershell
docker compose -f compose.local.yaml up --build -d --wait
docker compose -f compose.local.yaml stop web api
docker compose -f compose.local.yaml cp .local/transfer/rephone_test.dump postgres-test:/tmp/rephone_test.dump
docker compose -f compose.local.yaml exec -T postgres-test pg_restore -U rephone -d rephone_test --clean --if-exists --no-owner --no-acl --exit-on-error /tmp/rephone_test.dump
# Chỉ khi backup có thư mục storage:
docker compose -f compose.local.yaml cp .local/transfer/storage/. api:/workspace/.local/affiliate/storage
docker compose -f compose.local.yaml run --rm --no-deps --user root api chown -R node:node /workspace/.local/affiliate/storage
docker compose -f compose.local.yaml up --build -d --wait
```

Sau đó kiểm tra đăng nhập, hồ sơ CTV/đại lý, đơn và một ảnh/chứng từ cũ.
Backup sandbox đại lý riêng còn cần `.local/dealer-sandbox/environment.json` để giữ khóa mã hóa;
không trộn database sandbox này vào `rephone_test`. Backup Supabase xem runbook riêng vì Storage và role runtime cần xử lý khác.

## 7. Kiểm tra và xử lý lỗi thường gặp

| Triệu chứng                                 | Cách xử lý                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Không kết nối được Docker daemon            | Mở Docker Desktop, chờ Engine chạy; kiểm tra `docker info`                                               |
| `port is already allocated` / `EADDRINUSE`  | Dừng phiên chạy cùng cổng hoặc đổi `LOCAL_WEB_PORT`/`LOCAL_API_PORT`                                     |
| Container `init` lỗi                        | `docker compose -f compose.local.yaml logs init`; kiểm tra migration/seed trước                          |
| `schema-check` không qua ở dev/demo         | Chạy migration có chủ ý bằng job migrate; không bỏ schema gate, không sửa migration đã áp dụng           |
| Trang không có các hồ sơ/đơn trên máy nhà   | Đang dùng database local mới; cần restore backup hoặc chọn đúng Supabase cũ                              |
| Ảnh/chứng từ cũ không tải                   | Database và storage phải đi cùng; Docker local dùng volume uploads, Node dùng `.local/affiliate/storage` |
| Cổng CTV/đại lý báo đóng                    | Mở chương trình trong backoffice, ngoài điều kiện backend `*_ENABLED`; sau đó kiểm tra trạng thái hồ sơ  |
| Sai mật khẩu demo                           | Seed không ghi đè tài khoản cũ; dùng mật khẩu đã đổi hoặc reset qua hộp thư test                         |
| Sửa `.env.docker` không có tác dụng         | Recreate bằng `up --build`, `restart` không cập nhật environment                                         |
| API guide dùng URL cũ trong demo/production | Metadata công khai được đóng vào Web lúc build; rebuild với đúng build args                              |
| `pnpm install` báo khác lockfile            | Dùng pnpm 10.18.3, Node 24.18.x; không xóa lockfile để né lỗi                                            |

Kiểm tra code nhanh trên host:

```sh
pnpm typecheck
pnpm lint
pnpm test
```

Kiểm thử API đầy đủ trong Docker:

```sh
docker compose -p rephone-ci -f compose.yaml -f compose.test.yaml --profile test run --build --rm api-test
docker compose -p rephone-ci -f compose.yaml -f compose.test.yaml down
```

Project `rephone-ci` có volume riêng. Nếu cổng 5433 của mục 3 đang chạy, đặt
`POSTGRES_TEST_HOST_PORT=5434` trong terminal chạy CI. Job test **tạo lại schema test**;
`pnpm test:db:prepare`, integration/E2E hoặc `pnpm verify` cũng có thể xóa dữ liệu test.
Không chạy chúng chung database với phiên thử thủ công cần giữ.

## 8. Cấu trúc và tài liệu

```text
apps/api/                NestJS, Prisma schema/migration/seed, test API
apps/web/                Next.js storefront, backoffice, dealer, affiliate
packages/api-client/     Kiểu dữ liệu sinh từ OpenAPI
infra/docker/            Dockerfile, Caddy và cấu hình local test
scripts/                 Launcher sandbox/test và công cụ kiểm tra
docs/                    Nghiệp vụ, kiến trúc, kế hoạch và vận hành
compose.local.yaml       Local độc lập: DB + API + Web + khởi tạo
compose.yaml             Nền dùng chung cho dev/demo/test/prod
compose.dev.yaml          Docker Watch + Supabase
compose.demo.yaml         Bản build local + Supabase
compose.test.yaml         Bộ kiểm thử Linux/PostgreSQL
compose.prod.yaml         Image registry + HTTPS
```

- [Luồng affiliate chi tiết cho đồ án, so sánh trước/sau](docs/requirements/affiliate-business-workflow.md)
- [Đặc tả affiliate](docs/requirements/affiliate-channel.md)
- [Luồng test affiliate](docs/runbooks/affiliate-channel.md)
- [Vận hành đại lý](docs/operations/dealer-channel.md)
- [Docker, Supabase, triển khai VPS và backup production](docs/operations/local-development-and-deployment.md)

Thay đổi OpenAPI: `pnpm api:openapi` rồi `pnpm api:client`. Thay đổi schema:
tạo migration trên database phát triển đã xác định đúng đích, commit cả `schema.prisma` và thư mục migration.
Không chỉnh lại file migration đã áp dụng.
