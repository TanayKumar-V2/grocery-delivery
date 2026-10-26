import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UsersService } from './users.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('UsersService', () => {
  let service: UsersService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      user: {
        count: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('getUserCount returns count from prisma', async () => {
    mockPrisma.user.count.mockResolvedValue(10);

    const count = await service.getUserCount();

    expect(count).toBe(10);
    expect(mockPrisma.user.count).toHaveBeenCalledTimes(1);
  });
});
