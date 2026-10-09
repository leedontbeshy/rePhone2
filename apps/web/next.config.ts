import type { NextConfig } from 'next';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Host development shares the root configuration with the API. Container
// environment variables and Next's app-local configuration take precedence.
const workspaceEnv = resolve(process.cwd(), '../../.env');
if (
  process.env.NODE_ENV === 'development' &&
  process.env.REPHONE_SANDBOX_WEB !== 'true' &&
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
  distDir: process.env.REPHONE_SANDBOX_WEB === 'true' ? '.next-dealer-sandbox' : '.next',
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@rephone/api-client'],
};

export default nextConfig;
