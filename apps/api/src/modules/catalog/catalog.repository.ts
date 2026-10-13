import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { ProductListQueryDto, PublicUnitListQueryDto } from './catalog.dto.js';

const publicMediaRecordSchema = z.object({
  bucket: z.string(),
  objectPath: z.string(),
  visibility: z.string(),
  altText: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  fileSize: z.number().int(),
});

const productListItemRecordSchema = z.object({
  id: z.string(),
  slug: z.string(),
  productType: z.enum(['IPHONE', 'ACCESSORY']),
  brand: z.string(),
  name: z.string(),
  releaseYear: z.number().int().nullable(),
  coverMedia: publicMediaRecordSchema.nullable(),
  fromPrice: z.string().nullable(),
  compareAtPrice: z.string().nullable(),
  inStock: z.boolean(),
  storageOptions: z.array(z.number().int()),
  colorOptions: z.array(z.string()),
});

const productListResultSchema = z.object({
  totalItems: z.number().int().nonnegative(),
  items: z.array(productListItemRecordSchema),
});

export type ProductListItemRecord = z.infer<typeof productListItemRecordSchema>;

@Injectable()
export class CatalogRepository {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public async listProducts(
    query: ProductListQueryDto,
  ): Promise<{ totalItems: number; items: ProductListItemRecord[] }> {
    const filters = buildListFilters(query);
    const orderBy = buildOrderBy(query);
    const offset = (query.page - 1) * query.pageSize;
    const publicBucket = this.config.storage.publicBucket;
    const rows = await this.prisma.$queryRaw<Array<{ totalItems: number; items: unknown }>>(
      Prisma.sql`
        WITH active_variants AS (
          SELECT
            v.id,
            v.product_id,
            v.sku,
            v.display_name,
            v.storage_capacity_gb,
            v.color_name,
            v.inventory_mode,
            v.sale_price,
            v.compare_at_price
          FROM product_variants v
          WHERE v.status = 'ACTIVE'
            AND v.archived_at IS NULL
        ),
        valid_current_inspections AS (
          SELECT i.id, i.inventory_unit_id
          FROM inventory_inspections i
          WHERE i.status = 'COMPLETED'
            AND i.overall_result = 'PASSED'
            AND i.is_current
            AND i.condition_grade IS NOT NULL
            AND i.checks ->> 'schemaVersion' = '1'
            AND jsonb_typeof(i.checks -> 'items') = 'object'
            AND (
              SELECT COUNT(*)
              FROM jsonb_object_keys(i.checks -> 'items')
            ) = 18
            AND (i.checks -> 'items') ?& ARRAY[
              'DISPLAY', 'TOUCHSCREEN', 'FRONT_CAMERA', 'REAR_CAMERA',
              'FACE_ID_TOUCH_ID', 'SPEAKER', 'MICROPHONE', 'BUTTONS',
              'VIBRATION_HAPTICS', 'WIFI', 'BLUETOOTH', 'CELLULAR',
              'CHARGING_PORT', 'WIRELESS_CHARGING', 'BATTERY_FUNCTION',
              'GPS_LOCATION', 'SENSORS', 'CONNECTORS_OTHER'
            ]
            AND NOT EXISTS (
              SELECT 1
              FROM jsonb_each(i.checks -> 'items') check_item
              WHERE jsonb_typeof(check_item.value) <> 'object'
                OR COALESCE(check_item.value ->> 'status', '') NOT IN ('PASS', 'NOT_APPLICABLE')
            )
        ),
        iphone_offers AS (
          SELECT
            p.id AS product_id,
            u.id::text AS offer_id,
            u.sale_price,
            u.compare_at_price,
            true AS in_stock,
            v.storage_capacity_gb,
            u.sim_lock_status::text AS sim_lock_status
          FROM products p
          JOIN active_variants v ON v.product_id = p.id AND v.inventory_mode = 'SERIALIZED'
          JOIN inventory_units u ON u.variant_id = v.id
          JOIN inventory_locations location ON location.id = u.location_id
          JOIN valid_current_inspections inspection ON inspection.inventory_unit_id = u.id
          WHERE p.type = 'IPHONE'
            AND p.status = 'ACTIVE'
            AND p.archived_at IS NULL
            AND u.lifecycle_status = 'AVAILABLE'
            AND u.sale_price IS NOT NULL
            AND location.status = 'ACTIVE'
            AND NOT EXISTS (
              SELECT 1
              FROM inventory_reservations reservation
              WHERE reservation.inventory_unit_id = u.id
                AND reservation.status = 'ACTIVE'
            )
            AND EXISTS (
              SELECT 1
              FROM product_media media
              WHERE media.inventory_unit_id = u.id
                AND media.visibility = 'PUBLIC'
                AND media.bucket = ${publicBucket}
            )
        ),
        accessory_offers AS (
          SELECT
            p.id AS product_id,
            v.id::text AS offer_id,
            v.sale_price,
            v.compare_at_price,
            EXISTS (
              SELECT 1
              FROM stock_levels stock
              JOIN inventory_locations location ON location.id = stock.location_id
              WHERE stock.variant_id = v.id
                AND location.status = 'ACTIVE'
                AND stock.quantity_on_hand - stock.quantity_reserved > 0
            ) AS in_stock,
            v.storage_capacity_gb,
            NULL::text AS sim_lock_status
          FROM products p
          JOIN active_variants v ON v.product_id = p.id AND v.inventory_mode = 'QUANTITY'
          WHERE p.type = 'ACCESSORY'
            AND p.status = 'ACTIVE'
            AND p.archived_at IS NULL
            AND v.sale_price IS NOT NULL
        ),
        offers AS (
          SELECT * FROM iphone_offers
          UNION ALL
          SELECT * FROM accessory_offers
        ),
        ranked_offers AS (
          SELECT
            offer.*,
            ROW_NUMBER() OVER (
              PARTITION BY offer.product_id
              ORDER BY offer.sale_price ASC, offer.offer_id ASC
            ) AS price_rank,
            BOOL_OR(offer.in_stock) OVER (PARTITION BY offer.product_id) AS product_in_stock
          FROM offers offer
        ),
        product_rollup AS (
          SELECT
            p.id,
            p.slug,
            p.type AS product_type,
            p.brand,
            p.name,
            LOWER(REGEXP_REPLACE(BTRIM(p.name), '[[:space:]]+', ' ', 'g')) AS normalized_name,
            p.release_year,
            p.ram_gb,
            p.created_at,
            cheapest.sale_price AS from_price,
            cheapest.compare_at_price,
            COALESCE(cheapest.product_in_stock, false) AS in_stock,
            ARRAY(
              SELECT DISTINCT variant.storage_capacity_gb
              FROM active_variants variant
              WHERE variant.product_id = p.id
                AND variant.storage_capacity_gb IS NOT NULL
              ORDER BY variant.storage_capacity_gb
            ) AS storage_options,
            ARRAY(
              SELECT MIN(variant.color_name)
              FROM active_variants variant
              WHERE variant.product_id = p.id
                AND variant.color_name IS NOT NULL
              GROUP BY LOWER(variant.color_name)
              ORDER BY LOWER(MIN(variant.color_name))
            ) AS color_options,
            cover.bucket AS cover_bucket,
            cover.object_path AS cover_object_path,
            cover.visibility::text AS cover_visibility,
            cover.alt_text AS cover_alt_text,
            cover.width AS cover_width,
            cover.height AS cover_height,
            cover.file_size AS cover_file_size
          FROM products p
          LEFT JOIN ranked_offers cheapest
            ON cheapest.product_id = p.id AND cheapest.price_rank = 1
          LEFT JOIN LATERAL (
            SELECT media.*
            FROM product_media media
            WHERE media.product_id = p.id
              AND media.visibility = 'PUBLIC'
              AND media.bucket = ${publicBucket}
            ORDER BY media.sort_order ASC, media.id ASC
            LIMIT 1
          ) cover ON true
          WHERE p.status = 'ACTIVE'
            AND p.archived_at IS NULL
        ),
        matching_products AS (
          SELECT rollup.*
          FROM product_rollup rollup
          WHERE ${Prisma.join(filters, ' AND ')}
        ),
        ordered_page AS (
          SELECT *
          FROM matching_products
          ORDER BY ${orderBy}
          LIMIT ${query.pageSize}
          OFFSET ${offset}
        )
        SELECT
          (SELECT COUNT(*)::int FROM matching_products) AS "totalItems",
          COALESCE(
            JSONB_AGG(
              JSONB_BUILD_OBJECT(
                'id', page.id,
                'slug', page.slug,
                'productType', page.product_type::text,
                'brand', page.brand,
                'name', page.name,
                'releaseYear', page.release_year,
                'coverMedia', CASE
                  WHEN page.cover_object_path IS NULL THEN NULL
                  ELSE JSONB_BUILD_OBJECT(
                    'bucket', page.cover_bucket,
                    'objectPath', page.cover_object_path,
                    'visibility', page.cover_visibility,
                    'altText', page.cover_alt_text,
                    'width', page.cover_width,
                    'height', page.cover_height,
                    'fileSize', page.cover_file_size
                  )
                END,
                'fromPrice', page.from_price::text,
                'compareAtPrice', page.compare_at_price::text,
                'inStock', page.in_stock,
                'storageOptions', TO_JSONB(page.storage_options),
                'colorOptions', TO_JSONB(page.color_options)
              )
              ORDER BY ${orderBy}
            ),
            '[]'::jsonb
          ) AS items
        FROM ordered_page page
      `,
    );
    return productListResultSchema.parse(rows[0] ?? { totalItems: 0, items: [] });
  }

  public findPublicProduct(slug: string) {
    const publicBucket = this.config.storage.publicBucket;
    return this.prisma.product.findFirst({
      where: { slug, status: 'ACTIVE', archivedAt: null },
      select: {
        id: true,
        slug: true,
        type: true,
        brand: true,
        name: true,
        description: true,
        releaseYear: true,
        chipset: true,
        ramGb: true,
        screenSizeInches: true,
        warrantyPolicy: {
          select: { name: true, defaultDays: true, terms: true, status: true },
        },
        media: {
          where: { visibility: 'PUBLIC', bucket: publicBucket },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: mediaSelect,
        },
        variants: {
          where: { status: 'ACTIVE', archivedAt: null },
          orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            sku: true,
            displayName: true,
            storageCapacityGb: true,
            colorName: true,
            colorHex: true,
            inventoryMode: true,
            salePrice: true,
            compareAtPrice: true,
            accessoryAttributes: true,
            warrantyPolicy: {
              select: { name: true, defaultDays: true, terms: true, status: true },
            },
            media: {
              where: { visibility: 'PUBLIC', bucket: publicBucket },
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
              select: mediaSelect,
            },
            inventoryUnits: {
              where: {
                lifecycleStatus: 'AVAILABLE',
                salePrice: { not: null },
                location: { status: 'ACTIVE' },
                reservations: { none: { status: 'ACTIVE' } },
                inspections: {
                  some: { status: 'COMPLETED', overallResult: 'PASSED', isCurrent: true },
                },
                media: {
                  some: { visibility: 'PUBLIC', bucket: publicBucket },
                },
              },
              orderBy: [{ salePrice: 'asc' }, { inventoryCode: 'asc' }],
              select: {
                id: true,
                inventoryCode: true,
                modelNumber: true,
                regionCode: true,
                simLockStatus: true,
                carrierName: true,
                simConfiguration: true,
                salePrice: true,
                compareAtPrice: true,
                warrantyDaysOverride: true,
                imei1Suffix: true,
                imei2Suffix: true,
                serialSuffix: true,
                eidSuffix: true,
                location: { select: { type: true } },
                inspections: {
                  where: { status: 'COMPLETED', overallResult: 'PASSED', isCurrent: true },
                  take: 1,
                  select: {
                    batteryHealthPercent: true,
                    batteryCycleCount: true,
                    batteryReplacementStatus: true,
                    conditionGrade: true,
                    cosmeticNotes: true,
                    checks: true,
                    repairHistoryStatus: true,
                    repairNotes: true,
                    replacedParts: true,
                  },
                },
                media: {
                  where: { visibility: 'PUBLIC', bucket: publicBucket },
                  orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                  select: mediaSelect,
                },
              },
            },
            stockLevels: {
              where: { location: { status: 'ACTIVE' } },
              select: {
                quantityOnHand: true,
                quantityReserved: true,
                location: { select: { type: true } },
              },
            },
          },
        },
      },
    });
  }

  public findPublicUsedIphone(slug: string, inventoryCode: string) {
    const publicBucket = this.config.storage.publicBucket;
    return this.prisma.inventoryUnit.findFirst({
      where: {
        inventoryCode,
        lifecycleStatus: 'AVAILABLE',
        salePrice: { not: null },
        location: { status: 'ACTIVE' },
        reservations: { none: { status: 'ACTIVE' } },
        inspections: {
          some: { status: 'COMPLETED', overallResult: 'PASSED', isCurrent: true },
        },
        media: { some: { visibility: 'PUBLIC', bucket: publicBucket } },
        variant: {
          inventoryMode: 'SERIALIZED',
          status: 'ACTIVE',
          archivedAt: null,
          product: { slug, type: 'IPHONE', status: 'ACTIVE', archivedAt: null },
        },
      },
      select: publicUnitSelect(publicBucket),
    });
  }

  public async listPublicUnits(query: PublicUnitListQueryDto) {
    const publicBucket = this.config.storage.publicBucket;
    const featuredOrder = query.featuredFirst ? Prisma.sql`u.is_featured DESC,` : Prisma.empty;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH valid_current_inspections AS (
          SELECT i.id, i.inventory_unit_id
          FROM inventory_inspections i
          WHERE i.status = 'COMPLETED'
            AND i.overall_result = 'PASSED'
            AND i.is_current
            AND i.condition_grade IS NOT NULL
            AND i.checks ->> 'schemaVersion' = '1'
            AND jsonb_typeof(i.checks -> 'items') = 'object'
            AND (
              SELECT COUNT(*)
              FROM jsonb_object_keys(i.checks -> 'items')
            ) = 18
            AND (i.checks -> 'items') ?& ARRAY[
              'DISPLAY', 'TOUCHSCREEN', 'FRONT_CAMERA', 'REAR_CAMERA',
              'FACE_ID_TOUCH_ID', 'SPEAKER', 'MICROPHONE', 'BUTTONS',
              'VIBRATION_HAPTICS', 'WIFI', 'BLUETOOTH', 'CELLULAR',
              'CHARGING_PORT', 'WIRELESS_CHARGING', 'BATTERY_FUNCTION',
              'GPS_LOCATION', 'SENSORS', 'CONNECTORS_OTHER'
            ]
            AND NOT EXISTS (
              SELECT 1
              FROM jsonb_each(i.checks -> 'items') check_item
              WHERE jsonb_typeof(check_item.value) <> 'object'
                OR COALESCE(check_item.value ->> 'status', '') NOT IN ('PASS', 'NOT_APPLICABLE')
            )
        )
      SELECT u.id
      FROM inventory_units u
      JOIN product_variants v ON v.id = u.variant_id
      JOIN products p ON p.id = v.product_id
      JOIN inventory_locations location ON location.id = u.location_id
      JOIN valid_current_inspections inspection ON inspection.inventory_unit_id = u.id
      WHERE u.lifecycle_status = 'AVAILABLE' AND u.sale_price IS NOT NULL
        AND v.inventory_mode = 'SERIALIZED' AND v.status = 'ACTIVE' AND v.archived_at IS NULL
        AND p.type = 'IPHONE' AND p.status = 'ACTIVE' AND p.archived_at IS NULL
        AND location.status = 'ACTIVE'
        AND NOT EXISTS (SELECT 1 FROM inventory_reservations r WHERE r.inventory_unit_id = u.id AND r.status = 'ACTIVE')
        AND EXISTS (SELECT 1 FROM product_media m WHERE m.inventory_unit_id = u.id AND m.visibility = 'PUBLIC' AND m.bucket = ${publicBucket})
      ORDER BY ${featuredOrder} u.sale_price DESC, u.inventory_code ASC
      LIMIT ${query.limit}
    `);
    if (ids.length === 0) return [];
    const units = await this.prisma.inventoryUnit.findMany({
      where: {
        id: { in: ids.map(({ id }) => id) },
        lifecycleStatus: 'AVAILABLE',
        salePrice: { not: null },
        reservations: { none: { status: 'ACTIVE' } },
        location: { status: 'ACTIVE' },
        variant: {
          status: 'ACTIVE',
          archivedAt: null,
          product: { status: 'ACTIVE', archivedAt: null },
        },
      },
      select: publicUnitSelect(publicBucket),
    });
    const byId = new Map(units.map((unit) => [unit.id, unit]));
    return ids.flatMap(({ id }) => {
      const unit = byId.get(id);
      return unit === undefined ? [] : [unit];
    });
  }

  public findStoreWarrantyDefaults() {
    return this.prisma.storeSettings.findUnique({
      where: { key: 'STORE' },
      select: { defaultWarrantyDays: true, defaultWarrantyTerms: true },
    });
  }
}

const mediaSelect = {
  bucket: true,
  objectPath: true,
  visibility: true,
  altText: true,
  width: true,
  height: true,
  fileSize: true,
} as const;

function buildListFilters(query: ProductListQueryDto): Prisma.Sql[] {
  const filters: Prisma.Sql[] = [Prisma.sql`true`];
  if (query.q !== undefined) {
    const pattern = `%${escapeLike(query.q)}%`;
    filters.push(Prisma.sql`(
      rollup.name ILIKE ${pattern} ESCAPE '!'
      OR EXISTS (
        SELECT 1
        FROM active_variants searched_variant
        WHERE searched_variant.product_id = rollup.id
          AND (
            searched_variant.display_name ILIKE ${pattern} ESCAPE '!'
            OR searched_variant.sku ILIKE ${pattern} ESCAPE '!'
          )
      )
    )`);
  }
  if (query.productType !== undefined) {
    filters.push(Prisma.sql`rollup.product_type = CAST(${query.productType} AS "ProductType")`);
  }
  if (query.ramGb !== undefined) filters.push(Prisma.sql`rollup.ram_gb = ${query.ramGb}`);
  if (query.releaseYear !== undefined) {
    filters.push(Prisma.sql`rollup.release_year = ${query.releaseYear}`);
  }
  if (query.storageCapacityGb !== undefined) {
    filters.push(Prisma.sql`EXISTS (
      SELECT 1 FROM active_variants filtered_variant
      WHERE filtered_variant.product_id = rollup.id
        AND filtered_variant.storage_capacity_gb = ${query.storageCapacityGb}
    )`);
  }
  if (query.colorName !== undefined) {
    filters.push(Prisma.sql`EXISTS (
      SELECT 1 FROM active_variants filtered_variant
      WHERE filtered_variant.product_id = rollup.id
        AND LOWER(filtered_variant.color_name) = LOWER(${query.colorName})
    )`);
  }
  if (
    query.minPrice !== undefined ||
    query.maxPrice !== undefined ||
    query.simLockStatus !== undefined ||
    (query.inStock === true && query.storageCapacityGb !== undefined)
  ) {
    const priceFilters: Prisma.Sql[] = [Prisma.sql`priced_offer.product_id = rollup.id`];
    if (query.inStock === true) priceFilters.push(Prisma.sql`priced_offer.in_stock`);
    if (query.storageCapacityGb !== undefined)
      priceFilters.push(Prisma.sql`priced_offer.storage_capacity_gb = ${query.storageCapacityGb}`);
    if (query.simLockStatus !== undefined)
      priceFilters.push(Prisma.sql`priced_offer.sim_lock_status = ${query.simLockStatus}`);
    if (query.minPrice !== undefined) {
      priceFilters.push(Prisma.sql`priced_offer.sale_price >= CAST(${query.minPrice} AS numeric)`);
    }
    if (query.maxPrice !== undefined) {
      priceFilters.push(Prisma.sql`priced_offer.sale_price <= CAST(${query.maxPrice} AS numeric)`);
    }
    filters.push(
      Prisma.sql`EXISTS (SELECT 1 FROM offers priced_offer WHERE ${Prisma.join(priceFilters, ' AND ')})`,
    );
  }
  if (query.inStock !== undefined) {
    filters.push(Prisma.sql`rollup.in_stock = ${query.inStock}`);
  }
  return filters;
}

function buildOrderBy(query: ProductListQueryDto): Prisma.Sql {
  const ascending = query.sortOrder === 'asc';
  switch (query.sortBy) {
    case 'generation':
      return buildGenerationOrderBy(ascending);
    case 'name':
      return ascending
        ? Prisma.sql`LOWER(name) ASC, id ASC`
        : Prisma.sql`LOWER(name) DESC, id DESC`;
    case 'fromPrice':
      return ascending
        ? Prisma.sql`from_price ASC NULLS LAST, id ASC`
        : Prisma.sql`from_price DESC NULLS LAST, id DESC`;
    case 'releaseYear':
      return ascending
        ? Prisma.sql`release_year ASC NULLS LAST, id ASC`
        : Prisma.sql`release_year DESC NULLS LAST, id DESC`;
    case 'createdAt':
      return ascending ? Prisma.sql`created_at ASC, id ASC` : Prisma.sql`created_at DESC, id DESC`;
  }
}

/** Match the storefront's family order before LIMIT/OFFSET, regardless of import/release dates. */
function buildGenerationOrderBy(ascending: boolean): Prisma.Sql {
  const generation = Prisma.sql`CASE
    WHEN product_type <> 'IPHONE' THEN NULL
    WHEN normalized_name = 'iphone air' THEN 1700
    WHEN normalized_name ~ '^iphone [0-9]{1,2}([^0-9]|$)'
      THEN SUBSTRING(normalized_name FROM '^iphone ([0-9]{1,2})')::int * 100
    WHEN normalized_name ~ '^iphone (x|xr|xs|xs max)$' THEN 1050
    WHEN normalized_name ~ '^iphone se( |$)' THEN 0
    ELSE NULL
  END`;
  const direction = ascending ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  return Prisma.sql`
    CASE WHEN product_type = 'IPHONE' THEN 0 ELSE 1 END ASC,
    ${generation} ${direction} NULLS LAST,
    CASE
      WHEN normalized_name ~ '^iphone se( |$)'
        THEN 100 - COALESCE(SUBSTRING(normalized_name FROM '([0-9]+)')::numeric, 1)
      WHEN normalized_name = 'iphone air' THEN 40
      WHEN normalized_name = 'iphone x' THEN 0
      WHEN normalized_name = 'iphone xr' THEN 10
      WHEN normalized_name = 'iphone xs' THEN 20
      WHEN normalized_name = 'iphone xs max' THEN 30
      ELSE CASE REGEXP_REPLACE(normalized_name, '^iphone [0-9]{1,2} *', '')
        WHEN '' THEN 0
        WHEN 'mini' THEN 10
        WHEN 'c' THEN 10
        WHEN 'e' THEN 20
        WHEN 's' THEN 20
        WHEN 'plus' THEN CASE WHEN normalized_name ~ '^iphone 6 ' THEN 10 ELSE 30 END
        WHEN 's plus' THEN 30
        WHEN 'air' THEN 40
        WHEN 'pro' THEN 50
        WHEN 'pro max' THEN 60
        ELSE 500
      END
    END ASC,
    normalized_name ASC, id ASC
  `;
}

function escapeLike(input: string): string {
  return input.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_');
}

function publicUnitSelect(publicBucket: string) {
  return {
    id: true,
    inventoryCode: true,
    modelNumber: true,
    regionCode: true,
    simLockStatus: true,
    carrierName: true,
    simConfiguration: true,
    salePrice: true,
    compareAtPrice: true,
    warrantyDaysOverride: true,
    imei1Suffix: true,
    imei2Suffix: true,
    serialSuffix: true,
    eidSuffix: true,
    location: { select: { type: true } },
    inspections: {
      where: { status: 'COMPLETED', overallResult: 'PASSED', isCurrent: true },
      take: 1,
      select: {
        batteryHealthPercent: true,
        batteryCycleCount: true,
        batteryReplacementStatus: true,
        conditionGrade: true,
        cosmeticNotes: true,
        checks: true,
        repairHistoryStatus: true,
        repairNotes: true,
        replacedParts: true,
      },
    },
    media: {
      where: { visibility: 'PUBLIC', bucket: publicBucket },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: mediaSelect,
    },
    variant: {
      select: {
        id: true,
        sku: true,
        displayName: true,
        storageCapacityGb: true,
        colorName: true,
        colorHex: true,
        warrantyPolicy: {
          select: { name: true, defaultDays: true, terms: true, status: true },
        },
        media: {
          where: { visibility: 'PUBLIC', bucket: publicBucket },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: mediaSelect,
        },
        product: {
          select: {
            id: true,
            slug: true,
            name: true,
            brand: true,
            ramGb: true,
            warrantyPolicy: {
              select: { name: true, defaultDays: true, terms: true, status: true },
            },
            media: {
              where: { visibility: 'PUBLIC', bucket: publicBucket },
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
              select: mediaSelect,
            },
          },
        },
      },
    },
  } as const satisfies Prisma.InventoryUnitSelect;
}
