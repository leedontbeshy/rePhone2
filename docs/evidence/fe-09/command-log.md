# FE-09 — Command log

## Môi trường

| Thuộc tính | Giá trị |
| --- | --- |
| Ngày chạy | 2026-09-01 |
| Branch | `feat/fe-9-release-hardening` |
| Product baseline | `3e79db7` |
| Baseline run SHA | `1b6f4b245d04916e2dc3febfb9b407ca45ad2e23` |
| Package manager | pnpm `10.18.3` |
| Node target | `>=24.18.0 <25` |

## Baseline run tại `1b6f4b2`

| Command | Exit | Kết quả |
| --- | ---: | --- |
| `pnpm format:check` | 1 | `design-qa.md` chưa đúng Prettier |
| `pnpm lint` | 134 | Node hết heap khi ESLint quét cả raw artifact trong `.local/` |
| `pnpm typecheck` | 0 | 4/4 Turbo tasks xanh |
| `pnpm test` — lần đầu chạy song song với gate khác | 1 | API `679/680`; asset integrity test chạm timeout 15 giây |
| `pnpm test` — chạy lại độc lập | 0 | API client `7/7`; API `680/680`; web `567/567`; tổng `1.254/1.254` |
| `pnpm fe:coverage` | 0 | 4/4 |
| `pnpm fe:a11y` | 0 | 15/15 |
| `pnpm build` | 0 | 4/4 Turbo tasks; production Next build thành công |
| `pnpm exec playwright test --list` | 0 | 46 test trong 9 file |

Lần chạy API độc lập hoàn thành asset integrity test trong `12.863 s`, gần timeout
`15 s`. Đây vẫn là rủi ro flake cần theo dõi; lần lỗi đầu không bị xóa khỏi log.

## Build-size snapshot tại `1b6f4b2`

| Chỉ số | Giá trị |
| --- | ---: |
| `.next/static/chunks/**/*.js` | 2.950.360 byte |
| Số JavaScript chunk | 82 |
| Toàn bộ `.next` local | 4.974.382.324 byte |

Kích thước toàn bộ `.next` gồm cache và artifact local nên không được dùng làm
release payload budget. WP-12 phải tạo route-level production measurement trước
khi kết luận bundle tăng hoặc giảm.

## Baseline remediation tree `14f30fa`

| Command | Exit | Kết quả |
| --- | ---: | --- |
| `pnpm exec prettier --check package.json design-qa.md` | 0 | PASS |
| `pnpm lint` | 0 | PASS sau khi loại `.local/` và khai báo global Node script |
| `pnpm format:check` | 0 | PASS |
| `pnpm typecheck` | 0 | 4/4 Turbo tasks |

## Artifact policy

Output đầy đủ không được commit. CI sau WP-01 phải lưu sanitized summary khi
thành công và trace/screenshot/video chi tiết khi thất bại, với retention policy
rõ ràng.
