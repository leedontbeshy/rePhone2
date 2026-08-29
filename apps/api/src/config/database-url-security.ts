import { isIP } from 'node:net';

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
const TLS_MODES = new Set(['require', 'verify-ca', 'verify-full']);

export interface DatabaseUrlSecurityOptions {
  allowUnencryptedLoopback: boolean;
}

export function databaseUrlSecurityIssue(
  connectionString: string,
  options: DatabaseUrlSecurityOptions,
): string | undefined {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return 'must be a valid PostgreSQL connection URL';
  }

  if (!POSTGRES_PROTOCOLS.has(url.protocol)) {
    return 'must use the postgresql:// or postgres:// protocol';
  }

  if (options.allowUnencryptedLoopback && isLoopbackHost(url.hostname)) {
    return undefined;
  }

  const sslModes = url.searchParams.getAll('sslmode');
  if (sslModes.length !== 1 || !TLS_MODES.has(sslModes[0] ?? '')) {
    return 'must require TLS with sslmode=require, verify-ca or verify-full';
  }

  return undefined;
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    (isIP(normalized) === 4 && normalized.split('.')[0] === '127')
  );
}
