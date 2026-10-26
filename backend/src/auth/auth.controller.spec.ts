import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;
  let authServiceMock: any;

  beforeEach(async () => {
    authServiceMock = {
      register: vi.fn(),
      login: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authServiceMock,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('register delegates to authService', async () => {
    const dto = {
      name: 'John Doe',
      email: 'john@example.com',
      password: 'Password123!',
    };
    authServiceMock.register.mockResolvedValue({
      id: 'u-1',
      name: dto.name,
      email: dto.email,
      role: 'CUSTOMER',
    });

    const result = await controller.register(dto);

    expect(authServiceMock.register).toHaveBeenCalledWith(dto);
    expect(result.id).toBe('u-1');
  });

  it('login delegates to authService with email and password', async () => {
    const dto = {
      email: 'john@example.com',
      password: 'Password123!',
    };
    authServiceMock.login.mockResolvedValue({
      accessToken: 'jwt-token-123',
      user: { id: 'u-1', email: dto.email },
    });

    const result = await controller.login(dto);

    expect(authServiceMock.login).toHaveBeenCalledWith(dto.email, dto.password);
    expect(result.accessToken).toBe('jwt-token-123');
  });
});
