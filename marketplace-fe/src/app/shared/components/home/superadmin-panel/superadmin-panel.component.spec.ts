import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SuperadminPanelComponent } from './superadmin-panel.component';

describe('SuperadminPanelComponent', () => {
  let component: SuperadminPanelComponent;
  let fixture: ComponentFixture<SuperadminPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SuperadminPanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SuperadminPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
