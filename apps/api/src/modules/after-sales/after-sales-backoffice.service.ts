import { Inject, Injectable } from '@nestjs/common';
import { AfterSalesNotificationService } from '../notifications/after-sales-notification.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import type {
  ApproveAfterSalesRequestDto,
  AssignAfterSalesRequestDto,
  ReceiveAfterSalesRequestDto,
  RecordAfterSalesInspectionSummaryDto,
  RejectAfterSalesRequestDto,
  ResolveAfterSalesDto,
  ResolveAfterSalesRefundedDto,
  ResolveAfterSalesReplacedDto,
} from './after-sales.dto.js';
import {
  AfterSalesBackofficeCommandService,
  type AfterSalesCommandOutcome,
} from './after-sales-backoffice-command.service.js';
import { AfterSalesBackofficeQueryService } from './after-sales-backoffice-query.service.js';
import type { BackofficeAfterSalesDetailDto } from './after-sales-backoffice-response.dto.js';

type StaffRole = 'EMPLOYEE' | 'ADMIN';

@Injectable()
export class AfterSalesBackofficeService {
  public constructor(
    @Inject(AfterSalesBackofficeCommandService)
    private readonly commands: AfterSalesBackofficeCommandService,
    @Inject(AfterSalesBackofficeQueryService)
    private readonly queries: AfterSalesBackofficeQueryService,
    @Inject(AfterSalesNotificationService)
    private readonly notifications: AfterSalesNotificationService,
  ) {}

  public async assign(
    id: string,
    input: AssignAfterSalesRequestDto,
    actor: AuditActorContext,
    role: StaffRole,
  ) {
    await this.commands.assignAfterSalesRequest(id, input, actor);
    return this.queries.detail(id, role);
  }

  public receive(
    id: string,
    input: ReceiveAfterSalesRequestDto,
    actor: AuditActorContext,
    role: StaffRole,
  ) {
    return this.executeAndProject(
      id,
      role,
      this.commands.receiveAfterSalesRequest(id, input, actor),
      actor.requestId,
    );
  }

  public startInspection(id: string, actor: AuditActorContext, role: StaffRole) {
    return this.executeAndProject(
      id,
      role,
      this.commands.startAfterSalesInspection(id, actor),
      actor.requestId,
    );
  }

  public async recordInspectionSummary(
    id: string,
    input: RecordAfterSalesInspectionSummaryDto,
    actor: AuditActorContext,
    role: StaffRole,
  ) {
    await this.commands.recordAfterSalesInspectionSummary(id, input, actor);
    return this.queries.detail(id, role);
  }

  public approve(
    id: string,
    input: ApproveAfterSalesRequestDto,
    actor: AuditActorContext,
    role: StaffRole,
  ) {
    return this.executeAndProject(
      id,
      role,
      this.commands.approveAfterSalesRequest(id, input, actor),
      actor.requestId,
    );
  }

  public reject(
    id: string,
    input: RejectAfterSalesRequestDto,
    actor: AuditActorContext,
    role: StaffRole,
  ) {
    return this.executeAndProject(
      id,
      role,
      this.commands.rejectAfterSalesRequest(id, input, actor),
      actor.requestId,
    );
  }

  public resolveRepaired(
    id: string,
    input: ResolveAfterSalesDto,
    actor: AuditActorContext,
    role: StaffRole,
  ) {
    return this.executeAndProject(
      id,
      role,
      this.commands.resolveAfterSalesRepaired(id, input, actor),
      actor.requestId,
    );
  }

  public resolveReplaced(
    id: string,
    input: ResolveAfterSalesReplacedDto,
    actor: AuditActorContext,
    role: StaffRole,
  ) {
    return this.executeAndProject(
      id,
      role,
      this.commands.resolveAfterSalesReplaced(id, input, actor),
      actor.requestId,
    );
  }

  public resolveRefunded(
    id: string,
    input: ResolveAfterSalesRefundedDto,
    actor: AuditActorContext,
    role: StaffRole,
  ) {
    return this.executeAndProject(
      id,
      role,
      this.commands.resolveAfterSalesRefunded(id, input, actor),
      actor.requestId,
    );
  }

  public resolveReturnedUnchanged(
    id: string,
    input: ResolveAfterSalesDto,
    actor: AuditActorContext,
    role: StaffRole,
  ) {
    return this.executeAndProject(
      id,
      role,
      this.commands.resolveAfterSalesReturnedUnchanged(id, input, actor),
      actor.requestId,
    );
  }

  public resolveOther(
    id: string,
    input: ResolveAfterSalesDto,
    actor: AuditActorContext,
    role: StaffRole,
  ) {
    return this.executeAndProject(
      id,
      role,
      this.commands.resolveAfterSalesOther(id, input, actor, role),
      actor.requestId,
    );
  }

  private async executeAndProject(
    id: string,
    role: StaffRole,
    command: Promise<AfterSalesCommandOutcome>,
    requestId: string,
  ): Promise<BackofficeAfterSalesDetailDto> {
    const outcome = await command;
    const detail = await this.queries.detail(id, role);
    if (outcome.changed) {
      await this.notifications.sendUpdated({
        requestId,
        requestNumber: detail.requestNumber,
        orderNumber: detail.orderItem.orderNumber,
        customerEmail: detail.customer.email,
        status: detail.status,
      });
    }
    return detail;
  }
}
