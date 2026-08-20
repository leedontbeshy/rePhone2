import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
  type OperationObject,
} from '@nestjs/swagger';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const options = new DocumentBuilder()
    .setTitle('rePhone API')
    .setDescription('REST API contract for the rePhone P0 modular monolith.')
    .setVersion('1.0.0')
    .addServer('http://localhost:4000', 'Local development')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();

  return SwaggerModule.createDocument(app, options, {
    operationIdFactory: (_controllerKey, methodKey) => methodKey,
  });
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
