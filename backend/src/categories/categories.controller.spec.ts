import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let categoriesServiceMock: any;

  beforeEach(async () => {
    categoriesServiceMock = {
      createCategory: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        {
          provide: CategoriesService,
          useValue: categoriesServiceMock,
        },
      ],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
  });

  it('createCategory delegates to service with dto', async () => {
    const dto = { name: 'Dairy' };
    categoriesServiceMock.createCategory.mockResolvedValue({ id: 'cat-1', name: 'Dairy' });

    const result = await controller.createCategory(dto);

    expect(categoriesServiceMock.createCategory).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ id: 'cat-1', name: 'Dairy' });
  });
});
