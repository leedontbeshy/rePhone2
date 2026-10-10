import { describe, expect, it, vi } from 'vitest';
import { DealerApiError, dealerApi } from './dealer-api';

describe('Dealer form errors', () => {
  it('preserves the invalid tax-code field and explanation returned by the API', async () => {
    const client = {
      POST: vi.fn().mockResolvedValue({
        error: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Dữ liệu yêu cầu không hợp lệ.',
            details: [
              {
                field: 'taxCode',
                code: 'MATCHES',
                message: 'Mã số thuế phải có từ 8 đến 20 ký tự, chỉ gồm chữ số và dấu gạch ngang.',
              },
            ],
          },
        },
      }),
    };
    await expect(
      dealerApi(client).post('dealer-portal/application', { taxCode: '3123112' }),
    ).rejects.toMatchObject({
      name: 'DealerApiError',
      code: 'VALIDATION_FAILED',
      details: [
        {
          field: 'taxCode',
          message: 'Mã số thuế phải có từ 8 đến 20 ký tự, chỉ gồm chữ số và dấu gạch ngang.',
        },
      ],
    });
  });

  it('keeps actionable business errors even when there are no field details', async () => {
    const client = {
      POST: vi.fn().mockResolvedValue({
        error: {
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Cổng đại lý đang tạm ngừng nhận hồ sơ mới.',
          },
        },
      }),
    };
    await expect(dealerApi(client).post('dealer-portal/application', {})).rejects.toEqual(
      new DealerApiError('Cổng đại lý đang tạm ngừng nhận hồ sơ mới.', 'SERVICE_UNAVAILABLE', []),
    );
  });
});
