import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuditWriteActorContext, AuditWriteInput } from './audit.types.js';
import { toAuditInputJson } from './audit-sanitizer.js';

@Injectable()
export class AuditWriter {
  public write(
    transaction: Prisma.TransactionClient,
    actor: AuditWriteActorContext,
    input: AuditWriteInput,
  ) {
    const changes = toAuditInputJson(input.changes);
    const metadata = toAuditInputJson(input.metadata);
    return transaction.auditLog.create({
      data: {
        actorType: actor.actorType ?? 'USER',
        actorUserId:
          actor.actorType === 'GUEST' || actor.actorType === 'SYSTEM' ? null : actor.actorUserId,
        action: input.action,
        resourceType: input.resourceType,
        requestId: actor.requestId,
        ipAddress: actor.ipAddress,
        ...(actor.userAgent === undefined ? {} : { userAgent: actor.userAgent }),
        ...(input.resourceId === undefined ? {} : { resourceId: input.resourceId }),
        ...(changes === undefined ? {} : { changes }),
        ...(metadata === undefined ? {} : { metadata }),
      },
    });
  }
}
