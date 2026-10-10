import type { Prisma } from '../../generated/prisma/client.js';
import type { RequestContext } from '../../common/http/request-context.js';

export interface AuditActorContext extends RequestContext {
  actorType?: 'USER';
  actorUserId: string;
}

export type AuditWriteActorContext =
  | AuditActorContext
  | (RequestContext & { actorType: 'API_CLIENT'; actorApiClientId: string; actorUserId?: never })
  | (RequestContext & { actorType: 'GUEST'; actorUserId?: never })
  | (RequestContext & { actorType: 'SYSTEM'; actorUserId?: never });

export interface AuditWriteInput {
  action: string;
  resourceType: string;
  resourceId?: string;
  changes?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}
