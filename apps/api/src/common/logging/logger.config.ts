import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AppConfig } from '../../config/app-config.js';
import { generateRequestId } from '../http/request-id.js';

const SENSITIVE_LOG_FIELDS = [
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'refreshToken',
  'refreshTokenHash',
  'accessToken',
  'authTokenHash',
  'token',
  'tokenHash',
  'inviteToken',
  'invitationToken',
  'resetToken',
  'guestToken',
  'guestAccessToken',
  'guestAccessTokenHash',
  'guestTokenHash',
  'guestTokenDigest',
  'jwt',
  'databaseUrl',
  'directUrl',
  'serviceRoleKey',
  'smtpPassword',
  'encryptionKey',
  'hmacKey',
  'apiKey',
  'keyHash',
  'secretCiphertext',
  'accountNumberCiphertext',
  'accountNumber',
  'imei',
  'imei1',
  'imei2',
  'imei1Hmac',
  'imei2Hmac',
  'serial',
  'serialHmac',
  'eid',
  'eidHmac',
  'identifierHmac',
  'ciphertext',
  'signedUrl',
  'evidenceUrl',
  'evidenceBucket',
  'evidenceObjectPath',
  'evidenceSha256',
  'objectPath',
  'bankQrObjectPath',
  'bytes',
  'buffer',
  'file',
  'bankAccountNumber',
  'bankAccountHolder',
  'shippingAddress',
  'shippingAddressSnapshot',
  'address',
  'contact',
  'customerEmail',
  'customerPhone',
  'recipient',
  'customerNote',
] as const;

export const REDACTED_LOG_PATHS = [
  "req.headers['x-dealer-api-key']",
  "headers['x-dealer-api-key']",
  "*.headers['x-dealer-api-key']",
  'req.headers.authorization',
  'req.headers.cookie',
  "req.headers['idempotency-key']",
  "req.headers['x-guest-order-token']",
  "res.headers['set-cookie']",
  'headers.authorization',
  'headers.cookie',
  "headers['idempotency-key']",
  "headers['x-guest-order-token']",
  "headers['set-cookie']",
  '*.headers.authorization',
  '*.headers.cookie',
  "*.headers['idempotency-key']",
  "*.headers['x-guest-order-token']",
  "*.headers['set-cookie']",
  ...SENSITIVE_LOG_FIELDS.flatMap((field) => [field, `*.${field}`, `*.*.${field}`]),
];

interface RoutedRequest extends IncomingMessage {
  auth?: { userId: string };
  baseUrl?: string;
  route?: { path?: unknown };
}

export function httpLogFields(request: IncomingMessage, response: ServerResponse) {
  const routedRequest = request as RoutedRequest;
  const routePath = routedRequest.route?.path;
  const route =
    typeof routePath === 'string' ? `${routedRequest.baseUrl ?? ''}${routePath}` : undefined;
  return {
    method: request.method,
    ...(route === undefined ? {} : { route }),
    ...(routedRequest.auth === undefined
      ? {}
      : { actorType: 'USER', actorId: routedRequest.auth.userId }),
    statusCode: response.statusCode,
  };
}

function httpLogObject(
  value: unknown,
  request: IncomingMessage,
  response: ServerResponse,
): Record<string, unknown> {
  const fields =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return { ...fields, ...httpLogFields(request, response) };
}

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
      redact: { paths: REDACTED_LOG_PATHS, remove: true },
      serializers: {
        req: (request: IncomingMessage) => ({ method: request.method }),
        res: (response: ServerResponse) => ({ statusCode: response.statusCode }),
      },
      customSuccessObject: (request, response, value) => httpLogObject(value, request, response),
      customErrorObject: (request, response, _error, value) =>
        httpLogObject(value, request, response),
      customSuccessMessage: () => 'http.request.completed',
      customErrorMessage: () => 'http.request.failed',
      ...(prettyTransport === undefined ? {} : { transport: prettyTransport }),
    },
  };
}
