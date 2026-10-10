import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { ApiError } from '../../common/errors/api-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import { allowsDealerWebhook } from '../dealer-core/dealer-access.policy.js';
import { DealerProfileService } from './dealer-profile.service.js';
import { DealerRuntime } from './dealer-runtime.service.js';
import { DealerPaymentService } from './dealer-payment.service.js';
import {
  parseWebhookUrl,
  resolveWebhookTarget,
  sendDealerWebhook,
} from './dealer-webhook.transport.js';
import type { DealerWebhookDto } from './dealer.dto.js';

@Injectable()
export class DealerWebhookService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(DealerWebhookService.name);
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(DealerRuntime) private readonly runtime: DealerRuntime,
    @Inject(DealerProfileService) private readonly profiles: DealerProfileService,
    @Inject(DealerPaymentService) private readonly payments: DealerPaymentService,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
  ) {}

  public onModuleInit(): void {
    if (
      !this.runtime.enabled ||
      process.env['NODE_ENV'] === 'test' ||
      process.env['DEALER_WORKER_ENABLED'] === 'false'
    )
      return;
    this.timer = setInterval(() => {
      void this.tick().catch(() => {
        this.logger.error({ event: 'dealer.worker.failed' });
      });
    }, 15_000);
    this.timer.unref();
  }
  public onModuleDestroy(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  public async configure(input: DealerWebhookDto, actor: AuditActorContext) {
    await this.profiles.reauthenticate(actor.actorUserId, input.currentPassword);
    const target = await resolveWebhookTarget(input.url);
    const secret = randomBytes(32).toString('base64url');
    const saved = await this.transactions.run('dealer.webhook.configure', async (tx) => {
      const dealer = await this.profiles.requireOwner(tx, actor.actorUserId);
      if (
        dealer.businessStatus !== 'ACTIVE' ||
        !dealer.approvedDomains.includes(target.url.hostname)
      )
        throw new ApiError('FORBIDDEN', 'Webhook phải thuộc tên miền đã được duyệt.');
      const prior = await tx.dealerWebhookEndpoint.findFirst({
        where: { dealerId: dealer.id },
        orderBy: { createdAt: 'desc' },
      });
      const data = {
        url: target.url.toString(),
        secretCiphertext: this.runtime.encrypt(secret),
        keyId: randomUUID(),
        enabled: true,
      };
      const endpoint =
        prior === null
          ? await tx.dealerWebhookEndpoint.create({ data: { dealerId: dealer.id, ...data } })
          : await tx.dealerWebhookEndpoint.update({
              where: { id: prior.id },
              data: {
                ...data,
                previousSecretCiphertext: prior.url === data.url ? prior.secretCiphertext : null,
                previousKeyId: prior.url === data.url ? prior.keyId : null,
                previousValidUntil:
                  prior.url === data.url ? new Date(Date.now() + 86400_000) : null,
              },
            });
      await this.audit.write(tx, actor, {
        action: 'dealer.webhook.configured',
        resourceType: 'DealerWebhookEndpoint',
        resourceId: endpoint.id,
      });
      return endpoint;
    });
    return {
      id: saved.id,
      url: saved.url,
      keyId: saved.keyId,
      secret,
      previousValidUntil: saved.previousValidUntil?.toISOString() ?? null,
    };
  }

  public async history(userId: string) {
    const dealer = await this.profiles.own(userId);
    if (dealer === null) throw new ApiError('RESOURCE_NOT_FOUND');
    const endpoints = await this.prisma.dealerWebhookEndpoint.findMany({
      where: { dealerId: dealer.id },
      include: { deliveries: { include: { event: true }, orderBy: { dueAt: 'desc' }, take: 50 } },
    });
    return endpoints.map((endpoint) => ({
      id: endpoint.id,
      url: endpoint.url,
      enabled: endpoint.enabled,
      keyId: endpoint.keyId,
      deliveries: endpoint.deliveries.map((delivery) => ({
        id: delivery.id,
        eventId: delivery.eventId,
        status: delivery.status,
        attempts: delivery.attempts,
        lastStatusCode: delivery.lastStatusCode,
        lastError: delivery.lastError,
        dueAt: delivery.dueAt.toISOString(),
        payload: eventPayload(delivery.event, this.runtime.mode),
      })),
    }));
  }

  public async replay(id: string, actor: AuditActorContext) {
    await this.transactions.run('dealer.webhook.replay', async (tx) => {
      const dealer = await this.profiles.requireOwner(tx, actor.actorUserId);
      const delivery = await tx.dealerWebhookDelivery.findFirst({
        where: { id, endpoint: { dealerId: dealer.id } },
      });
      if (delivery === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (delivery.leaseUntil !== null && delivery.leaseUntil > new Date())
        throw new ApiError('CONCURRENT_MODIFICATION');
      await tx.dealerWebhookDelivery.update({
        where: { id },
        data: {
          status: 'PENDING',
          attempts: 0,
          dueAt: new Date(),
          leaseUntil: null,
          leaseToken: null,
        },
      });
      await this.audit.write(tx, actor, {
        action: 'dealer.webhook.replayed',
        resourceType: 'DealerWebhookDelivery',
        resourceId: id,
      });
    });
    return { id, queued: true };
  }

  public async test(actor: AuditActorContext) {
    return this.transactions.run('dealer.webhook.test', async (tx) => {
      const dealer = await this.profiles.requireOwner(tx, actor.actorUserId);
      const event = await tx.dealerOutboxEvent.create({
        data: {
          dealerId: dealer.id,
          eventType: 'webhook.test',
          resourceType: 'test',
          resourceId: randomUUID(),
          resourceVersion: 1,
          data: { environment: this.runtime.mode },
        },
      });
      return { eventId: event.id, queued: true };
    });
  }

  public async disable(id: string, actor: AuditActorContext) {
    return this.transactions.run('dealer.webhook.disable', async (tx) => {
      const dealer = await this.profiles.requireOwner(tx, actor.actorUserId);
      const updated = await tx.dealerWebhookEndpoint.updateMany({
        where: { id, dealerId: dealer.id },
        data: { enabled: false },
      });
      if (updated.count !== 1) throw new ApiError('RESOURCE_NOT_FOUND');
      await this.audit.write(tx, actor, {
        action: 'dealer.webhook.disabled',
        resourceType: 'DealerWebhookEndpoint',
        resourceId: id,
      });
      return { id, enabled: false };
    });
  }

  public async tick(): Promise<void> {
    if (!this.runtime.enabled || this.running) return;
    this.running = true;
    try {
      await this.payments.expireDue();
      await this.prisma.dealerRateLimit.deleteMany({
        where: { windowStart: { lt: new Date(Date.now() - 3600_000) } },
      });
      const events = await this.prisma.dealerOutboxEvent.findMany({
        where: { expandedAt: null },
        orderBy: { occurredAt: 'asc' },
        take: 100,
      });
      for (const event of events)
        await this.transactions.run('dealer.outbox.expand', async (tx) => {
          await tx.$queryRaw`SELECT id FROM dealer_outbox_events WHERE id=${event.id}::uuid FOR UPDATE`;
          const current = await tx.dealerOutboxEvent.findUnique({ where: { id: event.id } });
          if (current === null || current.expandedAt !== null) return;
          const endpoints = await tx.dealerWebhookEndpoint.findMany({
            where: { dealerId: event.dealerId, enabled: true },
          });
          for (const endpoint of endpoints)
            await tx.dealerWebhookDelivery.create({
              data: { eventId: event.id, endpointId: endpoint.id, dueAt: new Date() },
            });
          await tx.dealerOutboxEvent.update({
            where: { id: event.id },
            data: { expandedAt: new Date() },
          });
        });
      // Bounded batch; lease and optimistic token prevent two workers from owning the same attempt.
      const candidates = await this.prisma.dealerWebhookDelivery.findMany({
        where: {
          status: 'PENDING',
          dueAt: { lte: new Date() },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        select: { id: true },
        take: 4,
        orderBy: { dueAt: 'asc' },
      });
      await Promise.all(candidates.map(({ id }) => this.deliver(id)));
    } finally {
      this.running = false;
    }
  }

  private async deliver(id: string) {
    const token = randomUUID();
    const now = new Date();
    const claimed = await this.transactions.run('dealer.webhook.claim', async (tx) => {
      const candidate = await tx.dealerWebhookDelivery.findUnique({
        where: { id },
        select: { endpointId: true },
      });
      if (candidate === null) return { count: 0 };
      await tx.$queryRaw`SELECT id FROM dealer_webhook_endpoints WHERE id=${candidate.endpointId}::uuid FOR UPDATE`;
      const active = await tx.dealerWebhookDelivery.count({
        where: { endpointId: candidate.endpointId, id: { not: id }, leaseUntil: { gt: now } },
      });
      if (active > 0) return { count: 0 };
      return tx.dealerWebhookDelivery.updateMany({
        where: {
          id,
          status: 'PENDING',
          dueAt: { lte: now },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        data: { leaseToken: token, leaseUntil: new Date(now.getTime() + 60_000) },
      });
    });
    if (claimed.count !== 1) return;
    const delivery = await this.prisma.dealerWebhookDelivery.findUnique({
      where: { id },
      include: { event: true, endpoint: { include: { dealer: true } } },
    });
    if (delivery === null) return;
    const endpoint = delivery.endpoint;
    if (
      !endpoint.enabled ||
      !allowsDealerWebhook(
        endpoint.dealer,
        delivery.event.resourceType === 'catalog' ? 'CATALOG' : 'EXISTING_ORDER',
      )
    ) {
      await this.prisma.dealerWebhookDelivery.updateMany({
        where: { id, leaseToken: token },
        data: {
          status: 'SUPPRESSED',
          leaseUntil: null,
          leaseToken: null,
          lastError: 'Access unavailable',
        },
      });
      return;
    }
    let status: number | null = null;
    let error: string | null = null;
    try {
      if (!endpoint.dealer.approvedDomains.includes(parseWebhookUrl(endpoint.url).hostname))
        throw new Error('Domain no longer approved');
      const body = JSON.stringify(eventPayload(delivery.event, this.runtime.mode));
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const sign = (secret: string) =>
        createHmac('sha256', this.runtime.decrypt(secret))
          .update(`${timestamp}.${body}`)
          .digest('hex');
      const signatures = [`${endpoint.keyId}:${sign(endpoint.secretCiphertext)}`];
      if (
        endpoint.previousSecretCiphertext !== null &&
        endpoint.previousKeyId !== null &&
        endpoint.previousValidUntil !== null &&
        endpoint.previousValidUntil > new Date()
      )
        signatures.push(`${endpoint.previousKeyId}:${sign(endpoint.previousSecretCiphertext)}`);
      status = await sendDealerWebhook(endpoint.url, body, {
        'X-Rephone-Event-Id': delivery.eventId,
        'X-Rephone-Timestamp': timestamp,
        'X-Rephone-Signature': signatures.join(','),
        'User-Agent': 'rePhone-Webhook/1.0',
      });
      if (status < 200 || status >= 300) error = `HTTP ${status.toString()}`;
    } catch {
      error = 'Endpoint unavailable or rejected by network policy';
    }
    const attempts = delivery.attempts + 1;
    await this.prisma.dealerWebhookDelivery.updateMany({
      where: { id, leaseToken: token },
      data: {
        attempts,
        status: error === null ? 'DELIVERED' : attempts >= 7 ? 'FAILED' : 'PENDING',
        lastStatusCode: status,
        lastError: error,
        deliveredAt: error === null ? new Date() : null,
        leaseUntil: null,
        leaseToken: null,
        dueAt: new Date(
          Date.now() + ([60, 300, 900, 3600, 21600, 86400][attempts - 1] ?? 86400) * 1000,
        ),
      },
    });
  }
}

export function eventPayload(
  event: {
    id: string;
    eventType: string;
    resourceType: string;
    resourceId: string;
    resourceVersion: number;
    occurredAt: Date;
    data: unknown;
  },
  environment: 'TEST' | 'LIVE',
) {
  return {
    eventId: event.id,
    eventType: event.eventType,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    resourceVersion: event.resourceVersion,
    occurredAt: event.occurredAt.toISOString(),
    environment,
    data: event.data,
  };
}
