import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import { WarrantyPolicyCatalogReferenceGateway } from '../backoffice-catalog/warranty-policy-catalog-reference.gateway.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import type { CreateWarrantyPolicyDto, UpdateWarrantyPolicyDto } from './warranty.dto.js';
import type { WarrantyPolicyDto } from './warranty-response.dto.js';
import { WarrantyClock } from './warranty-clock.service.js';
import {
  WarrantyOperationsRepository,
  type WarrantyPolicyRecord,
} from './warranty-operations.repository.js';
import { WarrantyTransactionGateway } from './warranty-transaction.gateway.js';
import { projectBackofficeWarrantyDetail, projectWarrantyPolicy } from './warranty.projector.js';

@Injectable()
export class WarrantyCommandService {
  public constructor(
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(WarrantyOperationsRepository)
    private readonly repository: WarrantyOperationsRepository,
    @Inject(WarrantyTransactionGateway)
    private readonly warranties: WarrantyTransactionGateway,
    @Inject(WarrantyPolicyCatalogReferenceGateway)
    private readonly catalogReferences: WarrantyPolicyCatalogReferenceGateway,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(WarrantyClock) private readonly clock: WarrantyClock,
  ) {}

  public async createPolicy(
    input: CreateWarrantyPolicyDto,
    actor: AuditActorContext,
  ): Promise<WarrantyPolicyDto> {
    try {
      const created = await this.transactions.run('warranty_policy.create', async (transaction) => {
        const policy = await this.repository.createPolicy(
          {
            code: input.code,
            name: input.name,
            defaultDays: input.defaultDays,
            terms: input.terms,
            status: 'INACTIVE',
          },
          transaction,
        );
        await this.audit.write(transaction, actor, {
          action: 'warranty_policy.created',
          resourceType: 'WarrantyPolicy',
          resourceId: policy.id,
          changes: { after: auditPolicy(policy) },
        });
        return policy;
      });
      return projectWarrantyPolicy(created);
    } catch (error) {
      mapUniqueError(error);
    }
  }

  public async updatePolicy(
    id: string,
    input: UpdateWarrantyPolicyDto,
    actor: AuditActorContext,
  ): Promise<WarrantyPolicyDto> {
    if (Object.values(input).every((value) => value === undefined)) {
      throw new ApiError('VALIDATION_FAILED');
    }
    const updated = await this.transactions.run('warranty_policy.update', async (transaction) => {
      const existing = await this.warranties.lockPolicy(id, transaction);
      if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (existing.archivedAt !== null) throw new ApiError('INVALID_STATE_TRANSITION');
      const policy = await this.repository.updatePolicy(
        id,
        {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.defaultDays === undefined ? {} : { defaultDays: input.defaultDays }),
          ...(input.terms === undefined ? {} : { terms: input.terms }),
        },
        transaction,
      );
      await this.audit.write(transaction, actor, {
        action: 'warranty_policy.updated',
        resourceType: 'WarrantyPolicy',
        resourceId: id,
        changes: { before: auditPolicy(existing), after: auditPolicy(policy) },
      });
      return policy;
    });
    return projectWarrantyPolicy(updated);
  }

  public activatePolicy(id: string, actor: AuditActorContext): Promise<WarrantyPolicyDto> {
    return this.transitionPolicy(id, 'ACTIVE', 'warranty_policy.activated', actor);
  }

  public deactivatePolicy(
    id: string,
    reason: string,
    actor: AuditActorContext,
  ): Promise<WarrantyPolicyDto> {
    return this.transitionPolicy(id, 'INACTIVE', 'warranty_policy.deactivated', actor, reason);
  }

  public async archivePolicy(
    id: string,
    reason: string,
    actor: AuditActorContext,
  ): Promise<WarrantyPolicyDto> {
    const now = this.clock.now();
    const archived = await this.transactions.run('warranty_policy.archive', async (transaction) => {
      const existing = await this.warranties.lockPolicy(id, transaction);
      if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (existing.archivedAt !== null) return existing;
      if (await this.catalogReferences.hasActiveReferences(id, transaction)) {
        throw new ApiError('INVALID_STATE_TRANSITION');
      }
      const policy = await this.repository.updatePolicy(
        id,
        { status: 'INACTIVE', archivedAt: now },
        transaction,
      );
      await this.audit.write(transaction, actor, {
        action: 'warranty_policy.archived',
        resourceType: 'WarrantyPolicy',
        resourceId: id,
        changes: { before: auditPolicy(existing), after: auditPolicy(policy) },
        metadata: { reason },
      });
      return policy;
    });
    return projectWarrantyPolicy(archived);
  }

  public async voidWarranty(id: string, reason: string, actor: AuditActorContext) {
    const now = this.clock.now();
    const warranty = await this.transactions.run('warranty.void', async (transaction) => {
      const existing = await this.warranties.lockById(id, transaction);
      if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (existing.status === 'VOIDED') {
        if (existing.voidedById !== actor.actorUserId || existing.voidReason !== reason) {
          throw new ApiError('INVALID_STATE_TRANSITION');
        }
      } else {
        await this.warranties.voidActive(
          { id, reason, actorUserId: actor.actorUserId, now },
          transaction,
        );
        await this.audit.write(transaction, actor, {
          action: 'warranty.voided',
          resourceType: 'Warranty',
          resourceId: id,
          changes: { before: { status: 'ACTIVE' }, after: { status: 'VOIDED' } },
          metadata: { reason },
        });
      }
      return this.repository.findById(id, transaction);
    });
    if (warranty === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return projectBackofficeWarrantyDetail(warranty, now, 'ADMIN');
  }

  private async transitionPolicy(
    id: string,
    status: 'ACTIVE' | 'INACTIVE',
    action: string,
    actor: AuditActorContext,
    reason?: string,
  ): Promise<WarrantyPolicyDto> {
    const updated = await this.transactions.run(action, async (transaction) => {
      const existing = await this.warranties.lockPolicy(id, transaction);
      if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (existing.archivedAt !== null) throw new ApiError('INVALID_STATE_TRANSITION');
      if (existing.status === status) return existing;
      const policy = await this.repository.updatePolicy(id, { status }, transaction);
      await this.audit.write(transaction, actor, {
        action,
        resourceType: 'WarrantyPolicy',
        resourceId: id,
        changes: { before: { status: existing.status }, after: { status } },
        ...(reason === undefined ? {} : { metadata: { reason } }),
      });
      return policy;
    });
    return projectWarrantyPolicy(updated);
  }
}

function auditPolicy(policy: WarrantyPolicyRecord) {
  return {
    code: policy.code,
    name: policy.name,
    defaultDays: policy.defaultDays,
    status: policy.status,
    archivedAt: policy.archivedAt?.toISOString() ?? null,
  };
}

function mapUniqueError(error: unknown): never {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  ) {
    throw new ApiError('DUPLICATE_RESOURCE');
  }
  throw error;
}
