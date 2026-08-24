# Local development, demo deployment và runbook

Luồng mặc định cho Windows/Linux/macOS: ứng dụng chạy trên host để hot reload nhanh; Docker Compose chạy PostgreSQL và Mailpit. Profile `demo` có thể build/chạy cả web/API trong container để trình diễn production-like.

## 1. Prerequisites

- Git 2.5x+, Node 24.18.0, Corepack và Docker Desktop/Engine + Compose.
- pnpm không cài global bắt buộc: `corepack enable`, sau đó root `packageManager` chọn 10.18.3.
- Tài khoản/project Supabase với ba bucket theo configuration; nếu chưa có, các test dùng fake storage nhưng upload demo thật cần credential.
- Port mặc định trống: web 3000, API 4000, PostgreSQL 5432, SMTP 1025, Mailpit UI 8025.

## 2. Compose topology

Default services:

| Service | Image/port | Volume/health |
|---|---|---|
| `postgres` | `postgres:18.4-alpine`, `5432`, DB `rephone_dev` | named volume `rephone_pgdata`; `pg_isready` |
| `mailpit` | `axllent/mailpit:v1.30.6`, `1025/8025` | no persistent mail required |

Profile `test` thêm `postgres-test` cùng PostgreSQL image, host port 5433, database `rephone_test` và volume riêng/disposable; test scripts không bao giờ trỏ vào `rephone_dev`.

Optional `demo` profile:

- `api`: multi-stage Node 24-alpine image, port 4000, depends on healthy PostgreSQL, runs migration deploy before start through explicit entrypoint.
- `web`: multi-stage Next standalone image, port 3000, depends on ready API.

Database credential trong Compose chỉ dành local. Không dùng cùng password cho hosted demo.

Host `.env` dùng `localhost` (`DATABASE_URL ...@localhost:5432`, API URL `localhost:4000`). Service `api` trong profile demo override DB host thành `postgres`; service `web` dùng internal `http://api:4000/api/v1` cho server-side call và public browser URL `http://localhost:4000/api/v1`. Không dùng `localhost` để container gọi container khác.

## 3. First run

```powershell
corepack enable
pnpm install --frozen-lockfile
Copy-Item .env.example .env
docker compose up -d postgres mailpit
pnpm db:deploy
pnpm db:seed
pnpm dev
```

Kiểm tra:

- Web `http://localhost:3000`.
- API ready `http://localhost:4000/health/ready`.
- OpenAPI UI `http://localhost:4000/docs` chỉ bật development; JSON artifact được generate riêng.
- Mailpit `http://localhost:8025`.

Nếu máy đã có PostgreSQL container chiếm 5432, đổi host port Compose và local `DATABASE_URL`; container port vẫn 5432. Không cần cài `psql` trên host vì có thể chạy qua `docker compose exec postgres psql`.

## 4. Day-to-day commands

| Việc | Command |
|---|---|
| Start infra | `docker compose up -d postgres mailpit` |
| Stop infra, giữ data | `docker compose stop` |
| Xem log infra | `docker compose logs -f postgres mailpit` |
| Create migration | `pnpm db:migrate -- --name <name>` |
| Deploy existing migration | `pnpm db:deploy` |
| Seed/reseed idempotent | `pnpm db:seed` |
| Slice 10 invariant preflight | `pnpm preflight:slice10` |
| Slice 10 smoke mặc định (read-only) | `pnpm smoke:slice10` |
| Verify toàn repo | `pnpm verify` |
| Full demo containers | `docker compose --profile demo up --build` |

Không dùng `docker compose down -v` trong script thường ngày vì xóa database volume. Khi thật sự cần reset local, dùng command riêng có guard database name và ghi rõ mất dữ liệu.

## 5. Database backup/restore

Backup local từ service:

```powershell
docker compose exec -T postgres pg_dump -U rephone -d rephone_dev --format=custom > rephone-dev.dump
```

Restore phải vào database mới/rỗng, không overwrite mặc định:

```powershell
docker compose exec -T postgres createdb -U rephone rephone_restore
Get-Content -AsByteStream rephone-dev.dump | docker compose exec -T postgres pg_restore -U rephone -d rephone_restore --no-owner --no-privileges
```

Sau restore, trỏ temporary URL vào `rephone_restore`, chạy readiness + smoke query + kiểm tra count/order total. File dump có PII/secret-like token hash nên không commit hoặc gửi công khai.

Supabase object cần backup/export riêng nếu demo phụ thuộc file; database chỉ lưu metadata path.

## 6. Hosted demo topology

Mục tiêu tối giản:

```text
HTTPS reverse proxy/platform
├── Next.js web (1 instance)
└── NestJS API (1 instance + scheduler)
      ├── PostgreSQL 18 (managed/Supabase hoặc container private)
      ├── Supabase Storage
      └── SMTP provider
```

- Một API replica là deployment invariant P0.
- Database không public; TLS required với managed DB.
- Migration là release step một lần trước khi API mới nhận traffic.
- API/web images chạy non-root, production dependency only, healthcheck và restart policy.
- Next build nhận public API URL; server runtime nhận internal/public URL đúng môi trường.
- Không bật Swagger UI public ở production; có thể giữ static OpenAPI artifact trong repository.

## 7. Release checklist

1. `pnpm install --frozen-lockfile && pnpm verify` qua trên clean checkout.
2. Migration từ database rỗng và trên bản backup staging qua.
3. Backup hiện tại; xác nhận `DIRECT_URL` đúng target.
4. Deploy migration, API rồi web.
5. Check live/ready, login, public catalog, một checkout sandbox/demo, Mail/Storage.
6. Kiểm tra logs không lộ secret và scheduler chỉ chạy một instance.
7. Gắn release/commit SHA; ghi migration đã chạy.

## 8. Rollback và sự cố

- Code-only failure: rollback image về commit trước nếu schema tương thích.
- Migration additive được thiết kế backward-compatible trong một release; không tự down migration.
- Destructive/data migration: restore vào database mới rồi đổi connection chỉ sau xác minh; không chạy lệnh xóa trong hoảng loạn.
- Storage/SMTP down: API core vẫn ready; upload/mail use case trả/log lỗi rõ, business transaction đã commit không bị âm thầm rollback.
- Database down: readiness 503, dừng mutation; khôi phục DB rồi chạy smoke/invariant query.
- Suspected secret leak: rotate credential/key ngay; refresh/session revoke; encryption key rotation cần giữ old version để decrypt dữ liệu cũ.

## 9. Demo reset

Demo rehearsal dùng database riêng `rephone_demo`, seed idempotent và scenario script. Không reset database đang dùng cho đánh giá nếu chưa backup. Credential demo được truyền bằng environment và đổi sau buổi demo nếu domain public.

`pnpm smoke:slice10` mặc định chỉ kiểm tra API readiness và các invariant Refund, không tạo dữ liệu. Full mode tạo hai pickup Order terminal, tiêu thụ hai phụ kiện và giữ lịch sử Payment/Refund; chỉ chạy sau backup và xác nhận đúng target:

```powershell
$env:SLICE10_SMOKE_MODE='smoke'
$env:SLICE10_SMOKE_CONFIRM='consume-two-accessories-and-create-refunds'
pnpm smoke:slice10
```

Không dùng SQL để đổi business state hoặc xóa lịch sử sau smoke. Nếu script báo còn Refund `PROCESSING` từ lần chạy trước, resolve nó qua backoffice API/UI rồi mới chạy lại.

## Liên kết

- [Configuration](../architecture/configuration.md)
- [Observability](../architecture/observability.md)
- [Database implementation](../architecture/database-implementation.md)
- [Seed/demo scenarios](../planning/seed-and-demo-scenarios.md)
