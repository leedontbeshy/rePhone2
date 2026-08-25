import { Injectable } from '@nestjs/common';

@Injectable()
export class WarrantyClock {
  public now(): Date {
    return new Date();
  }
}
