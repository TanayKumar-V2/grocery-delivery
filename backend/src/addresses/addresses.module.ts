import { Module } from '@nestjs/common';
import { AddressesService } from './addresses.service.js';
import { AddressesController } from './addresses.controller.js';

@Module({
  providers: [AddressesService],
  controllers: [AddressesController]
})
export class AddressesModule {}
