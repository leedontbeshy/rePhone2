import { ApiProperty } from '@nestjs/swagger';

export class HealthOkResponse {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  public status!: 'ok';
}

export class HealthErrorResponse {
  @ApiProperty({ enum: ['error'], example: 'error' })
  public status!: 'error';
}
