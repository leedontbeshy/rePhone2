# Thiết kế CI hai tầng

## Mục tiêu

Giảm thời gian phản hồi cho mỗi lần cập nhật pull request nhưng vẫn giữ nguyên bộ kiểm tra phát hành đầy đủ của FE09. CI nhanh phục vụ vòng lặp phát triển; CI đầy đủ phục vụ lần chốt trước khi merge và xác minh lại `main`.

## Quyết định

- `pr-checks.yml` chạy trên mọi pull request, tự hủy lượt cũ khi có commit mới.
- Kiểm tra định dạng, lint, kiểu dữ liệu, unit test, contract, OpenAPI drift và build chỉ chạy trên Ubuntu.
- Database integration và API E2E chỉ chạy khi thay đổi API, schema, migration hoặc package dùng chung liên quan.
- Chromium smoke chỉ chạy khi thay đổi web, API, browser test hoặc package runtime liên quan.
- Pull request chỉ thay đổi tài liệu không khởi động PostgreSQL hoặc trình duyệt.
- `release-verification.yml` giữ bộ kiểm tra đầy đủ trên Ubuntu/Windows, coverage, 93 browser scenarios, Firefox/WebKit và performance.
- Bộ đầy đủ tự chạy sau khi merge vào `main`, chạy thủ công, hoặc chạy trên pull request được gắn nhãn `full-ci`.

## Giả định vận hành

- Dự án hiện do nhóm nhỏ vận hành và chưa bật branch protection bắt buộc.
- Trước khi merge thay đổi lớn, người duyệt gắn nhãn `full-ci` và chỉ merge khi bộ đầy đủ xanh tại commit hiện tại.
- Không giảm ngưỡng coverage, performance, accessibility hoặc bảo mật; chỉ thay đổi thời điểm chạy.

## Quyết định đã loại bỏ

- Không chia nhỏ browser suite thành nhiều máy vì giảm thời gian chờ nhưng tăng tổng runner-minute.
- Không chạy toàn bộ release suite cho mọi commit vì đây là nguyên nhân chính của thời gian CI hiện tại.
- Không bỏ kiểm tra đầy đủ sau merge; `main` vẫn phải được xác minh độc lập.

## Tiêu chí đạt

- Pull request thông thường nhận kết quả nhanh trong khoảng 3–7 phút khi runner và cache hoạt động bình thường.
- API/database và browser smoke được bỏ qua đúng với thay đổi chỉ có tài liệu.
- Full release vẫn có thể chạy bằng nhãn `full-ci`, thao tác thủ công và push vào `main`.
- Workflow được kiểm tra định dạng và contract trigger bằng test tự động.
