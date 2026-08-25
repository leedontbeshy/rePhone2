import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { BackofficeAuditLogListQueryDto } from './audit-operations.dto.js';

describe('BackofficeAuditLogListQueryDto', () => {
  it('normalizes pagination and accepts exact or explicit prefix actions', async () => {
    for (const action of ['payment.verified', 'inventory.*', 'inventory.unit.*']) {
      const dto = plainToInstance(BackofficeAuditLogListQueryDto, {
        action: ` ${action} `,
        page: '2',
        pageSize: '50',
      });
      expect(await validate(dto)).toEqual([]);
      expect(dto).toMatchObject({ action, page: 2, pageSize: 50 });
    }
  });

  it('rejects arbitrary wildcards and non-namespaced full-text actions', async () => {
    for (const action of ['verified', '*verified*', 'inventory.*.updated']) {
      const dto = plainToInstance(BackofficeAuditLogListQueryDto, { action });
      expect(await validate(dto)).not.toEqual([]);
    }
  });
});
