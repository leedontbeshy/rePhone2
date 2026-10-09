import { Inject, Injectable, type CanActivate } from '@nestjs/common';
import { DealerRuntime } from './dealer-runtime.service.js';
@Injectable()
export class DealerEnabledGuard implements CanActivate {
  public constructor(@Inject(DealerRuntime) private readonly runtime: DealerRuntime) {}
  public canActivate(): boolean {
    this.runtime.assertEnabled();
    return true;
  }
}
