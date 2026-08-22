import { Module } from '@nestjs/common';
import { CheckoutSettingsReader } from './checkout-settings.reader.js';

@Module({
  providers: [CheckoutSettingsReader],
  exports: [CheckoutSettingsReader],
})
export class SettingsModule {}
