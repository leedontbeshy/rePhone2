# Checklist kiểm định iPhone

Checklist là schema cố định, versioned theo ADR-0061. P0 dùng `schemaVersion = 1`; backend registry là nguồn duy nhất cho key, thứ tự, label và validation.

## 1. Schema JSONB

```json
{
  "schemaVersion": 1,
  "items": {
    "DISPLAY": { "status": "PASS", "note": null },
    "TOUCHSCREEN": { "status": "PASS", "note": null },
    "FRONT_CAMERA": { "status": "PASS", "note": null }
  }
}
```

Quy tắc:

- `schemaVersion` là integer dương và phải được backend hỗ trợ.
- Với DRAFT, `items` là object chứa subset key hợp lệ của version; với COMPLETE phải có đúng toàn bộ key, không thiếu/thừa.
- Mỗi item: `status` bắt buộc, `note` nullable tối đa 500 ký tự.
- Status: `PASS`, `FAIL`, `DEGRADED`, `NOT_TESTED`, `NOT_APPLICABLE`, `UNKNOWN`.
- `FAIL`, `DEGRADED`, `NOT_TESTED`, `UNKNOWN` bắt buộc có note giải thích; `PASS/NOT_APPLICABLE` note optional.
- Không lưu label, sort order, actor hoặc timestamp trong JSON; các field đó thuộc registry/Inspection record.

## 2. Checklist version 1

| Order | Key | Label public | Phạm vi kiểm tra |
|---:|---|---|---|
| 1 | `DISPLAY` | Màn hình hiển thị | Điểm chết, ám màu, độ sáng, hiển thị |
| 2 | `TOUCHSCREEN` | Cảm ứng | Toàn vùng cảm ứng, multi-touch |
| 3 | `FRONT_CAMERA` | Camera trước | Chụp/quay, lấy nét nếu hỗ trợ |
| 4 | `REAR_CAMERA` | Camera sau | Tất cả lens, chụp/quay/lấy nét |
| 5 | `FACE_ID_TOUCH_ID` | Face ID/Touch ID | Sinh trắc học theo model |
| 6 | `SPEAKER` | Loa | Loa thoại và loa ngoài |
| 7 | `MICROPHONE` | Micro | Thu âm/cuộc gọi |
| 8 | `BUTTONS` | Phím vật lý | Nguồn, âm lượng, action/mute |
| 9 | `VIBRATION_HAPTICS` | Rung/Haptic | Motor rung và phản hồi |
| 10 | `WIFI` | Wi‑Fi | Kết nối và duy trì tín hiệu |
| 11 | `BLUETOOTH` | Bluetooth | Bật, dò và kết nối cơ bản |
| 12 | `CELLULAR` | Sóng di động | Nhận SIM/eSIM, nghe gọi/dữ liệu cơ bản |
| 13 | `CHARGING_PORT` | Cổng sạc | Nhận sạc/cáp và kết nối ổn định |
| 14 | `WIRELESS_CHARGING` | Sạc không dây | Dùng `NOT_APPLICABLE` nếu model không hỗ trợ |
| 15 | `BATTERY_FUNCTION` | Hoạt động pin | Nhận pin, sạc/xả bất thường, cảnh báo linh kiện |
| 16 | `GPS_LOCATION` | GPS/Định vị | Nhận vị trí cơ bản |
| 17 | `SENSORS` | Cảm biến | Tiệm cận, xoay, ánh sáng và sensor cơ bản |
| 18 | `CONNECTORS_OTHER` | Kết nối khác | NFC/USB accessory hoặc chức năng kết nối liên quan |

Battery health %, cycle count và replacement status vẫn là cột riêng, không lặp vào `items`. Ngoại hình/grade/cosmetic note cũng là field riêng.

## 3. Draft và complete

### DRAFT

- Có thể lưu payload chưa đủ key để nhân viên tiếp tục sau.
- Backend vẫn validate key/status nào đã có thuộc schema version.
- `overallResult = INCOMPLETE`, `inspectedAt = null`, `isCurrent = false`.
- Chỉ owner staff phù hợp hoặc admin được sửa draft theo permission policy.

### COMPLETE

Command complete:

1. Load DRAFT và lock unit/current inspection context.
2. Require đầy đủ 18 key v1 và note cho non-pass status.
3. Validate battery/condition/repair fields theo inspection type.
4. Tự tính `overallResult`.
5. Set `status = COMPLETED`, `inspectedAt = now`.
6. Set inspection cũ `isCurrent=false`, inspection mới `isCurrent=true` trong cùng transaction.
7. Ghi audit summary đã redacted.

Completed record và `checks` immutable; sửa sai bằng inspection mới.

## 4. Tính `overallResult`

```text
if any status == FAIL:
  FAILED
else if any status in [DEGRADED, NOT_TESTED, UNKNOWN]:
  PARTIAL
else:
  PASSED
```

`NOT_APPLICABLE` không làm giảm kết quả. Backend không nhận `overallResult` từ DTO.

Condition grade A/B/C và battery health không tự biến overall result thành PARTIAL/FAILED; chúng là thông tin tình trạng/giá riêng. Functional `BATTERY_FUNCTION` mới tham gia rule.

## 5. Public projection

Public API chỉ trả:

```text
schemaVersion
items[] { key, label, status, note? }
```

- Thứ tự/label lấy từ registry v1.
- Chỉ current completed inspection của unit public được dùng.
- Không trả inspectorId, internal audit, draft hoặc raw JSON không qua projection.
- Note được staff xác định là customer-safe; secret/device identifier/PII bị cấm và DTO/log review cần kiểm tra.

## 6. Versioning

- Thêm/bỏ/đổi nghĩa key tạo `schemaVersion = 2`, không sửa registry v1.
- Inspection mới mặc định dùng latest active version do backend quy định.
- Record v1 tiếp tục render bằng registry v1.
- Không cần migration JSONB lịch sử chỉ để nâng checklist.
- Nếu code không còn parser cho version đang lưu, fail closed ở backoffice/public projection và log lỗi dữ liệu; không trả raw JSON.

## 7. Availability policy và API

- Chỉ current inspection `PASSED` mới cho phép unit chuyển `AVAILABLE` trong P0.
- `PARTIAL`/`FAILED` phải đi repair/quarantine và được kiểm định lại; không có admin override đưa bán.
- Grade B/C, battery health thấp hoặc battery đã thay không tự tạo PARTIAL nếu functional checks vẫn PASS; các field này được công khai riêng.
- DTO/path create/update/complete nằm tại [Backoffice Catalog và Inventory endpoints](../api/backoffice-catalog-inventory-endpoints.md).

## 8. Acceptance test tối thiểu

- Complete thiếu/thừa key hoặc unknown version bị từ chối.
- Non-pass không note bị từ chối.
- Rule PASSED/PARTIAL/FAILED đúng mọi nhóm status.
- Complete atomically đổi current inspection và record cũ bất biến.
- Registry v1 render đúng thứ tự/label; public không nhận raw/internal field.
- Draft được sửa nhưng completed không thể PATCH.

## Liên kết

- [Catalog/Inventory data dictionary](../data-model/catalog-inventory.md)
- [Public catalog endpoints](../api/public-catalog-endpoints.md)
- [ADR-0061](../decisions/0061-versioned-fixed-iphone-inspection-checklist.md)
- [Backoffice Catalog và Inventory endpoints](../api/backoffice-catalog-inventory-endpoints.md)
