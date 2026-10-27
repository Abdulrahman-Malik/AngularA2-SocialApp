import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SideRightComponent } from './side-right.component';

describe('SideRightComponent', () => {
  let component: SideRightComponent;
  let fixture: ComponentFixture<SideRightComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SideRightComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SideRightComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
