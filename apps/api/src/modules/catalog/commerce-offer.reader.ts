import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PublicMediaDto } from './catalog-response.dto.js';
import { PublicMediaUrlBuilder } from './public-media-url.builder.js';

type DbClient = PrismaService | Prisma.TransactionClient;

export type CommerceAvailability = 'AVAILABLE' | 'OUT_OF_STOCK' | 'RESERVED_OR_SOLD' | 'INACTIVE';

export interface CommerceOffer {
  itemType: 'IPHONE' | 'ACCESSORY';
  productId: string;
  productSlug: string;
  productName: string;
  productType: 'IPHONE' | 'ACCESSORY';
  variantId: string;
  variantName: string;
  inventoryUnitId?: string;
  inventoryCode?: string;
  currentUnitPrice: string | null;
  availabilityStatus: CommerceAvailability;
  availableQuantity: number | null;
  media: PublicMediaDto | null;
}

export interface CommerceOfferTarget {
  variantId: string;
  inventoryUnitId: string | null;
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

function publicMediaArgs() {
  return {
    where: { visibility: 'PUBLIC' as const },
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
    select: mediaSelect,
  };
}

@Injectable()
export class CommerceOfferReader {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PublicMediaUrlBuilder) private readonly mediaUrlBuilder: PublicMediaUrlBuilder,
  ) {}

  public async findIphoneByInventoryCode(
    inventoryCode: string,
    client: DbClient = this.prisma,
  ): Promise<CommerceOffer | null> {
    const units = await this.readUnits({ inventoryCode }, client);
    return units[0] ?? null;
  }

  public async findAccessoryByVariantId(
    variantId: string,
    client: DbClient = this.prisma,
  ): Promise<CommerceOffer | null> {
    const variants = await this.readAccessoryVariants([variantId], client);
    return variants[0] ?? null;
  }

  public async readOffers(
    targets: readonly CommerceOfferTarget[],
    client: DbClient = this.prisma,
  ): Promise<Map<string, CommerceOffer>> {
    const unitIds = targets.flatMap(({ inventoryUnitId }) =>
      inventoryUnitId === null ? [] : [inventoryUnitId],
    );
    const accessoryVariantIds = targets
      .filter(({ inventoryUnitId }) => inventoryUnitId === null)
      .map(({ variantId }) => variantId);
    const [units, accessories] = await Promise.all([
      unitIds.length === 0 ? [] : this.readUnits({ id: { in: unitIds } }, client),
      this.readAccessoryVariants(accessoryVariantIds, client),
    ]);
    return new Map(
      [...units, ...accessories].map((offer) => [
        offerKey(offer.variantId, offer.inventoryUnitId),
        offer,
      ]),
    );
  }

  private async readUnits(
    where: Prisma.InventoryUnitWhereInput,
    client: DbClient,
  ): Promise<CommerceOffer[]> {
    const units = await client.inventoryUnit.findMany({
      where,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        inventoryCode: true,
        lifecycleStatus: true,
        salePrice: true,
        location: { select: { status: true } },
        reservations: { where: { status: 'ACTIVE' }, select: { id: true }, take: 1 },
        inspections: {
          where: { status: 'COMPLETED', overallResult: 'PASSED', isCurrent: true },
          select: { id: true },
          take: 1,
        },
        media: publicMediaArgs(),
        variant: {
          select: {
            id: true,
            displayName: true,
            inventoryMode: true,
            status: true,
            archivedAt: true,
            media: publicMediaArgs(),
            product: {
              select: {
                id: true,
                slug: true,
                name: true,
                type: true,
                status: true,
                archivedAt: true,
                media: publicMediaArgs(),
              },
            },
          },
        },
      },
    });

    return units.map((unit) => {
      const { variant } = unit;
      const publicCatalogActive =
        variant.inventoryMode === 'SERIALIZED' &&
        variant.status === 'ACTIVE' &&
        variant.archivedAt === null &&
        variant.product.type === 'IPHONE' &&
        variant.product.status === 'ACTIVE' &&
        variant.product.archivedAt === null;
      const ownerMedia = this.firstMedia([unit.media], unit.inventoryCode);
      const media = this.firstMedia(
        [unit.media, variant.media, variant.product.media],
        unit.inventoryCode,
      );
      const available =
        publicCatalogActive &&
        unit.lifecycleStatus === 'AVAILABLE' &&
        unit.salePrice !== null &&
        unit.location.status === 'ACTIVE' &&
        unit.reservations.length === 0 &&
        unit.inspections.length === 1 &&
        ownerMedia !== null;
      const availabilityStatus: CommerceAvailability = !publicCatalogActive
        ? 'INACTIVE'
        : available
          ? 'AVAILABLE'
          : 'RESERVED_OR_SOLD';
      return {
        itemType: 'IPHONE',
        productId: variant.product.id,
        productSlug: variant.product.slug,
        productName: variant.product.name,
        productType: variant.product.type,
        variantId: variant.id,
        variantName: variant.displayName,
        inventoryUnitId: unit.id,
        inventoryCode: unit.inventoryCode,
        currentUnitPrice: unit.salePrice?.toString() ?? null,
        availabilityStatus,
        availableQuantity: available ? 1 : 0,
        media,
      };
    });
  }

  private async readAccessoryVariants(
    variantIds: readonly string[],
    client: DbClient,
  ): Promise<CommerceOffer[]> {
    if (variantIds.length === 0) {
      return [];
    }
    const variants = await client.productVariant.findMany({
      where: { id: { in: [...new Set(variantIds)] } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        displayName: true,
        inventoryMode: true,
        salePrice: true,
        status: true,
        archivedAt: true,
        media: publicMediaArgs(),
        stockLevels: {
          where: { location: { status: 'ACTIVE' } },
          select: { quantityOnHand: true, quantityReserved: true },
        },
        product: {
          select: {
            id: true,
            slug: true,
            name: true,
            type: true,
            status: true,
            archivedAt: true,
            media: publicMediaArgs(),
          },
        },
      },
    });

    return variants.map((variant) => {
      const active =
        variant.inventoryMode === 'QUANTITY' &&
        variant.status === 'ACTIVE' &&
        variant.archivedAt === null &&
        variant.product.type === 'ACCESSORY' &&
        variant.product.status === 'ACTIVE' &&
        variant.product.archivedAt === null &&
        variant.salePrice !== null;
      const availableQuantity = variant.stockLevels.reduce(
        (total, stock) => total + Math.max(0, stock.quantityOnHand - stock.quantityReserved),
        0,
      );
      return {
        itemType: 'ACCESSORY',
        productId: variant.product.id,
        productSlug: variant.product.slug,
        productName: variant.product.name,
        productType: variant.product.type,
        variantId: variant.id,
        variantName: variant.displayName,
        currentUnitPrice: variant.salePrice?.toString() ?? null,
        availabilityStatus: !active
          ? 'INACTIVE'
          : availableQuantity > 0
            ? 'AVAILABLE'
            : 'OUT_OF_STOCK',
        availableQuantity,
        media: this.firstMedia([variant.media, variant.product.media], variant.displayName),
      };
    });
  }

  private firstMedia(
    candidates: Array<
      Array<{
        bucket: string;
        objectPath: string;
        visibility: string;
        altText: string | null;
        width: number | null;
        height: number | null;
        fileSize: number;
      }>
    >,
    fallbackAltText: string,
  ): PublicMediaDto | null {
    for (const group of candidates) {
      for (const media of group) {
        const projected = this.mediaUrlBuilder.build(media, fallbackAltText);
        if (projected !== null) {
          return projected;
        }
      }
    }
    return null;
  }
}

export function offerKey(variantId: string, inventoryUnitId?: string | null): string {
  return inventoryUnitId === null || inventoryUnitId === undefined
    ? `variant:${variantId}`
    : `unit:${inventoryUnitId}`;
}
