import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const mockPrisma = {
    user: {
      count: vi.fn().mockResolvedValue(5),
    },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', 'test_jwt_secret_for_e2e_spec');
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_e2e');
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'test_key_secret');
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', 'test_webhook_secret');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET) returns service health status and database status', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'grocery-delivery-api',
      database: 'connected',
      users: 5,
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (app) {
      await app.close();
    }
  });
});
