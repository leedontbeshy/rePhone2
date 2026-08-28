import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  BackofficeProductListQueryDto,
  CreateProductDto,
  CreateVariantDto,
  UpdateVariantDto,
} from './backoffice-catalog.dto.js';

type DbClient = PrismaService | Prisma.TransactionClient;

const mediaOrderBy = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }];
const variantMediaInclude = {
  media: { orderBy: mediaOrderBy },
} satisfies Prisma.ProductVariantInclude;

const productInclude = {
  _count: { select: { variants: true } },
  media: { orderBy: mediaOrderBy },
  variants: {
    orderBy: [{ displayName: 'asc' as const }, { id: 'asc' as const }],
    include: variantMediaInclude,
  },
} satisfies Prisma.ProductInclude;

export type BackofficeProductRecord = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

@Injectable()
export class BackofficeCatalogRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async listProducts(query: BackofficeProductListQueryDto) {
    const where: Prisma.ProductWhereInput = {
      ...(query.type === undefined ? {} : { type: query.type }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.releaseYear === undefined ? {} : { releaseYear: query.releaseYear }),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { slug: { contains: query.q, mode: 'insensitive' as const } },
              {
                variants: {
                  some: {
                    OR: [
                      { sku: { contains: query.q, mode: 'insensitive' as const } },
                      { displayName: { contains: query.q, mode: 'insensitive' as const } },
                    ],
                  },
                },
              },
            ],
          }),
    };
    const orderBy = { [query.sortBy]: query.sortOrder } as Prisma.ProductOrderByWithRelationInput;
    const [items, totalItems] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [orderBy, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          _count: { select: { variants: true } },
          media: { orderBy: mediaOrderBy, take: 1 },
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items, totalItems };
  }

  public findProduct(id: string, client: DbClient = this.prisma) {
    return client.product.findUnique({ where: { id }, include: productInclude });
  }

  public createProduct(input: CreateProductDto, client: DbClient) {
    return client.product.create({
      data: {
        type: input.type,
        brand: input.brand,
        name: input.name,
        slug: input.slug,
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.releaseYear === undefined ? {} : { releaseYear: input.releaseYear }),
        ...(input.chipset === undefined ? {} : { chipset: input.chipset }),
        ...(input.ramGb === undefined ? {} : { ramGb: input.ramGb }),
        ...(input.screenSizeInches === undefined
          ? {}
          : { screenSizeInches: input.screenSizeInches }),
        ...(input.warrantyPolicyId === undefined
          ? {}
          : { warrantyPolicyId: input.warrantyPolicyId }),
        ...(input.seoTitle === undefined ? {} : { seoTitle: input.seoTitle }),
        ...(input.seoDescription === undefined ? {} : { seoDescription: input.seoDescription }),
      },
      include: productInclude,
    });
  }

  public updateProduct(id: string, input: Prisma.ProductUpdateInput, client: DbClient) {
    return client.product.update({
      where: { id },
      data: input,
      include: productInclude,
    });
  }

  public findVariant(id: string, client: DbClient = this.prisma) {
    return client.productVariant.findUnique({
      where: { id },
      include: {
        product: true,
        _count: { select: { stockLevels: true, stockMovements: true, orderItems: true } },
        ...variantMediaInclude,
      },
    });
  }

  public createVariant(
    productId: string,
    inventoryMode: 'SERIALIZED' | 'QUANTITY',
    input: CreateVariantDto,
    client: DbClient,
  ) {
    return client.productVariant.create({
      data: {
        productId,
        inventoryMode,
        sku: input.sku,
        displayName: input.displayName,
        ...(input.storageCapacityGb === undefined
          ? {}
          : { storageCapacityGb: input.storageCapacityGb }),
        ...(input.colorName === undefined ? {} : { colorName: input.colorName }),
        ...(input.colorHex === undefined ? {} : { colorHex: input.colorHex.toUpperCase() }),
        ...(input.salePrice === undefined ? {} : { salePrice: input.salePrice }),
        ...(input.compareAtPrice === undefined ? {} : { compareAtPrice: input.compareAtPrice }),
        ...(input.accessoryAttributes === undefined
          ? {}
          : { accessoryAttributes: input.accessoryAttributes as Prisma.InputJsonObject }),
        ...(input.warrantyPolicyId === undefined
          ? {}
          : { warrantyPolicyId: input.warrantyPolicyId }),
      },
      include: variantMediaInclude,
    });
  }

  public updateVariant(id: string, input: UpdateVariantDto, client: DbClient) {
    return client.productVariant.update({
      where: { id },
      data: {
        ...(input.sku === undefined ? {} : { sku: input.sku }),
        ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
        ...(input.storageCapacityGb === undefined
          ? {}
          : { storageCapacityGb: input.storageCapacityGb }),
        ...(input.colorName === undefined ? {} : { colorName: input.colorName }),
        ...(input.colorHex === undefined ? {} : { colorHex: input.colorHex.toUpperCase() }),
        ...(input.salePrice === undefined ? {} : { salePrice: input.salePrice }),
        ...(input.compareAtPrice === undefined ? {} : { compareAtPrice: input.compareAtPrice }),
        ...(input.accessoryAttributes === undefined
          ? {}
          : { accessoryAttributes: input.accessoryAttributes as Prisma.InputJsonObject }),
        ...(input.warrantyPolicyId === undefined
          ? {}
          : { warrantyPolicyId: input.warrantyPolicyId }),
      },
      include: variantMediaInclude,
    });
  }

  public updateVariantStatus(
    id: string,
    input: { status: 'ACTIVE' | 'ARCHIVED'; archivedAt?: Date },
    client: DbClient,
  ) {
    return client.productVariant.update({
      where: { id },
      data: input,
      include: variantMediaInclude,
    });
  }
}
