import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { UpdateStoreSettingsDto } from './settings.dto.js';

describe('UpdateStoreSettingsDto', () => {
  it.each([
    ['defaultShippingFee', '999999999999999'],
    ['shippingDepositAmount', '100000000000000'],
  ] as const)('accepts a 15-digit %s', async (field, value) => {
    const dto = plainToInstance(UpdateStoreSettingsDto, { expectedVersion: 1, [field]: value });

    expect(await validate(dto)).toEqual([]);
  });

  it.each([
    ['defaultShippingFee', '1000000000000000'],
    ['shippingDepositAmount', '1000000000000000'],
  ] as const)('rejects a 16-digit %s', async (field, value) => {
    const dto = plainToInstance(UpdateStoreSettingsDto, { expectedVersion: 1, [field]: value });

    expect(await validate(dto)).not.toEqual([]);
  });
});
