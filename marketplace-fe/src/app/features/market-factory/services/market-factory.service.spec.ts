import { TestBed } from '@angular/core/testing';

import { MarketFactoryService } from './market-factory.service';

describe('MarketFactoryService', () => {
  let service: MarketFactoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MarketFactoryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
