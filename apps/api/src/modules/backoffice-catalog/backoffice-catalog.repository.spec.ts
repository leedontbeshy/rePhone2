import { describe, expect, it, vi } from 'vitest';
import { BackofficeCatalogRepository } from './backoffice-catalog.repository.js';

describe('BackofficeCatalogRepository', () => {
  it('loads the primary product media in the paginated product query', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const repository = new BackofficeCatalogRepository({
      product: { findMany, count },
    } as never);

    await repository.listProducts({
      page: 1,
      pageSize: 20,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          _count: { select: { variants: true } },
          media: {
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            take: 1,
          },
        },
      }),
    );
    expect(count).toHaveBeenCalledTimes(1);
  });

  it('keeps products without a release year after newer models and uses the name as a tie-breaker', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new BackofficeCatalogRepository({
      product: { findMany, count: vi.fn().mockResolvedValue(0) },
    } as never);

    await repository.listProducts({
      page: 1,
      pageSize: 20,
      sortBy: 'releaseYear',
      sortOrder: 'desc',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ releaseYear: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }, { id: 'asc' }],
      }),
    );
  });
});
