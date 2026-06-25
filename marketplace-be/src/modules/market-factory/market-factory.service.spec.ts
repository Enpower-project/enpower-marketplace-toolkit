import { Test, TestingModule } from '@nestjs/testing';
import { MarketFactoryService } from './market-factory.service';

describe('MarketFactoryService', () => {
  let service: MarketFactoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MarketFactoryService],
    }).compile();

    service = module.get<MarketFactoryService>(MarketFactoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
