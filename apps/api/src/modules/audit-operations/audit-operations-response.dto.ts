import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../catalog/catalog-response.dto.js';
import { AUDIT_ACTOR_TYPES } from './audit-operations.dto.js';

export class AuditActorDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public fullName!: string;
  @ApiProperty({ enum: ['CUSTOMER', 'EMPLOYEE', 'ADMIN'] }) public role!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public employeeCode!: string | null;
}

export class AuditLogListItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ enum: AUDIT_ACTOR_TYPES }) public actorType!: string;
  @ApiPropertyOptional({ type: () => AuditActorDto, nullable: true })
  public actor!: AuditActorDto | null;
  @ApiProperty({ type: String }) public action!: string;
  @ApiProperty({ type: String }) public resourceType!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  public resourceId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public requestId!: string | null;
  @ApiPropertyOptional({ type: Object, nullable: true }) public changes!: unknown;
  @ApiPropertyOptional({ type: Object, nullable: true }) public metadata!: unknown;
  @ApiProperty({ type: String, format: 'date-time' }) public createdAt!: string;
}

export class AuditLogDetailDto extends AuditLogListItemDto {
  @ApiPropertyOptional({ type: String, nullable: true }) public ipAddress!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  public userAgent!: string | null;
}

export class AuditLogListMetaDto {
  @ApiProperty({ type: () => PaginationDto }) public pagination!: PaginationDto;
}

export class AuditLogListResponse {
  @ApiProperty({ type: () => [AuditLogListItemDto] }) public data!: AuditLogListItemDto[];
  @ApiProperty({ type: () => AuditLogListMetaDto }) public meta!: AuditLogListMetaDto;
}

export class AuditLogDetailResponse {
  @ApiProperty({ type: () => AuditLogDetailDto }) public data!: AuditLogDetailDto;
}
