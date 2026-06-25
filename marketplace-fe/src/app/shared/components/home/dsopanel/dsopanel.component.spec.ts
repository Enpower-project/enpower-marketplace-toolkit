import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DSOPanelComponent } from './dsopanel.component';

describe('DSOPanelComponent', () => {
  let component: DSOPanelComponent;
  let fixture: ComponentFixture<DSOPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DSOPanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DSOPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
