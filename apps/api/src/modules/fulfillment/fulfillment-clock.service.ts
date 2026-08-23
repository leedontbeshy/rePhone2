import { Injectable } from '@nestjs/common';

@Injectable()
export class FulfillmentClock {
  public now(): Date {
    return new Date();
  }
}
