export type Slice12SmokeMode = 'preflight' | 'smoke';

export const SLICE12_SMOKE_CONFIRMATION = 'login-dedicated-identities-run-rbac-and-double-seed';

export interface Slice12SmokeIdentityInput {
  adminEmail: string;
  employeeEmail: string;
  customerEmail: string;
}

export function accessTokenSessionId(accessToken: string): string {
  const payload = accessToken.split('.')[1];
  if (payload === undefined || payload.length === 0) {
    throw new Error('Slice 12 smoke access token has an invalid shape');
  }

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw new Error('Slice 12 smoke access token payload is invalid');
  }
  if (
    typeof claims !== 'object' ||
    claims === null ||
    !('sessionId' in claims) ||
    typeof claims.sessionId !== 'string' ||
    claims.sessionId.length === 0
  ) {
    throw new Error('Slice 12 smoke access token is missing its session identifier');
  }
  return claims.sessionId;
}

export function parseSlice12SmokeMode(value: string | undefined): Slice12SmokeMode {
  const normalized = value?.trim().toLowerCase() ?? 'preflight';
  if (normalized === 'preflight' || normalized === 'smoke') return normalized;
  throw new Error('SLICE12_SMOKE_MODE must be preflight or smoke');
}

export function assertSlice12FullSmokeSafety(input: {
  mode: Slice12SmokeMode;
  confirmation?: string;
  nodeEnvironment?: string;
  identities?: Slice12SmokeIdentityInput;
}): void {
  if (input.mode === 'preflight') return;
  if (input.confirmation !== SLICE12_SMOKE_CONFIRMATION) {
    throw new Error(
      `Full Slice 12 smoke creates short-lived sessions and runs seed three times; set SLICE12_SMOKE_CONFIRM=${SLICE12_SMOKE_CONFIRMATION} to continue`,
    );
  }
  if (input.nodeEnvironment?.trim().toLowerCase() === 'production') {
    throw new Error('Full Slice 12 smoke is forbidden when NODE_ENV=production');
  }
  if (input.identities === undefined) {
    throw new Error(
      'Full Slice 12 smoke requires dedicated ADMIN, EMPLOYEE and CUSTOMER identities',
    );
  }

  const normalized = [
    input.identities.adminEmail,
    input.identities.employeeEmail,
    input.identities.customerEmail,
  ].map((email) => email.trim().toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('Slice 12 smoke identities must be three distinct accounts');
  }
  if (normalized.slice(1).some((email) => !email.includes('smoke'))) {
    throw new Error(
      'Slice 12 EMPLOYEE and CUSTOMER identity emails must contain the marker "smoke"',
    );
  }
}
