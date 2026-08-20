export function setTestEnvironment(): void {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    API_PORT: '4001',
    API_PUBLIC_URL: 'http://localhost:4001',
    WEB_PUBLIC_URL: 'http://localhost:3001',
    WEB_ORIGIN: 'http://localhost:3001',
    DATABASE_URL:
      process.env.TEST_DATABASE_URL ?? 'postgresql://rephone:rephone@localhost:5433/rephone_test',
    DIRECT_URL:
      process.env.TEST_DATABASE_URL ?? 'postgresql://rephone:rephone@localhost:5433/rephone_test',
    JWT_ACCESS_SECRET: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
    IDENTIFIER_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
    IDENTIFIER_HMAC_KEY: 'YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk=',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    SUPABASE_PUBLIC_BUCKET: 'public-test',
    SUPABASE_PRIVATE_BUCKET: 'private-test',
    SUPABASE_STORE_BUCKET: 'store-test',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    SMTP_SECURE: 'false',
    MAIL_FROM: 'rePhone Test <no-reply@rephone.local>',
    LOG_LEVEL: 'silent',
    SCHEDULER_ENABLED: 'false',
  });
}
