import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { CheckoutCatalogReader } from '../catalog/checkout-catalog.reader.js';
import { PublicMediaUrlBuilder } from '../catalog/public-media-url.builder.js';
import { CheckoutSettingsReader } from '../settings/checkout-settings.reader.js';
import { resolveWarranty } from '../orders/checkout-pricing.js';
import type { DealerCatalogQuery } from './dealer.dto.js';

/** Listing is a snapshot, never a reservation. Filter eligible offers before pagination. */
@Injectable()
export class DealerCatalogReader {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CheckoutCatalogReader) private readonly catalog: CheckoutCatalogReader,
    @Inject(CheckoutSettingsReader) private readonly settings: CheckoutSettingsReader,
    @Inject(PublicMediaUrlBuilder) private readonly media: PublicMediaUrlBuilder,
  ) {}

  public list(query: DealerCatalogQuery) {
    return this.prisma.$transaction(
      async (tx) => {
        const policy = await tx.dealerPricingPolicy.findUnique({ where: { key: 'GLOBAL' } });
        const revision = await tx.dealerCatalogRevision.findUnique({ where: { key: 'GLOBAL' } });
        const page = {
          page: query.page,
          pageSize: query.pageSize,
          revision: revision?.version ?? 0,
        };
        if (!policy?.enabled || policy.reserveAmount === null || policy.minimumProfit === null)
          return { ...page, items: [], hasMore: false };
        const terms = (query.q ?? '').trim().split(/\s+/).filter(Boolean);
        const search = terms.length
          ? Prisma.sql`AND ${Prisma.join(
              terms.map(
                (term) => Prisma.sql`
        strpos(regexp_replace(lower(concat_ws(' ', p.name, v.display_name, v.sku, u.inventory_code)), '[[:space:]]+', '', 'g'), lower(${term})) > 0
      `,
              ),
              ' AND ',
            )}`
          : Prisma.empty;
        const condition = query.condition
          ? Prisma.sql`AND i.condition_grade::text = ${query.condition}`
          : Prisma.empty;
        const sorting =
          query.sort === 'price-asc'
            ? Prisma.sql`pricing.price ASC, u.id ASC`
            : query.sort === 'price-desc'
              ? Prisma.sql`pricing.price DESC, u.id ASC`
              : Prisma.sql`u.id DESC`;
        // Whole-VND arithmetic mirrors dealerPrice: ceiling discount, protected floor, explicit override.
        const floor = Prisma.sql`(u.acquisition_cost + u.additional_cost + ${policy.reserveAmount}::numeric + ${policy.minimumProfit}::numeric)`;
        const candidates = await tx.$queryRaw<
          Array<{ id: string; variantId: string; price: Prisma.Decimal }>
        >(Prisma.sql`
        SELECT u.id, u.variant_id AS "variantId", pricing.price
        FROM inventory_units u
        JOIN product_variants v ON v.id=u.variant_id
        JOIN products p ON p.id=v.product_id
        JOIN inventory_locations l ON l.id=u.location_id
        JOIN inventory_inspections i ON i.inventory_unit_id=u.id AND i.is_current=true AND i.status='COMPLETED' AND i.overall_result='PASSED'
        LEFT JOIN dealer_inventory_overrides o ON o.inventory_unit_id=u.id
        CROSS JOIN LATERAL (SELECT COALESCE(o.price, GREATEST(CEIL(u.sale_price * (10000-${policy.discountBps})::numeric / 10000), ${floor})) AS price) pricing
        WHERE u.lifecycle_status='AVAILABLE' AND l.status='ACTIVE'
          AND v.status='ACTIVE' AND v.archived_at IS NULL AND v.inventory_mode='SERIALIZED'
          AND p.status='ACTIVE' AND p.archived_at IS NULL AND p.type='IPHONE'
          AND u.sale_price > 0 AND u.acquisition_cost IS NOT NULL AND u.acquisition_cost >= 0 AND u.additional_cost >= 0
          AND ${policy.reserveAmount}::numeric >= 0 AND ${policy.minimumProfit}::numeric > 0
          AND ${policy.discountBps} BETWEEN 0 AND 9900
          AND (o.enabled IS NULL OR o.enabled=true) AND pricing.price >= ${floor} AND pricing.price < u.sale_price
          AND NOT EXISTS (SELECT 1 FROM inventory_reservations r WHERE r.inventory_unit_id=u.id AND r.status='ACTIVE')
          ${search} ${condition}
        ORDER BY ${sorting}
        LIMIT ${query.pageSize + 1} OFFSET ${(query.page - 1) * query.pageSize}
      `);
        const selected = candidates.slice(0, query.pageSize);
        if (!selected.length) return { ...page, items: [], hasMore: false };
        const lines = await this.catalog.readLines(
          selected.map((unit) => ({
            cartItemId: unit.id,
            inventoryUnitId: unit.id,
            variantId: unit.variantId,
            quantity: 1,
          })),
          tx,
        );
        const settings = await this.settings.read(tx);
        const photos = await tx.productMedia.findMany({
          where: {
            visibility: 'PUBLIC',
            mimeType: { startsWith: 'image/' },
            OR: [
              { inventoryUnitId: { in: selected.map(({ id }) => id) } },
              { variantId: { in: selected.map(({ variantId }) => variantId) } },
              { productId: { in: lines.map(({ productId }) => productId) } },
            ],
          },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        });
        const prices = new Map(selected.map((unit) => [unit.id, unit.price.toString()]));
        return {
          ...page,
          hasMore: candidates.length > query.pageSize,
          items: lines.map((line) => {
            const warranty = resolveWarranty(line, settings);
            const photo =
              [
                photos.filter((item) => item.inventoryUnitId === line.inventoryUnitId),
                photos.filter(
                  (item) => item.variantId === line.variantId && item.inventoryUnitId === null,
                ),
                photos.filter(
                  (item) =>
                    item.productId === line.productId &&
                    item.variantId === null &&
                    item.inventoryUnitId === null,
                ),
              ]
                .flat()
                .map((item) => this.media.build(item, line.productName))
                .find((item) => item !== null) ?? null;
            return {
              inventoryUnitId: line.inventoryUnitId,
              inventoryCode: line.inventoryCode,
              productName: line.productName,
              variantName: line.variantName,
              sku: line.sku,
              configuration: line.configurationSnapshot,
              dealerPrice: prices.get(line.cartItemId),
              publicReferencePrice: line.unitPrice,
              recommendedRetailPrice: line.unitPrice,
              warrantyDays: warranty.days,
              warrantyTerms: warranty.terms,
              image: photo,
            };
          }),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
