import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../common/errors/api-error.js';
import { StorageProviderError } from '../../common/providers/supabase-storage.provider.js';
import type { AppConfig } from '../../config/app-config.js';
import type { PrismaService } from '../../database/prisma.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import type { SettingsRepository, SettingsRecord } from './settings.repository.js';
import { SettingsService } from './settings.service.js';

const actor: AuditActorContext = {
  actorUserId: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6701',
  requestId: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6702',
  ipAddress: '127.0.0.1',
};

describe('SettingsService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('projects only public-safe store fields', async () => {
    const fixture = createFixture();
    fixture.repository.find.mockResolvedValue(settingsRecord());
    fixture.repository.findPickupLocation.mockResolvedValue({
      id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6703',
      name: 'Cửa hàng Hồ Chí Minh',
    });

    const result = await fixture.service.getPublicStore();

    expect(result).toEqual({
      storeName: 'rePhone',
      storePhone: '0900000000',
      storeAddress: '123 Demo',
      currency: 'VND',
      timezone: 'Asia/Ho_Chi_Minh',
      pickup: {
        locationName: 'Cửa hàng Hồ Chí Minh',
        address: '123 Demo',
        holdMinutes: 1_440,
      },
    });
    expect(result).not.toHaveProperty('bankAccountNumber');
    expect(result).not.toHaveProperty('version');
  });

  it.each([
    [null, { id: 'location', name: 'Store' }],
    [settingsRecord(), null],
  ])(
    'returns SERVICE_UNAVAILABLE when public store input is incomplete',
    async (settings, pickup) => {
      const fixture = createFixture();
      fixture.repository.find.mockResolvedValue(settings);
      fixture.repository.findPickupLocation.mockResolvedValue(pickup);

      await expect(fixture.service.getPublicStore()).rejects.toMatchObject({
        code: 'SERVICE_UNAVAILABLE',
      });
    },
  );

  it('projects configured backoffice QR data into an encoded public URL', async () => {
    const fixture = createFixture();
    fixture.config.storage.url = 'https://project.supabase.co/';
    fixture.repository.find.mockResolvedValue(
      settingsRecord({
        bankQrBucket: 'store assets',
        bankQrObjectPath: 'bank-qr/demo qr.png',
        updatedBy: {
          id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6799',
          fullName: 'Admin',
        },
      }),
    );

    await expect(fixture.service.getBackoffice()).resolves.toMatchObject({
      bankQrUrl:
        'https://project.supabase.co/storage/v1/object/public/store%20assets/bank-qr/demo%20qr.png',
      updatedBy: { fullName: 'Admin' },
    });
  });

  it('returns SERVICE_UNAVAILABLE when settings are absent', async () => {
    const fixture = createFixture();
    fixture.repository.find.mockResolvedValue(null);

    await expect(fixture.service.getBackoffice()).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('rejects an update with no mutable field', async () => {
    const fixture = createFixture();

    await expect(fixture.service.update({ expectedVersion: 1 }, actor)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(fixture.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('updates settings with compare-and-swap and writes a safe audit delta', async () => {
    const fixture = createFixture();
    const before = settingsRecord();
    const after = settingsRecord({ version: 2, defaultShippingFee: money('45000') });
    fixture.repository.find.mockResolvedValueOnce(before).mockResolvedValueOnce(after);
    fixture.repository.updateIfVersion.mockResolvedValue({ count: 1 });

    const result = await fixture.service.update(
      { expectedVersion: 1, defaultShippingFee: '45000' },
      actor,
    );

    expect(result.version).toBe(2);
    expect(result.defaultShippingFee).toBe('45000');
    expect(fixture.repository.updateIfVersion).toHaveBeenCalledWith(
      1,
      actor.actorUserId,
      { defaultShippingFee: '45000' },
      fixture.transaction,
    );
    expect(fixture.audit.write).toHaveBeenCalledWith(
      fixture.transaction,
      actor,
      expect.objectContaining({
        action: 'settings.updated',
        metadata: { fields: ['defaultShippingFee'] },
      }),
    );
    const auditPayload = JSON.stringify(fixture.audit.write.mock.calls[0]?.[2]);
    expect(auditPayload).toContain('0000');
    expect(auditPayload).not.toContain('REPHONE DEMO');
    expect(auditPayload).not.toContain('Điều khoản demo');
    expect(auditPayload).not.toContain('123 Demo');
    expect(auditPayload).not.toContain('0000000000');
  });

  it('passes every mutable field through CAS and masks bank data in audit', async () => {
    const fixture = createFixture();
    const before = settingsRecord({ bankAccountNumber: '123', bankQrBucket: null });
    const after = settingsRecord({
      version: 2,
      storeName: 'rePhone mới',
      storePhone: '0911111111',
      storeAddress: '456 Demo',
      defaultShippingFee: money('45000'),
      shippingDepositAmount: money('600000'),
      pickupHoldMinutes: 2_000,
      depositProofWindowMinutes: 60,
      depositReviewWindowMinutes: 2_000,
      defaultWarrantyDays: 365,
      defaultWarrantyTerms: 'Điều khoản mới',
      bankName: 'NEW BANK',
      bankAccountNumber: '1234567890',
      bankAccountHolder: 'REPHONE NEW',
      bankQrBucket: 'store-assets',
      bankQrObjectPath: 'bank-qr/existing.png',
    });
    fixture.repository.find.mockResolvedValueOnce(before).mockResolvedValueOnce(after);
    fixture.repository.updateIfVersion.mockResolvedValue({ count: 1 });
    const data = {
      expectedVersion: 1,
      storeName: after.storeName,
      storePhone: after.storePhone,
      storeAddress: after.storeAddress,
      defaultShippingFee: '45000',
      shippingDepositAmount: '600000',
      pickupHoldMinutes: after.pickupHoldMinutes,
      depositProofWindowMinutes: after.depositProofWindowMinutes,
      depositReviewWindowMinutes: after.depositReviewWindowMinutes,
      defaultWarrantyDays: after.defaultWarrantyDays,
      defaultWarrantyTerms: after.defaultWarrantyTerms,
      bankName: after.bankName,
      bankAccountNumber: after.bankAccountNumber,
      bankAccountHolder: after.bankAccountHolder,
    };

    await fixture.service.update(data, actor);

    expect(fixture.repository.updateIfVersion).toHaveBeenCalledWith(
      1,
      actor.actorUserId,
      dataWithoutVersion(data),
      fixture.transaction,
    );
    expect(fixture.audit.write).toHaveBeenCalledWith(
      fixture.transaction,
      actor,
      expect.objectContaining({
        changes: {
          before: {
            version: 1,
            bankConfigured: true,
            bankAccountSuffix: '123',
            bankQrConfigured: false,
          },
          after: {
            version: 2,
            bankConfigured: true,
            bankAccountSuffix: '7890',
            bankQrConfigured: true,
          },
        },
        metadata: {
          fields: [
            'bankAccountHolder',
            'bankAccountNumber',
            'bankName',
            'defaultShippingFee',
            'defaultWarrantyDays',
            'defaultWarrantyTerms',
            'depositProofWindowMinutes',
            'depositReviewWindowMinutes',
            'pickupHoldMinutes',
            'shippingDepositAmount',
            'storeAddress',
            'storeName',
            'storePhone',
          ],
        },
      }),
    );
  });

  it('returns the current version when compare-and-swap loses', async () => {
    const fixture = createFixture();
    fixture.repository.find
      .mockResolvedValueOnce(settingsRecord())
      .mockResolvedValueOnce(settingsRecord({ version: 3 }));
    fixture.repository.updateIfVersion.mockResolvedValue({ count: 0 });

    const error = await fixture.service
      .update({ expectedVersion: 1, storeName: 'rePhone mới' }, actor)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'SETTINGS_VERSION_CONFLICT',
      details: [expect.objectContaining({ current: { version: 3 } })],
    });
    expect(fixture.audit.write).not.toHaveBeenCalled();
  });

  it('returns SERVICE_UNAVAILABLE when the CAS conflict cannot reload settings', async () => {
    const fixture = createFixture();
    fixture.repository.find.mockResolvedValueOnce(settingsRecord()).mockResolvedValueOnce(null);
    fixture.repository.updateIfVersion.mockResolvedValue({ count: 0 });

    await expect(
      fixture.service.update({ expectedVersion: 1, storeName: 'rePhone mới' }, actor),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('rejects a stale QR version before parsing or uploading bytes', async () => {
    const fixture = createFixture();
    fixture.repository.find.mockResolvedValue(settingsRecord({ version: 2 }));

    await expect(fixture.service.uploadBankQr(1, file(), actor)).rejects.toMatchObject({
      code: 'SETTINGS_VERSION_CONFLICT',
      details: [expect.objectContaining({ current: { version: 2 } })],
    });
    expect(fixture.qrValidator.validate).not.toHaveBeenCalled();
    expect(fixture.storage.upload).not.toHaveBeenCalled();
  });

  it.each([new StorageProviderError('upload'), new Error('provider unavailable')])(
    'maps a storage provider failure to STORAGE_UNAVAILABLE',
    async (failure) => {
      const fixture = createFixture();
      fixture.repository.find.mockResolvedValue(settingsRecord());
      fixture.qrValidator.validate.mockResolvedValue(validatedImage());
      fixture.storage.upload.mockRejectedValue(failure);

      await expect(fixture.service.uploadBankQr(1, file(), actor)).rejects.toMatchObject({
        code: 'STORAGE_UNAVAILABLE',
      });
      expect(fixture.prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('does not hide a non-Error storage failure', async () => {
    const fixture = createFixture();
    const failure = { provider: 'unknown-failure' };
    fixture.repository.find.mockResolvedValue(settingsRecord());
    fixture.qrValidator.validate.mockResolvedValue(validatedImage());
    fixture.storage.upload.mockRejectedValue(failure);

    await expect(fixture.service.uploadBankQr(1, file(), actor)).rejects.toBe(failure);
  });

  it('attaches a validated bank QR with CAS and audits metadata', async () => {
    const fixture = createFixture();
    const before = settingsRecord();
    const after = settingsRecord({
      version: 2,
      bankQrBucket: 'rephone-store-assets',
      bankQrObjectPath: 'bank-qr/new.png',
    });
    fixture.repository.find
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);
    fixture.qrValidator.validate.mockResolvedValue(validatedImage());
    fixture.storage.upload.mockResolvedValue({
      bucket: 'rephone-store-assets',
      objectPath: 'bank-qr/new.png',
      mimeType: 'image/png',
      fileSize: 1,
    });
    fixture.repository.updateIfVersion.mockResolvedValue({ count: 1 });

    const result = await fixture.service.uploadBankQr(1, file(), actor);

    expect(result).toMatchObject({
      version: 2,
      bankQrUrl:
        'https://project.supabase.co/storage/v1/object/public/rephone-store-assets/bank-qr/new.png',
    });
    expect(fixture.repository.updateIfVersion).toHaveBeenCalledWith(
      1,
      actor.actorUserId,
      {
        bankQrBucket: 'rephone-store-assets',
        bankQrObjectPath: 'bank-qr/new.png',
      },
      fixture.transaction,
    );
    expect(fixture.audit.write).toHaveBeenCalledWith(
      fixture.transaction,
      actor,
      expect.objectContaining({
        action: 'settings.bank_qr_updated',
        metadata: { mimeType: 'image/png', fileSize: 1 },
      }),
    );
    expect(fixture.storage.delete).not.toHaveBeenCalled();
  });

  it('deletes the previous QR object after its replacement commits', async () => {
    const fixture = createFixture();
    const before = settingsRecord({
      bankQrBucket: 'rephone-store-assets',
      bankQrObjectPath: 'bank-qr/previous.png',
    });
    const after = settingsRecord({
      version: 2,
      bankQrBucket: 'rephone-store-assets',
      bankQrObjectPath: 'bank-qr/new.png',
    });
    fixture.repository.find
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);
    fixture.qrValidator.validate.mockResolvedValue(validatedImage());
    fixture.storage.upload.mockResolvedValue({
      bucket: 'rephone-store-assets',
      objectPath: 'bank-qr/new.png',
      mimeType: 'image/png',
      fileSize: 1,
    });
    fixture.repository.updateIfVersion.mockResolvedValue({ count: 1 });

    await expect(fixture.service.uploadBankQr(1, file(), actor)).resolves.toMatchObject({
      version: 2,
      bankQrUrl:
        'https://project.supabase.co/storage/v1/object/public/rephone-store-assets/bank-qr/new.png',
    });
    expect(fixture.storage.delete).toHaveBeenCalledTimes(1);
    expect(fixture.storage.delete).toHaveBeenCalledWith(
      'rephone-store-assets',
      'bank-qr/previous.png',
    );
  });

  it('keeps committed QR settings when deleting the previous object fails', async () => {
    const fixture = createFixture();
    const logger = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const before = settingsRecord({
      bankQrBucket: 'rephone-store-assets',
      bankQrObjectPath: 'bank-qr/previous.png',
    });
    const after = settingsRecord({
      version: 2,
      bankQrBucket: 'rephone-store-assets',
      bankQrObjectPath: 'bank-qr/new.png',
    });
    fixture.repository.find
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);
    fixture.qrValidator.validate.mockResolvedValue(validatedImage());
    fixture.storage.upload.mockResolvedValue({
      bucket: 'rephone-store-assets',
      objectPath: 'bank-qr/new.png',
      mimeType: 'image/png',
      fileSize: 1,
    });
    fixture.storage.delete.mockRejectedValue(new Error('cleanup unavailable'));
    fixture.repository.updateIfVersion.mockResolvedValue({ count: 1 });

    await expect(fixture.service.uploadBankQr(1, file(), actor)).resolves.toMatchObject({
      version: 2,
      bankQrUrl:
        'https://project.supabase.co/storage/v1/object/public/rephone-store-assets/bank-qr/new.png',
    });
    expect(logger).toHaveBeenCalledWith({
      event: 'storage_orphan_candidate',
      requestId: actor.requestId,
      scope: 'store-bank-qr',
    });
    expect(JSON.stringify(logger.mock.calls)).not.toContain('bank-qr/previous.png');
  });

  it('never deletes the active QR object when the previous and uploaded paths match', async () => {
    const fixture = createFixture();
    const before = settingsRecord({
      bankQrBucket: 'rephone-store-assets',
      bankQrObjectPath: 'bank-qr/current.png',
    });
    const after = settingsRecord({
      version: 2,
      bankQrBucket: 'rephone-store-assets',
      bankQrObjectPath: 'bank-qr/current.png',
    });
    fixture.repository.find
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);
    fixture.qrValidator.validate.mockResolvedValue(validatedImage());
    fixture.storage.upload.mockResolvedValue({
      bucket: 'rephone-store-assets',
      objectPath: 'bank-qr/current.png',
      mimeType: 'image/png',
      fileSize: 1,
    });
    fixture.repository.updateIfVersion.mockResolvedValue({ count: 1 });

    await expect(fixture.service.uploadBankQr(1, file(), actor)).resolves.toMatchObject({
      version: 2,
    });
    expect(fixture.storage.delete).not.toHaveBeenCalled();
  });

  it('cleans the uploaded QR object when the database attach loses', async () => {
    const fixture = createFixture();
    fixture.repository.find
      .mockResolvedValueOnce(settingsRecord())
      .mockResolvedValueOnce(settingsRecord())
      .mockResolvedValueOnce(settingsRecord({ version: 2 }));
    fixture.repository.updateIfVersion.mockResolvedValue({ count: 0 });
    fixture.qrValidator.validate.mockResolvedValue({
      bytes: new Uint8Array([1]),
      mimeType: 'image/png',
      extension: 'png',
      fileSize: 1,
    });
    fixture.storage.upload.mockResolvedValue({
      bucket: 'rephone-store-assets',
      objectPath: 'bank-qr/new.png',
      mimeType: 'image/png',
      fileSize: 1,
    });

    await expect(fixture.service.uploadBankQr(1, file(), actor)).rejects.toMatchObject({
      code: 'SETTINGS_VERSION_CONFLICT',
    });
    expect(fixture.storage.delete).toHaveBeenCalledWith('rephone-store-assets', 'bank-qr/new.png');
  });

  it('logs an orphan candidate without replacing the database error when cleanup fails', async () => {
    const fixture = createFixture();
    const logger = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    fixture.repository.find
      .mockResolvedValueOnce(settingsRecord())
      .mockResolvedValueOnce(settingsRecord())
      .mockResolvedValueOnce(settingsRecord({ version: 2 }));
    fixture.repository.updateIfVersion.mockResolvedValue({ count: 0 });
    fixture.qrValidator.validate.mockResolvedValue(validatedImage());
    fixture.storage.upload.mockResolvedValue({
      bucket: 'rephone-store-assets',
      objectPath: 'bank-qr/orphan.png',
      mimeType: 'image/png',
      fileSize: 1,
    });
    fixture.storage.delete.mockRejectedValue(new Error('cleanup unavailable'));

    await expect(fixture.service.uploadBankQr(1, file(), actor)).rejects.toMatchObject({
      code: 'SETTINGS_VERSION_CONFLICT',
    });
    expect(logger).toHaveBeenCalledWith({
      event: 'storage_orphan_candidate',
      requestId: actor.requestId,
      scope: 'store-bank-qr',
    });
  });
});

function createFixture() {
  const transaction = {};
  const prisma = {
    $transaction: vi.fn(async (callback: (client: object) => Promise<unknown>) =>
      callback(transaction),
    ),
  };
  const repository = {
    find: vi.fn(),
    findPickupLocation: vi.fn(),
    updateIfVersion: vi.fn(),
  };
  const qrValidator = { validate: vi.fn() };
  const storage = {
    upload: vi.fn(),
    delete: vi.fn(),
    createSignedReadUrl: vi.fn(),
  };
  const audit = { write: vi.fn() };
  const config = {
    storage: {
      url: 'https://project.supabase.co',
      storeBucket: 'rephone-store-assets',
    },
  } as AppConfig;
  return {
    transaction,
    prisma,
    repository,
    qrValidator,
    storage,
    audit,
    config,
    service: new SettingsService(
      prisma as unknown as PrismaService,
      repository as unknown as SettingsRepository,
      qrValidator,
      storage,
      config,
      audit,
    ),
  };
}

function validatedImage() {
  return {
    bytes: new Uint8Array([1]),
    mimeType: 'image/png',
    extension: 'png',
    fileSize: 1,
  };
}

function dataWithoutVersion<T extends { expectedVersion: number }>(
  input: T,
): Omit<T, 'expectedVersion'> {
  const { expectedVersion: _expectedVersion, ...data } = input;
  void _expectedVersion;
  return data;
}

function settingsRecord(overrides: Partial<SettingsRecord> = {}): SettingsRecord {
  return {
    id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6704',
    key: 'STORE',
    storeName: 'rePhone',
    storePhone: '0900000000',
    storeAddress: '123 Demo',
    currency: 'VND',
    timezone: 'Asia/Ho_Chi_Minh',
    defaultShippingFee: money('30000'),
    shippingDepositAmount: money('500000'),
    pickupHoldMinutes: 1_440,
    depositProofWindowMinutes: 30,
    depositReviewWindowMinutes: 1_440,
    defaultWarrantyDays: 90,
    defaultWarrantyTerms: 'Điều khoản demo',
    bankName: 'DEMO BANK',
    bankAccountNumber: '0000000000',
    bankAccountHolder: 'REPHONE DEMO',
    bankQrBucket: null,
    bankQrObjectPath: null,
    version: 1,
    updatedById: null,
    updatedBy: null,
    createdAt: new Date('2026-08-25T00:00:00.000Z'),
    updatedAt: new Date('2026-08-25T00:00:00.000Z'),
    ...overrides,
  };
}

function money(value: string): SettingsRecord['defaultShippingFee'] {
  return { toString: () => value } as SettingsRecord['defaultShippingFee'];
}

function file(): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'qr.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: 1,
    destination: '',
    filename: '',
    path: '',
    buffer: Buffer.from([1]),
    stream: undefined as never,
  };
}
