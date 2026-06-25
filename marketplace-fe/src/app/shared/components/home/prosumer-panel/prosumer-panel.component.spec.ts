import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProsumerPanelComponent } from './prosumer-panel.component';

describe('ProsumerPanelComponent', () => {
  let component: ProsumerPanelComponent;
  let fixture: ComponentFixture<ProsumerPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProsumerPanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProsumerPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
