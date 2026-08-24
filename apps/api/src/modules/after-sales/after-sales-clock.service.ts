import { Injectable } from '@nestjs/common';

@Injectable()
export class AfterSalesClock {
  public now(): Date {
    return new Date();
  }
}
