import { Test, TestingModule } from '@nestjs/testing';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import { AuthService } from './auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('AuthService', () => {
  let service: AuthService;

  const prismaMock = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };

  const jwtMock = {
    signAsync: vi.fn(),
  };

  let passwordHash: string;

  beforeAll(async () => {
    // Generate a real test password hash with a low cost factor.
    passwordHash = await bcrypt.hash('CorrectPassword123!', 4);
  });

  beforeEach(async () => {
    prismaMock.user.findUnique.mockReset();
    prismaMock.user.create.mockReset();
    jwtMock.signAsync.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: JwtService,
          useValue: jwtMock,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  const activeUser = () => ({
    id: 'user-123',
    name: 'Test Customer',
    email: 'customer@example.com',
    passwordHash,
    role: 'CUSTOMER',
    isActive: true,
  });

  describe('register', () => {
    it('registers a customer with a hashed password', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      prismaMock.user.create.mockResolvedValue({
        id: 'user-123',
        name: 'Test Customer',
        email: 'customer@example.com',
        role: 'CUSTOMER',
        passwordHash: 'stored-hash',
      });

      const result = await service.register({
        name: 'Test Customer',
        email: 'customer@example.com',
        password: 'CorrectPassword123!',
      });

      expect(result).toEqual({
        id: 'user-123',
        name: 'Test Customer',
        email: 'customer@example.com',
        role: 'CUSTOMER',
      });

      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          name: 'Test Customer',
          email: 'customer@example.com',
          passwordHash: expect.any(String),
          role: 'CUSTOMER',
        },
      });

      const savedData = prismaMock.user.create.mock.calls[0][0].data;

      expect(savedData.passwordHash).not.toBe('CorrectPassword123!');
      await expect(
        bcrypt.compare(
          'CorrectPassword123!',
          savedData.passwordHash,
        ),
      ).resolves.toBe(true);
    });

    it('rejects registration when the email already exists', async () => {
      prismaMock.user.findUnique.mockResolvedValue(activeUser());

      await expect(
        service.register({
          name: 'Another Customer',
          email: 'customer@example.com',
          password: 'CorrectPassword123!',
        }),
      ).rejects.toThrow('An account with this email already exists');

      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('rejects an email that does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login('unknown@example.com', 'any-password'),
      ).rejects.toThrow('Invalid email or password');

      expect(jwtMock.signAsync).not.toHaveBeenCalled();
    });

    it('rejects a disabled account', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...activeUser(),
        isActive: false,
      });

      await expect(
        service.login('customer@example.com', 'CorrectPassword123!'),
      ).rejects.toThrow('This account has been disabled');

      expect(jwtMock.signAsync).not.toHaveBeenCalled();
    });

    it('rejects an incorrect password', async () => {
      prismaMock.user.findUnique.mockResolvedValue(activeUser());

      await expect(
        service.login('customer@example.com', 'WrongPassword123!'),
      ).rejects.toThrow('Invalid email or password');

      expect(jwtMock.signAsync).not.toHaveBeenCalled();
    });

    it('logs in successfully and returns an access token', async () => {
      prismaMock.user.findUnique.mockResolvedValue(activeUser());
      jwtMock.signAsync.mockResolvedValue('test-access-token');

      const result = await service.login(
        'customer@example.com',
        'CorrectPassword123!',
      );

      expect(jwtMock.signAsync).toHaveBeenCalledWith({
        sub: 'user-123',
        email: 'customer@example.com',
        role: 'CUSTOMER',
      });

      expect(result).toEqual({
        accessToken: 'test-access-token',
        user: {
          id: 'user-123',
          name: 'Test Customer',
          email: 'customer@example.com',
          role: 'CUSTOMER',
        },
      });
    });
  });
});