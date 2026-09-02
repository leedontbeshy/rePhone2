/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await */
import { describe, expect, it, vi } from 'vitest';
import type { ApiError } from '../../common/errors/api-error.js';
import type { AppConfig } from '../../config/app-config.js';
import type { User } from '../../generated/prisma/client.js';
import { AuthService } from './auth.service.js';
import type { RequestMetadata } from './auth.types.js';
import type { LockedAuthSession } from './repositories/auth-sessions.repository.js';
import type { LockedAuthToken } from './repositories/auth-tokens.repository.js';

const USER_ID = '0199b901-0000-7000-8000-000000000001';
const SESSION_ID = '0199b901-0000-7000-8000-000000000002';
const TOKEN_ID = '0199b901-0000-7000-8000-000000000003';
const metadata: RequestMetadata = { ipAddress: '127.0.0.1', userAgent: 'Vitest' };

describe('AuthService register and login', () => {
  it('normalizes registration data and handles the optional phone field', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.register(
        {
          email: '  Customer@Example.COM ',
          password: 'Password123',
          fullName: '  Customer Name ',
          phone: ' 0900000000 ',
        },
        metadata,
      ),
    ).resolves.toEqual({ message: expect.stringContaining('đã được tiếp nhận') });
    expect(fixture.rateLimiter.register).toHaveBeenCalledWith(metadata.ipAddress);
    expect(fixture.password.hash).toHaveBeenCalledWith('Password123');
    expect(fixture.users.createCustomer).toHaveBeenCalledWith({
      email: 'Customer@Example.COM',
      normalizedEmail: 'customer@example.com',
      passwordHash: 'new-password-hash',
      fullName: 'Customer Name',
      phone: '0900000000',
    });

    await fixture.service.register(
      { email: 'second@example.com', password: 'Password123', fullName: 'Second' },
      metadata,
    );
    expect(fixture.users.createCustomer).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ phone: expect.anything() }),
    );
  });

  it('returns the same generic result for a unique violation and rethrows other failures', async () => {
    const created = createFixture();
    const createdResult = await created.service.register(
      { email: 'new@example.com', password: 'Password123', fullName: 'New' },
      metadata,
    );
    const duplicate = createFixture({
      users: {
        createCustomer: vi.fn(async () =>
          Promise.reject(Object.assign(new Error('duplicate'), { code: 'P2002' })),
        ),
      },
    });
    await expect(
      duplicate.service.register(
        { email: 'taken@example.com', password: 'Password123', fullName: 'Taken' },
        metadata,
      ),
    ).resolves.toEqual(createdResult);

    const databaseFailure = new Error('database offline');
    const failed = createFixture({
      users: { createCustomer: vi.fn(async () => Promise.reject(databaseFailure)) },
    });
    await expect(
      failed.service.register(
        { email: 'new@example.com', password: 'Password123', fullName: 'New' },
        metadata,
      ),
    ).rejects.toBe(databaseFailure);
  });

  it.each([
    ['missing account', null],
    ['invited account without a password', user({ passwordHash: null })],
  ])('uses a dummy verification for %s', async (_label, foundUser) => {
    const fixture = createFixture({
      users: { findByNormalizedEmail: vi.fn(async () => foundUser) },
    });

    await expect(
      fixture.service.login(' Customer@Example.com ', 'wrong', metadata),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' } satisfies Partial<ApiError>);
    expect(fixture.users.findByNormalizedEmail).toHaveBeenCalledWith('customer@example.com');
    expect(fixture.password.performDummyVerification).toHaveBeenCalledWith('wrong');
    expect(fixture.sessions.create).not.toHaveBeenCalled();
  });

  it('rejects a wrong password before checking account state', async () => {
    const fixture = createFixture({ password: { verify: vi.fn(async () => false) } });

    await expect(
      fixture.service.login('customer@example.com', 'wrong', metadata),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' } satisfies Partial<ApiError>);
    expect(fixture.sessions.create).not.toHaveBeenCalled();
  });

  it.each([
    ['PENDING_VERIFICATION', 'INVALID_CREDENTIALS'],
    ['SUSPENDED', 'ACCOUNT_UNAVAILABLE'],
    ['DISABLED', 'ACCOUNT_UNAVAILABLE'],
  ] as const)('rejects a %s account with %s', async (status, code) => {
    const fixture = createFixture({
      users: { findByNormalizedEmail: vi.fn(async () => user({ status })) },
    });

    await expect(
      fixture.service.login('customer@example.com', 'Password123', metadata),
    ).rejects.toMatchObject({ code });
    expect(fixture.sessions.create).not.toHaveBeenCalled();
  });

  it('issues a session from the locked current user and preserves user-agent metadata', async () => {
    const current = user({ fullName: 'Current User' });
    const fixture = createFixture({ users: { findById: vi.fn(async () => current) } });

    await expect(
      fixture.service.login('customer@example.com', 'Password123', metadata),
    ).resolves.toMatchObject({
      accessToken: 'signed-access-token',
      expiresIn: 900,
      refreshToken: 'new-opaque-token',
      user: { id: USER_ID, fullName: 'Current User' },
    });
    expect(fixture.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        refreshTokenHash: 'digest:new-opaque-token',
        userAgent: 'Vitest',
        ipAddress: '127.0.0.1',
      }),
      fixture.transaction,
    );
    expect(fixture.transaction.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { lastLoginAt: expect.any(Date) },
    });
    expect(fixture.tokens.signAccessToken).toHaveBeenCalledWith(USER_ID, 'CUSTOMER', SESSION_ID);
  });

  it('omits user-agent and rejects a vanished or newly disabled user under the login lock', async () => {
    const vanished = createFixture({ users: { lockById: vi.fn(async () => false) } });
    await expect(
      vanished.service.login('customer@example.com', 'Password123', { ipAddress: '127.0.0.1' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    const disabled = createFixture({
      users: { findById: vi.fn(async () => user({ status: 'DISABLED' })) },
    });
    await expect(
      disabled.service.login('customer@example.com', 'Password123', { ipAddress: '127.0.0.1' }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' });

    const success = createFixture();
    await success.service.login('customer@example.com', 'Password123', {
      ipAddress: '127.0.0.1',
    });
    expect(success.sessions.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ userAgent: expect.anything() }),
      success.transaction,
    );
  });
});

describe('AuthService refresh and logout', () => {
  it.each([undefined, ''])('rejects a missing refresh token (%s)', async (rawToken) => {
    const fixture = createFixture();
    await expect(fixture.service.refresh(rawToken, metadata)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    expect(fixture.sessions.findByRefreshTokenHash).not.toHaveBeenCalled();
  });

  it('rejects an unknown refresh token before opening a transaction', async () => {
    const fixture = createFixture({
      sessions: { findByRefreshTokenHash: vi.fn(async () => null) },
    });
    await expect(fixture.service.refresh('refresh-token', metadata)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    expect(fixture.prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['locked user vanished', { lockUser: false }, 'AUTH_REQUIRED'],
    ['session vanished', { lockedSession: null }, 'AUTH_REQUIRED'],
    [
      'session belongs to another user',
      { lockedSession: session({ userId: '0199b901-0000-7000-8000-000000000099' }) },
      'AUTH_REQUIRED',
    ],
  ] as const)('handles %s during refresh', async (_label, state, code) => {
    const fixture = createFixture({
      users: {
        ...('lockUser' in state ? { lockById: vi.fn(async () => false) } : {}),
      },
      sessions: {
        ...('lockedSession' in state
          ? { lockByRefreshTokenHash: vi.fn(async () => state.lockedSession) }
          : {}),
      },
    });

    await expect(fixture.service.refresh('refresh-token', metadata)).rejects.toMatchObject({
      code,
    });
    expect(fixture.sessions.create).not.toHaveBeenCalled();
  });

  it('revokes the whole family when a revoked refresh token is reused', async () => {
    const current = session({ revokedAt: new Date() });
    const fixture = createFixture({
      sessions: { lockByRefreshTokenHash: vi.fn(async () => current) },
    });

    await expect(fixture.service.refresh('refresh-token', metadata)).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
    expect(fixture.sessions.revokeFamily).toHaveBeenCalledWith(
      current.tokenFamilyId,
      fixture.transaction,
    );
  });

  it('revokes an expired refresh session', async () => {
    const current = session({ expiresAt: new Date(Date.now() - 60_000) });
    const fixture = createFixture({
      sessions: { lockByRefreshTokenHash: vi.fn(async () => current) },
    });

    await expect(fixture.service.refresh('refresh-token', metadata)).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
    expect(fixture.sessions.revoke).toHaveBeenCalledWith(SESSION_ID, fixture.transaction);
  });

  it.each([
    ['missing user', null],
    ['suspended user', user({ status: 'SUSPENDED' })],
  ])('revokes all sessions when the refresh user is %s', async (_label, currentUser) => {
    const fixture = createFixture({ users: { findById: vi.fn(async () => currentUser) } });

    await expect(fixture.service.refresh('refresh-token', metadata)).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
    expect(fixture.sessions.revokeAllForUser).toHaveBeenCalledWith(USER_ID, fixture.transaction);
  });

  it('rotates a valid token in the same family and returns the successor only after commit', async () => {
    const current = session();
    const fixture = createFixture();

    await expect(fixture.service.refresh('refresh-token', metadata)).resolves.toMatchObject({
      refreshToken: 'new-opaque-token',
      refreshExpiresAt: current.expiresAt,
      accessToken: 'signed-access-token',
    });
    expect(fixture.sessions.revoke).toHaveBeenCalledWith(SESSION_ID, fixture.transaction);
    expect(fixture.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshTokenHash: 'digest:new-opaque-token',
        tokenFamilyId: current.tokenFamilyId,
        userAgent: 'Vitest',
      }),
      fixture.transaction,
    );
  });

  it('treats logout without a token or without a matching session as idempotent', async () => {
    const fixture = createFixture();
    await fixture.service.logout(undefined);
    await fixture.service.logout('');
    expect(fixture.prisma.$transaction).not.toHaveBeenCalled();

    const missing = createFixture({
      sessions: { lockByRefreshTokenHash: vi.fn(async () => null) },
    });
    await missing.service.logout('refresh-token');
    expect(missing.sessions.revokeFamily).not.toHaveBeenCalled();
  });

  it('revokes the full session family on logout', async () => {
    const fixture = createFixture();
    await fixture.service.logout('refresh-token');
    expect(fixture.sessions.revokeFamily).toHaveBeenCalledWith(
      '0199b901-0000-7000-8000-000000000004',
      fixture.transaction,
    );
  });
});

describe('AuthService one-time credentials', () => {
  it.each([
    ['missing user', null],
    ['inactive user', user({ status: 'SUSPENDED' })],
    ['passwordless user', user({ passwordHash: null })],
  ])('keeps forgot-password enumeration-safe for %s', async (_label, currentUser) => {
    const fixture = createFixture({
      users: { findByNormalizedEmail: vi.fn(async () => currentUser) },
    });

    await expect(
      fixture.service.forgotPassword(' Customer@Example.com ', metadata),
    ).resolves.toEqual({ message: expect.stringContaining('Nếu tài khoản phù hợp') });
    expect(fixture.password.performDummyVerification).toHaveBeenCalledWith(
      'forgot-password-probe-1',
    );
    expect(fixture.authTokens.create).not.toHaveBeenCalled();
    expect(fixture.notifications.deliver).not.toHaveBeenCalled();
  });

  it.each([
    ['lock lost', { lock: false, current: user() }],
    ['user removed', { lock: true, current: null }],
    ['user suspended', { lock: true, current: user({ status: 'SUSPENDED' }) }],
    ['password removed', { lock: true, current: user({ passwordHash: null }) }],
  ])('does not issue a reset token when %s in the transaction', async (_label, state) => {
    const fixture = createFixture({
      users: {
        lockById: vi.fn(async () => state.lock),
        findById: vi.fn(async () => state.current),
      },
    });

    await expect(fixture.service.forgotPassword('customer@example.com', metadata)).resolves.toEqual(
      { message: expect.any(String) },
    );
    expect(fixture.notifications.deliver).not.toHaveBeenCalled();
  });

  it('invalidates old reset links, stores only the digest and sends a fragment URL after commit', async () => {
    const fixture = createFixture();

    await fixture.service.forgotPassword('customer@example.com', metadata);

    expect(fixture.authTokens.invalidateActive).toHaveBeenCalledWith(
      USER_ID,
      'RESET_PASSWORD',
      expect.any(Date),
      fixture.transaction,
    );
    expect(fixture.authTokens.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        purpose: 'RESET_PASSWORD',
        tokenHash: 'digest:new-opaque-token',
      }),
      fixture.transaction,
    );
    expect(fixture.notifications.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'auth.password_reset_requested',
        resourceId: USER_ID,
        message: expect.objectContaining({
          text: expect.stringContaining('/reset-password#token=new-opaque-token'),
        }),
      }),
    );
  });

  it('rejects reset when the token candidate is absent', async () => {
    const fixture = createFixture({
      authTokens: { findByHash: vi.fn(async () => null) },
    });
    await expect(
      fixture.service.resetPassword('reset-token', 'NewPassword123', metadata),
    ).rejects.toMatchObject({ code: 'ONE_TIME_TOKEN_INVALID' });
    expect(fixture.prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['user lock lost', { lock: false, lockedToken: authToken(), currentUser: user() }],
    ['token removed', { lock: true, lockedToken: null, currentUser: user() }],
    [
      'token owner changed',
      {
        lock: true,
        lockedToken: authToken({ userId: '0199b901-0000-7000-8000-000000000099' }),
        currentUser: user(),
      },
    ],
    [
      'wrong token purpose',
      {
        lock: true,
        lockedToken: authToken({ purpose: 'EMPLOYEE_INVITATION' }),
        currentUser: user(),
      },
    ],
    [
      'token consumed',
      { lock: true, lockedToken: authToken({ consumedAt: new Date() }), currentUser: user() },
    ],
    [
      'token expired',
      {
        lock: true,
        lockedToken: authToken({ expiresAt: new Date(Date.now() - 1_000) }),
        currentUser: user(),
      },
    ],
    ['user removed', { lock: true, lockedToken: authToken(), currentUser: null }],
    [
      'user suspended',
      { lock: true, lockedToken: authToken(), currentUser: user({ status: 'SUSPENDED' }) },
    ],
    [
      'user password absent',
      { lock: true, lockedToken: authToken(), currentUser: user({ passwordHash: null }) },
    ],
  ])('rejects reset when %s', async (_label, state) => {
    const fixture = createFixture({
      users: {
        lockById: vi.fn(async () => state.lock),
        findById: vi.fn(async () => state.currentUser),
      },
      authTokens: { lockByHash: vi.fn(async () => state.lockedToken) },
    });

    await expect(
      fixture.service.resetPassword('reset-token', 'NewPassword123', metadata),
    ).rejects.toMatchObject({ code: 'ONE_TIME_TOKEN_INVALID' });
  });

  it('consumes a valid reset token, changes the password and revokes all credentials', async () => {
    const fixture = createFixture();

    await fixture.service.resetPassword('reset-token', 'NewPassword123', metadata);

    expect(fixture.authTokens.consume).toHaveBeenCalledWith(
      TOKEN_ID,
      expect.any(Date),
      fixture.transaction,
    );
    expect(fixture.authTokens.invalidateActive).toHaveBeenCalledWith(
      USER_ID,
      'RESET_PASSWORD',
      expect.any(Date),
      fixture.transaction,
    );
    expect(fixture.transaction.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { passwordHash: 'new-password-hash', passwordChangedAt: expect.any(Date) },
    });
    expect(fixture.sessions.revokeAllForUser).toHaveBeenCalledWith(USER_ID, fixture.transaction);
  });

  it('accepts one valid employee invitation and atomically activates the employee', async () => {
    const invited = user({
      role: 'EMPLOYEE',
      status: 'PENDING_VERIFICATION',
      passwordHash: null,
    });
    const invite = authToken({ purpose: 'EMPLOYEE_INVITATION' });
    const fixture = createFixture({
      users: {
        findById: vi.fn(async () => invited),
      },
      authTokens: {
        findByHash: vi.fn(async () => invite),
        lockByHash: vi.fn(async () => invite),
      },
    });

    await fixture.service.acceptEmployeeInvitation('invite-token', 'Password123', metadata);

    expect(fixture.rateLimiter.invitation).toHaveBeenCalledWith(
      metadata.ipAddress,
      'digest:invite-token',
    );
    expect(fixture.authTokens.consume).toHaveBeenCalledWith(
      TOKEN_ID,
      expect.any(Date),
      fixture.transaction,
    );
    expect(fixture.transaction.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: {
        status: 'ACTIVE',
        passwordHash: 'new-password-hash',
        emailVerifiedAt: expect.any(Date),
        passwordChangedAt: expect.any(Date),
      },
    });
  });

  it.each([
    ['missing candidate', null, authToken({ purpose: 'EMPLOYEE_INVITATION' }), user()],
    ['wrong token purpose', authToken(), authToken(), user()],
    [
      'wrong user lifecycle',
      authToken({ purpose: 'EMPLOYEE_INVITATION' }),
      authToken({ purpose: 'EMPLOYEE_INVITATION' }),
      user({ role: 'CUSTOMER', status: 'ACTIVE' }),
    ],
  ])('rejects invitation for %s', async (_label, candidate, locked, currentUser) => {
    const fixture = createFixture({
      users: { findById: vi.fn(async () => currentUser) },
      authTokens: {
        findByHash: vi.fn(async () => candidate),
        lockByHash: vi.fn(async () => locked),
      },
    });

    await expect(
      fixture.service.acceptEmployeeInvitation('invite-token', 'Password123', metadata),
    ).rejects.toMatchObject({ code: 'ONE_TIME_TOKEN_INVALID' });
  });
});

describe('AuthService changePassword', () => {
  it.each([
    ['missing user', null],
    ['passwordless user', user({ passwordHash: null })],
  ])('rejects current password validation for %s', async (_label, currentUser) => {
    const fixture = createFixture({ users: { findById: vi.fn(async () => currentUser) } });
    await expect(
      fixture.service.changePassword(USER_ID, 'Current123', 'NewPassword123'),
    ).rejects.toMatchObject({ code: 'CURRENT_PASSWORD_INCORRECT' });
    expect(fixture.password.verify).not.toHaveBeenCalled();
  });

  it('rejects an incorrect current password', async () => {
    const fixture = createFixture({ password: { verify: vi.fn(async () => false) } });
    await expect(
      fixture.service.changePassword(USER_ID, 'Wrong123', 'NewPassword123'),
    ).rejects.toMatchObject({ code: 'CURRENT_PASSWORD_INCORRECT' });
    expect(fixture.password.hash).not.toHaveBeenCalled();
  });

  it.each([
    ['lock lost', false, user()],
    ['user removed', true, null],
    ['user disabled', true, user({ status: 'DISABLED' })],
    ['password changed concurrently', true, user({ passwordHash: 'other-hash' })],
  ])('rejects change when %s', async (_label, lock, currentUser) => {
    const fixture = createFixture({
      users: {
        lockById: vi.fn(async () => lock),
        findById: vi.fn().mockResolvedValueOnce(user()).mockResolvedValueOnce(currentUser),
      },
    });

    await expect(
      fixture.service.changePassword(USER_ID, 'Current123', 'NewPassword123'),
    ).rejects.toMatchObject({ code: 'CURRENT_PASSWORD_INCORRECT' });
    expect(fixture.sessions.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('changes the password and revokes every session and pending one-time token', async () => {
    const fixture = createFixture();

    await fixture.service.changePassword(USER_ID, 'Current123', 'NewPassword123');

    expect(fixture.transaction.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { passwordHash: 'new-password-hash', passwordChangedAt: expect.any(Date) },
    });
    expect(fixture.sessions.revokeAllForUser).toHaveBeenCalledWith(USER_ID, fixture.transaction);
    expect(fixture.transaction.authToken.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
  });
});

interface FixtureOverrides {
  users?: object;
  sessions?: object;
  authTokens?: object;
  password?: object;
  tokens?: object;
  rateLimiter?: object;
  notifications?: object;
  config?: Partial<AppConfig>;
}

function createFixture(overrides: FixtureOverrides = {}) {
  const transaction = {
    user: { update: vi.fn(async () => user()) },
    authToken: { updateMany: vi.fn(async () => ({ count: 1 })) },
  };
  const prisma = {
    $transaction: vi.fn(async (work: (client: unknown) => Promise<unknown>) => work(transaction)),
  };
  const users = {
    createCustomer: vi.fn(async () => user()),
    findByNormalizedEmail: vi.fn(async () => user()),
    findById: vi.fn(async () => user()),
    lockById: vi.fn(async () => true),
    ...overrides.users,
  };
  const sessions = {
    create: vi.fn(async () => session()),
    findByRefreshTokenHash: vi.fn(async () => session()),
    lockByRefreshTokenHash: vi.fn(async () => session()),
    revoke: vi.fn(async () => 1),
    revokeFamily: vi.fn(async () => 1),
    revokeAllForUser: vi.fn(async () => 1),
    ...overrides.sessions,
  };
  const authTokens = {
    create: vi.fn(async () => authToken()),
    findByHash: vi.fn(async () => authToken()),
    invalidateActive: vi.fn(async () => ({ count: 1 })),
    lockByHash: vi.fn(async () => authToken()),
    consume: vi.fn(async () => authToken({ consumedAt: new Date() })),
    ...overrides.authTokens,
  };
  const password = {
    hash: vi.fn(async () => 'new-password-hash'),
    verify: vi.fn(async () => true),
    performDummyVerification: vi.fn(async () => undefined),
    ...overrides.password,
  };
  const tokens = {
    createOpaqueToken: vi.fn(() => 'new-opaque-token'),
    digestOpaqueToken: vi.fn((raw: string) => `digest:${raw}`),
    signAccessToken: vi.fn(async () => 'signed-access-token'),
    ...overrides.tokens,
  };
  const rateLimiter = {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    reset: vi.fn(),
    invitation: vi.fn(),
    ...overrides.rateLimiter,
  };
  const notifications = {
    deliver: vi.fn(async () => 'SENT'),
    ...overrides.notifications,
  };
  const config = {
    api: { webPublicUrl: 'http://localhost:3001' },
    auth: {
      accessTtlSeconds: 900,
      refreshTtlDays: 7,
      passwordResetTtlMinutes: 30,
    },
    ...overrides.config,
  } as AppConfig;

  return {
    transaction,
    prisma,
    users,
    sessions,
    authTokens,
    password,
    tokens,
    rateLimiter,
    notifications,
    service: new AuthService(
      prisma as never,
      users as never,
      sessions as never,
      authTokens as never,
      password as never,
      tokens as never,
      rateLimiter as never,
      config,
      notifications as never,
    ),
  };
}

function user(overrides: Partial<User> = {}): User {
  const now = new Date('2026-08-01T00:00:00.000Z');
  return {
    id: USER_ID,
    email: 'customer@example.com',
    normalizedEmail: 'customer@example.com',
    passwordHash: 'current-password-hash',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    fullName: 'Demo Customer',
    phone: '0900000000',
    employeeCode: null,
    hiredAt: null,
    emailVerifiedAt: now,
    passwordChangedAt: now,
    lastLoginAt: null,
    suspendedAt: null,
    disabledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function session(overrides: Partial<LockedAuthSession> = {}): LockedAuthSession {
  const now = new Date('2026-08-01T00:00:00.000Z');
  return {
    id: SESSION_ID,
    userId: USER_ID,
    refreshTokenHash: 'digest:refresh-token',
    tokenFamilyId: '0199b901-0000-7000-8000-000000000004',
    userAgent: 'Vitest',
    ipAddress: '127.0.0.1',
    lastUsedAt: null,
    expiresAt: new Date('2099-08-26T00:00:00.000Z'),
    revokedAt: null,
    createdAt: now,
    ...overrides,
  };
}

function authToken(overrides: Partial<LockedAuthToken> = {}): LockedAuthToken {
  return {
    id: TOKEN_ID,
    userId: USER_ID,
    purpose: 'RESET_PASSWORD',
    tokenHash: 'digest:reset-token',
    expiresAt: new Date('2099-08-26T00:00:00.000Z'),
    consumedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}
