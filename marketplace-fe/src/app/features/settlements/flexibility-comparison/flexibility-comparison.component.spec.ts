import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FlexibilityComparisonComponent } from './flexibility-comparison.component';

describe('FlexibilityComparisonComponent', () => {
  let component: FlexibilityComparisonComponent;
  let fixture: ComponentFixture<FlexibilityComparisonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlexibilityComparisonComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(FlexibilityComparisonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
