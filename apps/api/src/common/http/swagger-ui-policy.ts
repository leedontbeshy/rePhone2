import type { AppConfig } from '../../config/app-config.js';

export function shouldEnableSwaggerUi(
  environment: AppConfig['environment'],
  requested = true,
): boolean {
  return environment === 'development' && requested;
}
