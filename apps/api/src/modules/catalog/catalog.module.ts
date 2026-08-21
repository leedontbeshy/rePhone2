import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.js';
import { CatalogRepository } from './catalog.repository.js';
import { CatalogService } from './catalog.service.js';
import { PublicMediaUrlBuilder } from './public-media-url.builder.js';
import { CommerceOfferReader } from './commerce-offer.reader.js';

@Module({
  controllers: [CatalogController],
  providers: [CatalogRepository, CatalogService, PublicMediaUrlBuilder, CommerceOfferReader],
  exports: [CommerceOfferReader],
})
export class CatalogModule {}
