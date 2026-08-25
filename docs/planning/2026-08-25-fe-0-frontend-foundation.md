# FE-0 — Frontend foundation implementation record

> Trạng thái: **DONE**
> Branch: `feat/fe-0-design-foundation`  
> Baseline frontend SHA: `801ad26`  
> Start SHA: `65605f1`  
> Completion code SHA: `c4d2b3c`
> Ngày bắt đầu: `2026-08-25`  
> Ngày hoàn thành: `2026-08-25`
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

| WP | Nội dung | Commit kế hoạch | Kết quả |
|---|---|---|---|
| 0 | Ghi record và đánh dấu FE-0 đang triển khai | `docs(fe): start frontend foundation workstream` | `9b7f72f` |
| 1 | 160-operation/55-route manifest và coverage assertions | `test(web): enforce frontend coverage contract` | `ffe4b84` |
| 2 | Design tokens, base styles và primitives | `feat(web): add frontend design foundations` | `5a6e302` |
| 3 | Storefront/auth/customer/backoffice shell foundations | `feat(web): add frontend surface shells` | `ea6de09` |
| 4 | Root integration, accessibility/browser/visual regression | `test(web): verify frontend foundation` | `e0cd7ca`, `881bd98`, `c4d2b3c` |
| 5 | Evidence, rollback note và chuyển FE-1 thành next step | `docs(fe): mark frontend foundation complete` | Commit chứa bản closeout này |

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

## 7. Evidence bàn giao

### 7.1. Commit theo concern

| Concern | Commit |
|---|---|
| Khởi tạo implementation record | `9b7f72f` — `docs(fe): start frontend foundation workstream` |
| Executable operation/route coverage | `ffe4b84` — `test(web): enforce frontend coverage contract` |
| Token, base style và primitives | `5a6e302` — `feat(web): add frontend design foundations` |
| Bốn reusable surface shell | `ea6de09` — `feat(web): add frontend surface shells` |
| Accessibility contract hardening | `e0cd7ca` — `fix(web): harden frontend accessibility contracts` |
| Root integration và FE-0 test suite | `881bd98` — `test(web): verify frontend foundation` |
| Strict-lint blocker của baseline API test | `9542623` — `test(api): satisfy strict inventory lint` |
| Visual fixture độc lập business flow | `c4d2b3c` — `test(web): isolate visual baseline fixture` |

`9542623` chỉ sửa cách viết assertion của test Inventory hiện hữu để toàn bộ strict lint chạy được; không đổi production code hoặc nghiệp vụ.

### 7.2. Coverage và quality gates

| Bằng chứng | Kết quả |
|---|---:|
| OpenAPI ↔ executable manifest ↔ `plan-fe.md` | `160/160` exact `{ operationId, method, path }`, không trùng |
| Route filesystem ↔ ownership manifest ↔ `plan-fe.md` | `37/37` route hiện hữu + `18/18` route planned |
| Shared accessibility contract | `14/14` assertions xanh |
| Web unit/component | `69` test xanh |
| API unit | `600` test xanh |
| Database integration | `54` test xanh |
| API E2E | `93` test xanh |
| `pnpm verify` | Xanh lại trên final closeout tree sau `c4d2b3c`; gồm format, lint, typecheck, unit, integration, E2E, OpenAPI/client và production build |
| `pnpm test:browser` | `3/3` xanh sau `c4d2b3c`: critical commerce, exact-unit visual và keyboard/focus smoke |

Visual baseline đã review:

- [Exact-unit desktop 1440×900](../../tests/browser/frontend-foundation.spec.ts-snapshots/fe0-exact-unit-desktop-1440-chromium-win32.png)
- [Exact-unit mobile 390×844](../../tests/browser/frontend-foundation.spec.ts-snapshots/fe0-exact-unit-mobile-390-chromium-win32.png)

### 7.3. Giới hạn đã biết

- Bốn shell là reusable foundation, chưa thay shell của 37 route; migrate route-by-route bắt đầu từ FE-1/FE-2.
- Mobile navigation mới khóa slot/landmark contract; focus-managed drawer hoàn chỉnh thuộc phase sử dụng đầu tiên.
- Visual snapshot mask vùng media tải từ Supabase để baseline không phụ thuộc network/object lifecycle; browser commerce regression vẫn dùng dữ liệu thật.
- Legacy `globals.css` và `CatalogHeader` được giữ nguyên làm fallback; chưa xóa selector nào.
- Cả 160 business operation tiếp tục mang trạng thái `NOT STARTED`; FE-0 chỉ chứng minh owner, phase và automated-test contract.
- FE-1 phải đổi status đồng thời ở executable manifest, coverage assertion và `plan-fe.md`; test FE-0 đang cố ý khóa toàn bộ status ở `NOT STARTED`.
- Nhãn `browser:*` trong ledger mới là owner dự kiến; mỗi phase phải tạo/chứng minh suite thật trước khi đổi operation sang `DONE`.
- `apps/web/next-env.d.ts` là thay đổi có sẵn của người dùng và không nằm trong bất kỳ commit FE-0 nào.

## 8. Rollback rehearsal và bước kế tiếp

- Rehearsal đã chạy trong detached worktree tạm tại `c4d2b3c`: sáu revert `--no-commit` theo thứ tự `c4d2b3c` → `881bd98` → `e0cd7ca` → `ea6de09` → `5a6e302` → `ffe4b84` đều áp dụng không conflict.
- Sau rehearsal, `git diff --check` xanh, root layout khớp baseline `801ad26`, route count vẫn là `37`, và không còn target foundation `styles/tokens.css`, `components/ui`, `components/shells`.
- Worktree tạm đã được xóa thành công; rehearsal không tác động working tree chính hoặc dữ liệu.
- Root providers, cookie, CSRF, guest token, signed URL, route công khai và authoritative business flow không đổi.
- Không có migration hoặc database rollback.
- Checkpoint C0 đã đạt. Bước kế tiếp là FE-1; trạng thái hiện tại của FE-1 vẫn là `NOT STARTED` cho đến khi có implementation record riêng.
