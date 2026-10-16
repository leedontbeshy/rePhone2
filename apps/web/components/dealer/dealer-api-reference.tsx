'use client';

import { useRef, useState } from 'react';
import { DisclosureSummary, Button, Input, Select } from '@/components/ui';
import { classNames } from '@/components/ui/class-names';
import {
  DEALER_API_ENDPOINTS,
  dealerEndpointCurl,
  type DealerApiEndpoint,
} from '@/lib/dealer-api-reference';
import { DealerCode } from './dealer-workspace';
import styles from './dealer.module.css';

const groups = [
  { value: 'catalog', label: 'Kho máy' },
  { value: 'orders', label: 'Đơn hàng' },
  { value: 'payments', label: 'Thanh toán và hoàn tiền' },
  { value: 'after-sales', label: 'Hậu mãi và bảo hành' },
] as const;

const fieldLocations = {
  path: 'Trong đường dẫn',
  query: 'Tham số truy vấn',
  body: 'JSON body',
  file: 'Tệp multipart',
} as const;

function searchable(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
}

function matchesSearch(endpoint: DealerApiEndpoint, query: string) {
  const text = searchable(
    [
      endpoint.method,
      endpoint.path,
      endpoint.title,
      endpoint.description,
      endpoint.scope,
      ...(endpoint.fields?.map((field) => `${field.name} ${field.description}`) ?? []),
      ...(endpoint.notes ?? []),
    ].join(' '),
  );
  return searchable(query)
    .trim()
    .split(/\s+/)
    .every((word) => text.includes(word));
}

export function DealerApiReference() {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const detailRefs = useRef(new Map<string, HTMLDetailsElement>());
  const endpoints = DEALER_API_ENDPOINTS.filter(
    (endpoint) => (!group || endpoint.group === group) && matchesSearch(endpoint, query),
  );

  function resetFilters() {
    setQuery('');
    setGroup('');
  }

  return (
    <div className={styles.apiReference}>
      <div className={styles.apiReferenceHeading}>
        <span className={styles.eyebrow}>Tra cứu kết nối</span>
        <h2>Danh sách API đại lý</h2>
        <p>
          {DEALER_API_ENDPOINTS.length} endpoint dành cho máy chủ của đại lý. Chọn đường dẫn để xem
          quyền cần cấp, tham số, lệnh cURL và phản hồi mẫu của từng API.
        </p>
        <p>
          Nối địa chỉ API đã gồm <code>/api/v1</code> với đường dẫn bên dưới. Ví dụ:{' '}
          <code>{'REPHONE_API_BASE_URL + /dealer/catalog'}</code>. Mọi yêu cầu đều cần header{' '}
          <code>X-Dealer-Api-Key</code>; khóa phải có quyền được ghi ở từng endpoint.
        </p>
        <p>
          Chạy lệnh cURL bằng Bash/WSL, với hai biến <code>REPHONE_API_BASE_URL</code> và{' '}
          <code>REPHONE_DEALER_KEY</code> đã cấu hình ở bước bắt đầu. Thay <code>{'{id}'}</code>,{' '}
          <code>{'{attachmentId}'}</code>, các giá trị trong dấu <code>{'<…>'}</code> và đường dẫn
          tệp mẫu bằng dữ liệu của bạn trước khi gửi. Phản hồi bên dưới là ví dụ minh họa.
        </p>
      </div>

      <div className={styles.apiReferenceFilters} role="search" aria-label="Tra cứu API đại lý">
        <Input
          id="dealer-api-reference-search"
          label="Tìm API"
          type="search"
          value={query}
          maxLength={160}
          placeholder="Tên chức năng, đường dẫn hoặc quyền truy cập…"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        <Select
          id="dealer-api-reference-group"
          label="Nhóm API"
          value={group}
          onChange={(event) => {
            setGroup(event.target.value);
          }}
        >
          <option value="">Tất cả nhóm API</option>
          {groups.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
        {(query || group) && (
          <Button variant="secondary" onClick={resetFilters}>
            Xóa bộ lọc API
          </Button>
        )}
      </div>

      <p className={styles.apiReferenceCount} role="status" aria-live="polite" aria-atomic="true">
        Hiển thị {endpoints.length}/{DEALER_API_ENDPOINTS.length} endpoint
      </p>

      {endpoints.length === 0 ? (
        <div className={styles.apiReferenceEmpty}>
          <p>Không tìm thấy API phù hợp. Thử tìm theo tên chức năng hoặc bỏ bộ lọc nhóm API.</p>
          <Button variant="secondary" onClick={resetFilters}>
            Hiển thị tất cả API
          </Button>
        </div>
      ) : (
        <>
          <div
            className={styles.tableWrap}
            role="region"
            aria-label="Danh sách API đại lý"
            tabIndex={0}
          >
            <table
              className={classNames(styles.table, styles.apiReferenceTable)}
              aria-label="Danh sách API đại lý"
            >
              <thead>
                <tr>
                  <th scope="col">Phương thức</th>
                  <th scope="col">Đường dẫn</th>
                  <th scope="col">Chức năng</th>
                  <th scope="col">Quyền cần có</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((endpoint) => (
                  <tr key={endpoint.id}>
                    <td>
                      <span className={styles.apiMethod}>{endpoint.method}</span>
                    </td>
                    <td>
                      <a
                        href={`#endpoint-${endpoint.id}`}
                        className={styles.apiEndpointLink}
                        onClick={(event) => {
                          const detail = detailRefs.current.get(endpoint.id);
                          if (detail) {
                            event.preventDefault();
                            detail.open = true;
                            window.history.replaceState(
                              window.history.state,
                              '',
                              `#endpoint-${endpoint.id}`,
                            );
                            detail.querySelector('summary')?.focus();
                            detail.scrollIntoView({ block: 'start' });
                          }
                        }}
                      >
                        <code>{endpoint.path}</code>
                      </a>
                    </td>
                    <td>{endpoint.title}</td>
                    <td>
                      <code>{endpoint.scope}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {groups.map((item) => {
            const groupedEndpoints = endpoints.filter((endpoint) => endpoint.group === item.value);
            if (groupedEndpoints.length === 0) return null;
            return (
              <div key={item.value} className={styles.apiReferenceGroup}>
                <h3>{item.label}</h3>
                {groupedEndpoints.map((endpoint) => (
                  <details
                    key={endpoint.id}
                    id={`endpoint-${endpoint.id}`}
                    className={styles.apiEndpoint}
                    ref={(element) => {
                      if (element) detailRefs.current.set(endpoint.id, element);
                      else detailRefs.current.delete(endpoint.id);
                    }}
                  >
                    <DisclosureSummary className={styles.apiEndpointSummary}>
                      <span className={styles.apiMethod}>{endpoint.method}</span>
                      <span className={styles.apiEndpointSummaryText}>
                        <strong>{endpoint.title}</strong>
                        <code>{endpoint.path}</code>
                      </span>
                    </DisclosureSummary>
                    <div className={styles.apiEndpointBody}>
                      <p>{endpoint.description}</p>
                      <dl className={styles.apiEndpointMeta}>
                        <div>
                          <dt>Quyền cần có</dt>
                          <dd>
                            <code>{endpoint.scope}</code>
                          </dd>
                        </div>
                        <div>
                          <dt>HTTP thành công</dt>
                          <dd>{endpoint.successStatus}</dd>
                        </div>
                      </dl>
                      {endpoint.idempotency && (
                        <p className={styles.apiEndpointNotice}>
                          <code>Idempotency-Key</code> bắt buộc. Lưu khóa và nội dung yêu cầu trước
                          khi gửi; khi thử lại, giữ nguyên cả hai để tránh tạo trùng yêu cầu.
                        </p>
                      )}
                      {endpoint.fields && endpoint.fields.length > 0 && (
                        <>
                          <h4>Tham số yêu cầu</h4>
                          <div
                            className={styles.tableWrap}
                            role="region"
                            aria-label={`Tham số ${endpoint.method} ${endpoint.path}`}
                            tabIndex={0}
                          >
                            <table
                              className={classNames(styles.table, styles.apiParameterTable)}
                              aria-label={`Tham số ${endpoint.method} ${endpoint.path}`}
                            >
                              <thead>
                                <tr>
                                  <th scope="col">Tên và kiểu dữ liệu</th>
                                  <th scope="col">Vị trí</th>
                                  <th scope="col">Bắt buộc</th>
                                  <th scope="col">Cách sử dụng</th>
                                </tr>
                              </thead>
                              <tbody>
                                {endpoint.fields.map((field) => (
                                  <tr key={`${field.location}-${field.name}`}>
                                    <td>
                                      <code>{field.name}</code>
                                      <span className={styles.apiFieldType}>{field.type}</span>
                                    </td>
                                    <td>{fieldLocations[field.location]}</td>
                                    <td>{field.required ? 'Có' : 'Không'}</td>
                                    <td>{field.description}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                      {endpoint.requestBody && (
                        <DealerCode
                          label={`JSON body minh họa · ${endpoint.title}`}
                          code={JSON.stringify(endpoint.requestBody, null, 2)}
                        />
                      )}
                      <DealerCode
                        label={`cURL · Bash/WSL · ${endpoint.method} ${endpoint.path}`}
                        code={dealerEndpointCurl(endpoint)}
                      />
                      <DealerCode
                        label={`Phản hồi minh họa · HTTP ${String(endpoint.successStatus)} · ${endpoint.title}`}
                        code={JSON.stringify(endpoint.responseExample, null, 2)}
                      />
                      {endpoint.notes && endpoint.notes.length > 0 && (
                        <ul className={styles.apiEndpointNotes}>
                          {endpoint.notes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
