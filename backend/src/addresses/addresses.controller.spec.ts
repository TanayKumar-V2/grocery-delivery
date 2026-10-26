import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AddressesController } from './addresses.controller.js';
import { AddressesService } from './addresses.service.js';

describe('AddressesController', () => {
  let controller: AddressesController;
  let addressesServiceMock: any;

  beforeEach(async () => {
    addressesServiceMock = {
      createAddress: vi.fn(),
      getAddresses: vi.fn(),
      updateAddress: vi.fn(),
      deleteAddress: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AddressesController],
      providers: [
        {
          provide: AddressesService,
          useValue: addressesServiceMock,
        },
      ],
    }).compile();

    controller = module.get<AddressesController>(AddressesController);
  });

  const mockUserReq = {
    user: { userId: 'user-123', email: 'user@example.com', role: 'CUSTOMER' },
  } as any;

  it('createAddress delegates to service with userId and dto', async () => {
    const dto = { recipientName: 'Alice' } as any;
    addressesServiceMock.createAddress.mockResolvedValue({ id: 'addr-1' });

    const result = await controller.createAddress(mockUserReq, dto);

    expect(addressesServiceMock.createAddress).toHaveBeenCalledWith('user-123', dto);
    expect(result).toEqual({ id: 'addr-1' });
  });

  it('getAddresses delegates to service with userId', async () => {
    addressesServiceMock.getAddresses.mockResolvedValue([]);

    const result = await controller.getAddresses(mockUserReq);

    expect(addressesServiceMock.getAddresses).toHaveBeenCalledWith('user-123');
    expect(result).toEqual([]);
  });

  it('updateAddress delegates to service with userId, addressId, and dto', async () => {
    const dto = { recipientName: 'Bob' };
    addressesServiceMock.updateAddress.mockResolvedValue({ id: 'addr-1' });

    const result = await controller.updateAddress(mockUserReq, 'addr-1', dto);

    expect(addressesServiceMock.updateAddress).toHaveBeenCalledWith('user-123', 'addr-1', dto);
    expect(result).toEqual({ id: 'addr-1' });
  });

  it('deleteAddress delegates to service with userId and addressId', async () => {
    addressesServiceMock.deleteAddress.mockResolvedValue({ message: 'Deleted' });

    const result = await controller.deleteAddress(mockUserReq, 'addr-1');

    expect(addressesServiceMock.deleteAddress).toHaveBeenCalledWith('user-123', 'addr-1');
    expect(result).toEqual({ message: 'Deleted' });
  });
});
