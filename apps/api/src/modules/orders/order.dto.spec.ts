import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateCheckoutRequestDto } from './order.dto.js';

const validCheckout = {
  fulfillmentType: 'PICKUP',
  expectedPreviewFingerprint: `v1:${'a'.repeat(64)}`,
  expectedCartUpdatedAt: '2026-09-02T00:00:00.000Z',
  expectedGrandTotal: '1000000',
  expectedDepositRequired: '0',
} as const;

describe('CreateCheckoutRequestDto', () => {
  it.each([undefined, null, '', 'v1:wrong', `v2:${'a'.repeat(64)}`])(
    'rejects an invalid preview fingerprint: %s',
    async (expectedPreviewFingerprint) => {
      const dto = plainToInstance(CreateCheckoutRequestDto, {
        ...validCheckout,
        contact: {
          fullName: 'Khách Test',
          email: 'checkout@example.com',
          phone: '0900000000',
        },
        expectedPreviewFingerprint,
      });

      const errors = await validate(dto);

      expect(errors.some(({ property }) => property === 'expectedPreviewFingerprint')).toBe(true);
    },
  );

  it.each([
    ['missing', undefined],
    ['null', null],
  ])('requires contact when it is %s', async (_case, contact) => {
    const dto = plainToInstance(CreateCheckoutRequestDto, {
      ...validCheckout,
      ...(contact === undefined ? {} : { contact }),
    });

    const errors = await validate(dto);
    const contactError = errors.find(({ property }) => property === 'contact');

    expect(contactError).toBeDefined();
    expect(typeof contactError?.constraints?.['isDefined']).toBe('string');
  });
});
