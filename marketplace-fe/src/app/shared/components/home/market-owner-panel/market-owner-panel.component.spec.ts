import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MarketOwnerPanelComponent } from './market-owner-panel.component';

describe('MarketOwnerPanelComponent', () => {
  let component: MarketOwnerPanelComponent;
  let fixture: ComponentFixture<MarketOwnerPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarketOwnerPanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MarketOwnerPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
