import { describe, expect, it, vi } from 'vitest';
import {
  afterSalesBackofficeError,
  assignAfterSales,
  getBackofficeAfterSales,
  getBackofficeAfterSalesAttachmentUrl,
  listAfterSalesLocations,
  listBackofficeAfterSales,
  completeAfterSalesInspection,
  resolveAfterSalesReplaced,
  updateAfterSalesInspection,
  type AfterSalesBackofficeApiClient,
  type AfterSalesDetail,
} from './after-sales-backoffice-api';

const ID = '0198f1e4-9051-7af4-a157-c15223562e10';
const EMPLOYEE_ID = '0198f1e4-9051-7af4-a157-c15223562e11';
const ATTACHMENT_ID = '0198f1e4-9051-7af4-a157-c15223562e16';
const INSPECTION_ID = '0198f1e4-9051-7af4-a157-c15223562e15';
const DETAIL: AfterSalesDetail = {
  id: ID,
  requestNumber: 'AS-20260825-ABC23456',
  type: 'WARRANTY',
  status: 'INSPECTING',
  orderItem: {
    id: '0198f1e4-9051-7af4-a157-c15223562e12',
    orderNumber: 'RPH-20260820-ABC23456',
    productName: 'iPhone 15 Pro',
    variantName: '256 GB · Titan tự nhiên',
    inventoryCode: 'IP15P-DEMO-01',
    quantity: 1,
  },
  issueDescription: 'Máy mất rung sau ba ngày sử dụng bình thường.',
  requestedAt: '2026-08-25T08:00:00.000Z',
  updatedAt: '2026-08-25T09:00:00.000Z',
  customer: {
    id: '0198f1e4-9051-7af4-a157-c15223562e13',
    name: 'Khách Demo',
    email: 'customer@example.com',
    phone: '0900000000',
  },
  assignedTo: { id: EMPLOYEE_ID, fullName: 'Nhân viên Demo' },
  attachmentCount: 1,
  requestedResolution: 'Kiểm tra và sửa máy',
  warranty: {
    warrantyCode: 'RPH-W-20260820-ABC23456',
    status: 'ACTIVE',
    startAt: '2026-08-20T08:00:00.000Z',
    endAt: '2027-08-20T08:00:00.000Z',
    isValid: true,
    isExpired: false,
  },
  receivedLocation: {
    id: '0198f1e4-9051-7af4-a157-c15223562e14',
    code: 'STORE-HCM',
    name: 'Cửa hàng TP.HCM',
    type: 'STORE',
    status: 'ACTIVE',
  },
  receivedBy: { id: EMPLOYEE_ID, fullName: 'Nhân viên Demo' },
  receiveNote: 'Đã nhận máy nguyên trạng.',
  inspectionSummary: null,
  inspection: {
    id: '0198f1e4-9051-7af4-a157-c15223562e15',
    type: 'WARRANTY',
    status: 'DRAFT',
    overallResult: 'INCOMPLETE',
    inspector: { id: EMPLOYEE_ID, fullName: 'Nhân viên Demo' },
    inspectedAt: null,
  },
  decidedBy: null,
  resolvedBy: null,
  returnNote: null,
  refund: null,
  replacementUnit: null,
  attachments: [
    {
      id: ATTACHMENT_ID,
      mimeType: 'image/jpeg',
      fileSize: 3456,
      uploadedAt: '2026-08-25T08:05:00.000Z',
    },
  ],
  decisionNote: null,
  resolutionType: null,
  resolutionNote: null,
  cancelReason: null,
  timeline: {
    requestedAt: '2026-08-25T08:00:00.000Z',
    receivedAt: '2026-08-25T08:30:00.000Z',
    inspectedAt: '2026-08-25T09:00:00.000Z',
    decidedAt: null,
    resolvedAt: null,
    returnedAt: null,
    cancelledAt: null,
  },
  availableActions: ['ASSIGN'],
};

describe('after-sales backoffice api adapter', () => {
  it('compacts list filters and maps pagination', async () => {
    const client = {
      GET: vi.fn().mockResolvedValue({
        data: {
          data: [DETAIL],
          meta: {
            pagination: { page: 2, pageSize: 20, totalItems: 23, totalPages: 2 },
          },
        },
      }),
    } as unknown as AfterSalesBackofficeApiClient;

    const result = await listBackofficeAfterSales(client, {
      q: '  AS-2026  ',
      type: '',
      status: 'INSPECTING',
      assignedToId: '',
      page: 2,
      pageSize: 20,
      sortBy: 'requestedAt',
      sortOrder: 'desc',
    });

    expect(client.GET).toHaveBeenCalledWith('/api/v1/backoffice/after-sales', {
      params: {
        query: {
          q: 'AS-2026',
          status: 'INSPECTING',
          page: 2,
          pageSize: 20,
          sortBy: 'requestedAt',
          sortOrder: 'desc',
        },
      },
    });
    expect(result.pagination).toEqual({ page: 2, pageSize: 20, totalItems: 23, totalPages: 2 });
    expect(result.data[0]).toMatchObject({ requestNumber: 'AS-20260825-ABC23456' });
  });

  it('projects detail without forwarding private storage metadata', async () => {
    const unsafe = {
      ...DETAIL,
      attachments: [
        {
          ...DETAIL.attachments[0],
          bucket: 'rephone-private',
          objectPath: 'after-sales/secret/file.jpg',
          sha256: 'secret-digest',
        },
      ],
    };
    const client = {
      GET: vi.fn().mockResolvedValue({ data: { data: unsafe } }),
    } as unknown as AfterSalesBackofficeApiClient;

    const result = await getBackofficeAfterSales(client, ID);

    expect(result.attachments[0]).toEqual(DETAIL.attachments[0]);
    expect(result.attachments[0]).not.toHaveProperty('bucket');
    expect(result.attachments[0]).not.toHaveProperty('objectPath');
    expect(JSON.stringify(result)).not.toContain('secret-digest');
  });

  it('uses assignment and typed replacement contracts', async () => {
    const client = {
      POST: vi.fn().mockResolvedValue({ data: { data: DETAIL } }),
    } as unknown as AfterSalesBackofficeApiClient;
    const replacementId = '0198f1e4-9051-7af4-a157-c15223562e17';

    await assignAfterSales(client, ID, EMPLOYEE_ID);
    await resolveAfterSalesReplaced(client, ID, {
      replacementInventoryUnitId: replacementId,
      resolutionNote: 'Đổi unit cùng sản phẩm sau khi kiểm tra điều kiện.',
    });

    expect(client.POST).toHaveBeenNthCalledWith(1, '/api/v1/backoffice/after-sales/{id}/assign', {
      params: { path: { id: ID } },
      body: { employeeId: EMPLOYEE_ID },
    });
    expect(client.POST).toHaveBeenNthCalledWith(
      2,
      '/api/v1/backoffice/after-sales/{id}/resolve-replaced',
      {
        params: { path: { id: ID } },
        body: {
          replacementInventoryUnitId: replacementId,
          resolutionNote: 'Đổi unit cùng sản phẩm sau khi kiểm tra điều kiện.',
        },
      },
    );
  });

  it('returns only safe active-location projection fields', async () => {
    const client = {
      GET: vi.fn().mockResolvedValue({
        data: {
          data: [
            {
              id: '0198f1e4-9051-7af4-a157-c15223562e14',
              code: 'STORE-HCM',
              name: 'Cửa hàng TP.HCM',
              type: 'STORE',
              status: 'ACTIVE',
              internalNote: 'must-not-leak',
            },
          ],
        },
      }),
    } as unknown as AfterSalesBackofficeApiClient;

    const locations = await listAfterSalesLocations(client);

    expect(locations[0]).toEqual({
      id: '0198f1e4-9051-7af4-a157-c15223562e14',
      code: 'STORE-HCM',
      name: 'Cửa hàng TP.HCM',
      type: 'STORE',
      status: 'ACTIVE',
    });
    expect(locations[0]).not.toHaveProperty('internalNote');
  });

  it('uses the existing inspection draft and completion contracts for the iPhone editor', async () => {
    const inspection = {
      id: INSPECTION_ID,
      inventoryUnitId: '0198f1e4-9051-7af4-a157-c15223562e20',
      inspectionType: 'WARRANTY',
      inspectorId: EMPLOYEE_ID,
      status: 'DRAFT',
      overallResult: 'INCOMPLETE',
      isCurrent: false,
      batteryHealthPercent: 91,
      batteryCycleCount: null,
      batteryReplacementStatus: 'ORIGINAL',
      conditionGrade: 'B',
      cosmeticNotes: null,
      checks: {},
      repairHistoryStatus: 'NONE_KNOWN',
      repairNotes: null,
      replacedParts: null,
      inspectedAt: null,
      createdAt: '2026-08-25T09:00:00.000Z',
      updatedAt: '2026-08-25T09:00:00.000Z',
    } as const;
    const client = {
      PATCH: vi.fn().mockResolvedValue({ data: { data: inspection } }),
      POST: vi.fn().mockResolvedValue({
        data: { data: { ...inspection, status: 'COMPLETED', overallResult: 'PASSED' } },
      }),
    } as unknown as AfterSalesBackofficeApiClient;
    const input = {
      batteryHealthPercent: 91,
      batteryReplacementStatus: 'ORIGINAL' as const,
      conditionGrade: 'B' as const,
      repairHistoryStatus: 'NONE_KNOWN' as const,
      checks: {},
    };

    await updateAfterSalesInspection(client, INSPECTION_ID, input);
    await completeAfterSalesInspection(client, INSPECTION_ID);

    expect(client.PATCH).toHaveBeenCalledWith('/api/v1/backoffice/inspections/{id}', {
      params: { path: { id: INSPECTION_ID } },
      body: input,
    });
    expect(client.POST).toHaveBeenCalledWith('/api/v1/backoffice/inspections/{id}/complete', {
      params: { path: { id: INSPECTION_ID } },
    });
  });

  it('accepts only credential-free HTTP signed URLs', async () => {
    const client = {
      GET: vi.fn().mockResolvedValue({
        data: {
          data: {
            url: 'https://user:password@storage.example/private-file',
            expiresAt: '2026-08-25T09:05:00.000Z',
          },
        },
      }),
    } as unknown as AfterSalesBackofficeApiClient;

    await expect(getBackofficeAfterSalesAttachmentUrl(client, ID, ATTACHMENT_ID)).rejects.toThrow(
      'Phản hồi signed URL không hợp lệ.',
    );

    client.GET = vi.fn().mockResolvedValue({
      data: {
        data: {
          url: 'http://storage.example/private-file',
          expiresAt: '2026-08-25T09:05:00.000Z',
        },
      },
    });
    await expect(getBackofficeAfterSalesAttachmentUrl(client, ID, ATTACHMENT_ID)).rejects.toThrow(
      'Phản hồi signed URL không hợp lệ.',
    );

    client.GET = vi.fn().mockResolvedValue({
      data: {
        data: {
          url: 'http://127.0.0.1:54321/storage/v1/object/sign/private-file',
          expiresAt: '2026-08-25T09:05:00.000Z',
        },
      },
    });
    const signed = await getBackofficeAfterSalesAttachmentUrl(client, ID, ATTACHMENT_ID);
    expect(signed.url).toContain('127.0.0.1');
  });

  it('maps stable state and requirement errors without exposing backend detail', () => {
    expect(
      afterSalesBackofficeError(
        {
          error: {
            code: 'AFTER_SALES_RESOLUTION_REQUIREMENTS_NOT_MET',
            message: 'private database detail',
          },
        },
        'fallback',
      ),
    ).toContain('chưa đủ điều kiện');
    expect(
      afterSalesBackofficeError(
        { error: { code: 'CONCURRENT_MODIFICATION', message: 'private database detail' } },
        'fallback',
      ),
    ).toContain('phiên khác');
  });
});
