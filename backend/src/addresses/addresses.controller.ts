import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  Param,
  Patch,
  Delete,
} from '@nestjs/common';
import { Request } from 'express';

import { AddressesService } from './addresses.service.js';
import { CreateAddressDto } from './dto/create-address.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UpdateAddressDto } from './dto/update-address.dto.js';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email: string;
    role: string;
  };
}

@Controller('addresses')
@UseGuards(JwtAuthGuard)
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Post()
  async createAddress(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateAddressDto,
  ) {
    return this.addressesService.createAddress(req.user.userId, dto);
  }

  @Get()
  async getAddresses(@Req() req: AuthenticatedRequest) {
    return this.addressesService.getAddresses(req.user.userId);
  }

  @Patch(':id')
  async updateAddress(
    @Req() req: AuthenticatedRequest,
    @Param('id') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.updateAddress(req.user.userId, addressId, dto);
  }
  
  @Delete(':id')
  async deleteAddress(
    @Req() req: AuthenticatedRequest,
    @Param('id') addressId: string,
  ) {
    return this.addressesService.deleteAddress(req.user.userId, addressId);
  }
}
