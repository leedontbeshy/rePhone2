import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { UpdateInspectionDto } from './inventory.dto.js';

describe('UpdateInspectionDto', () => {
  it('accepts null notes so an existing note can be cleared', async () => {
    const dto = plainToInstance(UpdateInspectionDto, {
      cosmeticNotes: null,
      repairNotes: null,
    });

    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({ cosmeticNotes: null, repairNotes: null });
  });

  it('trims note content and enforces the 2,000-character limit', async () => {
    const dto = plainToInstance(UpdateInspectionDto, {
      cosmeticNotes: '  Trầy nhẹ ở cạnh máy  ',
      repairNotes: 'x'.repeat(2_001),
    });

    const errors = await validate(dto);
    expect(dto.cosmeticNotes).toBe('Trầy nhẹ ở cạnh máy');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('repairNotes');
    expect(errors[0]?.constraints).toHaveProperty('maxLength');
  });
});
