import Link from 'next/link';
import type { ReactNode } from 'react';
import { searchParamValue, type CatalogSearchParams } from '@/lib/catalog-query';
import styles from './catalog.module.css';

interface CatalogFilterFormProps {
  readonly current: CatalogSearchParams;
  readonly idPrefix: string;
  readonly pageSize: number;
}

export function CatalogFilterForm({ current, idPrefix, pageSize }: CatalogFilterFormProps) {
  return (
    <form className={styles.filterForm} action="/products" method="get">
      <FilterField id={`${idPrefix}-q`} label="Tìm kiếm" wide>
        <input
          id={`${idPrefix}-q`}
          name="q"
          type="search"
          maxLength={100}
          defaultValue={searchParamValue(current, 'q')}
          placeholder="Tên model hoặc cấu hình"
        />
      </FilterField>
      <FilterField id={`${idPrefix}-type`} label="Loại sản phẩm">
        <select
          id={`${idPrefix}-type`}
          name="productType"
          defaultValue={searchParamValue(current, 'productType') ?? ''}
        >
          <option value="">Tất cả</option>
          <option value="IPHONE">iPhone</option>
          <option value="ACCESSORY">Phụ kiện</option>
        </select>
      </FilterField>
      <FilterField id={`${idPrefix}-year`} label="Năm ra mắt">
        <input
          id={`${idPrefix}-year`}
          name="releaseYear"
          type="number"
          inputMode="numeric"
          min={2007}
          max={2100}
          defaultValue={searchParamValue(current, 'releaseYear')}
        />
      </FilterField>
      <FilterField id={`${idPrefix}-storage`} label="Dung lượng">
        <select
          id={`${idPrefix}-storage`}
          name="storageCapacityGb"
          defaultValue={searchParamValue(current, 'storageCapacityGb') ?? ''}
        >
          <option value="">Tất cả</option>
          <option value="64">64 GB</option>
          <option value="128">128 GB</option>
          <option value="256">256 GB</option>
          <option value="512">512 GB</option>
          <option value="1024">1 TB</option>
        </select>
      </FilterField>
      <FilterField id={`${idPrefix}-color`} label="Màu">
        <input
          id={`${idPrefix}-color`}
          name="colorName"
          maxLength={255}
          defaultValue={searchParamValue(current, 'colorName')}
        />
      </FilterField>
      <FilterField id={`${idPrefix}-min-price`} label="Giá từ">
        <input
          id={`${idPrefix}-min-price`}
          name="minPrice"
          inputMode="numeric"
          pattern="[0-9]+"
          maxLength={15}
          defaultValue={searchParamValue(current, 'minPrice')}
        />
      </FilterField>
      <FilterField id={`${idPrefix}-max-price`} label="Giá đến">
        <input
          id={`${idPrefix}-max-price`}
          name="maxPrice"
          inputMode="numeric"
          pattern="[0-9]+"
          maxLength={15}
          defaultValue={searchParamValue(current, 'maxPrice')}
        />
      </FilterField>
      <FilterField id={`${idPrefix}-stock`} label="Khả dụng">
        <select
          id={`${idPrefix}-stock`}
          name="inStock"
          defaultValue={searchParamValue(current, 'inStock') ?? ''}
        >
          <option value="">Tất cả</option>
          <option value="true">Còn hàng</option>
          <option value="false">Tạm hết hàng</option>
        </select>
      </FilterField>
      <FilterField id={`${idPrefix}-sort`} label="Sắp xếp">
        <select
          id={`${idPrefix}-sort`}
          name="sortBy"
          defaultValue={searchParamValue(current, 'sortBy') ?? 'createdAt'}
        >
          <option value="createdAt">Mới cập nhật</option>
          <option value="name">Tên</option>
          <option value="fromPrice">Giá</option>
          <option value="releaseYear">Năm ra mắt</option>
        </select>
      </FilterField>
      <FilterField id={`${idPrefix}-order`} label="Thứ tự">
        <select
          id={`${idPrefix}-order`}
          name="sortOrder"
          defaultValue={searchParamValue(current, 'sortOrder') ?? 'desc'}
        >
          <option value="desc">Giảm dần</option>
          <option value="asc">Tăng dần</option>
        </select>
      </FilterField>
      <input type="hidden" name="pageSize" value={pageSize} />
      <div className={styles.filterActions}>
        <button className={styles.applyFilter} type="submit">
          Áp dụng
        </button>
        <Link className={styles.clearFilter} href="/products">
          Xóa lọc
        </Link>
      </div>
    </form>
  );
}

function FilterField({
  children,
  id,
  label,
  wide = false,
}: Readonly<{
  children: ReactNode;
  id: string;
  label: string;
  wide?: boolean;
}>) {
  return (
    <div className={wide ? styles.filterWide : undefined}>
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}
