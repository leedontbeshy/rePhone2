import { Injectable } from '@nestjs/common';

@Injectable()
export class RefundClock {
  public now(): Date {
    return new Date();
  }
}
