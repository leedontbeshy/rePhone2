import { fulfillPendingTasks } from './support/pending-tasks';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';
import {
  freezeWp11Clock,
  installDeterministicWp11CatalogMedia,
  stabilizeWp11VisualPage,
  WP11_RESPONSIVE_VIEWPORTS,
} from './support/wp11-visual';

const PRODUCT_ID = '0199c346-f8d2-79d8-b90b-e462bd717fe0';
const VARIANT_ID = '0199c346-f8d2-79d8-b90b-e462bd717fe1';
const PRODUCT_B_ID = '0199c346-f8d2-79d8-b90b-e462bd717fe9';
const VARIANT_B_ID = '0199c346-f8d2-79d8-b90b-e462bd717fea';
const CREATED_VARIANT_ID = '0199c346-f8d2-79d8-b90b-e462bd717fe4';
const PRODUCT_MEDIA_ID = '0199c346-f8d2-79d8-b90b-e462bd717fe5';
const VARIANT_MEDIA_ID = '0199c346-f8d2-79d8-b90b-e462bd717fe6';
const UPLOADED_PRODUCT_MEDIA_ID = '0199c346-f8d2-79d8-b90b-e462bd717fe7';
const UPLOADED_VARIANT_MEDIA_ID = '0199c346-f8d2-79d8-b90b-e462bd717fe8';
const POLICY_ID = '0199c346-f8d2-79d8-b90b-e462bd717fe3';
const VOUCHER_ID = '0199c9aa-a258-74c8-a35f-9cd11c562aa1';
const PRODUCT_NAME = 'iPhone 15 Pro FE05';
const PRODUCT_B_NAME = 'iPhone 16 Pro FE09';
const VOUCHER_NAME = 'Ưu đãi iPhone tháng 9';

type StaffRole = 'ADMIN' | 'EMPLOYEE';
type RecordStatus = 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
type VoucherStatus = RecordStatus | 'PAUSED';

interface ApiProbe {
  catalogQueries: string[];
  catalogStatus: RecordStatus;
  conflictNextProductUpdate: boolean;
  conflictNextVoucherUpdate: boolean;
  detailRequests: number;
  failNextVoucherUsage: boolean;
  mediaDeletes: number;
  mediaUploads: number;
  productMedia: ReturnType<typeof mediaFixture>[];
  pauseReason: string | null;
  productCreateBody: Record<string, unknown> | null;
  voucherCreateBody: Record<string, unknown> | null;
  voucherCreateRequests: number;
  voucherDescription: string;
  voucherDetailRequests: number;
  voucherName: string;
  voucherRequests: number;
  voucherStatus: VoucherStatus;
  voucherTransitionRequests: number;
  voucherUpdateBodies: Record<string, unknown>[];
  voucherUpdateRequests: number;
  voucherUsageRequests: number;
  variantMedia: ReturnType<typeof mediaFixture>[];
  variants: ReturnType<typeof variantFixture>[];
}

test.describe('FE-05 catalog and voucher administration', () => {
  test(bt('browser:catalog-voucher-admin', 'employee-boundary'), async ({ page }) => {
    const probe = await installFe05Api(page, 'EMPLOYEE');

    await page.goto('/backoffice/catalog/products');
    await expect(page.getByRole('heading', { level: 1, name: 'Danh mục sản phẩm' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: PRODUCT_NAME })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Danh mục', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mã ưu đãi', exact: true })).toHaveCount(0);

    await page.goto('/backoffice/catalog/products/new');
    await expect(page.getByRole('heading', { level: 1, name: 'Thêm sản phẩm' })).toBeVisible();
    await expect(page.getByLabel('Chính sách bảo hành')).toContainText('Bảo hành iPhone');

    await page.goto(`/backoffice/catalog/products/${PRODUCT_ID}`);
    await expect(page.getByRole('heading', { level: 1, name: PRODUCT_NAME })).toBeVisible();
    await expect(page.getByText('Theo từng máy', { exact: true })).toBeVisible();

    // The detail workspace runs under React Strict Mode. This conditional dialog mounts open,
    // then unmounts on Escape and must retain its original trigger through effect replay.
    const editTrigger = page.locator('header').getByRole('button', {
      name: 'Lưu thay đổi',
      exact: true,
    });
    await editTrigger.click();
    const editDialog = page.getByRole('dialog', { name: 'Chỉnh sửa thông tin' });
    await expect(editDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(editDialog).toHaveCount(0);
    await expect(editTrigger).toBeFocused();

    // Backoffice action dialogs stay mounted while their controlled `open` state changes.
    const archiveTrigger = page
      .locator('header')
      .getByRole('button', { name: 'Lưu trữ sản phẩm', exact: true });
    await archiveTrigger.click();
    const archiveDialog = page.getByRole('dialog', { name: `Lưu trữ ${PRODUCT_NAME}?` });
    await expect(archiveDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(archiveDialog).toHaveCount(0);
    await expect(archiveTrigger).toBeFocused();

    await page.goto('/backoffice/vouchers');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Không thể mở khu vực này' }),
    ).toBeVisible();
    await expect(page.getByText('Chỉ quản trị viên được quản lý mã ưu đãi.')).toBeVisible();

    for (const forbiddenPath of [
      '/backoffice/vouchers/new',
      `/backoffice/vouchers/${VOUCHER_ID}`,
    ]) {
      await page.goto(forbiddenPath);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Không thể mở khu vực này' }),
      ).toBeVisible();
      await expect(page.getByText('Chỉ quản trị viên được quản lý mã ưu đãi.')).toBeVisible();
    }
    expect(probe.voucherRequests).toBe(0);
    await expectSingleMainAndNoOverflow(page);
    await expectAccessible(page);
  });

  test(bt('browser:catalog-voucher-admin', 'catalog-draft-lifecycle'), async ({ page }) => {
    const probe = await installFe05Api(page, 'ADMIN');

    await page.goto('/backoffice/catalog/products');
    await expect(page.getByRole('heading', { level: 1, name: 'Danh mục sản phẩm' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mã ưu đãi', exact: true })).toBeVisible();

    const search = page.getByRole('combobox', { name: 'Tìm sản phẩm' });
    await search.fill('iPhone 15');
    const suggestions = page.getByRole('listbox', { name: 'Gợi ý sản phẩm' });
    await expect(suggestions.getByRole('option', { name: new RegExp(PRODUCT_NAME) })).toBeVisible();
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(page).toHaveURL(`/backoffice/catalog/products/${PRODUCT_ID}`);

    await page.goto('/backoffice/catalog/products?page=99');
    await expect(page.getByRole('heading', { level: 1, name: 'Danh mục sản phẩm' })).toBeVisible();
    await expect(page).toHaveURL('/backoffice/catalog/products');
    const typeFilter = page.getByLabel('Loại sản phẩm');
    const productBoard = page.getByRole('region', { name: 'Danh sách sản phẩm' });
    await expect(productBoard).not.toHaveAttribute('aria-busy', 'true');
    await expect(productBoard.getByRole('heading', { level: 2, name: PRODUCT_NAME })).toBeVisible();
    expect(
      probe.catalogQueries.some(
        (query) => query.includes('sortBy=releaseYear') && query.includes('sortOrder=desc'),
      ),
    ).toBe(true);

    let releaseFilter = () => undefined;
    const filterRelease = new Promise<void>((resolve) => {
      releaseFilter = resolve;
    });
    await page.route('**/api/v1/backoffice/products**', async (route) => {
      const url = new URL(route.request().url());
      if (
        route.request().method() !== 'GET' ||
        url.pathname !== '/api/v1/backoffice/products' ||
        url.searchParams.get('type') !== 'ACCESSORY' ||
        url.searchParams.get('pageSize') !== '6'
      ) {
        await route.fallback();
        return;
      }
      await filterRelease;
      await route.fallback();
    });
    const filteredRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return (
        request.method() === 'GET' &&
        url.pathname === '/api/v1/backoffice/products' &&
        url.searchParams.get('type') === 'ACCESSORY' &&
        url.searchParams.get('pageSize') === '6'
      );
    });
    try {
      await typeFilter.focus();
      await typeFilter.selectOption('ACCESSORY');
      await filteredRequest;
      await expect(productBoard).toHaveAttribute('aria-busy', 'true');
      await expect(
        productBoard.getByRole('heading', { level: 2, name: PRODUCT_NAME }),
      ).toBeVisible();
      await expect(typeFilter).toBeFocused();
    } finally {
      releaseFilter();
    }
    await expect(productBoard).not.toHaveAttribute('aria-busy', 'true');
    await expect(page).toHaveURL(/type=ACCESSORY/);

    await page.goto('/backoffice/catalog/products/new');
    await expect(page.getByRole('heading', { level: 1, name: 'Thêm sản phẩm' })).toBeVisible();
    await page.getByLabel('Tên sản phẩm').fill(PRODUCT_NAME);
    await page.getByRole('textbox', { name: /^Mô tả \*/ }).fill('Mẫu máy dành cho kiểm thử FE-05.');
    await page.getByLabel('Năm ra mắt').fill('2023');
    await page.getByLabel('Dung lượng RAM').selectOption('8');
    await page.getByLabel('Kích thước màn hình').fill('6.1');
    await page.getByLabel('Bộ xử lý').fill('Apple A17 Pro');
    await page.getByLabel('Chính sách bảo hành').selectOption(POLICY_ID);
    await page.getByLabel('Tiêu đề tìm kiếm').fill('iPhone 15 Pro đang có sẵn');
    await page
      .getByLabel('Mô tả tìm kiếm')
      .fill('Thông tin rõ ràng về các máy iPhone 15 Pro đang có sẵn.');
    await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();

    await page.waitForURL(`/backoffice/catalog/products/${PRODUCT_ID}`);
    await expect(page.getByRole('heading', { level: 1, name: PRODUCT_NAME })).toBeVisible();
    expect(probe.productCreateBody).toMatchObject({
      brand: 'Apple',
      name: PRODUCT_NAME,
      slug: 'iphone-15-pro-fe05',
      type: 'IPHONE',
      warrantyPolicyId: POLICY_ID,
    });

    const editProduct = page.locator('header').getByRole('button', {
      name: 'Lưu thay đổi',
      exact: true,
    });
    probe.conflictNextProductUpdate = true;
    const detailRequestsBeforeConflict = probe.detailRequests;
    await editProduct.click();
    const productDialog = page.getByRole('dialog', { name: 'Chỉnh sửa thông tin' });
    await productDialog.getByLabel('Tên sản phẩm').fill(`${PRODUCT_NAME} cũ`);
    await productDialog.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await expect(productDialog).toHaveCount(0);
    await expect(
      page.getByText(
        'Dữ liệu sản phẩm vừa thay đổi. Đã tải lại thông tin mới nhất; hãy kiểm tra rồi thao tác lại.',
        { exact: true },
      ),
    ).toBeVisible();
    expect(probe.detailRequests).toBeGreaterThan(detailRequestsBeforeConflict);
    await expect(page.getByRole('heading', { level: 1, name: PRODUCT_NAME })).toBeVisible();

    await page.getByRole('button', { name: 'Thêm biến thể', exact: true }).click();
    const createVariantDialog = page.getByRole('dialog', { name: 'Thêm biến thể' });
    await createVariantDialog.getByLabel('Tên phiên bản *').fill('256 GB · Titan');
    await createVariantDialog.getByLabel('Mã biến thể *').fill('IP15P-256-TTN-FE09');
    await createVariantDialog.getByLabel('Dung lượng *').fill('256');
    await createVariantDialog.getByLabel('Tên màu *').fill('Titan');
    await createVariantDialog.getByRole('button', { name: 'Thêm biến thể', exact: true }).click();
    await expect(createVariantDialog).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 3, name: '256 GB · Titan' })).toBeVisible();

    await page.getByRole('button', { name: 'Sửa 256 GB · Titan' }).click();
    const editVariantDialog = page.getByRole('dialog', { name: 'Chỉnh sửa biến thể' });
    await editVariantDialog.getByLabel('Tên phiên bản *').fill('256 GB · Titan tự nhiên');
    await editVariantDialog.getByRole('button', { name: 'Lưu biến thể', exact: true }).click();
    await expect(editVariantDialog).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 3, name: '256 GB · Titan tự nhiên' }),
    ).toBeVisible();

    const productMediaInput = page.locator('#product-media input[type="file"]');
    const uploadsBeforeEmptyFile = probe.mediaUploads;
    await productMediaInput.setInputFiles({
      name: 'empty.png',
      mimeType: 'image/png',
      buffer: Buffer.from([]),
    });
    await expect(page.getByText('Tệp ảnh đang trống.', { exact: true })).toBeVisible();
    expect(probe.mediaUploads).toBe(uploadsBeforeEmptyFile);
    await productMediaInput.setInputFiles({
      name: 'product.webp',
      mimeType: 'image/webp',
      buffer: Buffer.from('product-image'),
    });
    await expect(page.getByText('Đã tải hình ảnh lên.', { exact: true })).toBeVisible();

    const createdVariantInput = page.getByLabel('Tải ảnh cho 256 GB · Titan tự nhiên');
    await createdVariantInput.setInputFiles({
      name: 'variant.webp',
      mimeType: 'image/webp',
      buffer: Buffer.from('variant-image'),
    });
    await expect(page.getByText('Ảnh phiên bản mới', { exact: true })).toBeVisible();

    const productMediaSection = page.locator('#product-media');
    await productMediaSection.getByRole('button', { name: 'Sửa' }).last().click();
    const mediaDialog = page.getByRole('dialog', { name: 'Chỉnh sửa hình ảnh' });
    await mediaDialog.getByLabel('Mô tả hình ảnh').fill('Ảnh sản phẩm đã chỉnh sửa');
    await mediaDialog.getByLabel('Vị trí hiển thị').fill('12');
    await mediaDialog.getByRole('button', { name: 'Lưu hình ảnh', exact: true }).click();
    await expect(mediaDialog).toHaveCount(0);
    await expect(page.getByText('Ảnh sản phẩm đã chỉnh sửa', { exact: true })).toBeVisible();
    const deletesBefore = probe.mediaDeletes;
    await productMediaSection.getByRole('button', { name: 'Xóa' }).last().click();
    const deleteMediaDialog = page.getByRole('dialog', { name: 'Xóa hình ảnh này?' });
    await deleteMediaDialog.getByRole('button', { name: 'Xóa hình ảnh', exact: true }).click();
    await expect(deleteMediaDialog).toHaveCount(0);
    expect(probe.mediaDeletes).toBe(deletesBefore + 1);

    await page.getByRole('button', { name: 'Lưu trữ 256 GB · Titan tự nhiên' }).click();
    const archiveVariantDialog = page.getByRole('dialog', {
      name: 'Lưu trữ 256 GB · Titan tự nhiên?',
    });
    await archiveVariantDialog.getByLabel('Lý do').fill('Ngừng nhập cấu hình thử nghiệm');
    await archiveVariantDialog
      .getByRole('button', { name: 'Lưu trữ biến thể', exact: true })
      .click();
    await expect(archiveVariantDialog).toHaveCount(0);

    await page.locator('header').getByRole('button', { name: 'Mở bán', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Mở bán ${PRODUCT_NAME}?` });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Mở bán sản phẩm', exact: true }).click();
    await expect(page.getByText('Sản phẩm đã được mở bán.', { exact: true })).toBeVisible();
    await expect(page.getByText('Đang bán', { exact: true }).first()).toBeVisible();
    expect(probe.catalogStatus).toBe('ACTIVE');
    await expectNaturalVietnameseMain(page);
    await expectSingleMainAndNoOverflow(page);
  });

  test(bt('browser:catalog-voucher-admin', 'voucher-lifecycle'), async ({ page }) => {
    const probe = await installFe05Api(page, 'ADMIN', { catalogStatus: 'ACTIVE' });

    let markProductAStarted: (() => void) | undefined;
    let markProductACompleted: (() => void) | undefined;
    let releaseProductA: (() => void) | undefined;
    const productAStarted = new Promise<void>((resolve) => {
      markProductAStarted = resolve;
    });
    const productARelease = new Promise<void>((resolve) => {
      releaseProductA = resolve;
    });
    const productACompleted = new Promise<void>((resolve) => {
      markProductACompleted = resolve;
    });
    await page.route(`**/api/v1/backoffice/products/${PRODUCT_ID}`, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      markProductAStarted?.();
      await productARelease;
      await route.fallback();
      markProductACompleted?.();
    });

    await page.goto('/backoffice/vouchers');
    await expect(page.getByRole('heading', { level: 1, name: 'Mã ưu đãi' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: VOUCHER_NAME })).toBeVisible();

    await page.goto('/backoffice/vouchers/new');
    await expect(page.getByRole('heading', { level: 1, name: 'Tạo mã ưu đãi' })).toBeVisible();
    await page.getByRole('textbox', { name: /^Mã ưu đãi/ }).fill('fe05demo');
    await page.getByLabel('Tên chương trình').fill(VOUCHER_NAME);
    await page.getByLabel('Mô tả').fill('Ưu đãi dành cho sản phẩm đã chọn.');
    await page.getByLabel('Mức giảm (%)').fill('10');
    await page.getByLabel('Giảm tối đa (đ)').fill('1500000');
    await page.getByLabel('Giá trị đơn hàng tối thiểu (đ)').fill('10000000');
    await page.getByLabel('Biến thể cụ thể').check();
    const variantProduct = page.getByLabel('Chọn sản phẩm để xem biến thể');
    await variantProduct.selectOption(PRODUCT_ID);
    await productAStarted;
    await variantProduct.selectOption(PRODUCT_B_ID);
    await expect(page.getByRole('checkbox', { name: '256 GB · Titan sa mạc' })).toBeVisible();
    releaseProductA?.();
    await productACompleted;
    await page.waitForTimeout(50);
    await expect(page.getByRole('checkbox', { name: '128 GB · Đen' })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: '256 GB · Titan sa mạc' })).toBeVisible();
    await page.getByRole('checkbox', { name: '256 GB · Titan sa mạc' }).check();
    await page.getByLabel('Bắt đầu').fill('2026-09-01T08:00');
    await page.getByLabel('Kết thúc').fill('2026-09-30T23:00');
    await page.getByLabel('Tổng lượt sử dụng').fill('300');
    await page.getByLabel('Chỉ dành cho tài khoản').check();
    await page.getByLabel('Mỗi khách hàng').fill('1');
    await page.locator('#create-voucher-form').evaluate((form) => {
      const voucherForm = form as HTMLFormElement;
      voucherForm.requestSubmit();
      voucherForm.requestSubmit();
    });

    await page.waitForURL(`/backoffice/vouchers/${VOUCHER_ID}?created=1`);
    await expect(page.getByRole('heading', { level: 1, name: VOUCHER_NAME })).toBeVisible();
    expect(probe.voucherCreateRequests).toBe(1);
    expect(probe.voucherCreateBody).toMatchObject({
      code: 'FE05DEMO',
      endsAt: '2026-09-30T16:00:00.000Z',
      name: VOUCHER_NAME,
      scopeConfig: { variantIds: [VARIANT_B_ID] },
      scopeType: 'VARIANTS',
      startsAt: '2026-09-01T01:00:00.000Z',
      visibility: 'ACCOUNT_ONLY',
    });
    const usageRow = page.getByText('RPH-20260828-FE050001', { exact: true });
    await expect(usageRow).toBeVisible();

    await page.getByRole('button', { name: 'Mở áp dụng', exact: true }).click();
    const activateDialog = page.getByRole('dialog', { name: 'Mở áp dụng mã ưu đãi?' });
    await expect(activateDialog).toBeVisible();
    const transitionsBeforeActivation = probe.voucherTransitionRequests;
    const usagesBeforeActivation = probe.voucherUsageRequests;
    await activateDialog
      .getByRole('button', { name: 'Mở áp dụng', exact: true })
      .evaluate((button) => {
        (button as HTMLButtonElement).click();
        (button as HTMLButtonElement).click();
      });
    await expect(page.getByText('Mã ưu đãi đang được áp dụng.', { exact: true })).toBeVisible();
    await expect(page.getByText('Đang áp dụng', { exact: true }).first()).toBeVisible();
    await expect.poll(() => probe.voucherTransitionRequests).toBe(transitionsBeforeActivation + 1);
    await expect.poll(() => probe.voucherUsageRequests).toBe(usagesBeforeActivation + 1);
    await page.waitForTimeout(100);
    expect(probe.voucherUsageRequests).toBe(usagesBeforeActivation + 1);

    await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
    const activeName = `${VOUCHER_NAME} mới`;
    const activeDescription = 'Nội dung giới thiệu đã được cập nhật.';
    await page.getByLabel('Tên chương trình').fill(activeName);
    await page.getByLabel('Mô tả').fill(activeDescription);
    probe.failNextVoucherUsage = true;
    const updatesBeforeActiveEdit = probe.voucherUpdateRequests;
    const usagesBeforeActiveEdit = probe.voucherUsageRequests;
    await page.locator('#edit-voucher-form').evaluate((form) => {
      const voucherForm = form as HTMLFormElement;
      voucherForm.requestSubmit();
      voucherForm.requestSubmit();
    });
    await expect(page.getByText('Đã lưu thay đổi của mã ưu đãi.', { exact: true })).toBeVisible();
    await expect(page.getByText('Chưa tải được lịch sử sử dụng', { exact: true })).toBeVisible();
    await expect(usageRow).toBeVisible();
    await expect(page.getByText('Chưa thể hoàn tất', { exact: true })).toHaveCount(0);
    expect(probe.voucherUpdateRequests).toBe(updatesBeforeActiveEdit + 1);
    expect(probe.voucherUpdateBodies[probe.voucherUpdateBodies.length - 1]).toEqual({
      description: activeDescription,
      name: activeName,
    });
    await expect.poll(() => probe.voucherUsageRequests).toBe(usagesBeforeActiveEdit + 1);
    await page.waitForTimeout(100);
    expect(probe.voucherUsageRequests).toBe(usagesBeforeActiveEdit + 1);
    await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await expect.poll(() => probe.voucherUsageRequests).toBe(usagesBeforeActiveEdit + 2);
    await expect(page.getByText('Chưa tải được lịch sử sử dụng', { exact: true })).toHaveCount(0);
    await expect(usageRow).toBeVisible();

    const authoritativeName = 'Ưu đãi đã được cập nhật ở nơi khác';
    probe.voucherName = authoritativeName;
    probe.conflictNextVoucherUpdate = true;
    const detailsBeforeConflict = probe.voucherDetailRequests;
    await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
    await page.getByLabel('Tên chương trình').fill('Nội dung chỉnh sửa đã cũ');
    await page.locator('#edit-voucher-form').evaluate((form) => {
      (form as HTMLFormElement).requestSubmit();
    });
    await expect(page.locator('#edit-voucher-form')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: authoritativeName })).toBeVisible();
    await expect(
      page
        .locator('main')
        .getByRole('alert')
        .filter({ hasText: 'Mã ưu đãi vừa được cập nhật. Hãy tải lại dữ liệu mới nhất.' }),
    ).toBeVisible();
    expect(probe.voucherDetailRequests).toBeGreaterThan(detailsBeforeConflict);

    await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
    const pauseDialog = page.getByRole('dialog', { name: 'Tạm dừng mã ưu đãi?' });
    await pauseDialog.getByLabel('Lý do tạm dừng').fill('Điều chỉnh nội dung chương trình');
    const transitionsBeforePause = probe.voucherTransitionRequests;
    await pauseDialog.getByRole('button', { name: 'Tạm dừng', exact: true }).evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(page.getByText('Đã tạm dừng mã ưu đãi.', { exact: true })).toBeVisible();
    await expect(page.getByText('Tạm dừng', { exact: true }).first()).toBeVisible();
    expect(probe.voucherTransitionRequests).toBe(transitionsBeforePause + 1);
    expect(probe.pauseReason).toBe('Điều chỉnh nội dung chương trình');
    expect(probe.voucherStatus).toBe('PAUSED');
    await expectNaturalVietnameseMain(page);
    await expectSingleMainAndNoOverflow(page);
  });

  test(bt('browser:catalog-voucher-admin', 'admin-responsive'), async ({ page }) => {
    test.setTimeout(240_000);
    await freezeWp11Clock(page);
    await installDeterministicWp11CatalogMedia(page);
    await installFe05Api(page, 'ADMIN');
    const screens = [
      { path: '/backoffice/catalog/products', heading: 'Danh mục sản phẩm' },
      { path: '/backoffice/catalog/products/new', heading: 'Thêm sản phẩm' },
      { path: '/backoffice/vouchers', heading: 'Mã ưu đãi' },
      { path: '/backoffice/vouchers/new', heading: 'Tạo mã ưu đãi' },
      { path: `/backoffice/vouchers/${VOUCHER_ID}`, heading: VOUCHER_NAME },
    ] as const;

    for (const viewport of WP11_RESPONSIVE_VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`/backoffice/catalog/products/${PRODUCT_ID}`);
      await expect(page.getByRole('heading', { level: 1, name: PRODUCT_NAME })).toBeVisible();
      await expect(page.getByText('Bản nháp', { exact: true }).first()).toBeVisible();
      await expect(
        page.getByRole('img', { name: `Chưa có ảnh cho ${PRODUCT_NAME}` }),
      ).toBeVisible();
      await expectNaturalVietnameseMain(page);
      await expectSingleMainAndNoOverflow(page);

      if (viewport.name === 'desktop-1440' || viewport.name === 'mobile-390') {
        await expectAccessible(page);
        await stabilizeWp11VisualPage(page);
        await expect(page).toHaveScreenshot(
          `wp11-catalog-product-detail-draft-${viewport.name}.png`,
          {
            animations: 'disabled',
            caret: 'hide',
          },
        );
      }
    }

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      for (const screen of screens) {
        await page.goto(screen.path);
        await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible();
        await expectNaturalVietnameseMain(page);
        await expectSingleMainAndNoOverflow(page);
        await expectAccessible(page);
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    let releaseUsages!: () => void;
    const usagesReady = new Promise<void>((resolve) => {
      releaseUsages = resolve;
    });
    const usagesPattern = `**/api/v1/backoffice/vouchers/${VOUCHER_ID}/usages*`;
    await page.route(usagesPattern, async (route) => {
      await usagesReady;
      await route.fallback();
    });
    try {
      await page.goto(`/backoffice/vouchers/${VOUCHER_ID}`);
      const usageRegion = page.getByRole('region', { name: 'Lịch sử sử dụng mã ưu đãi' });
      await expect(usageRegion).toHaveAttribute('aria-busy', 'true');
      await page.getByLabel('Trạng thái lượt sử dụng').focus();
      await page.keyboard.press('Tab');
      await expect(usageRegion).toBeFocused();
      await expect
        .poll(() => usageRegion.evaluate((element) => element.scrollWidth <= element.clientWidth))
        .toBe(true);
      await expect(usageRegion.getByText('Đang tải…', { exact: true })).toBeVisible();
      await expectAccessible(page);
    } finally {
      releaseUsages();
    }
    const loadedUsageRegion = page.getByRole('region', { name: 'Lịch sử sử dụng mã ưu đãi' });
    const usageOrder = loadedUsageRegion.getByRole('link', {
      name: 'RPH-20260828-FE050001',
      exact: true,
    });
    await expect(usageOrder).toBeVisible();
    await expect(loadedUsageRegion.locator('td[data-label="Khách hàng"]')).toBeVisible();
    await expect(loadedUsageRegion.locator('td[data-label="Trạng thái"]')).toBeVisible();
    await expect(loadedUsageRegion.locator('td[data-label="Thời gian"]')).toBeVisible();
    await expect
      .poll(() =>
        loadedUsageRegion.evaluate((element) => element.scrollWidth <= element.clientWidth),
      )
      .toBe(true);
    await loadedUsageRegion.focus();
    await page.keyboard.press('Tab');
    await expect(usageOrder).toBeFocused();
    await page.unroute(usagesPattern);

    await page.goto(`/backoffice/catalog/products/${PRODUCT_ID}`);
    await page.getByRole('button', { name: 'Thêm biến thể', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Thêm biến thể' })).toBeVisible();
    await expectSingleMainAndNoOverflow(page);
    await expectAccessible(page);
    await page.keyboard.press('Escape');
    await page.locator('#product-media').getByRole('button', { name: 'Sửa' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Chỉnh sửa hình ảnh' })).toBeVisible();
    await expectSingleMainAndNoOverflow(page);
    await expectAccessible(page);
    await page.keyboard.press('Escape');

    await page.goto(`/backoffice/vouchers/${VOUCHER_ID}`);
    await page.getByRole('button', { name: 'Mở áp dụng', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Mở áp dụng mã ưu đãi?' })).toBeVisible();
    await expectSingleMainAndNoOverflow(page);
    await expectAccessible(page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Lưu trữ mã ưu đãi', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Lưu trữ mã ưu đãi?' })).toBeVisible();
    await expectSingleMainAndNoOverflow(page);
    await expectAccessible(page);
  });
});

async function installFe05Api(
  page: Page,
  role: StaffRole,
  initial: Partial<Pick<ApiProbe, 'catalogStatus' | 'voucherStatus'>> = {},
): Promise<ApiProbe> {
  const probe: ApiProbe = {
    catalogQueries: [],
    catalogStatus: initial.catalogStatus ?? 'DRAFT',
    conflictNextProductUpdate: false,
    conflictNextVoucherUpdate: false,
    detailRequests: 0,
    failNextVoucherUsage: false,
    mediaDeletes: 0,
    mediaUploads: 0,
    pauseReason: null,
    productMedia: [mediaFixture(PRODUCT_MEDIA_ID, 'Ảnh sản phẩm ban đầu', 0)],
    productCreateBody: null,
    voucherCreateBody: null,
    voucherCreateRequests: 0,
    voucherDescription: 'Ưu đãi dành cho sản phẩm đã chọn.',
    voucherDetailRequests: 0,
    voucherName: VOUCHER_NAME,
    voucherRequests: 0,
    voucherStatus: initial.voucherStatus ?? 'DRAFT',
    voucherTransitionRequests: 0,
    voucherUpdateBodies: [],
    voucherUpdateRequests: 0,
    voucherUsageRequests: 0,
    variantMedia: [mediaFixture(VARIANT_MEDIA_ID, 'Ảnh phiên bản ban đầu', 0)],
    variants: [variantFixture(VARIANT_ID, '128 GB · Đen', 'ACTIVE')],
  };

  await page.route('**/api/v1/auth/refresh', async (route) => {
    await fulfillJson(route, {
      data: {
        accessToken: `fe05-${role.toLowerCase()}-access`,
        user: staffUser(role),
      },
    });
  });

  await page.route('**/api/v1/backoffice/**', async (route) => {
    if (await fulfillPendingTasks(route)) return;
    if (route.request().method() === 'OPTIONS') {
      await fulfillPreflight(route);
      return;
    }
    const url = new URL(route.request().url());
    const { pathname } = url;
    const method = route.request().method();

    if (pathname.endsWith('/backoffice/warranty-policies') && method === 'GET') {
      await fulfillJson(route, warrantyPolicyPage());
      return;
    }

    if (pathname.endsWith('/backoffice/products') && method === 'GET') {
      probe.catalogQueries.push(url.search);
      const requestedStatus = url.searchParams.get('status');
      const matches = requestedStatus === null || requestedStatus === probe.catalogStatus;
      const product = catalogProduct(probe.catalogStatus, probe);
      const pageSize = Number(url.searchParams.get('pageSize')) || 12;
      await fulfillJson(
        route,
        paged(matches ? [product, ...(pageSize === 100 ? [catalogProductB()] : [])] : [], pageSize),
      );
      return;
    }

    if (pathname.endsWith('/backoffice/products') && method === 'POST') {
      probe.productCreateBody = requestJson(route);
      probe.catalogStatus = 'DRAFT';
      await fulfillJson(route, { data: catalogProduct(probe.catalogStatus, probe) }, 201);
      return;
    }

    if (pathname.endsWith(`/backoffice/products/${PRODUCT_ID}/publish`) && method === 'POST') {
      probe.catalogStatus = 'ACTIVE';
      await fulfillJson(route, { data: catalogProduct(probe.catalogStatus, probe) });
      return;
    }

    if (pathname.endsWith(`/backoffice/products/${PRODUCT_ID}`) && method === 'GET') {
      probe.detailRequests += 1;
      await fulfillJson(route, { data: catalogProduct(probe.catalogStatus, probe) });
      return;
    }

    if (pathname.endsWith(`/backoffice/products/${PRODUCT_B_ID}`) && method === 'GET') {
      await fulfillJson(route, { data: catalogProductB() });
      return;
    }

    if (pathname.endsWith(`/backoffice/products/${PRODUCT_ID}`) && method === 'PATCH') {
      if (probe.conflictNextProductUpdate) {
        probe.conflictNextProductUpdate = false;
        await fulfillJson(
          route,
          { error: { code: 'CONCURRENT_MODIFICATION', message: 'stale browser fixture' } },
          409,
        );
        return;
      }
      await fulfillJson(route, { data: catalogProduct(probe.catalogStatus, probe) });
      return;
    }

    if (pathname.endsWith(`/backoffice/products/${PRODUCT_ID}/variants`) && method === 'POST') {
      const body = requestJson(route);
      const created = variantFixture(
        CREATED_VARIANT_ID,
        stringField(body, 'displayName') ?? '256 GB · Titan',
        'DRAFT',
      );
      probe.variants.push(created);
      await fulfillJson(route, { data: created }, 201);
      return;
    }

    if (pathname.endsWith(`/backoffice/variants/${CREATED_VARIANT_ID}`) && method === 'PATCH') {
      const body = requestJson(route);
      const variant = probe.variants.find(({ id }) => id === CREATED_VARIANT_ID);
      if (variant !== undefined) {
        variant.displayName = stringField(body, 'displayName') ?? variant.displayName;
      }
      await fulfillJson(route, { data: variant });
      return;
    }

    if (
      pathname.endsWith(`/backoffice/variants/${CREATED_VARIANT_ID}/archive`) &&
      method === 'POST'
    ) {
      const variant = probe.variants.find(({ id }) => id === CREATED_VARIANT_ID);
      if (variant !== undefined) variant.status = 'ARCHIVED';
      await fulfillJson(route, { data: variant });
      return;
    }

    if (pathname.endsWith(`/backoffice/products/${PRODUCT_ID}/media`) && method === 'POST') {
      probe.mediaUploads += 1;
      const media = mediaFixture(
        UPLOADED_PRODUCT_MEDIA_ID,
        PRODUCT_NAME,
        nextMediaSortOrder(probe.productMedia),
      );
      probe.productMedia.push(media);
      await fulfillJson(route, { data: media }, 201);
      return;
    }

    if (
      pathname.endsWith(`/backoffice/variants/${CREATED_VARIANT_ID}/media`) &&
      method === 'POST'
    ) {
      probe.mediaUploads += 1;
      const media = mediaFixture(UPLOADED_VARIANT_MEDIA_ID, 'Ảnh phiên bản mới', 0);
      probe.variantMedia.push(media);
      await fulfillJson(route, { data: media }, 201);
      return;
    }

    if (pathname.includes('/backoffice/product-media/') && method === 'PATCH') {
      const mediaId = pathname.slice(pathname.lastIndexOf('/') + 1);
      const body = requestJson(route);
      const media = [...probe.productMedia, ...probe.variantMedia].find(({ id }) => id === mediaId);
      if (media !== undefined) {
        media.altText = stringField(body, 'altText') ?? media.altText;
        if (typeof body['sortOrder'] === 'number') media.sortOrder = body['sortOrder'];
      }
      await fulfillJson(route, { data: media });
      return;
    }

    if (pathname.includes('/backoffice/product-media/') && method === 'DELETE') {
      const mediaId = pathname.slice(pathname.lastIndexOf('/') + 1);
      probe.productMedia = probe.productMedia.filter(({ id }) => id !== mediaId);
      probe.variantMedia = probe.variantMedia.filter(({ id }) => id !== mediaId);
      probe.mediaDeletes += 1;
      await route.fulfill({ status: 204, headers: corsHeaders(route) });
      return;
    }

    if (pathname.includes('/backoffice/vouchers')) probe.voucherRequests += 1;

    if (pathname.endsWith('/backoffice/vouchers') && method === 'GET') {
      const requestedStatus = url.searchParams.get('status');
      const matches = requestedStatus === null || requestedStatus === probe.voucherStatus;
      await fulfillJson(
        route,
        paged(
          matches ? [voucher(probe.voucherStatus, probe)] : [],
          Number(url.searchParams.get('pageSize')) || 12,
        ),
      );
      return;
    }

    if (pathname.endsWith('/backoffice/vouchers') && method === 'POST') {
      probe.voucherCreateRequests += 1;
      probe.voucherCreateBody = requestJson(route);
      probe.voucherName = stringField(probe.voucherCreateBody, 'name') ?? probe.voucherName;
      probe.voucherDescription =
        stringField(probe.voucherCreateBody, 'description') ?? probe.voucherDescription;
      probe.voucherStatus = 'DRAFT';
      await fulfillJson(route, { data: voucher(probe.voucherStatus, probe) }, 201);
      return;
    }

    if (pathname.endsWith(`/backoffice/vouchers/${VOUCHER_ID}/usages`) && method === 'GET') {
      probe.voucherUsageRequests += 1;
      if (probe.failNextVoucherUsage) {
        probe.failNextVoucherUsage = false;
        await fulfillJson(
          route,
          { error: { code: 'SERVICE_UNAVAILABLE', message: 'usage fixture unavailable' } },
          503,
        );
        return;
      }
      await fulfillJson(route, voucherUsagePage());
      return;
    }

    if (pathname.endsWith(`/backoffice/vouchers/${VOUCHER_ID}/activate`) && method === 'POST') {
      probe.voucherTransitionRequests += 1;
      probe.voucherStatus = 'ACTIVE';
      await fulfillJson(route, { data: voucher(probe.voucherStatus, probe) });
      return;
    }

    if (pathname.endsWith(`/backoffice/vouchers/${VOUCHER_ID}/pause`) && method === 'POST') {
      probe.voucherTransitionRequests += 1;
      probe.pauseReason = stringField(requestJson(route), 'reason');
      probe.voucherStatus = 'PAUSED';
      await fulfillJson(route, { data: voucher(probe.voucherStatus, probe) });
      return;
    }

    if (pathname.endsWith(`/backoffice/vouchers/${VOUCHER_ID}`) && method === 'PATCH') {
      probe.voucherUpdateRequests += 1;
      const body = requestJson(route);
      probe.voucherUpdateBodies.push(body);
      if (probe.conflictNextVoucherUpdate) {
        probe.conflictNextVoucherUpdate = false;
        await fulfillJson(
          route,
          { error: { code: 'CONCURRENT_MODIFICATION', message: 'stale voucher fixture' } },
          409,
        );
        return;
      }
      probe.voucherName = stringField(body, 'name') ?? probe.voucherName;
      probe.voucherDescription = stringField(body, 'description') ?? probe.voucherDescription;
      await fulfillJson(route, { data: voucher(probe.voucherStatus, probe) });
      return;
    }

    if (pathname.endsWith(`/backoffice/vouchers/${VOUCHER_ID}`) && method === 'GET') {
      probe.voucherDetailRequests += 1;
      await fulfillJson(route, { data: voucher(probe.voucherStatus, probe) });
      return;
    }

    await fulfillJson(
      route,
      { error: { code: 'RESOURCE_NOT_FOUND', message: 'Browser fixture route not found' } },
      404,
    );
  });

  return probe;
}

function staffUser(role: StaffRole) {
  return {
    id:
      role === 'ADMIN'
        ? '0199c346-f8d2-79d8-b90b-e462bd717fa0'
        : '0199c346-f8d2-79d8-b90b-e462bd717fa1',
    email: `${role.toLowerCase()}-fe05@rephone.local`,
    fullName: role === 'ADMIN' ? 'Quản trị viên FE05' : 'Nhân viên FE05',
    phone: '0900000505',
    role,
    status: 'ACTIVE',
  } as const;
}

function variantFixture(
  id: string,
  displayName: string,
  status: RecordStatus,
  productId = PRODUCT_ID,
) {
  return {
    id,
    productId,
    sku: productId === PRODUCT_B_ID ? 'IP16P-256-DSR-FE09' : 'IP15P-128-BLK-FE05',
    displayName,
    storageCapacityGb: 128,
    colorName: 'Đen',
    colorHex: '#111111',
    inventoryMode: 'SERIALIZED',
    salePrice: null,
    compareAtPrice: null,
    accessoryAttributes: null,
    warrantyPolicyId: POLICY_ID,
    status,
    media: [],
    createdAt: '2026-08-28T01:00:00.000Z',
    updatedAt: '2026-08-28T02:00:00.000Z',
  };
}

function mediaFixture(id: string, altText: string, sortOrder: number) {
  return {
    id,
    ownerType: 'PRODUCT',
    ownerId: PRODUCT_ID,
    url: `https://cdn.example.test/${id}.webp`,
    mimeType: 'image/webp',
    fileSize: 1024,
    width: 800,
    height: 800,
    sortOrder,
    altText,
    createdAt: '2026-08-28T02:00:00.000Z',
  };
}

function nextMediaSortOrder(media: readonly ReturnType<typeof mediaFixture>[]) {
  return media.reduce((maximum, item) => Math.max(maximum, item.sortOrder), -1) + 1;
}

function catalogProduct(status: RecordStatus, probe: ApiProbe) {
  const variants = probe.variants.map((variant) => ({
    ...variant,
    media: variant.id === CREATED_VARIANT_ID ? probe.variantMedia : variant.media,
  }));
  return {
    id: PRODUCT_ID,
    type: 'IPHONE',
    brand: 'Apple',
    name: PRODUCT_NAME,
    slug: 'iphone-15-pro-fe05',
    status,
    releaseYear: 2023,
    variantCount: variants.length,
    primaryMedia: probe.productMedia[0] ?? null,
    createdAt: '2026-08-28T01:00:00.000Z',
    updatedAt: '2026-08-28T02:00:00.000Z',
    description: 'Mẫu máy dành cho kiểm thử FE-05.',
    chipset: 'Apple A17 Pro',
    ramGb: 8,
    screenSizeInches: '6.1',
    warrantyPolicyId: POLICY_ID,
    seoTitle: 'iPhone 15 Pro đang có sẵn',
    seoDescription: 'Thông tin rõ ràng về các máy iPhone 15 Pro đang có sẵn.',
    archivedAt: status === 'ARCHIVED' ? '2026-08-28T03:00:00.000Z' : null,
    variants,
    media: probe.productMedia,
  };
}

function catalogProductB() {
  const variants = [variantFixture(VARIANT_B_ID, '256 GB · Titan sa mạc', 'ACTIVE', PRODUCT_B_ID)];
  return {
    id: PRODUCT_B_ID,
    type: 'IPHONE',
    brand: 'Apple',
    name: PRODUCT_B_NAME,
    slug: 'iphone-16-pro-fe09',
    status: 'ACTIVE',
    releaseYear: 2024,
    variantCount: variants.length,
    primaryMedia: null,
    createdAt: '2026-08-28T01:00:00.000Z',
    updatedAt: '2026-08-28T02:00:00.000Z',
    description: 'Sản phẩm dùng để kiểm tra đổi lựa chọn biến thể.',
    chipset: 'Apple A18 Pro',
    ramGb: 8,
    screenSizeInches: '6.3',
    warrantyPolicyId: POLICY_ID,
    seoTitle: null,
    seoDescription: null,
    archivedAt: null,
    variants,
    media: [],
  };
}

function warrantyPolicyPage() {
  return paged(
    [
      {
        id: POLICY_ID,
        code: 'IPHONE-90',
        name: 'Bảo hành iPhone',
        defaultDays: 90,
        terms: 'Bảo hành phần cứng trong 90 ngày.',
        status: 'ACTIVE',
        isArchived: false,
        archivedAt: null,
        createdAt: '2026-08-28T01:00:00.000Z',
        updatedAt: '2026-08-28T01:00:00.000Z',
      },
    ],
    100,
  );
}

function voucher(status: VoucherStatus, probe?: ApiProbe) {
  const requestedScopeType = probe?.voucherCreateBody?.['scopeType'];
  const scopeType =
    requestedScopeType === 'ORDER' ||
    requestedScopeType === 'PRODUCT_TYPE' ||
    requestedScopeType === 'PRODUCTS' ||
    requestedScopeType === 'VARIANTS'
      ? requestedScopeType
      : 'PRODUCTS';
  const requestedScopeConfig = probe?.voucherCreateBody?.['scopeConfig'];
  const scopeConfig =
    requestedScopeConfig !== null &&
    typeof requestedScopeConfig === 'object' &&
    !Array.isArray(requestedScopeConfig)
      ? requestedScopeConfig
      : { productIds: [PRODUCT_ID] };
  return {
    id: VOUCHER_ID,
    code: 'FE05DEMO',
    name: probe?.voucherName ?? VOUCHER_NAME,
    description: probe?.voucherDescription ?? 'Ưu đãi dành cho sản phẩm đã chọn.',
    discountType: 'PERCENT',
    discountValue: '10',
    maxDiscountAmount: '1500000',
    minimumOrderAmount: '10000000',
    startsAt: '2026-09-01T01:00:00.000Z',
    endsAt: '2026-09-30T16:00:00.000Z',
    totalUsageLimit: 300,
    perCustomerLimit: 1,
    visibility: 'ACCOUNT_ONLY',
    scopeType,
    scopeConfig,
    status,
    usageCounts: { reserved: 1, consumed: 12, released: 2 },
    createdAt: '2026-08-28T01:00:00.000Z',
    updatedAt: '2026-08-28T02:00:00.000Z',
  };
}

function voucherUsagePage() {
  return paged(
    [
      {
        id: '0199c9aa-a258-74c8-a35f-9cd11c562aa2',
        orderId: '0199c9aa-a258-74c8-a35f-9cd11c562aa3',
        orderNumber: 'RPH-20260828-FE050001',
        customerId: '0199c9aa-a258-74c8-a35f-9cd11c562aa4',
        customer: { name: 'Nguyễn Hoàng Nam', email: 'nam@example.com' },
        status: 'CONSUMED',
        createdAt: '2026-08-28T07:32:00.000Z',
        consumedAt: '2026-08-28T07:33:00.000Z',
        releasedAt: null,
      },
    ],
    10,
  );
}

function paged(data: readonly unknown[], pageSize: number) {
  return {
    data,
    meta: {
      pagination: {
        page: 1,
        pageSize,
        totalItems: data.length,
        totalPages: data.length === 0 ? 0 : 1,
      },
    },
  };
}

function requestJson(route: Route): Record<string, unknown> {
  const value: unknown = route.request().postDataJSON();
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === 'string' ? value[key] : null;
}

async function fulfillPreflight(route: Route): Promise<void> {
  await route.fulfill({ status: 204, headers: corsHeaders(route) });
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: corsHeaders(route),
    body: JSON.stringify(body),
  });
}

function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers()['origin'];
  return {
    ...(origin === undefined
      ? {}
      : {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        }),
    'Access-Control-Allow-Headers': 'authorization, content-type, x-csrf-token',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
}

async function expectNaturalVietnameseMain(page: Page): Promise<void> {
  const mainText = await page.locator('main').innerText();
  expect(mainText).not.toMatch(
    /\b(?:DRAFT|ACTIVE|PAUSED|ARCHIVED|scopeConfig|localStorage)\b|access token|refresh session|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
}

async function expectSingleMainAndNoOverflow(page: Page): Promise<void> {
  await expect(page.locator('main')).toHaveCount(1);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectAccessible(page: Page): Promise<void> {
  await expect(page).toHaveTitle(/rePhone/);
  const results = await new AxeBuilder({ page })
    .exclude('nextjs-portal')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations
      .filter(({ impact }) => impact === 'serious' || impact === 'critical')
      .map(({ id, impact, nodes }) => ({
        id,
        impact,
        nodes: nodes.map(({ target, html, failureSummary }) => ({
          target,
          html,
          failureSummary,
        })),
      })),
  ).toEqual([]);
}
