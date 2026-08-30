import { ApiProperty } from '@nestjs/swagger';

export const SYSTEM_HEALTH_STATES = [
  'healthy',
  'degraded',
  'unavailable',
  'not_configured',
] as const;
export type SystemHealthState = (typeof SYSTEM_HEALTH_STATES)[number];

export const SYSTEM_HEALTH_REASONS = [
  'ok',
  'timeout',
  'unavailable',
  'no_applied_migration',
  'incomplete_migration',
  'not_configured',
] as const;
export type SystemHealthReason = (typeof SYSTEM_HEALTH_REASONS)[number];

export class SystemDependencyHealthDto {
  @ApiProperty({ enum: SYSTEM_HEALTH_STATES }) public state!: SystemHealthState;
  @ApiProperty({ enum: SYSTEM_HEALTH_REASONS }) public reason!: SystemHealthReason;
  @ApiProperty({ type: Number, minimum: 0 }) public latencyMs!: number;
}

export class SystemApiHealthDto extends SystemDependencyHealthDto {
  @ApiProperty({ type: Number, minimum: 0 }) public uptimeSeconds!: number;
  @ApiProperty({ type: String }) public version!: string;
}

export class SystemDatabaseHealthDto extends SystemDependencyHealthDto {
  @ApiProperty({ type: Number, minimum: 0 }) public appliedMigrationCount!: number;
  @ApiProperty({ type: Number, minimum: 0 }) public incompleteMigrationCount!: number;
}

export class SystemHealthDetailDto {
  @ApiProperty({ enum: ['healthy', 'degraded', 'unavailable'] })
  public state!: Exclude<SystemHealthState, 'not_configured'>;
  @ApiProperty({ type: String, format: 'date-time' }) public checkedAt!: string;
  @ApiProperty({ type: Number, minimum: 0 }) public durationMs!: number;
  @ApiProperty({ type: () => SystemApiHealthDto }) public api!: SystemApiHealthDto;
  @ApiProperty({ type: () => SystemDatabaseHealthDto })
  public database!: SystemDatabaseHealthDto;
  @ApiProperty({ type: () => SystemDependencyHealthDto })
  public storage!: SystemDependencyHealthDto;
  @ApiProperty({ type: () => SystemDependencyHealthDto }) public mail!: SystemDependencyHealthDto;
}

export class SystemHealthDetailResponse {
  @ApiProperty({ type: () => SystemHealthDetailDto }) public data!: SystemHealthDetailDto;
}
