import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AdminModule } from './admin/admin.module.js';
import { ProductsModule } from './products/products.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { CartModule } from './cart/cart.module.js';
import { AddressesModule } from './addresses/addresses.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [PrismaModule, UsersModule, AuthModule, AdminModule, ProductsModule, CategoriesModule, CartModule, AddressesModule, OrdersModule,ScheduleModule.forRoot()],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}