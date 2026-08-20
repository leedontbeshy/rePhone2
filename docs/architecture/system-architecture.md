# Kiến trúc tổng thể

## 1. Kiểu kiến trúc

rePhone là modular monolith trong Turborepo. Hệ thống có một frontend Next.js, một REST API NestJS và một PostgreSQL database. Ranh giới module được tổ chức theo capability nghiệp vụ; không tách microservice trong MVP.

```text
Browser
  |
  +-- Next.js Web
  |     +-- Storefront
  |     +-- Customer portal
  |     +-- Staff/Admin back office (chi tiết UI tạm hoãn)
  |
  +-- /api/v1 -> NestJS API
                    +-- Prisma -> PostgreSQL
                    +-- Supabase Storage
                    +-- SMTP / Mailpit
                    +-- Scheduled jobs
```

## 2. Cấu trúc monorepo mục tiêu

```text
apps/
  web/                    Next.js application
  api/                    NestJS application và Prisma schema
packages/
  api-client/             Typed client sinh từ OpenAPI
  eslint-config/          Cấu hình lint dùng chung
  typescript-config/      Cấu hình TypeScript dùng chung
  test-config/            Cấu hình test dùng chung
docs/                     Yêu cầu, kiến trúc, ADR và kế hoạch
infra/                    Docker/build assets khi cần
```

`packages/ui` chỉ được tạo khi bắt đầu UI và có component thực sự cần chia sẻ; P0 backend không tạo package rỗng.

Prisma schema thuộc `apps/api`; frontend không import Prisma types hoặc truy cập database trực tiếp. Contract chia sẻ với frontend được sinh từ OpenAPI để tránh tạo một package DTO làm rò rỉ cấu trúc nội bộ.

## 3. Ranh giới tin cậy

- Browser không được tin cậy về giá, quyền, trạng thái, tồn kho hoặc tổng tiền.
- Next.js không chứa database credential, Supabase service key, SMTP credential hoặc encryption secret.
- NestJS thực hiện authentication, authorization, validation và toàn bộ business rule.
- PostgreSQL là nguồn sự thật cho catalog, inventory, order, payment và warranty metadata.
- Supabase Storage là nguồn object; database chỉ lưu bucket/object path và metadata.

## 4. Luồng request

1. Request nhận/gắn request ID.
2. Authentication giải mã session/token nếu endpoint cần danh tính.
3. Guard kiểm tra role/ownership/policy.
4. DTO được transform và validate.
5. Application service thực thi use case và transaction khi cần.
6. Serializer tạo response DTO; field nội bộ không được trả về ngoài ý muốn.
7. Exception filter chuyển lỗi sang error envelope thống nhất.
8. Structured log ghi request ID, actor và kết quả, không ghi secret/token/raw evidence.

## 5. Quy tắc tích hợp

- REST API version theo prefix `/api/v1`.
- API contract xuất OpenAPI; frontend dùng generated client.
- Storage và email được bọc qua provider interface.
- Không gọi provider ngoài khi transaction database đang mở nếu có thể tránh.
- Scheduled jobs xử lý hết hạn reservation và tác vụ định kỳ; handler phải idempotent.
- SePay và carrier API là adapter tương lai, không ảnh hưởng domain hiện tại.

## 6. Triển khai local

- Luồng phát triển mặc định chạy web/API trên host để hot reload; Docker Compose chạy PostgreSQL và Mailpit.
- Compose profile `demo` có thể build/chạy cả web và API trong container.
- Supabase Storage là dịch vụ ngoài và cần internet.
- Environment variables được validate khi API khởi động.
- Database migration chạy như một bước triển khai có kiểm soát; không tự đồng bộ schema phá hủy dữ liệu.

## 7. Tài liệu liên quan

- [ADR-0002](../decisions/0002-turborepo-modular-monolith.md)
- [ADR-0003](../decisions/0003-nextjs-nestjs-rest-openapi.md)
- [ADR-0004](../decisions/0004-postgresql-prisma-and-local-docker.md)
- [Ranh giới module backend](backend-modules.md)
- [Toolchain và monorepo](../development/toolchain-and-monorepo.md)
- [Local development và deployment](../operations/local-development-and-deployment.md)
