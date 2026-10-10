import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
  type OperationObject,
} from '@nestjs/swagger';
import { GUEST_CART_COOKIE_NAME, REFRESH_COOKIE_NAME } from '../modules/auth/auth.constants.js';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const options = new DocumentBuilder()
    .setTitle('rePhone API')
    .setDescription('REST API contract for the rePhone P0 modular monolith.')
    .setVersion('1.0.0')
    .addServer('http://localhost:4000', 'Local development')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addCookieAuth(
      REFRESH_COOKIE_NAME,
      { type: 'apiKey', in: 'cookie', name: REFRESH_COOKIE_NAME },
      REFRESH_COOKIE_NAME,
    )
    .addCookieAuth(
      GUEST_CART_COOKIE_NAME,
      { type: 'apiKey', in: 'cookie', name: GUEST_CART_COOKIE_NAME },
      GUEST_CART_COOKIE_NAME,
    )
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Guest-Order-Token' }, 'guestOrderToken')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Dealer-Api-Key' }, 'dealerApiKey')
    .build();

  const document = SwaggerModule.createDocument(app, options, {
    operationIdFactory: (controllerKey, methodKey) =>
      controllerKey.startsWith('Dealer') || controllerKey.startsWith('Affiliate')
        ? `${controllerKey}_${methodKey}`
        : methodKey,
  });
  applyOptionalCommerceSecurity(document);
  return document;
}

function applyOptionalCommerceSecurity(document: OpenAPIObject): void {
  const securityByOperationId: Record<string, Array<Record<string, string[]>>> = {
    getCart: [{}, { 'access-token': [] }, { rephone_guest_cart: [] }],
    addCartItem: [{ 'access-token': [] }, { rephone_guest_cart: [] }],
    updateCartItem: [{ 'access-token': [] }, { rephone_guest_cart: [] }],
    removeCartItem: [{ 'access-token': [] }, { rephone_guest_cart: [] }],
    mergeCart: [{ 'access-token': [] }],
    listPublicVouchers: [{}, { 'access-token': [] }],
    previewCheckout: [{ 'access-token': [] }, { rephone_guest_cart: [] }],
    createCheckout: [{ 'access-token': [] }, { rephone_guest_cart: [] }],
    listCustomerOrders: [{ 'access-token': [] }],
    getCustomerOrder: [{ 'access-token': [] }, { guestOrderToken: [] }, { rephone_guest_cart: [] }],
    cancelCustomerOrder: [
      { 'access-token': [] },
      { guestOrderToken: [] },
      { rephone_guest_cart: [] },
    ],
    getCustomerWarranty: [
      { 'access-token': [] },
      { guestOrderToken: [] },
      { rephone_guest_cart: [] },
    ],
    createAfterSalesRequest: [
      { 'access-token': [] },
      { guestOrderToken: [] },
      { rephone_guest_cart: [] },
    ],
    getAfterSalesRequest: [
      { 'access-token': [] },
      { guestOrderToken: [] },
      { rephone_guest_cart: [] },
    ],
    uploadAfterSalesAttachment: [
      { 'access-token': [] },
      { guestOrderToken: [] },
      { rephone_guest_cart: [] },
    ],
    getAfterSalesAttachmentUrl: [
      { 'access-token': [] },
      { guestOrderToken: [] },
      { rephone_guest_cart: [] },
    ],
    cancelAfterSalesRequest: [
      { 'access-token': [] },
      { guestOrderToken: [] },
      { rephone_guest_cart: [] },
    ],
  };
  for (const pathItem of Object.values(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation: OperationObject | undefined = pathItem[method];
      if (operation?.operationId === undefined) continue;
      const security = securityByOperationId[operation.operationId];
      if (security !== undefined) operation.security = security;
    }
  }
}

export function validateOpenApiDocument(document: OpenAPIObject): void {
  const operationIds = new Set<string>();

  for (const [path, pathItem] of Object.entries(document.paths)) {
    if (!path.startsWith('/api/v1/') && path !== '/health/live' && path !== '/health/ready') {
      throw new Error(`Unexpected API path in OpenAPI: ${path}`);
    }

    for (const method of HTTP_METHODS) {
      const operation: OperationObject | undefined = pathItem[method];
      if (operation === undefined) {
        continue;
      }
      if (!operation.operationId) {
        throw new Error(`Missing operationId for ${method.toUpperCase()} ${path}`);
      }
      if (operationIds.has(operation.operationId)) {
        throw new Error(`Duplicate OpenAPI operationId: ${operation.operationId}`);
      }
      operationIds.add(operation.operationId);
    }
  }
}

export function sortOpenApiDocument(document: OpenAPIObject): OpenAPIObject {
  return sortObjectKeys(document) as OpenAPIObject;
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => sortObjectKeys(item));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortObjectKeys(item)]),
    );
  }
  return value;
}
