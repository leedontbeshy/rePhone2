import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AuditLogDetail, AuditLogListItem } from '@/lib/system-admin-api';
import { projectAuditListItem } from './audit-presenter';
import { AuditDetailPanel, AuditLogList } from './audit-workspace';

describe('audit master-detail presentation', () => {
  it('keeps detail-only and request fields out of list rows', () => {
    const row = projectAuditListItem(
      auditItem({
        changes: { secret: 'list-secret-sentinel' },
        metadata: { token: 'list-metadata-sentinel' },
        requestId: 'list-request-sentinel',
      }),
    );
    const markup = renderToStaticMarkup(
      <AuditLogList
        activeId={row.id}
        buildHref={(id) => `/backoffice/audit-logs?selected=${id}`}
        rows={[row]}
      />,
    );

    expect(markup).toContain('Đã vô hiệu hóa nhân viên');
    expect(markup).toContain('Đang chọn');
    expect(markup).toContain('/backoffice/audit-logs?selected=audit-1');
    expect(markup).not.toContain('employee.disabled');
    expect(markup).not.toContain('list-secret-sentinel');
    expect(markup).not.toContain('list-metadata-sentinel');
    expect(markup).not.toContain('list-request-sentinel');
  });

  it('renders the selected detail with hierarchy and humanized sanitized fields', () => {
    const detail = {
      ...auditItem(),
      changes: { reason: '[REDACTED]' },
      ipAddress: '203.0.113.10',
      metadata: { result: 'success' },
      userAgent: 'Safe browser label',
    } as unknown as AuditLogDetail;
    const markup = renderToStaticMarkup(
      <AuditDetailPanel
        detail={detail}
        error={undefined}
        headingRef={createRef<HTMLHeadingElement>()}
        loading={false}
        selectedId={detail.id}
        onRetry={vi.fn()}
      />,
    );

    expect(markup).toContain('Đã vô hiệu hóa nhân viên');
    expect(markup).toContain('Người thực hiện');
    expect(markup).toContain('Truy vết yêu cầu');
    expect(markup).toContain('Thay đổi được ghi nhận');
    expect(markup).toContain('Lý do');
    expect(markup).toContain('[REDACTED]');
    expect(markup).toContain('Thông tin bổ sung');
    expect(markup).toContain('Kết quả');
    expect(markup).toContain('Thành công');
    expect(markup).not.toContain('&quot;reason&quot;');
    expect(markup).not.toContain('&quot;result&quot;');
    expect(markup).not.toContain('employee.disabled');
  });

  it('shows an explicit empty detail state when no record is selected', () => {
    const markup = renderToStaticMarkup(
      <AuditDetailPanel
        detail={undefined}
        error={undefined}
        headingRef={createRef<HTMLHeadingElement>()}
        loading={false}
        selectedId={undefined}
        onRetry={vi.fn()}
      />,
    );

    expect(markup).toContain('Chọn một bản ghi trong danh sách');
  });
});

function auditItem(overrides: Record<string, unknown> = {}): AuditLogListItem {
  return {
    action: 'employee.disabled',
    actor: {
      employeeCode: 'NV001',
      fullName: 'Nguyễn Văn An',
      id: 'actor-1',
      role: 'ADMIN',
    },
    actorType: 'USER',
    createdAt: '2026-08-30T04:30:00.000Z',
    id: 'audit-1',
    requestId: 'request-safe',
    resourceId: 'employee-1',
    resourceType: 'User',
    ...overrides,
  } as unknown as AuditLogListItem;
}
