import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { createValidationError } from '../../common/http/validation.js';
import { DealerApplicationDto } from './dealer.dto.js';

const application = {
  legalName: 'Cửa hàng thử nghiệm',
  businessType: 'HOUSEHOLD',
  representativeName: 'Người thử nghiệm',
  businessAddress: 'Địa chỉ thử nghiệm',
  contactEmail: 'dealer@example.test',
  contactPhone: '0900000000',
  displayName: 'Cửa hàng thử nghiệm',
  approvedDomains: ['example.test'],
  termsVersion: 'dealer-v1.0',
};
describe('Dealer application validation feedback', () => {
  it('identifies a seven-character tax code without rejecting the other valid fields', async () => {
    const errors = await validate(
      plainToInstance(DealerApplicationDto, { ...application, taxCode: '3123112' }),
    );
    expect(createValidationError(errors).details).toEqual([
      {
        field: 'taxCode',
        code: 'MATCHES',
        message: 'Mã số thuế phải có từ 8 đến 20 ký tự, chỉ gồm chữ số và dấu gạch ngang.',
      },
    ]);
  });
  it('trims whitespace before validating the existing tax-code format', async () => {
    expect(
      await validate(
        plainToInstance(DealerApplicationDto, { ...application, taxCode: ' 0123456789 ' }),
      ),
    ).toEqual([]);
  });
});
