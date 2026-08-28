import { describe, expect, it, vi } from 'vitest';
import {
  adjustInventoryStock,
  canRequestInventoryCost,
  completeInventoryInspection,
  createInventoryUnitInspection,
  getAdminInventoryUnitCost,
  getInventoryInspection,
  getInventoryUnit,
  intakeInventoryUnit,
  inventoryAdminError,
  inventoryErrorRequiresRefetch,
  listInventoryLocations,
  listInventoryStockLevels,
  listInventoryStockMovements,
  listInventoryUnitInspections,
  listInventoryUnits,
  lookupInventoryUnitIdentifier,
  makeInventoryUnitAvailable,
  quarantineInventoryUnit,
  receiveInventoryStock,
  returnInventoryStock,
  revealInventoryUnitIdentifiers,
  sendInventoryUnitToRepair,
  transferInventoryStock,
  transferInventoryUnit,
  updateAdminInventoryUnitCost,
  updateInventoryInspection,
  updateInventoryUnit,
  uploadInventoryUnitMedia,
  validateInventoryMediaFile,
  writeOffInventoryUnit,
  type InventoryApiClient,
} from './backoffice-inventory-api';

const UNIT_ID = '0199c9aa-a258-74c8-a35f-9cd11c562a01';
const PRODUCT_ID = '0199c9aa-a258-74c8-a35f-9cd11c562a02';
const VARIANT_ID = '0199c9aa-a258-74c8-a35f-9cd11c562a03';
const LOCATION_ID = '0199c9aa-a258-74c8-a35f-9cd11c562a04';
const OTHER_LOCATION_ID = '0199c9aa-a258-74c8-a35f-9cd11c562a05';
const INSPECTION_ID = '0199c9aa-a258-74c8-a35f-9cd11c562a06';
const MEDIA_ID = '0199c9aa-a258-74c8-a35f-9cd11c562a07';
const MOVEMENT_ID = '0199c9aa-a258-74c8-a35f-9cd11c562a08';

const PRODUCT = {
  id: PRODUCT_ID,
  name: 'iPhone 15 Pro',
  slug: 'iphone-15-pro',
  status: 'ACTIVE' as const,
};

const VARIANT = {
  id: VARIANT_ID,
  sku: 'IP15P-256-NT',
  displayName: '256 GB · Titan tự nhiên',
  status: 'ACTIVE' as const,
};

const LOCATION = {
  id: LOCATION_ID,
  code: 'STORE-HCM',
  name: 'Cửa hàng TP.HCM',
  type: 'STORE' as const,
  status: 'ACTIVE' as const,
};

const LIST_UNIT = {
  id: UNIT_ID,
  inventoryCode: 'RPH-IP15P-0001',
  lifecycleStatus: 'INSPECTING' as const,
  product: PRODUCT,
  variant: VARIANT,
  location: LOCATION,
  salePrice: '18990000',
  compareAtPrice: '19990000',
  simLockStatus: 'UNLOCKED' as const,
  maskedIdentifiers: [
    { type: 'IMEI_1' as const, maskedValue: '•••• 1234' },
    { type: 'SERIAL' as const, maskedValue: '•••• X9T2' },
  ],
  currentInspection: {
    id: INSPECTION_ID,
    overallResult: 'PASSED' as const,
    conditionGrade: 'A' as const,
    batteryHealthPercent: 96,
    inspectedAt: '2026-08-28T04:00:00.000Z',
  },
  activeReservationCount: 0,
  mediaCount: 1,
  receivedAt: '2026-08-28T02:00:00.000Z',
  updatedAt: '2026-08-28T05:00:00.000Z',
};

const UNIT_MEDIA = {
  id: MEDIA_ID,
  ownerType: 'INVENTORY_UNIT' as const,
  ownerId: UNIT_ID,
  url: 'https://cdn.example.com/unit.webp',
  mimeType: 'image/webp' as const,
  fileSize: 4,
  width: 1200,
  height: 1200,
  sortOrder: 0,
  altText: 'Mặt trước máy',
  createdAt: '2026-08-28T03:00:00.000Z',
};

const DETAIL_UNIT = {
  ...LIST_UNIT,
  carrierName: null,
  modelNumber: 'A3102',
  regionCode: 'VN/A',
  simConfiguration: 'PHYSICAL_AND_ESIM' as const,
  warrantyDaysOverride: 90,
  media: [UNIT_MEDIA],
  availableActions: ['MAKE_AVAILABLE', 'TRANSFER', 'UNKNOWN_ACTION'],
  availabilityReadiness: { isReady: false, reasons: ['MEDIA_REQUIRED', 'PRIVATE_REASON'] },
  // Deliberately hostile additive fields: the projector must never copy these into reusable state.
  acquisitionCost: '15000000',
  additionalCost: '250000',
  imei1: '356789012341234',
  serial: 'F2LPRIVATE',
};

const INSPECTION = {
  id: INSPECTION_ID,
  inventoryUnitId: UNIT_ID,
  inspectionType: 'INTAKE' as const,
  status: 'DRAFT' as const,
  overallResult: 'INCOMPLETE' as const,
  inspectorId: '0199c9aa-a258-74c8-a35f-9cd11c562a09',
  inspector: {
    id: '0199c9aa-a258-74c8-a35f-9cd11c562a09',
    fullName: 'Nguyễn Kỹ Thuật',
    employeeCode: 'NV-009',
  },
  isCurrent: false,
  inspectedAt: null,
  checks: { schemaVersion: 1, items: { DISPLAY: { status: 'PASS', note: null } } },
  checklist: {
    schemaVersion: 1,
    items: [
      { key: 'DISPLAY', label: 'Màn hình hiển thị', order: 1, status: 'PASS', note: null },
      { key: 'TOUCHSCREEN', label: 'Cảm ứng', order: 2, note: null },
      { key: 'PRIVATE', label: 123, order: 3, status: 'PASS', note: null },
    ],
  },
  batteryHealthPercent: 96,
  batteryCycleCount: 184,
  batteryReplacementStatus: 'ORIGINAL' as const,
  conditionGrade: 'A' as const,
  cosmeticNotes: 'Xước nhẹ cạnh dưới',
  repairHistoryStatus: 'NONE_KNOWN' as const,
  repairNotes: null,
  replacedParts: null,
  createdAt: '2026-08-28T03:30:00.000Z',
  updatedAt: '2026-08-28T04:00:00.000Z',
};

const STOCK_LEVEL = {
  id: '0199c9aa-a258-74c8-a35f-9cd11c562a10',
  product: { ...PRODUCT, name: 'Ốp lưng MagSafe', slug: 'op-lung-magsafe' },
  variant: { ...VARIANT, sku: 'CASE-MAGSAFE', displayName: 'Trong suốt' },
  location: LOCATION,
  quantityOnHand: 20,
  quantityReserved: 3,
  quantityAvailable: 17,
  reorderThreshold: 5,
  lowStock: false,
  updatedAt: '2026-08-28T05:00:00.000Z',
};

const MOVEMENT = {
  id: MOVEMENT_ID,
  type: 'TRANSFER' as const,
  variantId: VARIANT_ID,
  product: STOCK_LEVEL.product,
  variant: STOCK_LEVEL.variant,
  fromLocationId: LOCATION_ID,
  fromLocation: LOCATION,
  toLocationId: OTHER_LOCATION_ID,
  toLocation: { ...LOCATION, id: OTHER_LOCATION_ID, code: 'WAREHOUSE-HCM', name: 'Kho TP.HCM' },
  quantity: 4,
  referenceType: null,
  referenceId: null,
  reason: 'Bổ sung hàng tại cửa hàng',
  createdById: INSPECTION.inspectorId,
  createdBy: INSPECTION.inspector,
  createdAt: '2026-08-28T05:30:00.000Z',
};

describe('backoffice inventory typed-client adapter', () => {
  it('normalizes unit filters, forwards AbortSignal and allow-lists safe projections', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        data: [DETAIL_UNIT],
        meta: { pagination: { page: 2, pageSize: 12, totalItems: 13, totalPages: 2 } },
      },
    });
    const controller = new AbortController();

    const result = await listInventoryUnits(
      mockClient({ GET: get }),
      {
        q: '  iPhone 15  ',
        productId: `  ${PRODUCT_ID}  `,
        variantId: '',
        locationId: LOCATION_ID,
        lifecycleStatus: 'INSPECTING',
        conditionGrade: 'A',
        simLockStatus: '',
        minBatteryHealth: 90,
        page: 2,
        pageSize: 12,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      },
      { signal: controller.signal },
    );

    expect(get).toHaveBeenCalledWith('/api/v1/backoffice/inventory-units', {
      params: {
        query: {
          q: 'iPhone 15',
          productId: PRODUCT_ID,
          locationId: LOCATION_ID,
          lifecycleStatus: 'INSPECTING',
          conditionGrade: 'A',
          minBatteryHealth: 90,
          page: 2,
          pageSize: 12,
          sortBy: 'updatedAt',
          sortOrder: 'desc',
        },
      },
      signal: controller.signal,
    });
    expect(result.pagination).toEqual({ page: 2, pageSize: 12, totalItems: 13, totalPages: 2 });
    expect(result.data[0]).toMatchObject({
      inventoryCode: LIST_UNIT.inventoryCode,
      maskedIdentifiers: [{ maskedValue: '•••• 1234' }, { maskedValue: '•••• X9T2' }],
    });
    expect(result.data[0]).not.toHaveProperty('imei1');
    expect(result.data[0]).not.toHaveProperty('serial');
    expect(result.data[0]).not.toHaveProperty('acquisitionCost');
    expect(result.data[0]).not.toHaveProperty('additionalCost');
  });

  it('uses audited lookup and intake/update bodies without retaining raw fields in projections', async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce({ data: { data: DETAIL_UNIT } })
      .mockResolvedValueOnce({ data: { data: DETAIL_UNIT } });
    const patch = vi.fn().mockResolvedValue({ data: { data: DETAIL_UNIT } });
    const client = mockClient({ POST: post, PATCH: patch });

    const lookup = await lookupInventoryUnitIdentifier(client, {
      type: 'IMEI',
      value: ' 356789012341234 ',
      reason: '  Đối chiếu máy khách mang đến  ',
    });
    const intake = await intakeInventoryUnit(client, {
      variantId: VARIANT_ID,
      locationId: LOCATION_ID,
      imei1: '356789012341234',
      serial: 'F2LPRIVATE',
      simLockStatus: 'UNLOCKED',
      simConfiguration: 'PHYSICAL_AND_ESIM',
      salePrice: '18990000',
    });
    await updateInventoryUnit(client, UNIT_ID, {
      salePrice: '18490000',
      reason: '  Điều chỉnh theo tình trạng máy  ',
    });

    expect(post.mock.calls).toEqual([
      [
        '/api/v1/backoffice/inventory-units/lookup-identifier',
        {
          body: {
            type: 'IMEI',
            value: '356789012341234',
            reason: 'Đối chiếu máy khách mang đến',
          },
        },
      ],
      [
        '/api/v1/backoffice/inventory-units',
        {
          body: {
            variantId: VARIANT_ID,
            locationId: LOCATION_ID,
            imei1: '356789012341234',
            serial: 'F2LPRIVATE',
            simLockStatus: 'UNLOCKED',
            simConfiguration: 'PHYSICAL_AND_ESIM',
            salePrice: '18990000',
          },
        },
      ],
    ]);
    expect(patch).toHaveBeenCalledWith('/api/v1/backoffice/inventory-units/{id}', {
      params: { path: { id: UNIT_ID } },
      body: { salePrice: '18490000', reason: 'Điều chỉnh theo tình trạng máy' },
    });
    for (const projection of [lookup, intake]) {
      expect(projection).not.toHaveProperty('imei1');
      expect(projection).not.toHaveProperty('serial');
      expect(projection).not.toHaveProperty('acquisitionCost');
    }
  });

  it('loads ordinary detail separately from audited reveal and admin-only cost operations', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: { data: DETAIL_UNIT } })
      .mockResolvedValueOnce({
        data: {
          data: { acquisitionCost: '15000000', additionalCost: '250000', totalCost: '15250000' },
        },
      });
    const post = vi.fn().mockResolvedValue({
      data: {
        data: { imei1: '356789012341234', imei2: null, serial: 'F2LPRIVATE', eid: null },
      },
    });
    const patch = vi.fn().mockResolvedValue({
      data: {
        data: { acquisitionCost: '14800000', additionalCost: '250000', totalCost: '15050000' },
      },
    });
    const client = mockClient({ GET: get, POST: post, PATCH: patch });

    const detail = await getInventoryUnit(client, UNIT_ID);
    const identifiers = await revealInventoryUnitIdentifiers(
      client,
      UNIT_ID,
      '  Kiểm tra trước khi bàn giao  ',
    );

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/api/v1/backoffice/inventory-units/{id}', {
      params: { path: { id: UNIT_ID } },
    });
    expect(detail).toMatchObject({
      media: [{ id: MEDIA_ID }],
      availableActions: ['MAKE_AVAILABLE', 'TRANSFER'],
      availabilityReadiness: { isReady: false, reasons: ['MEDIA_REQUIRED'] },
    });
    expect(detail).not.toHaveProperty('acquisitionCost');
    expect(detail).not.toHaveProperty('imei1');
    expect(post).toHaveBeenCalledWith(
      '/api/v1/backoffice/inventory-units/{id}/reveal-identifiers',
      {
        params: { path: { id: UNIT_ID } },
        body: { reason: 'Kiểm tra trước khi bàn giao' },
      },
    );
    expect(identifiers).toEqual({
      imei1: '356789012341234',
      imei2: null,
      serial: 'F2LPRIVATE',
      eid: null,
    });

    expect(canRequestInventoryCost('EMPLOYEE')).toBe(false);
    expect(canRequestInventoryCost('ADMIN')).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);

    await getAdminInventoryUnitCost(client, UNIT_ID);
    await updateAdminInventoryUnitCost(client, UNIT_ID, {
      acquisitionCost: '14800000',
      additionalCost: '250000',
      reason: '  Cập nhật theo hóa đơn nhập  ',
    });
    expect(get).toHaveBeenNthCalledWith(2, '/api/v1/backoffice/inventory-units/{id}/cost', {
      params: { path: { id: UNIT_ID } },
    });
    expect(patch).toHaveBeenCalledWith('/api/v1/backoffice/inventory-units/{id}/cost', {
      params: { path: { id: UNIT_ID } },
      body: {
        acquisitionCost: '14800000',
        additionalCost: '250000',
        reason: 'Cập nhật theo hóa đơn nhập',
      },
    });
  });

  it('routes every unit lifecycle command through its dedicated endpoint', async () => {
    const post = vi.fn().mockResolvedValue({ data: { data: DETAIL_UNIT } });
    const client = mockClient({ POST: post });

    await makeInventoryUnitAvailable(client, UNIT_ID);
    await sendInventoryUnitToRepair(client, UNIT_ID, '  Cần thay cổng sạc  ');
    await quarantineInventoryUnit(client, UNIT_ID, '  Chờ xác minh nguồn hàng  ');
    await writeOffInventoryUnit(client, UNIT_ID, '  Không thể sửa chữa  ');
    await transferInventoryUnit(client, UNIT_ID, {
      toLocationId: OTHER_LOCATION_ID,
      reason: '  Chuyển về kho trung tâm  ',
    });

    expect(post.mock.calls).toEqual([
      [
        '/api/v1/backoffice/inventory-units/{id}/make-available',
        { params: { path: { id: UNIT_ID } } },
      ],
      [
        '/api/v1/backoffice/inventory-units/{id}/send-to-repair',
        { params: { path: { id: UNIT_ID } }, body: { reason: 'Cần thay cổng sạc' } },
      ],
      [
        '/api/v1/backoffice/inventory-units/{id}/quarantine',
        { params: { path: { id: UNIT_ID } }, body: { reason: 'Chờ xác minh nguồn hàng' } },
      ],
      [
        '/api/v1/backoffice/inventory-units/{id}/write-off',
        { params: { path: { id: UNIT_ID } }, body: { reason: 'Không thể sửa chữa' } },
      ],
      [
        '/api/v1/backoffice/inventory-units/{id}/transfer',
        {
          params: { path: { id: UNIT_ID } },
          body: { toLocationId: OTHER_LOCATION_ID, reason: 'Chuyển về kho trung tâm' },
        },
      ],
    ]);
  });

  it('covers inspection list/create/get/update/complete with projected registry data', async () => {
    const controller = new AbortController();
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          data: [INSPECTION],
          meta: { pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 } },
        },
      })
      .mockResolvedValueOnce({ data: { data: INSPECTION } });
    const post = vi
      .fn()
      .mockResolvedValueOnce({ data: { data: INSPECTION } })
      .mockResolvedValueOnce({ data: { data: { ...INSPECTION, status: 'COMPLETED' } } });
    const patch = vi.fn().mockResolvedValue({ data: { data: INSPECTION } });
    const client = mockClient({ GET: get, POST: post, PATCH: patch });

    const page = await listInventoryUnitInspections(
      client,
      UNIT_ID,
      { page: 1, pageSize: 10 },
      { signal: controller.signal },
    );
    await createInventoryUnitInspection(client, UNIT_ID, { inspectionType: 'PRE_SALE' });
    const detail = await getInventoryInspection(client, INSPECTION_ID);
    await updateInventoryInspection(client, INSPECTION_ID, {
      batteryHealthPercent: 96,
      conditionGrade: 'A',
      checks: {
        schemaVersion: 1,
        items: { DISPLAY: { status: 'PASS', note: null } },
      },
    });
    await completeInventoryInspection(client, INSPECTION_ID);

    expect(get.mock.calls[0]).toEqual([
      '/api/v1/backoffice/inventory-units/{id}/inspections',
      {
        params: { path: { id: UNIT_ID }, query: { page: 1, pageSize: 10 } },
        signal: controller.signal,
      },
    ]);
    expect(page.data[0]).toMatchObject({
      inspector: { fullName: 'Nguyễn Kỹ Thuật', employeeCode: 'NV-009' },
    });
    expect(detail.checklist).toEqual({
      schemaVersion: 1,
      items: [
        { key: 'DISPLAY', label: 'Màn hình hiển thị', order: 1, status: 'PASS', note: null },
        { key: 'TOUCHSCREEN', label: 'Cảm ứng', order: 2, status: null, note: null },
      ],
    });
    expect(post.mock.calls).toEqual([
      [
        '/api/v1/backoffice/inventory-units/{id}/inspections',
        { params: { path: { id: UNIT_ID } }, body: { inspectionType: 'PRE_SALE' } },
      ],
      ['/api/v1/backoffice/inspections/{id}/complete', { params: { path: { id: INSPECTION_ID } } }],
    ]);
    expect(get.mock.calls[1]).toEqual([
      '/api/v1/backoffice/inspections/{id}',
      { params: { path: { id: INSPECTION_ID } } },
    ]);
    expect(patch).toHaveBeenCalledWith('/api/v1/backoffice/inspections/{id}', {
      params: { path: { id: INSPECTION_ID } },
      body: {
        batteryHealthPercent: 96,
        conditionGrade: 'A',
        checks: {
          schemaVersion: 1,
          items: { DISPLAY: { status: 'PASS', note: null } },
        },
      },
    });
  });

  it('lists locations with cancellation and uploads a real multipart image body', async () => {
    const get = vi.fn().mockResolvedValue({ data: { data: [LOCATION] } });
    const post = vi.fn().mockResolvedValue({ data: { data: UNIT_MEDIA } });
    const client = mockClient({ GET: get, POST: post });
    const controller = new AbortController();
    const image = new Blob(['data'], { type: 'image/webp' });

    await listInventoryLocations(client, { signal: controller.signal });
    expect(get).toHaveBeenCalledWith('/api/v1/backoffice/inventory-locations', {
      signal: controller.signal,
    });
    expect(validateInventoryMediaFile(image)).toBeNull();
    expect(validateInventoryMediaFile(new Blob(['data'], { type: 'text/plain' }))).toContain(
      'JPEG',
    );

    await uploadInventoryUnitMedia(client, UNIT_ID, {
      file: image,
      altText: '  Mặt trước máy  ',
      sortOrder: 2,
    });
    expect(post.mock.calls[0]?.[0]).toBe('/api/v1/backoffice/inventory-units/{id}/media');
    const options = post.mock.calls[0]?.[1] as {
      params: { path: { id: string } };
      body: { file: Blob; altText: string; sortOrder: number };
      bodySerializer: () => FormData;
    };
    expect(options.params).toEqual({ path: { id: UNIT_ID } });
    expect(options.body.file).toBe(image);
    expect(options.bodySerializer()).toBeInstanceOf(FormData);
    expect(options.bodySerializer().get('file')).toBeInstanceOf(Blob);
    expect(options.bodySerializer().get('altText')).toBe('Mặt trước máy');
    expect(options.bodySerializer().get('sortOrder')).toBe('2');
  });

  it('normalizes both stock lists, supports cancellation and maps additive summaries', async () => {
    const controller = new AbortController();
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          data: [STOCK_LEVEL],
          meta: { pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [MOVEMENT],
          meta: { pagination: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2 } },
        },
      });
    const client = mockClient({ GET: get });

    const levels = await listInventoryStockLevels(
      client,
      { variantId: ` ${VARIANT_ID} `, locationId: '', lowStock: false, page: 1, pageSize: 20 },
      { signal: controller.signal },
    );
    const movements = await listInventoryStockMovements(
      client,
      {
        variantId: VARIANT_ID,
        locationId: LOCATION_ID,
        type: 'TRANSFER',
        dateFrom: ' 2026-08-01 ',
        dateTo: '2026-08-31',
        referenceType: '',
        referenceId: ' ref-01 ',
        page: 2,
        pageSize: 20,
      },
      { signal: controller.signal },
    );

    expect(get.mock.calls[0]).toEqual([
      '/api/v1/backoffice/stock-levels',
      {
        params: { query: { variantId: VARIANT_ID, lowStock: false, page: 1, pageSize: 20 } },
        signal: controller.signal,
      },
    ]);
    expect(get.mock.calls[1]).toEqual([
      '/api/v1/backoffice/stock-movements',
      {
        params: {
          query: {
            variantId: VARIANT_ID,
            locationId: LOCATION_ID,
            type: 'TRANSFER',
            dateFrom: '2026-08-01',
            dateTo: '2026-08-31',
            referenceId: 'ref-01',
            page: 2,
            pageSize: 20,
          },
        },
        signal: controller.signal,
      },
    ]);
    expect(levels.data[0]).toMatchObject({ product: { name: 'Ốp lưng MagSafe' } });
    expect(movements.data[0]).toMatchObject({
      variant: { displayName: 'Trong suốt' },
      fromLocation: { name: LOCATION.name },
      toLocation: { name: 'Kho TP.HCM' },
      createdBy: { fullName: 'Nguyễn Kỹ Thuật' },
    });
  });

  it('uses exact command bodies for receive, transfer, adjust and return stock', async () => {
    const post = vi.fn().mockResolvedValue({
      data: { data: { affectedLevels: [STOCK_LEVEL], movement: MOVEMENT } },
    });
    const client = mockClient({ POST: post });

    await receiveInventoryStock(client, {
      variantId: VARIANT_ID,
      locationId: LOCATION_ID,
      quantity: 12,
      reason: '  Nhập lô mới  ',
    });
    await transferInventoryStock(client, {
      variantId: VARIANT_ID,
      fromLocationId: LOCATION_ID,
      toLocationId: OTHER_LOCATION_ID,
      quantity: 4,
      reason: '  Bổ sung cửa hàng  ',
    });
    await adjustInventoryStock(client, {
      variantId: VARIANT_ID,
      locationId: LOCATION_ID,
      direction: 'OUT',
      quantity: 1,
      reason: '  Hàng mẫu bị hỏng  ',
    });
    await returnInventoryStock(client, {
      variantId: VARIANT_ID,
      locationId: LOCATION_ID,
      quantity: 2,
      referenceType: 'SHIPMENT',
      referenceId: '0199c9aa-a258-74c8-a35f-9cd11c562a11',
      reason: '  Đơn giao không thành công  ',
    });

    expect(post.mock.calls).toEqual([
      [
        '/api/v1/backoffice/stock/receive',
        {
          body: {
            variantId: VARIANT_ID,
            locationId: LOCATION_ID,
            quantity: 12,
            reason: 'Nhập lô mới',
          },
        },
      ],
      [
        '/api/v1/backoffice/stock/transfer',
        {
          body: {
            variantId: VARIANT_ID,
            fromLocationId: LOCATION_ID,
            toLocationId: OTHER_LOCATION_ID,
            quantity: 4,
            reason: 'Bổ sung cửa hàng',
          },
        },
      ],
      [
        '/api/v1/backoffice/stock/adjust',
        {
          body: {
            variantId: VARIANT_ID,
            locationId: LOCATION_ID,
            direction: 'OUT',
            quantity: 1,
            reason: 'Hàng mẫu bị hỏng',
          },
        },
      ],
      [
        '/api/v1/backoffice/stock/return',
        {
          body: {
            variantId: VARIANT_ID,
            locationId: LOCATION_ID,
            quantity: 2,
            referenceType: 'SHIPMENT',
            referenceId: '0199c9aa-a258-74c8-a35f-9cd11c562a11',
            reason: 'Đơn giao không thành công',
          },
        },
      ],
    ]);
  });

  it('maps private server failures to safe copy and marks authoritative refetch cases', async () => {
    const conflict = inventoryAdminError(
      { error: { code: 'CONCURRENT_MODIFICATION', message: 'private transaction detail' } },
      'fallback',
    );
    expect(conflict.message).toContain('tải lại');
    expect(conflict.message).not.toContain('private');
    expect(conflict.requiresRefetch).toBe(true);
    expect(inventoryErrorRequiresRefetch(conflict)).toBe(true);

    const client = mockClient({
      POST: vi.fn().mockResolvedValue({
        error: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'internal checklist parser detail',
            details: [{ field: 'checks', code: 'INVENTORY_INSPECTION_REQUIRED' }],
          },
        },
      }),
    });
    await expect(completeInventoryInspection(client, INSPECTION_ID)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Máy cần hoàn tất kiểm định đạt yêu cầu trước khi đưa lên bán.',
      requiresRefetch: false,
    });
  });
});

function mockClient(overrides: Record<string, unknown>): InventoryApiClient {
  return {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    DELETE: vi.fn(),
    ...overrides,
  } as unknown as InventoryApiClient;
}
