import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../common/errors/api-error.js';
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
      expect.objectContaining({ action: 'settings.updated' }),
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
