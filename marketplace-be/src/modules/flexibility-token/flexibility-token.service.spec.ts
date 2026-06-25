import { Test, TestingModule } from '@nestjs/testing';
import { FlexibilityTokenService } from './flexibility-token.service';

describe('FlexibilityTokenService', () => {
  let service: FlexibilityTokenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FlexibilityTokenService],
    }).compile();

    service = module.get<FlexibilityTokenService>(FlexibilityTokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
