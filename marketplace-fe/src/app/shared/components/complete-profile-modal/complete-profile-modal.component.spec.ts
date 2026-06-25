import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { CompleteProfileModalComponent } from './complete-profile-modal.component';
import { UserStatusService } from '../../../core/services/auth/user-status.service';
import { CompleteProfileDto } from '../../../core/services/auth/first-login.service';

describe('CompleteProfileModalComponent', () => {
  let component: CompleteProfileModalComponent;
  let fixture: ComponentFixture<CompleteProfileModalComponent>;
  let mockDialogRef: jasmine.SpyObj<MatDialogRef<CompleteProfileModalComponent>>;
  let mockUserStatusService: jasmine.SpyObj<UserStatusService>;
  let mockSnackBar: jasmine.SpyObj<MatSnackBar>;
  let formBuilder: FormBuilder;

  beforeEach(async () => {
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    const userStatusServiceSpy = jasmine.createSpyObj('UserStatusService', ['completeUserProfile']);
    const snackBarSpy = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [
        CompleteProfileModalComponent,
        ReactiveFormsModule,
        NoopAnimationsModule
      ],
      providers: [
        FormBuilder,
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: UserStatusService, useValue: userStatusServiceSpy },
        { provide: MatSnackBar, useValue: snackBarSpy }
      ]
    }).compileComponents();

    mockDialogRef = TestBed.inject(MatDialogRef) as jasmine.SpyObj<MatDialogRef<CompleteProfileModalComponent>>;
    mockUserStatusService = TestBed.inject(UserStatusService) as jasmine.SpyObj<UserStatusService>;
    mockSnackBar = TestBed.inject(MatSnackBar) as jasmine.SpyObj<MatSnackBar>;
    formBuilder = TestBed.inject(FormBuilder);

    fixture = TestBed.createComponent(CompleteProfileModalComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('form initialization', () => {
    it('should initialize form with correct controls and validators', () => {
      expect(component.profileForm).toBeDefined();
      expect(component.profileForm.get('firstName')).toBeTruthy();
      expect(component.profileForm.get('lastName')).toBeTruthy();
      expect(component.profileForm.get('phone')).toBeTruthy();
      expect(component.profileForm.get('address')).toBeTruthy();
      expect(component.profileForm.get('city')).toBeTruthy();
      expect(component.profileForm.get('country')).toBeTruthy();
      expect(component.profileForm.get('postalCode')).toBeTruthy();
    });

    it('should require firstName field', () => {
      const firstNameControl = component.profileForm.get('firstName');
      expect(firstNameControl?.hasError('required')).toBe(true);

      firstNameControl?.setValue('John');
      expect(firstNameControl?.hasError('required')).toBe(false);
    });

    it('should require lastName field', () => {
      const lastNameControl = component.profileForm.get('lastName');
      expect(lastNameControl?.hasError('required')).toBe(true);

      lastNameControl?.setValue('Doe');
      expect(lastNameControl?.hasError('required')).toBe(false);
    });

    it('should not require optional fields', () => {
      const optionalFields = ['phone', 'address', 'city', 'country', 'postalCode'];

      optionalFields.forEach(fieldName => {
        const control = component.profileForm.get(fieldName);
        expect(control?.hasError('required')).toBe(false);
      });
    });
  });

  describe('ngOnInit', () => {
    it('should initialize component without errors', () => {
      expect(() => component.ngOnInit()).not.toThrow();
    });
  });

  describe('onCancel', () => {
    it('should close dialog with false result', () => {
      component.onCancel();

      expect(mockDialogRef.close).toHaveBeenCalledWith(false);
    });
  });

  describe('onSave', () => {
    beforeEach(() => {
      jasmine.clock().install();
    });

    afterEach(() => {
      jasmine.clock().uninstall();
    });

    it('should not save if form is invalid', () => {
      // Form is invalid by default (firstName and lastName are required)
      component.onSave();

      expect(mockUserStatusService.completeUserProfile).not.toHaveBeenCalled();
      expect(component.isLoading).toBe(false);
    });

    it('should save profile when form is valid', () => {
      // Make form valid
      component.profileForm.patchValue({
        firstName: 'John',
        lastName: 'Doe',
        phone: '123-456-7890',
        address: '123 Main St',
        city: 'New York',
        country: 'USA',
        postalCode: '10001'
      });

      expect(component.profileForm.valid).toBe(true);

      component.onSave();

      expect(component.isLoading).toBe(true);
      expect(mockUserStatusService.completeUserProfile).toHaveBeenCalledWith({
        firstName: 'John',
        lastName: 'Doe',
        phone: '123-456-7890',
        address: '123 Main St',
        city: 'New York',
        country: 'USA',
        postalCode: '10001'
      });
    });

    it('should show success message and close dialog after save completes', () => {
      // Make form valid with minimal data
      component.profileForm.patchValue({
        firstName: 'John',
        lastName: 'Doe'
      });

      component.onSave();

      // Fast-forward time to complete the setTimeout
      jasmine.clock().tick(2000);

      expect(component.isLoading).toBe(false);
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Profile completed successfully!',
        'Close',
        {
          duration: 3000,
          panelClass: ['success-snackbar']
        }
      );
      expect(mockDialogRef.close).toHaveBeenCalledWith(true);
    });

    it('should handle profile data with only required fields', () => {
      component.profileForm.patchValue({
        firstName: 'Jane',
        lastName: 'Smith'
      });

      component.onSave();

      expect(mockUserStatusService.completeUserProfile).toHaveBeenCalledWith({
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '',
        address: '',
        city: '',
        country: '',
        postalCode: ''
      });
    });

    it('should handle profile data with all fields filled', () => {
      const completeProfileData: CompleteProfileDto = {
        firstName: 'Alice',
        lastName: 'Johnson',
        phone: '+1-555-0123',
        address: '456 Oak Avenue',
        city: 'Los Angeles',
        country: 'United States',
        postalCode: '90210'
      };

      component.profileForm.patchValue(completeProfileData);

      component.onSave();

      expect(mockUserStatusService.completeUserProfile).toHaveBeenCalledWith(completeProfileData);
    });

    it('should set loading state during save operation', () => {
      component.profileForm.patchValue({
        firstName: 'Test',
        lastName: 'User'
      });

      expect(component.isLoading).toBe(false);

      component.onSave();

      expect(component.isLoading).toBe(true);

      jasmine.clock().tick(2000);

      expect(component.isLoading).toBe(false);
    });
  });

  describe('form validation integration', () => {
    it('should be invalid when firstName is empty', () => {
      component.profileForm.patchValue({
        firstName: '',
        lastName: 'Doe'
      });

      expect(component.profileForm.valid).toBe(false);
      expect(component.profileForm.get('firstName')?.hasError('required')).toBe(true);
    });

    it('should be invalid when lastName is empty', () => {
      component.profileForm.patchValue({
        firstName: 'John',
        lastName: ''
      });

      expect(component.profileForm.valid).toBe(false);
      expect(component.profileForm.get('lastName')?.hasError('required')).toBe(true);
    });

    it('should be valid when only required fields are filled', () => {
      component.profileForm.patchValue({
        firstName: 'John',
        lastName: 'Doe'
      });

      expect(component.profileForm.valid).toBe(true);
    });

    it('should be valid when all fields are filled', () => {
      component.profileForm.patchValue({
        firstName: 'John',
        lastName: 'Doe',
        phone: '123-456-7890',
        address: '123 Main St',
        city: 'New York',
        country: 'USA',
        postalCode: '10001'
      });

      expect(component.profileForm.valid).toBe(true);
    });
  });

  describe('component integration', () => {
    it('should initialize with correct default values', () => {
      expect(component.isLoading).toBe(false);
      expect(component.profileForm).toBeDefined();
    });

    it('should have FormBuilder injected correctly', () => {
      expect(component['fb']).toBeDefined();
      expect(component['fb']).toBe(formBuilder);
    });

    it('should have all dependencies injected correctly', () => {
      expect(component['dialogRef']).toBeDefined();
      expect(component['userStatusService']).toBeDefined();
      expect(component['snackBar']).toBeDefined();
    });
  });

  describe('form state management', () => {
    it('should reset form state when needed', () => {
      component.profileForm.patchValue({
        firstName: 'John',
        lastName: 'Doe'
      });

      expect(component.profileForm.get('firstName')?.value).toBe('John');

      component.profileForm.reset();

      expect(component.profileForm.get('firstName')?.value).toBeNull();
    });

    it('should handle form control errors correctly', () => {
      const firstNameControl = component.profileForm.get('firstName');

      firstNameControl?.markAsTouched();
      expect(firstNameControl?.hasError('required')).toBe(true);

      firstNameControl?.setValue('John');
      expect(firstNameControl?.hasError('required')).toBe(false);
    });
  });
});