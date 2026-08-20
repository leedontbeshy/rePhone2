import { RequestMethod, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded, type Express } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ApiExceptionFilter } from './common/http/api-exception.filter.js';
import { ApiResponseInterceptor } from './common/http/api-response.interceptor.js';
import { createValidationError } from './common/http/validation.js';
import { AppModule } from './app.module.js';
import { APP_CONFIG } from './config/app-config.module.js';
import type { AppConfig } from './config/app-config.js';
import { createOpenApiDocument } from './openapi/openapi.js';

export interface CreateApplicationOptions {
  enableSwagger?: boolean;
}

export async function createApplication(
  options: CreateApplicationOptions = {},
): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  const config = app.get<AppConfig>(APP_CONFIG);

  app.useLogger(app.get(Logger));
  const express = app.getHttpAdapter().getInstance() as Express;
  express.set('trust proxy', config.api.trustProxy);
  app.use(helmet());
  app.use(cookieParser());
  app.use(json({ limit: config.api.requestBodyLimit }));
  app.use(urlencoded({ extended: true, limit: config.api.requestBodyLimit }));
  app.enableCors({
    origin: config.api.webOrigin,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health/{*path}', method: RequestMethod.ALL }],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: createValidationError,
    }),
  );
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  app.useGlobalFilters(new ApiExceptionFilter());

  if ((options.enableSwagger ?? true) && config.environment === 'development') {
    SwaggerModule.setup('docs', app, createOpenApiDocument(app));
  }

  app.enableShutdownHooks();
  return app;
}
