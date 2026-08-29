# Toolchain và cấu trúc monorepo

Tài liệu này là baseline triển khai tại ngày 2026-08-18. Khi scaffold, dùng đúng major/minor đã nêu và commit `pnpm-lock.yaml`; không tự nâng major trong tháng làm đồ án.

## 1. Phiên bản chuẩn

| Thành phần | Baseline | Quy tắc |
|---|---|---|
| Node.js | `24.18.0` LTS | Khóa bằng `.nvmrc` và `engines.node: ">=24.18.0 <25"` |
| pnpm | `10.18.3` | Khóa bằng `packageManager: "pnpm@10.18.3"`; chạy qua Corepack |
| Turborepo | `2.10.10` | Pin exact trong root devDependencies |
| TypeScript | `5.9.3` | Strict mode; chưa nâng TypeScript 7 trong P0 |
| Next.js | `16.2.11` Active LTS | App Router, React 19; không dùng bản preview |
| React / React DOM | `19.2.8` | Pin cùng version; tương thích peer range của Next baseline |
| NestJS | `11.2.1` | REST trên Express adapter |
| Prisma ORM | `7.9.1` | ESM, `prisma-client`, `@prisma/adapter-pg` và `pg` |
| PostgreSQL | `17.6` test / Supabase 17 | Test image `postgres:17.6-alpine`; database UTF-8, timezone UTC |
| Vitest | `4.1.10` | Unit/integration/API e2e |
| Playwright | `1.62.1` | Chỉ thêm khi bắt đầu browser smoke test |

Version exact của dependency ứng dụng nằm trong lockfile. `^` có thể dùng trong `package.json`, nhưng CI và demo luôn cài bằng `pnpm install --frozen-lockfile`.

## 2. Cấu trúc repository mục tiêu

```text
rePhone/
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── migrations/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   ├── src/
│   │   │   ├── common/
│   │   │   ├── config/
│   │   │   ├── generated/prisma/
│   │   │   ├── modules/
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   ├── test/
│   │   │   ├── integration/
│   │   │   └── e2e/
│   │   └── prisma.config.ts
│   └── web/
│       ├── app/
│       ├── components/
│       ├── features/
│       ├── lib/
│       └── public/
├── packages/
│   ├── api-client/
│   ├── eslint-config/
│   ├── typescript-config/
│   └── test-config/
├── docs/
├── infra/
│   └── docker/
├── .env.example
├── compose.yaml
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.json
```

`packages/ui` chỉ tạo khi bước UI bắt đầu và thực sự có component dùng chung; không tạo package rỗng. Prisma schema và generated client thuộc `apps/api`. `apps/web` chỉ dùng contract từ `packages/api-client`, không import DTO nội bộ hoặc Prisma type.

## 3. Workspace và scripts

`pnpm-workspace.yaml` bao phủ `apps/*` và `packages/*`. Root scripts tối thiểu:

| Script | Ý nghĩa |
|---|---|
| `pnpm dev` | Chạy web/API qua Turbo; PostgreSQL và Mailpit đã chạy bằng Compose |
| `pnpm build` | Build toàn workspace theo dependency graph |
| `pnpm lint` | ESLint toàn repo, warning bị xem là lỗi trong CI |
| `pnpm format:check` | Kiểm tra Prettier, không tự sửa trong CI |
| `pnpm typecheck` | TypeScript no-emit |
| `pnpm test` | Unit test |
| `pnpm test:integration` | Test với PostgreSQL test database |
| `pnpm test:e2e` | API e2e; browser e2e bổ sung sau |
| `pnpm api:openapi` | Sinh `openapi.json` từ Nest application context |
| `pnpm api:client` | Sinh types/client từ OpenAPI |
| `pnpm db:migrate` | `prisma migrate dev` trong `apps/api` |
| `pnpm db:deploy` | `prisma migrate deploy` |
| `pnpm db:seed` | Seed idempotent |
| `pnpm db:studio` | Prisma Studio cho local |
| `pnpm verify` | lint + format check + typecheck + unit + integration + API e2e + build |

Turbo cache `build`, `lint`, `typecheck`, `test`; `dev` là persistent và không cache. Schema/OpenAPI/generated client phải là input/output rõ trong `turbo.json` để thay đổi contract buộc build lại consumer.

## 4. Dependency baseline

### API

- Nest core/platform/config/swagger/throttler, `class-validator`, `class-transformer`, `helmet`.
- Prisma 7 với generator `prisma-client`, output `src/generated/prisma`; runtime dùng `@prisma/adapter-pg` và `pg`.
- `argon2` cho password, `@nestjs/jwt` cho access token.
- `nestjs-pino`/`pino` cho structured logging.
- `@nestjs/schedule` cho job P0; không có Redis/queue.
- `@supabase/supabase-js` sau một storage adapter server-side.
- `nodemailer` sau một mail adapter; Mailpit cho local.
- `file-type` kiểm tra magic bytes; không tin MIME từ browser.
- `zod` chỉ dùng để validate environment/config và JSONB schema; request DTO dùng `class-validator` để Swagger đơn giản.
- ID khai báo Prisma `String @id @default(uuid(7)) @db.Uuid`; Prisma sinh UUIDv7 nên schema chạy được cả local PostgreSQL và Supabase version tương thích, không tự ghép ID trong business code.

### Web và contract

- Next.js App Router và React; server/client component được chọn theo nhu cầu UI.
- `openapi-typescript` sinh type và `openapi-fetch` làm HTTP client mỏng.
- Không gọi API bằng `fetch` rải rác; mọi request qua một client cấu hình base URL, auth refresh và error mapping.
- Không dùng Redux trong P0. State server dùng query abstraction tại feature; form state giữ cục bộ. Chỉ thêm thư viện khi luồng UI được thiết kế.

### Tooling

- ESLint flat config, Prettier, Vitest và Supertest.
- `tsx` chạy seed/tool script TypeScript.
- Không cài Husky/lint-staged trong P0; `pnpm verify` và CI là gate đủ dùng cho một người.

## 5. ESM và TypeScript

- Root và `apps/api` đặt `"type": "module"` vì Prisma 7 là ESM.
- API target `ES2023`, `module/moduleResolution = NodeNext`, bật `experimentalDecorators` + `emitDecoratorMetadata`; relative source import dùng `.js` specifier để output chạy đúng Node ESM.
- Web dùng Next defaults với `module = ESNext`, `moduleResolution = Bundler`, `noEmit=true`.
- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` bật cho code mới.
- Không dùng `any`; boundary không tin cậy bắt đầu là `unknown` rồi validate.
- Alias chỉ dùng trong ranh giới package/app; không import xuyên `src` của workspace khác.
- Không bật experimental decorator ngoài những gì NestJS cần.

## 6. Quy tắc module API

Mỗi capability trong `apps/api/src/modules/<module>` có cấu trúc vừa đủ:

```text
<module>/
├── application/        use case, command/query DTO nội bộ
├── domain/             policy, state transition, value logic
├── infrastructure/     Prisma repository/provider adapter
├── presentation/       controller, HTTP DTO, serializer
└── <module>.module.ts
```

Không bắt buộc tạo đủ bốn thư mục nếu module nhỏ; tránh file rỗng và abstraction một implementation không đem lại testability. Controller không truy cập Prisma trực tiếp. Transaction orchestration nằm ở application use case, domain không biết Nest/HTTP/Prisma.

## 7. Trình tự scaffold

1. Tạo root workspace, scripts, lint/TypeScript/test config và Compose infra.
2. Scaffold Nest app, config validation, logging, health và Prisma kết nối PostgreSQL.
3. Viết schema/migration + seed, sau đó test constraint thật.
4. Scaffold Next app và typed API client từ OpenAPI tối thiểu.
5. Triển khai theo vertical slice trong [lộ trình](../planning/implementation-roadmap.md), không tạo hàng loạt controller rỗng.

## 8. Tiêu chí thay đổi baseline

Nâng patch/minor chỉ khi `pnpm verify` và migration test qua. Nâng Node, Next, Nest, Prisma, TypeScript hoặc PostgreSQL major là thay đổi kiến trúc vận hành: phải cập nhật file này, lockfile, image, CI và ghi rõ lý do trong pull request/commit; trong tháng đồ án nên hoãn nếu không giải quyết lỗi bắt buộc.

## Liên kết

- [Kiến trúc tổng thể](../architecture/system-architecture.md)
- [Database implementation](../architecture/database-implementation.md)
- [OpenAPI và typed client](../api/openapi-and-client.md)
- [Local development và deployment](../operations/local-development-and-deployment.md)

## Tham khảo phiên bản chính thức

- [Node.js release status](https://nodejs.org/en/about/previous-releases)
- [Next.js releases/security](https://nextjs.org/blog)
- [NestJS 11 migration guide](https://docs.nestjs.com/migration-guide)
- [Prisma ORM 7 upgrade guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)
- [Prisma system requirements](https://docs.prisma.io/docs/orm/reference/system-requirements)
- [PostgreSQL 17 release notes](https://www.postgresql.org/docs/17/release.html)
- [pnpm installation/Corepack](https://pnpm.io/installation)
- [Turborepo installation](https://turborepo.com/docs/getting-started/installation)
