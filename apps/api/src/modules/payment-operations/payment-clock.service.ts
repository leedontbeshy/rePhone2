import { Injectable } from '@nestjs/common';

@Injectable()
export class PaymentClock {
  public now(): Date {
    return new Date();
  }
}
