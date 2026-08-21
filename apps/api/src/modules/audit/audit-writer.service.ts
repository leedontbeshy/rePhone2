import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuditWriteActorContext, AuditWriteInput } from './audit.types.js';

@Injectable()
export class AuditWriter {
  public write(
    transaction: Prisma.TransactionClient,
    actor: AuditWriteActorContext,
    input: AuditWriteInput,
  ) {
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
        ...(input.changes === undefined ? {} : { changes: input.changes }),
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      },
    });
  }
}
