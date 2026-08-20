import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.js';
import { CatalogRepository } from './catalog.repository.js';
import { CatalogService } from './catalog.service.js';
import { PublicMediaUrlBuilder } from './public-media-url.builder.js';

@Module({
  controllers: [CatalogController],
  providers: [CatalogRepository, CatalogService, PublicMediaUrlBuilder],
})
export class CatalogModule {}
