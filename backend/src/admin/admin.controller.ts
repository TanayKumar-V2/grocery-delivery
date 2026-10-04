import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';

import { Role } from '../generated/prisma/enums.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guards.js';
import { Roles } from '../auth/decorators/roles.decorators.js';

@Controller('admin')
export class AdminController {
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('dashboard')
  getDashboard() {
    return {
      message: 'Welcome to the admin dashboard',
    };
  }
}