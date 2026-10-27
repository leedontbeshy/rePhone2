import type { NextConfig } from 'next';
export function cloudProxyConfig(env: NodeJS.ProcessEnv): Pick<NextConfig, 'rewrites' | 'headers'>;
