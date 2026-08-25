import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../../common/providers/storage-provider.js';
import { StorageProviderError } from '../../common/providers/supabase-storage.provider.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import type { UpdateStoreSettingsDto } from './settings.dto.js';
import type { PublicStoreDto, StoreSettingsDto } from './settings-response.dto.js';
import { SettingsRepository, type SettingsRecord } from './settings.repository.js';
import { StoreQrImageValidator } from './store-qr-image.validator.js';

const MUTABLE_FIELDS = [
  'storeName',
  'storePhone',
  'storeAddress',
  'defaultShippingFee',
  'shippingDepositAmount',
  'pickupHoldMinutes',
  'depositProofWindowMinutes',
  'depositReviewWindowMinutes',
  'defaultWarrantyDays',
  'defaultWarrantyTerms',
  'bankName',
  'bankAccountNumber',
  'bankAccountHolder',
] as const;

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SettingsRepository) private readonly repository: SettingsRepository,
    @Inject(StoreQrImageValidator) private readonly qrValidator: StoreQrImageValidator,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
  ) {}

  public async getPublicStore(): Promise<PublicStoreDto> {
    const [settings, pickup] = await Promise.all([
      this.repository.find(),
      this.repository.findPickupLocation(),
    ]);
    if (settings === null || pickup === null) throw new ApiError('SERVICE_UNAVAILABLE');
    return {
      storeName: settings.storeName,
      storePhone: settings.storePhone,
      storeAddress: settings.storeAddress,
      currency: settings.currency,
      timezone: settings.timezone,
      pickup: {
        locationName: pickup.name,
        address: settings.storeAddress,
        holdMinutes: settings.pickupHoldMinutes,
      },
    };
  }

  public async getBackoffice(): Promise<StoreSettingsDto> {
    const settings = await this.requireSettings();
    return projectSettings(settings, this.config);
  }

  public async update(
    input: UpdateStoreSettingsDto,
    actor: AuditActorContext,
  ): Promise<StoreSettingsDto> {
    const data = mutableSettingsData(input);
    if (Object.keys(data).length === 0) {
      throw new ApiError('VALIDATION_FAILED', undefined, [
        {
          field: 'body',
          code: 'AT_LEAST_ONE_MUTABLE_FIELD_REQUIRED',
          message: 'AT_LEAST_ONE_MUTABLE_FIELD_REQUIRED',
        },
      ]);
    }
    const updated = await this.prisma.$transaction(async (transaction) => {
      const before = await this.requireSettings(transaction);
      const result = await this.repository.updateIfVersion(
        input.expectedVersion,
        actor.actorUserId,
        data,
        transaction,
      );
      if (result.count !== 1) await throwVersionConflict(this.repository, transaction);
      const after = await this.requireSettings(transaction);
      await this.audit.write(transaction, actor, {
        action: 'settings.updated',
        resourceType: 'StoreSettings',
        resourceId: after.id,
        changes: { before: safeAuditSettings(before), after: safeAuditSettings(after) },
        metadata: { fields: Object.keys(data).sort() },
      });
      return after;
    });
    return projectSettings(updated, this.config);
  }

  public async uploadBankQr(
    expectedVersion: number,
    file: Express.Multer.File | undefined,
    actor: AuditActorContext,
  ): Promise<StoreSettingsDto> {
    const current = await this.requireSettings();
    if (current.version !== expectedVersion) throw settingsVersionError(current.version);
    const image = await this.qrValidator.validate(file);
    const objectPath = `bank-qr/${randomUUID()}.${image.extension}`;
    let stored: { bucket: string; objectPath: string };
    try {
      stored = await this.storage.upload({
        bucket: this.config.storage.storeBucket,
        objectPath,
        bytes: image.bytes,
        mimeType: image.mimeType,
      });
    } catch (error) {
      if (error instanceof StorageProviderError || error instanceof Error) {
        throw new ApiError('STORAGE_UNAVAILABLE');
      }
      throw error;
    }

    try {
      const updated = await this.prisma.$transaction(async (transaction) => {
        const before = await this.requireSettings(transaction);
        const result = await this.repository.updateIfVersion(
          expectedVersion,
          actor.actorUserId,
          { bankQrBucket: stored.bucket, bankQrObjectPath: stored.objectPath },
          transaction,
        );
        if (result.count !== 1) await throwVersionConflict(this.repository, transaction);
        const after = await this.requireSettings(transaction);
        await this.audit.write(transaction, actor, {
          action: 'settings.bank_qr_updated',
          resourceType: 'StoreSettings',
          resourceId: after.id,
          changes: {
            before: { configured: before.bankQrBucket !== null },
            after: { configured: true },
          },
          metadata: { mimeType: image.mimeType, fileSize: image.fileSize },
        });
        return after;
      });
      return projectSettings(updated, this.config);
    } catch (error) {
      await this.deleteBestEffort(stored.bucket, stored.objectPath, actor.requestId);
      throw error;
    }
  }

  private async requireSettings(client?: Prisma.TransactionClient): Promise<SettingsRecord> {
    const settings = await this.repository.find(client);
    if (settings === null) throw new ApiError('SERVICE_UNAVAILABLE');
    return settings;
  }

  private async deleteBestEffort(bucket: string, objectPath: string, requestId: string) {
    try {
      await this.storage.delete(bucket, objectPath);
    } catch {
      this.logger.warn({ event: 'storage_orphan_candidate', requestId, scope: 'store-bank-qr' });
    }
  }
}

function mutableSettingsData(
  input: UpdateStoreSettingsDto,
): Prisma.StoreSettingsUpdateManyMutationInput {
  return Object.fromEntries(
    MUTABLE_FIELDS.flatMap((field) => (input[field] === undefined ? [] : [[field, input[field]]])),
  );
}

async function throwVersionConflict(
  repository: SettingsRepository,
  transaction: Prisma.TransactionClient,
): Promise<never> {
  const current = await repository.find(transaction);
  if (current === null) throw new ApiError('SERVICE_UNAVAILABLE');
  throw settingsVersionError(current.version);
}

function settingsVersionError(version: number): ApiError {
  return new ApiError('SETTINGS_VERSION_CONFLICT', undefined, [
    {
      field: 'expectedVersion',
      code: 'SETTINGS_VERSION_CONFLICT',
      message: 'SETTINGS_VERSION_CONFLICT',
      current: { version },
    },
  ]);
}

function projectSettings(settings: SettingsRecord, config: AppConfig): StoreSettingsDto {
  return {
    storeName: settings.storeName,
    storePhone: settings.storePhone,
    storeAddress: settings.storeAddress,
    currency: settings.currency,
    timezone: settings.timezone,
    defaultShippingFee: settings.defaultShippingFee.toString(),
    shippingDepositAmount: settings.shippingDepositAmount.toString(),
    pickupHoldMinutes: settings.pickupHoldMinutes,
    depositProofWindowMinutes: settings.depositProofWindowMinutes,
    depositReviewWindowMinutes: settings.depositReviewWindowMinutes,
    defaultWarrantyDays: settings.defaultWarrantyDays,
    defaultWarrantyTerms: settings.defaultWarrantyTerms,
    bankName: settings.bankName,
    bankAccountNumber: settings.bankAccountNumber,
    bankAccountHolder: settings.bankAccountHolder,
    bankQrUrl:
      settings.bankQrBucket === null || settings.bankQrObjectPath === null
        ? null
        : publicObjectUrl(config, settings.bankQrBucket, settings.bankQrObjectPath),
    version: settings.version,
    updatedBy: settings.updatedBy,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}

function safeAuditSettings(settings: SettingsRecord) {
  return {
    version: settings.version,
    bankConfigured: settings.bankAccountNumber.trim().length > 0,
    bankAccountSuffix: accountSuffix(settings.bankAccountNumber),
    bankQrConfigured: settings.bankQrBucket !== null,
  };
}

function accountSuffix(value: string): string {
  return value.slice(-4);
}

function publicObjectUrl(config: AppConfig, bucket: string, objectPath: string): string {
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  return `${config.storage.url.replace(/\/$/, '')}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
}
