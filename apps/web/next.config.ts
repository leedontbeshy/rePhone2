import type { NextConfig } from 'next';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Host development shares the root configuration with the API. Container
// environment variables and Next's app-local configuration take precedence.
const workspaceRoot = resolve(process.cwd(), '../..');
const workspaceEnv = resolve(
  workspaceRoot,
  process.env.REPHONE_ENV_FILE ??
    (process.env.NODE_ENV === 'production' ? '.env.production' : '.env'),
);
if (
  process.env.NODE_ENV !== 'test' &&
  process.env.REPHONE_SKIP_ENV_FILE !== 'true' &&
  existsSync(workspaceEnv)
) {
  process.loadEnvFile(workspaceEnv);
}

const nextConfig: NextConfig = {
  // Only public connection metadata belongs in the guide and client bundle.
  env: {
    DEALER_ENVIRONMENT: process.env.DEALER_ENVIRONMENT ?? 'LIVE',
    DEALER_SANDBOX_WEB_URL: process.env.DEALER_SANDBOX_WEB_URL ?? '',
    DEALER_SANDBOX_API_URL: process.env.DEALER_SANDBOX_API_URL ?? '',
    API_PUBLIC_URL: process.env.API_PUBLIC_URL ?? '',
  },
  distDir: process.env.REPHONE_WEB_DIST_DIR ?? '.next',
  turbopack: { root: workspaceRoot },
  outputFileTracingRoot: workspaceRoot,
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@rephone/api-client'],
};

export default nextConfig;
