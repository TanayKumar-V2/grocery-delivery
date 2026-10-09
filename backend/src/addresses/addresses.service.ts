import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAddressDto } from './dto/create-address.dto.js';
import { UpdateAddressDto } from './dto/update-address.dto.js';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async createAddress(userId: string, dto: CreateAddressDto) {
    return this.prisma.$transaction(async (tx) => {
      const addressCount = await tx.address.count({
        where: { userId },
      });

      const shouldBeDefault = dto.isDefault ?? addressCount === 0;

      if (shouldBeDefault) {
        await tx.address.updateMany({
          where: {
            userId,
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        });
      }

      return tx.address.create({
        data: {
          userId,
          label: dto.label ?? 'HOME',
          recipientName: dto.recipientName,
          phone: dto.phone,
          addressLine1: dto.addressLine1,
          addressLine2: dto.addressLine2,
          landmark: dto.landmark,
          city: dto.city,
          state: dto.state,
          postalCode: dto.postalCode,
          isDefault: shouldBeDefault,
        },
        select: {
          id: true,
          label: true,
          recipientName: true,
          phone: true,
          addressLine1: true,
          addressLine2: true,
          landmark: true,
          city: true,
          state: true,
          postalCode: true,
          isDefault: true,
          createdAt: true,
        },
      });
    });
  }

  async getAddresses(userId: string) {
    return this.prisma.address.findMany({
      where: {
        userId,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        label: true,
        recipientName: true,
        phone: true,
        addressLine1: true,
        addressLine2: true,
        landmark: true,
        city: true,
        state: true,
        postalCode: true,
        latitude: true,
        longitude: true,
        isDefault: true,
        createdAt: true,
      },
    });
  }
  async updateAddress(
    userId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const address = await tx.address.findFirst({
        where: {
          id: addressId,
          userId,
        },
      });

      if (!address) {
        throw new NotFoundException('Address not found');
      }

      if (dto.isDefault === true) {
        await tx.address.updateMany({
          where: {
            userId,
            isDefault: true,
            id: {
              not: addressId,
            },
          },
          data: {
            isDefault: false,
          },
        });
      }

      return tx.address.update({
        where: {
          id: addressId,
        },
        data: dto,
        select: {
          id: true,
          label: true,
          recipientName: true,
          phone: true,
          addressLine1: true,
          addressLine2: true,
          landmark: true,
          city: true,
          state: true,
          postalCode: true,
          isDefault: true,
          updatedAt: true,
        },
      });
    });
  }
  async deleteAddress(userId: string, addressId: string) {
    return this.prisma.$transaction(async (tx) => {
      const address = await tx.address.findFirst({
        where: {
          id: addressId,
          userId,
        },
      });

      if (!address) {
        throw new NotFoundException('Address not found');
      }

      await tx.address.delete({
        where: {
          id: addressId,
        },
      });

      if (address.isDefault) {
        const nextAddress = await tx.address.findFirst({
          where: {
            userId,
          },
          orderBy: {
            createdAt: 'asc',
          },
        });

        if (nextAddress) {
          await tx.address.update({
            where: {
              id: nextAddress.id,
            },
            data: {
              isDefault: true,
            },
          });
        }
      }

      return {
        message: 'Address deleted successfully',
      };
    });
  }
}
