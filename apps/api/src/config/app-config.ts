import { Buffer } from 'node:buffer';
import { z } from 'zod';

const integerString = (minimum: number, maximum?: number) => {
  let schema = z.coerce.number().int().min(minimum);
  if (maximum !== undefined) {
    schema = schema.max(maximum);
  }
  return schema;
};

const strictBoolean = z.enum(['true', 'false']).transform((value) => value === 'true');
const exampleEncryptionKey = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const exampleHmacKey = 'YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk=';

const optionalTrimmed = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

const base64Bytes = (minimum: number, exact = false) =>
  z.string().refine(
    (value) => {
      try {
        const bytes = Buffer.from(value, 'base64');
        return exact ? bytes.length === minimum : bytes.length >= minimum;
      } catch {
        return false;
      }
    },
    exact
      ? `must decode to exactly ${minimum.toString()} bytes`
      : `must decode to at least ${minimum.toString()} bytes`,
  );

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    API_PORT: integerString(1, 65_535),
    API_PUBLIC_URL: z.url(),
    WEB_PUBLIC_URL: z.url(),
    WEB_ORIGIN: z.url(),
    DATABASE_URL: z.string().min(1),
    DB_POOL_MAX: integerString(1, 100).default(10),
    DB_CONNECTION_TIMEOUT_MS: integerString(1).default(5_000),
    DB_IDLE_TIMEOUT_MS: integerString(1).default(10_000),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_TTL_SECONDS: integerString(60).default(900),
    JWT_ISSUER: z.string().trim().min(1).default('rephone-api'),
    JWT_AUDIENCE: z.string().trim().min(1).default('rephone-web'),
    AUTH_REFRESH_TTL_DAYS: integerString(1).default(7),
    ARGON2_MEMORY_KIB: integerString(8_192).default(65_536),
    ARGON2_TIME_COST: integerString(1).default(3),
    ARGON2_PARALLELISM: integerString(1).default(1),
    PASSWORD_RESET_TTL_MINUTES: integerString(1).default(30),
    EMPLOYEE_INVITE_TTL_HOURS: integerString(1).default(24),
    GUEST_CART_TTL_DAYS: integerString(1).default(30),
    IDENTIFIER_ENCRYPTION_KEY: base64Bytes(32, true),
    IDENTIFIER_HMAC_KEY: base64Bytes(32),
    SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SUPABASE_PUBLIC_BUCKET: z.string().trim().min(1),
    SUPABASE_PRIVATE_BUCKET: z.string().trim().min(1),
    SUPABASE_STORE_BUCKET: z.string().trim().min(1),
    SIGNED_URL_TTL_SECONDS: integerString(1).default(300),
    SMTP_HOST: z.string().trim().min(1),
    SMTP_PORT: integerString(1, 65_535),
    SMTP_SECURE: strictBoolean,
    SMTP_REQUIRE_TLS: strictBoolean.default(false),
    SMTP_USER: optionalTrimmed,
    SMTP_PASSWORD: optionalTrimmed,
    MAIL_FROM: z.string().trim().min(3),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).optional(),
    SCHEDULER_ENABLED: strictBoolean.default(true),
    SCHEDULER_BATCH_SIZE: integerString(1, 500).default(100),
    SCHEDULER_GUEST_CART_BATCH_SIZE: integerString(1, 1_000).default(200),
    SCHEDULER_AUTH_CLEANUP_BATCH_SIZE: integerString(1, 1_000).default(500),
    REQUEST_BODY_LIMIT: z
      .string()
      .regex(/^\d+(?:kb|mb)$/i)
      .default('1mb'),
    TRUST_PROXY: strictBoolean.default(false),
    APP_VERSION: z.string().trim().min(1).default('dev'),
  })
  .superRefine((environment, context) => {
    if (environment.IDENTIFIER_ENCRYPTION_KEY === environment.IDENTIFIER_HMAC_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['IDENTIFIER_HMAC_KEY'],
        message: 'must differ from IDENTIFIER_ENCRYPTION_KEY',
      });
    }

    const smtpCredentials = [environment.SMTP_USER, environment.SMTP_PASSWORD];
    if (smtpCredentials.filter(Boolean).length === 1) {
      context.addIssue({
        code: 'custom',
        path: ['SMTP_USER'],
        message: 'SMTP_USER and SMTP_PASSWORD must be provided together',
      });
    }

    const bucketNames = new Set([
      environment.SUPABASE_PUBLIC_BUCKET,
      environment.SUPABASE_PRIVATE_BUCKET,
      environment.SUPABASE_STORE_BUCKET,
    ]);
    if (bucketNames.size !== 3) {
      context.addIssue({
        code: 'custom',
        path: ['SUPABASE_PRIVATE_BUCKET'],
        message: 'storage buckets must be distinct',
      });
    }

    if (environment.NODE_ENV === 'production') {
      for (const field of [
        'API_PUBLIC_URL',
        'WEB_PUBLIC_URL',
        'WEB_ORIGIN',
        'SUPABASE_URL',
      ] as const) {
        if (!environment[field].startsWith('https://')) {
          context.addIssue({
            code: 'custom',
            path: [field],
            message: 'must use HTTPS in production',
          });
        }
      }

      for (const field of ['JWT_ACCESS_SECRET', 'SUPABASE_SERVICE_ROLE_KEY'] as const) {
        if (/placeholder|change-me|local|test/i.test(environment[field])) {
          context.addIssue({
            code: 'custom',
            path: [field],
            message: 'production secrets must not use placeholder values',
          });
        }
      }

      for (const [field, value, placeholder] of [
        ['IDENTIFIER_ENCRYPTION_KEY', environment.IDENTIFIER_ENCRYPTION_KEY, exampleEncryptionKey],
        ['IDENTIFIER_HMAC_KEY', environment.IDENTIFIER_HMAC_KEY, exampleHmacKey],
      ] as const) {
        if (value === placeholder) {
          context.addIssue({
            code: 'custom',
            path: [field],
            message: 'production secrets must not use example values',
          });
        }
      }

      if (
        (environment.SMTP_SECURE && environment.SMTP_PORT !== 465) ||
        (!environment.SMTP_SECURE && environment.SMTP_PORT === 465)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['SMTP_PORT'],
          message: 'must match SMTP_SECURE mode',
        });
      }
    }
  });

type ValidEnvironment = z.infer<typeof environmentSchema>;

export interface AppConfig {
  environment: ValidEnvironment['NODE_ENV'];
  api: {
    port: number;
    publicUrl: string;
    webPublicUrl: string;
    webOrigin: string;
    requestBodyLimit: string;
    trustProxy: boolean;
  };
  database: {
    url: string;
    poolMax: number;
    connectionTimeoutMs: number;
    idleTimeoutMs: number;
  };
  auth: {
    accessSecret: string;
    accessTtlSeconds: number;
    issuer: string;
    audience: string;
    refreshTtlDays: number;
    argon2MemoryKib: number;
    argon2TimeCost: number;
    argon2Parallelism: number;
    passwordResetTtlMinutes: number;
    employeeInviteTtlHours: number;
    guestCartTtlDays: number;
  };
  identifiers: {
    encryptionKey: string;
    hmacKey: string;
  };
  storage: {
    url: string;
    serviceRoleKey: string;
    publicBucket: string;
    privateBucket: string;
    storeBucket: string;
    signedUrlTtlSeconds: number;
  };
  mail: {
    host: string;
    port: number;
    secure: boolean;
    requireTls: boolean;
    user?: string;
    password?: string;
    from: string;
  };
  logging: {
    level: Exclude<ValidEnvironment['LOG_LEVEL'], undefined>;
  };
  scheduler: {
    enabled: boolean;
    batchSize: number;
    guestCartBatchSize: number;
    authCleanupBatchSize: number;
  };
  version: string;
}

export function loadConfig(source: NodeJS.ProcessEnv): AppConfig {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    const summary = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${summary}`);
  }

  const environment = result.data;
  const defaultLogLevel =
    environment.NODE_ENV === 'test'
      ? 'silent'
      : environment.NODE_ENV === 'production'
        ? 'info'
        : 'debug';

  return {
    environment: environment.NODE_ENV,
    api: {
      port: environment.API_PORT,
      publicUrl: environment.API_PUBLIC_URL,
      webPublicUrl: environment.WEB_PUBLIC_URL,
      webOrigin: environment.WEB_ORIGIN,
      requestBodyLimit: environment.REQUEST_BODY_LIMIT,
      trustProxy: environment.TRUST_PROXY,
    },
    database: {
      url: environment.DATABASE_URL,
      poolMax: environment.DB_POOL_MAX,
      connectionTimeoutMs: environment.DB_CONNECTION_TIMEOUT_MS,
      idleTimeoutMs: environment.DB_IDLE_TIMEOUT_MS,
    },
    auth: {
      accessSecret: environment.JWT_ACCESS_SECRET,
      accessTtlSeconds: environment.JWT_ACCESS_TTL_SECONDS,
      issuer: environment.JWT_ISSUER,
      audience: environment.JWT_AUDIENCE,
      refreshTtlDays: environment.AUTH_REFRESH_TTL_DAYS,
      argon2MemoryKib: environment.ARGON2_MEMORY_KIB,
      argon2TimeCost: environment.ARGON2_TIME_COST,
      argon2Parallelism: environment.ARGON2_PARALLELISM,
      passwordResetTtlMinutes: environment.PASSWORD_RESET_TTL_MINUTES,
      employeeInviteTtlHours: environment.EMPLOYEE_INVITE_TTL_HOURS,
      guestCartTtlDays: environment.GUEST_CART_TTL_DAYS,
    },
    identifiers: {
      encryptionKey: environment.IDENTIFIER_ENCRYPTION_KEY,
      hmacKey: environment.IDENTIFIER_HMAC_KEY,
    },
    storage: {
      url: new URL(environment.SUPABASE_URL).origin,
      serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
      publicBucket: environment.SUPABASE_PUBLIC_BUCKET,
      privateBucket: environment.SUPABASE_PRIVATE_BUCKET,
      storeBucket: environment.SUPABASE_STORE_BUCKET,
      signedUrlTtlSeconds: environment.SIGNED_URL_TTL_SECONDS,
    },
    mail: {
      host: environment.SMTP_HOST,
      port: environment.SMTP_PORT,
      secure: environment.SMTP_SECURE,
      requireTls: environment.SMTP_REQUIRE_TLS,
      ...(environment.SMTP_USER === undefined ? {} : { user: environment.SMTP_USER }),
      ...(environment.SMTP_PASSWORD === undefined ? {} : { password: environment.SMTP_PASSWORD }),
      from: environment.MAIL_FROM,
    },
    logging: {
      level: environment.LOG_LEVEL ?? defaultLogLevel,
    },
    scheduler: {
      enabled: environment.SCHEDULER_ENABLED,
      batchSize: environment.SCHEDULER_BATCH_SIZE,
      guestCartBatchSize: environment.SCHEDULER_GUEST_CART_BATCH_SIZE,
      authCleanupBatchSize: environment.SCHEDULER_AUTH_CLEANUP_BATCH_SIZE,
    },
    version: environment.APP_VERSION,
  };
}
