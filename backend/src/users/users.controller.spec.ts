import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

describe('UsersController', () => {
  let controller: UsersController;
  let usersServiceMock: any;

  beforeEach(async () => {
    usersServiceMock = {
      getUserCount: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: usersServiceMock,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('getUserCount calls service and returns count', async () => {
    usersServiceMock.getUserCount.mockResolvedValue(15);

    const result = await controller.getUserCount();

    expect(usersServiceMock.getUserCount).toHaveBeenCalled();
    expect(result).toEqual({ count: 15 });
  });

  it('getMe returns authenticated user', () => {
    const req = {
      user: {
        userId: 'u-1',
        email: 'user@example.com',
        role: 'CUSTOMER',
      },
    } as any;

    const result = controller.getMe(req);

    expect(result).toEqual(req.user);
  });

  it('adminTest returns welcome message', () => {
    const result = controller.adminTest();

    expect(result).toEqual({ message: 'Welcome, Admin!' });
  });
});
