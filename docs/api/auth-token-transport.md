# Auth token transport

rePhone dùng access token ngắn hạn trong frontend memory và refresh token rotation bằng HttpOnly cookie. Mục tiêu là không để token dài hạn cho JavaScript đọc, đồng thời không biến mọi business mutation thành cookie-authenticated request cần CSRF token.

## 1. Login/refresh response

Login thành công:

- Backend tạo `AuthSession`, lưu hash của refresh token và metadata phiên.
- Raw refresh token chỉ được đặt vào cookie; không xuất hiện trong JSON/log/database.
- Access token được trả trong success envelope cùng expiry metadata và user summary.
- Frontend giữ access token trong memory của auth store; không ghi localStorage/sessionStorage/IndexedDB.

Ví dụ shape định hướng:

```json
{
  "data": {
    "accessToken": "...",
    "expiresIn": 900,
    "user": {
      "id": "...",
      "role": "CUSTOMER"
    }
  }
}
```

Access token hết hạn sau 15 phút; `expiresIn` là 900 ở baseline hiện hành.

## 2. Business API request

- Frontend gửi `Authorization: Bearer <accessToken>`.
- Backend verify JWT rồi kiểm tra `sessionId`/User ACTIVE trong database; chữ ký hợp lệ nhưng session revoked vẫn trả `SESSION_REVOKED`.
- Access token không được browser tự gắn như cookie, nên CSRF không phải cơ chế auth của business mutation.
- Access token hết hạn: frontend phối hợp một refresh request, cập nhật memory rồi retry request phù hợp tối đa một lần.
- Không log Authorization header hoặc token payload nhạy cảm.

## 3. Refresh cookie

Baseline production:

- `HttpOnly`.
- `Secure`.
- `SameSite=Lax` khi frontend/API cùng site như topology dự kiến.
- Path giới hạn dưới `/api/v1/auth` để refresh/logout nhận được cookie.
- Không set `Domain` rộng nếu deployment không bắt buộc.
- CORS dùng exact origin allowlist và credentials; không dùng wildcard với credentials.

Cookie dùng tên cố định `rephone_refresh` theo [Configuration](../architecture/configuration.md); lifetime đã chốt tại ADR-0051. Local development được phép bỏ `Secure` trên HTTP localhost nhưng không thay đổi nguyên tắc production.

Refresh session hết hạn tuyệt đối sau 7 ngày từ login; rotation không gia hạn deadline.

## 4. Refresh rotation/reuse

- `POST /api/v1/auth/refresh` đọc refresh cookie, so hash với AuthSession active và kiểm tra expiry/revocation/account status.
- Thành công phải rotate token trong một transaction: revoke generation hiện tại, tạo `AuthSession` successor cùng `tokenFamilyId` và absolute expiry, set cookie mới và trả access token có `sessionId` của successor.
- Không update đè hash của generation cũ. Reuse token cũ lookup được row đã revoke và làm revoke mọi generation active trong family.
- `POST /api/v1/auth/logout` revoke session hiện tại và clear cookie với cùng name/path/attributes.
- Đổi mật khẩu/disable account có thể revoke toàn bộ session của user.

## 5. CSRF/CORS cho cookie endpoint

Refresh/logout là các endpoint dùng cookie tự động nên phải:

- Chỉ chấp nhận unsafe request từ Origin allowlist chính xác.
- Yêu cầu custom request header do rePhone frontend gửi; request simple/cross-site không có header bị từ chối.
- Dùng JSON content type/không nhận simple form content type không cần thiết.
- Có thể kiểm tra Fetch Metadata làm defense in depth; Origin/allowlist vẫn là fallback bắt buộc.
- SameSite chỉ là defense in depth, không thay thế các check trên.

Các webhook tương lai không dùng cookie và phải có authentication riêng, không được miễn global policy một cách mơ hồ.

## 6. Next.js tradeoff

- Public catalog vẫn render server-side mà không cần access token.
- Protected page có thể hydrate rồi gọi refresh để khôi phục access token trong memory.
- SSR trực tiếp cho protected data sẽ cần BFF/server token forwarding riêng; hoãn khỏi MVP thay vì chia sẻ refresh token cho JavaScript.

## 7. Acceptance test tối thiểu

- Login/refresh không trả refresh token trong JSON.
- Reload mất access token memory nhưng refresh hợp lệ cấp token mới.
- Access token không xuất hiện trong Web Storage.
- Refresh rotation làm token cũ không dùng lại được; reuse revoke family theo policy.
- Origin không được phép hoặc thiếu custom header bị từ chối ở refresh/logout.
- CORS credentials không đi cùng wildcard origin.
- Logout clear đúng cookie và revoke AuthSession.

## Liên kết

- [Xác thực và bảo mật](../architecture/authentication-and-security.md)
- [Identity/Auth data dictionary](../data-model/identity-auth.md)
- [ADR-0050](../decisions/0050-memory-access-token-and-http-only-refresh-cookie.md)
- [ADR-0051](../decisions/0051-auth-token-lifetimes.md)

## Tham khảo bảo mật

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [MDN Secure cookie configuration](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies)
