import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InfiniteLoaderComponent } from './infinite-loader.component';

describe('InfiniteLoaderComponent', () => {
  let component: InfiniteLoaderComponent;
  let fixture: ComponentFixture<InfiniteLoaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ InfiniteLoaderComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(InfiniteLoaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
