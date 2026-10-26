import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AdminController } from './admin.controller.js';

describe('AdminController', () => {
  let controller: AdminController;

  it('getDashboard returns dashboard message', async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
    }).compile();

    controller = module.get<AdminController>(AdminController);

    const result = controller.getDashboard();

    expect(result).toEqual({ message: 'Welcome to the admin dashboard' });
  });
});
