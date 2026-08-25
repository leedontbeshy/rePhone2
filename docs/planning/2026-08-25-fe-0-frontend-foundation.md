# FE-0 — Frontend foundation implementation record

> Trạng thái: **IN PROGRESS**  
> Branch: `feat/fe-0-design-foundation`  
> Baseline frontend SHA: `801ad26`  
> Start SHA: `65605f1`  
> Ngày bắt đầu: `2026-08-25`  
> Design authority: [design.md](../../design.md)  
> Delivery plan: [plan-fe.md](../../plan-fe.md)

## 1. Mục tiêu

FE-0 tạo foundation có thể kiểm chứng cho chương trình frontend Post-P0/P1 mà không thay đổi public URL hoặc business behavior:

- Chụp và khóa baseline route, role, state và visual ở desktop/mobile.
- Tạo executable design tokens, base styles và primitive components.
- Tạo shell foundations riêng cho storefront, auth, customer và backoffice.
- Biến ledger 160 OpenAPI operation và 55 route ownership thành contract máy kiểm tra được.
- Giữ P0 critical browser flow xanh trong suốt migration.

## 2. Baseline đã xác minh

| Hạng mục | Baseline |
|---|---|
| OpenAPI | 160 operation, 160 `operationId` duy nhất |
| Next routes | 37 `page.tsx` hiện hữu |
| Planned routes | 18 URL đã duyệt trong `plan-fe.md` |
| Root providers | `AuthProvider → CommerceProvider` |
| Global styles | `apps/web/app/globals.css`, 2.773 dòng |
| Shared legacy navigation | `CatalogHeader` đang được nhúng thủ công ở nhiều surface |
| Browser regression | `tests/browser/critical-commerce-flow.spec.ts` |
| User-owned worktree change | `apps/web/next-env.d.ts`; tuyệt đối không stage hoặc sửa |

## 3. Quyết định triển khai

1. Token và base styles nằm ở `apps/web/styles`, chạy song song với legacy CSS.
2. Primitive có API nhỏ, semantic HTML và CSS Module; không thêm UI framework hoặc icon library trong FE-0.
3. Shell được tạo như reusable foundation nhưng chưa move route group hàng loạt trong FE-0.
4. Root layout chỉ được import foundation CSS theo thứ tự token → base → legacy; providers giữ nguyên.
5. Operation coverage dùng manifest version-controlled và test exact-set với OpenAPI hiện hành.
6. Route coverage test scan filesystem và so exact-set với 37 route hiện hữu; 18 route mới chỉ là `PLANNED`.
7. Mọi operation bắt đầu `NOT STARTED`; có owner không đồng nghĩa đã có UI.
8. Visual baseline dùng representative storefront ở `1440×900` và `390×844`; screenshot không thay browser regression.

## 4. Work packages và commit strategy

| WP | Nội dung | Commit dự kiến |
|---|---|---|
| 0 | Ghi record và đánh dấu FE-0 đang triển khai | `docs(fe): start frontend foundation workstream` |
| 1 | 160-operation/55-route manifest và coverage assertions | `test(web): enforce frontend coverage contract` |
| 2 | Design tokens, base styles và primitives | `feat(web): add frontend design foundations` |
| 3 | Storefront/auth/customer/backoffice shell foundations | `feat(web): add frontend surface shells` |
| 4 | Root integration, accessibility/browser/visual regression | `test(web): verify frontend foundation` |
| 5 | Evidence, rollback note và chuyển FE-1 thành next step | `docs(fe): mark frontend foundation complete` |

Mỗi commit chỉ stage file thuộc concern. Không stage `apps/web/next-env.d.ts`.

## 5. Acceptance và test

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm fe:coverage`
- `pnpm build`
- `pnpm verify`
- `pnpm test:browser`
- Visual baseline desktop/mobile được review.
- Keyboard smoke xác nhận skip link, landmark và focus-visible foundation.
- OpenAPI exact set bằng operation manifest; route filesystem exact set bằng route manifest.

## 6. Rollback

- Revert từng concern theo thứ tự shell → primitive/style → coverage.
- Giữ `AuthProvider`, `CommerceProvider`, cookie, CSRF, token và public route nguyên trạng.
- Không xóa `globals.css` hoặc `CatalogHeader` trong FE-0.
- Không có migration/database rollback.

## 7. Evidence

Sẽ ghi khi hoàn thành:

- Commit SHA từng work package.
- Kết quả gate và browser run.
- Visual baseline desktop/mobile.
- Route/operation coverage count.
- Known limitation hoặc documentation debt còn lại.
