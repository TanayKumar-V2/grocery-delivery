import 'dotenv/config';
import net from 'node:net';
import dns from 'node:dns';

if (typeof (net as any).setDefaultAutoSelectFamily === 'function') {
  (net as any).setDefaultAutoSelectFamily(false);
}
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { RateLimitGuard } from './common/guards/rate-limit.guard.js';
import { validateEnvironment } from './config/env.validation.js';

async function bootstrap() {
  const env = validateEnvironment();

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  app.enableShutdownHooks();

  const origins = env.CORS_ORIGIN.includes(',')
    ? env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : env.CORS_ORIGIN;

  app.enableCors({
    origin: origins,
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const reflector = app.get(Reflector);
  app.useGlobalGuards(new RateLimitGuard(reflector));

  await app.listen(env.PORT);

  console.log(`Backend running at http://localhost:${env.PORT}`);
}

void bootstrap();
