import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AppConfig } from '../../config/app-config.js';
import { generateRequestId } from '../http/request-id.js';

const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers.idempotency-key',
  'req.headers.x-guest-order-token',
  'res.headers.set-cookie',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.refreshToken',
  '*.accessToken',
  '*.token',
  '*.inviteToken',
  '*.resetToken',
  '*.guestToken',
  '*.guestAccessToken',
  '*.guestAccessTokenHash',
  '*.guestTokenHash',
  '*.guestTokenDigest',
  '*.jwt',
  '*.databaseUrl',
  '*.serviceRoleKey',
  '*.encryptionKey',
  '*.hmacKey',
  '*.imei',
  '*.imei1',
  '*.imei2',
  '*.serial',
  '*.eid',
  '*.ciphertext',
  '*.signedUrl',
  '*.bytes',
  '*.bankAccountNumber',
  '*.shippingAddress',
  '*.shippingAddressSnapshot',
  '*.contact',
];

export function createLoggerParams(config: AppConfig): Params {
  const prettyTransport =
    config.environment === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, singleLine: true, translateTime: 'SYS:standard' },
        }
      : undefined;

  return {
    pinoHttp: {
      level: config.logging.level,
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
      genReqId: generateRequestId,
      customAttributeKeys: {
        reqId: 'requestId',
        responseTime: 'durationMs',
      },
      customProps: () => ({
        service: 'rephone-api',
        environment: config.environment,
        version: config.version,
      }),
      redact: { paths: REDACTED_PATHS, remove: true },
      serializers: {
        req: (request: IncomingMessage) => ({ method: request.method }),
        res: (response: ServerResponse) => ({ statusCode: response.statusCode }),
      },
      customSuccessMessage: () => 'http.request.completed',
      customErrorMessage: () => 'http.request.failed',
      ...(prettyTransport === undefined ? {} : { transport: prettyTransport }),
    },
  };
}
