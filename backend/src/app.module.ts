import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AdminModule } from './admin/admin.module.js';

@Module({
  imports: [PrismaModule, UsersModule, AuthModule, AdminModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}