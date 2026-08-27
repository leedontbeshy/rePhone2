# FE-1 — Storefront discovery & inspection dossier implementation record

> Trạng thái: **DONE**<br>
> Branch: `feat/fe-1-storefront-discovery`  
> Main baseline SHA: `83c004b`  
> Frontend foundation SHA: `0b0fc52`  
> Ngày bắt đầu: `2026-08-25`  
> Design authority: [design.md](../../design.md)  
> Delivery plan: [plan-fe.md](../../plan-fe.md)

## 1. Understanding lock

Yêu cầu triển khai và hai tài liệu `APPROVED` đã xác nhận:

- FE-1 chỉ sở hữu `/`, `/store`, `/products`, `/products/[slug]`, `/products/[slug]/units/[inventoryCode]` và `/vouchers`.
- Năm operation thuộc phase là `listProducts`, `getProductBySlug`, `getUsedIphoneByInventoryCode`, `getPublicStore` và `listPublicVouchers`.
- Model giúp khám phá; exact unit giúp quyết định; inspection giúp tạo niềm tin.
- Exact-unit desktop/mobile là canonical reference cho storefront về hierarchy, media, metrics, purchase rail và dossier.
- Backend tiếp tục là authority cho public visibility, price, availability, voucher visibility và projection an toàn.
- Không đổi public URL, cookie, CSRF, token transport, API behavior, database hoặc state machine.
- Không dùng claim thiếu authority như VAT, số chi nhánh, đổi trả bảy ngày, ETA, miễn phí giao hàng hoặc “36 bước”.

Không còn open question làm thay đổi scope. Yêu cầu “triển khai tiếp FE-1” là xác nhận bắt đầu implementation theo thiết kế đã duyệt.

## 2. Assumptions và non-functional requirements

- Quy mô giữ 20–50 người dùng đồng thời; list có pagination và không gọi N+1 unit detail.
- Catalog, model, exact unit và store là Server Component với `cache: 'no-store'`; client island chỉ dùng cho session/cart, mobile menu/filter, gallery và mutation hiện hữu.
- Voucher giữ auth-aware client flow vì access token nằm trong memory; Bearer sai không fallback anonymous.
- Một public STORE được backend chọn; UI chỉ render `PublicStoreDto`, không suy diễn location nội bộ.
- Money dùng integer string/BigInt formatter; không floating point.
- WCAG 2.2 AA, keyboard-only, touch target 44 px, viewport 320–1440 px và zoom 200% là acceptance bắt buộc.
- Mục tiêu representative mobile: LCP ≤2,5 giây, CLS ≤0,1, INP ≤200 ms; media/network provider không được làm layout shift.
- Seed iPhone 14 Pro và `IP14P-128-001` là fixture đọc ổn định; không dùng unit iPhone 13 bị critical commerce flow bán.
- `apps/web/next-env.d.ts` là thay đổi có sẵn của người dùng và không được stage.

## 3. Phương án và quyết định

| Phương án | Đánh giá | Quyết định |
|---|---|---|
| Route group riêng cho đúng surface FE-1, giữ route khác trên legacy shell | Shared shell sạch, URL giữ nguyên, blast radius giới hạn sáu route | **Chọn** |
| Bọc `StorefrontShell` lặp lại trong từng page | Rollback từng file đơn giản nhưng dễ drift header/footer/error boundary | Không chọn |
| Chuyển toàn storefront sang Client Component | Dễ dùng auth/path state nhưng tăng JS và làm yếu SSR | Loại |
| Rewrite `globals.css`/`CatalogHeader` toàn hệ thống | Nhanh về hình thức nhưng ảnh hưởng hơn 30 route chưa thuộc phase | Loại |

### Decision log

1. Chỉ move surface FE-1 vào `app/(storefront)`; `CatalogHeader` tiếp tục là compatibility fallback cho route chưa migrate.
2. `StorefrontShell` là server shell; session/cart badge, mobile navigation, mobile filter, media gallery và voucher account upgrade là client island.
3. Component nhận generated DTO hoặc type alias từ adapter; không tạo response model song song.
4. Giữ native media wrapper với width/height, lazy/eager và fallback; chưa chuyển `next/image` khi remote policy chưa được khóa.
5. Grade chỉ mô tả ngoại hình; inspection mô tả chức năng. `NONE_KNOWN` dịch là “Không ghi nhận lịch sử sửa chữa”.
6. Không thêm icon library chỉ để trang trí FE-1; dùng text label rõ, không emoji hoặc SVG tự dựng.
7. Sửa Swagger meta voucher bằng DTO wrapper đúng `meta.pagination`; đây là contract-artifact fix, không đổi runtime nghiệp vụ.
8. Browser test intercept demo Supabase media bằng asset local; test fallback riêng vẫn abort provider URL.

## 4. Component và data boundary

```text
app/(storefront)/layout
  → StorefrontFrame (server)
      → StorefrontShell
      → HeaderSessionActions (client)
      → MobileNavigation (client)
  → route Server Component
      → lib public adapter (generated client, no-store)
      → catalog/store component nhận typed projection
      → client island khi cần interaction
```

Component groups:

- `components/storefront`: frame, search, session actions, mobile navigation, footer, breadcrumb, page state.
- `components/catalog`: media frame/gallery, product card, exact-unit card, filter, pagination, metrics, fulfillment, inspection dossier và disclosure.
- `components/vouchers`: discovery card/list state.
- Route CSS Module chỉ quyết định composition; token/primitive tiếp tục từ FE-0.

## 5. Work packages và commit strategy

| WP | Nội dung | Commit |
|---|---|---|
| 0 | Implementation record, phase status và executable coverage lifecycle | `docs(fe): start storefront discovery phase` |
| 1 | Sửa voucher `meta.pagination`, OpenAPI assertion và generated client | `fix(api): align voucher pagination contract` |
| 2 | Route-group shell, header actions, mobile navigation, media/CTA primitives | `feat(web): add storefront application shell` |
| 3 | Canonical exact-unit dossier desktop/mobile | `feat(web): redesign exact unit dossier` |
| 4 | Model detail và catalog/filter/pagination | `feat(web): redesign catalog discovery` |
| 5 | Home và public `/store` | `feat(web): expose storefront and pickup context` |
| 6 | Voucher discovery pagination và account visibility | `feat(web): redesign voucher discovery` |
| 7 | Unit/component/SSR/a11y/browser/visual/performance coverage | `test(web): cover storefront discovery` |
| 8 | Full gates, rollback rehearsal, evidence và chuyển FE-2 thành next step | `docs(fe): mark storefront discovery complete` |

Mỗi commit chỉ stage concern liên quan và được push riêng lên `origin`.

## 6. Test matrix

- Unit/component: query normalization, phase/route coverage, media fallback, gallery selection, checklist grouping, money/status copy và voucher pagination.
- SSR: JavaScript tắt vẫn đọc được catalog, model, exact unit và store.
- Security projection: không cost, raw identifier, location ID, bank/QR, settings version, storage path, internal actor hoặc mockup-only claim.
- Browser guest: home → catalog → filter URL/back-forward → model → exact unit → `/store` → vouchers.
- Browser customer: đăng nhập và thấy `ACCOUNT_ONLY`; guest không thấy.
- Accessibility: skip link, landmark/heading, dialog Escape/focus return, gallery controls, 44 px target, axe không có serious/critical finding.
- Responsive/visual: 320, 390, 768, 1024 và 1440 px; home/catalog/exact-unit hero + dossier desktop/mobile.
- Media: local deterministic response cho visual; provider abort vẫn giữ identity, price và CTA.
- Regression: critical commerce flow và 37 route cũ không đổi behavior ngoài surface FE-1.

## 7. Rollback

- Revert theo thứ tự voucher UI → home/store → catalog/model → dossier → shell → contract fix.
- Giữ legacy `CatalogHeader` và global selectors làm compatibility fallback đến checkpoint FE-9.
- Không rollback dữ liệu, Order, inventory hoặc voucher lifecycle.
- OpenAPI wrapper fix tương thích runtime hiện hành và có thể giữ lại nếu rollback UI.

## 8. Nguồn contract

- [Public catalog endpoints](../api/public-catalog-endpoints.md)
- [Voucher endpoints](../api/voucher-endpoints.md)
- [Employee, settings và audit endpoints](../api/employee-settings-audit-endpoints.md)
- [Checklist kiểm định iPhone](../architecture/iphone-inspection-checklist.md)
- [Authentication và security](../architecture/authentication-and-security.md)
- [Testing strategy](../quality/testing-strategy.md)
- [Seed và demo scenarios](seed-and-demo-scenarios.md)

## 9. Nghiệm thu và evidence

- Sáu public surface đã được migrate theo route group riêng: `/`, `/products`, model detail, exact-unit detail, `/store` và `/vouchers`; URL công khai không đổi.
- Năm operation của FE-1 đã chuyển `DONE` đồng thời trong executable coverage manifest và ledger `plan-fe.md`.
- Exact-unit dossier hiển thị ảnh thật, mã máy, giá hiện hành, Grade, pin, bảo hành, fulfillment, dữ liệu sửa chữa, identifier masked và đúng 18 hạng mục inspection; không render cost, raw identifier hoặc claim ngoài contract.
- Voucher giữ đúng public/account visibility; public store chỉ dùng projection an toàn; public routes vẫn đọc được khi tắt JavaScript.
- Evidence code: `05f32f2..aae6f12`; canonical code SHA `aae6f12`.
- Test evidence: Web unit `79/79`; FE-1 Playwright `8/8`; toàn bộ browser regression `11/11`; axe không có finding serious/critical trên sáu route và không overflow ở 320 px.
- Visual evidence: desktop 1440 và mobile 390 tại `tests/browser/storefront-discovery.spec.ts-snapshots/`; FE-0 baseline đã migrate có chủ đích sang surface mới.
- Release gate: `pnpm verify:release` xanh trên closeout tree.

Rollback rehearsal được xác nhận ở mức commit boundary: các concern shell, catalog/dossier, voucher, test và contract fix có thể revert độc lập; không có database migration hoặc business state cần rollback. FE-2 là bước kế tiếp nhưng vẫn `NOT STARTED`.
