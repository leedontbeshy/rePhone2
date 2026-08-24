import { Injectable } from '@nestjs/common';

@Injectable()
export class OrderCancellationClock {
  public now(): Date {
    return new Date();
  }
}
