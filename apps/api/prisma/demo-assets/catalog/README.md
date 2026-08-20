# Catalog demo assets

Các file PNG trong thư mục này là ảnh demo được tạo bằng công cụ OpenAI Image Generation cho
Slice 03. Ảnh không chứa logo, text hoặc watermark và chỉ phục vụ seed/demo catalog.

- Kích thước: `1254 × 1254`.
- MIME: `image/png`.
- Object đích: prefix `demo/catalog/` trong bucket `SUPABASE_PUBLIC_BUCKET`.
- Upload idempotent: `pnpm storage:seed:catalog`.

Không đổi tên hoặc tối ưu file mà chưa cập nhật `prisma/demo-catalog-assets.ts`; manifest khóa
file size để phát hiện asset bị thay ngoài ý muốn.
