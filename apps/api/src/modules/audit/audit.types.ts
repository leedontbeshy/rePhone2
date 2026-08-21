import type { Prisma } from '../../generated/prisma/client.js';
import type { RequestContext } from '../../common/http/request-context.js';

export interface AuditActorContext extends RequestContext {
  actorUserId: string;
}

export interface AuditWriteInput {
  action: string;
  resourceType: string;
  resourceId?: string;
  changes?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}
