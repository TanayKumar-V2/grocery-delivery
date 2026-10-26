import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

import { AppController } from './app.controller.js';
import { PrismaService } from './prisma/prisma.service.js';

describe('AppController', () => {
  let appController: AppController;
  let prismaMock: { user: { count: ReturnType<typeof vi.fn> } };

  beforeEach(async () => {
    prismaMock = {
      user: {
        count: vi.fn(),
      },
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('returns 200 and healthy status when database is connected', async () => {
    prismaMock.user.count.mockResolvedValue(42);
    const statusSpy = vi.fn();
    const jsonSpy = vi.fn();
    const res = {
      status: statusSpy.mockReturnThis(),
      json: jsonSpy.mockReturnThis(),
    } as unknown as Response;

    await appController.getHealth(res);

    expect(statusSpy).toHaveBeenCalledWith(HttpStatus.OK);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        service: 'grocery-delivery-api',
        database: 'connected',
        users: 42,
      }),
    );
  });

  it('returns 503 and error status when database fails', async () => {
    prismaMock.user.count.mockRejectedValue(new Error('Connection timeout'));
    const statusSpy = vi.fn();
    const jsonSpy = vi.fn();
    const res = {
      status: statusSpy.mockReturnThis(),
      json: jsonSpy.mockReturnThis(),
    } as unknown as Response;

    await appController.getHealth(res);

    expect(statusSpy).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        service: 'grocery-delivery-api',
        database: 'disconnected',
        error: 'Connection timeout',
      }),
    );
  });
});
