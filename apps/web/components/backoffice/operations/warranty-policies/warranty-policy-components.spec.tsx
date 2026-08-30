import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BackofficeWarrantyPolicyDetail, WarrantyPolicy } from '@/lib/warranty-api';
import {
  ReadonlyPolicy,
  reconcileWarrantyPolicyMutation,
  WarrantyPolicyEditor,
} from './warranty-policy-editor';
import { WarrantyPolicyList } from './warranty-policy-view';

describe('warranty policy components', () => {
  it('renders a Vietnamese row and an accessible selected state', () => {
    const policy = fixture();
    const markup = renderToStaticMarkup(
      <WarrantyPolicyList items={[policy]} selectedId={policy.id} onSelect={() => undefined} />,
    );
    expect(markup).toContain('Đang áp dụng');
    expect(markup).toContain('aria-label="Đang xem chính sách BH-365"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).not.toContain('ACTIVE');
  });

  it('keeps archived policy content readable without lifecycle controls', () => {
    const markup = renderToStaticMarkup(
      <ReadonlyPolicy policy={{ ...fixture(), isArchived: true, status: 'INACTIVE' }} />,
    );
    expect(markup).toContain('Đã lưu trữ');
    expect(markup).toContain('Điều khoản bảo hành phần cứng.');
    expect(markup).not.toContain('Lưu trữ vĩnh viễn');
  });

  it('uses only detail DTO actions for lifecycle controls', () => {
    const client = {} as never;
    const reload = () => Promise.resolve(detail([]));
    const readonlyMarkup = renderToStaticMarkup(
      <WarrantyPolicyEditor
        client={client}
        policy={detail([])}
        onClose={() => undefined}
        onReload={reload}
      />,
    );
    const editableMarkup = renderToStaticMarkup(
      <WarrantyPolicyEditor
        client={client}
        policy={detail(['EDIT', 'DEACTIVATE'])}
        onClose={() => undefined}
        onReload={reload}
      />,
    );

    expect(readonlyMarkup).not.toContain('Ngừng áp dụng');
    expect(editableMarkup).toContain('Ngừng áp dụng');
    expect(editableMarkup).not.toContain('Lưu trữ vĩnh viễn');
  });

  it('locks stale policy actions when a committed mutation cannot refetch detail', async () => {
    const outcome = await reconcileWarrantyPolicyMutation({
      command: vi.fn().mockResolvedValue(fixture()),
      onReload: vi.fn().mockRejectedValue(new Error('offline')),
      success: 'Đã cập nhật.',
    });

    expect(outcome).toEqual({
      notice: null,
      refreshRequiredId: 'policy-1',
      serverError: 'Thay đổi đã được ghi nhận nhưng chưa tải lại được trạng thái mới nhất.',
    });
  });

  it('also locks stale actions when a failed command cannot refetch current detail', async () => {
    const outcome = await reconcileWarrantyPolicyMutation({
      command: vi.fn().mockRejectedValue(new Error('Dữ liệu đã đổi trạng thái.')),
      currentPolicyId: 'policy-1',
      onReload: vi.fn().mockRejectedValue(new Error('offline')),
      success: 'Đã cập nhật.',
    });

    expect(outcome.refreshRequiredId).toBe('policy-1');
    expect(outcome.serverError).toContain('Chưa thể tải lại trạng thái mới nhất.');
  });
});

function fixture(): WarrantyPolicy {
  return {
    archivedAt: null,
    code: 'BH-365',
    createdAt: '2026-01-01T00:00:00.000Z',
    defaultDays: 365,
    id: 'policy-1',
    isArchived: false,
    name: 'Bảo hành một năm',
    status: 'ACTIVE',
    terms: 'Điều khoản bảo hành phần cứng.',
    updatedAt: '2026-08-29T00:00:00.000Z',
  };
}

function detail(
  availableActions: BackofficeWarrantyPolicyDetail['availableActions'],
): BackofficeWarrantyPolicyDetail {
  return {
    ...fixture(),
    archiveBlockedReason: availableActions.includes('ARCHIVE') ? null : 'ACTIVE_CATALOG_REFERENCES',
    availableActions,
  };
}
