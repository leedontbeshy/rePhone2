'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, InlineAlert } from '@/components/ui';
import {
  getBackofficeAfterSalesAttachmentUrl,
  type AfterSalesBackofficeApiClient,
  type AfterSalesDetail,
} from '@/lib/after-sales-backoffice-api';
import { formatAfterSalesDateTime } from './after-sales-presenter';
import styles from './after-sales.module.css';

export function AfterSalesEvidence({
  client,
  detail,
}: Readonly<{ client: AfterSalesBackofficeApiClient; detail: AfterSalesDetail }>) {
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openingGate = useRef(createAfterSalesEvidenceOpenGate());
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error !== null) errorRef.current?.focus({ preventScroll: true });
  }, [error]);

  if (detail.attachments.length === 0) {
    return <p className={styles.secondary}>Khách hàng chưa gửi ảnh hoặc tài liệu minh chứng.</p>;
  }

  async function openEvidence(attachmentId: string) {
    if (!openingGate.current.claim(attachmentId)) return;
    const attachmentWindow = window.open('about:blank', '_blank');
    if (attachmentWindow === null) {
      openingGate.current.release(attachmentId);
      setError('Trình duyệt đang chặn cửa sổ mới. Hãy cho phép rồi thử lại.');
      return;
    }
    attachmentWindow.opener = null;
    setOpeningId(attachmentId);
    setError(null);
    try {
      const signed = await getBackofficeAfterSalesAttachmentUrl(client, detail.id, attachmentId);
      attachmentWindow.location.replace(signed.url);
    } catch (caught) {
      attachmentWindow.close();
      setError(caught instanceof Error ? caught.message : 'Không thể mở minh chứng này.');
    } finally {
      openingGate.current.release(attachmentId);
      setOpeningId(null);
    }
  }

  return (
    <div className={styles.actionStack}>
      {error === null ? null : (
        <InlineAlert ref={errorRef} tabIndex={-1} title="Chưa mở được minh chứng" tone="danger">
          {error}
        </InlineAlert>
      )}
      <ul className={styles.evidenceList}>
        {detail.attachments.map((attachment, index) => (
          <li className={styles.evidenceItem} key={attachment.id}>
            <div>
              <strong>
                {attachment.mimeType === 'application/pdf'
                  ? `Tài liệu ${String(index + 1)}`
                  : `Hình ảnh ${String(index + 1)}`}
              </strong>
              <p>{fileSizeLabel(attachment.fileSize)}</p>
              <small>Gửi lúc {formatAfterSalesDateTime(attachment.uploadedAt)}</small>
            </div>
            <Button
              disabled={openingId !== null && openingId !== attachment.id}
              loading={openingId === attachment.id}
              loadingLabel="Đang mở minh chứng"
              size="compact"
              variant="secondary"
              onClick={() => {
                void openEvidence(attachment.id);
              }}
            >
              Xem minh chứng
            </Button>
          </li>
        ))}
      </ul>
      <p className={styles.secondary}>
        Mỗi lần xem, hệ thống tạo một liên kết mới có thời hạn ngắn.
      </p>
    </div>
  );
}

export interface AfterSalesEvidenceOpenGate {
  claim: (attachmentId: string) => boolean;
  release: (attachmentId: string) => void;
}

export function createAfterSalesEvidenceOpenGate(): AfterSalesEvidenceOpenGate {
  let currentAttachmentId: string | null = null;
  return {
    claim(attachmentId) {
      if (currentAttachmentId !== null) return false;
      currentAttachmentId = attachmentId;
      return true;
    },
    release(attachmentId) {
      if (currentAttachmentId === attachmentId) currentAttachmentId = null;
    },
  };
}

function fileSizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toString()} KB`;
}
