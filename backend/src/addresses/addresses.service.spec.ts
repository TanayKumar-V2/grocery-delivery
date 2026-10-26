import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import { AddressesService } from './addresses.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('AddressesService', () => {
  let service: AddressesService;
  let mockPrisma: any;
  let mockTx: any;

  beforeEach(async () => {
    mockTx = {
      address: {
        count: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };

    mockPrisma = {
      address: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(mockTx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressesService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<AddressesService>(AddressesService);
  });

  describe('createAddress', () => {
    it('automatically marks first address as default', async () => {
      mockTx.address.count.mockResolvedValue(0);
      mockTx.address.create.mockResolvedValue({
        id: 'addr-1',
        recipientName: 'Alice',
        isDefault: true,
      });

      const dto = {
        recipientName: 'Alice',
        phone: '9876543210',
        addressLine1: '123 Test Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400001',
      };

      const result = await service.createAddress('user-1', dto);

      expect(mockTx.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true },
        data: { isDefault: false },
      });
      expect(mockTx.address.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            isDefault: true,
          }),
        }),
      );
      expect(result.isDefault).toBe(true);
    });

    it('unsets previous default addresses when new default address is added', async () => {
      mockTx.address.count.mockResolvedValue(2);
      mockTx.address.create.mockResolvedValue({
        id: 'addr-3',
        recipientName: 'Alice',
        isDefault: true,
      });

      const dto = {
        recipientName: 'Alice',
        phone: '9876543210',
        addressLine1: '456 New Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400001',
        isDefault: true,
      };

      await service.createAddress('user-1', dto);

      expect(mockTx.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true },
        data: { isDefault: false },
      });
    });
  });

  describe('getAddresses', () => {
    it('returns only the requesting user addresses ordered by default', async () => {
      const mockAddresses = [
        { id: 'addr-1', isDefault: true },
        { id: 'addr-2', isDefault: false },
      ];
      mockPrisma.address.findMany.mockResolvedValue(mockAddresses);

      const result = await service.getAddresses('user-1');

      expect(mockPrisma.address.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        }),
      );
      expect(result).toEqual(mockAddresses);
    });
  });

  describe('updateAddress', () => {
    it('throws NotFoundException if address does not exist or does not belong to user', async () => {
      mockTx.address.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAddress('user-1', 'addr-other', { recipientName: 'Bob' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates address and handles setting isDefault true', async () => {
      mockTx.address.findFirst.mockResolvedValue({
        id: 'addr-2',
        userId: 'user-1',
        isDefault: false,
      });
      mockTx.address.update.mockResolvedValue({
        id: 'addr-2',
        isDefault: true,
      });

      const result = await service.updateAddress('user-1', 'addr-2', { isDefault: true });

      expect(mockTx.address.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          isDefault: true,
          id: { not: 'addr-2' },
        },
        data: { isDefault: false },
      });
      expect(result.isDefault).toBe(true);
    });
  });

  describe('deleteAddress', () => {
    it('throws NotFoundException if address does not belong to user', async () => {
      mockTx.address.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteAddress('user-1', 'addr-other'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deletes address and sets next address as default if deleted address was default', async () => {
      mockTx.address.findFirst
        .mockResolvedValueOnce({ id: 'addr-1', userId: 'user-1', isDefault: true }) // address to delete
        .mockResolvedValueOnce({ id: 'addr-2', userId: 'user-1' }); // next address

      mockTx.address.delete.mockResolvedValue({ id: 'addr-1' });
      mockTx.address.update.mockResolvedValue({ id: 'addr-2', isDefault: true });

      const result = await service.deleteAddress('user-1', 'addr-1');

      expect(mockTx.address.delete).toHaveBeenCalledWith({ where: { id: 'addr-1' } });
      expect(mockTx.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-2' },
        data: { isDefault: true },
      });
      expect(result.message).toBe('Address deleted successfully');
    });
  });
});
