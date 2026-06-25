import { Test, TestingModule } from '@nestjs/testing';
import { MarketFactoryController } from './market-factory.controller';

describe('MarketFactoryController', () => {
  let controller: MarketFactoryController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MarketFactoryController],
    }).compile();

    controller = module.get<MarketFactoryController>(MarketFactoryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
