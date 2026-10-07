import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { FormErrorHandlerService } from '../../../core/services/error/form-error-handler.service';
import { ToastNotificationComponent } from '../../../shared/components/toast-notification/toast-notification.component';
import { Market, CreateMarketRequest, UpdateMarketRequest, MyMarket } from '../../../shared/models/market-place/market-model';
import { MarketFactoryService } from '../services/market-factory.service';

@Component({
  selector: 'app-create-market',
  standalone: true,
  imports: [CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslateModule],
  templateUrl: './create-market.component.html',
  styleUrl: './create-market.component.css'
})
export class CreateMarketComponent implements OnInit {
  marketForm!: FormGroup;
  isSubmitting = false;
  isEditMode = false;
  formSubmitted = false;
  marketId: string | null = null;
  currentMarket: Market | null = null;

  constructor(
    private fb: FormBuilder,
    private marketFactoryService: MarketFactoryService,
    private router: Router,
    private route: ActivatedRoute,
    private formErrorHandler: FormErrorHandlerService
  ) { }

  ngOnInit(): void {
    this.marketId = this.route.snapshot.paramMap.get('id');
    this.isEditMode = !!this.marketId;

    this.initializeForm();

    if (this.isEditMode && this.marketId) {
      // Try to get market data from navigation state first
      const navigationState = this.router.getCurrentNavigation()?.extras?.state ||
        (history.state && history.state.marketData ? history.state : null);

      if (navigationState?.marketData) {
        this.loadMarketDataFromState(navigationState.marketData);
      } else {
        this.loadMarketData(this.marketId);
      }
    }
  }

  private initializeForm(): void {
    this.marketForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      description: ['', [Validators.required, Validators.minLength(10)]],
      ownerEmail: [{ value: '', disabled: this.isEditMode }, [Validators.required, Validators.email]],
      ownerFirstName: ['', [Validators.required, Validators.minLength(2)]],
      ownerLastName: ['', [Validators.required, Validators.minLength(2)]],
      // dsoAddress: ['Default DSO Address'], // Hidden field with default value
      region: ['', [Validators.required, Validators.minLength(3)]]
    });
  }

  private loadMarketDataFromState(marketData: MyMarket): void {
    this.marketForm.patchValue({
      name: marketData.name,
      description: marketData.description,
      ownerEmail: marketData.marketOwner?.email,
      ownerFirstName: marketData.marketOwner?.firstName || '',
      ownerLastName: marketData.marketOwner?.lastName || '',
      region: marketData.region
    });

    // Convert MyMarket to Market format for consistency
    this.currentMarket = {
      _id: marketData.id,
      name: marketData.name,
      description: marketData.description,
      region: marketData.region,
      dsoAddress: '', // This field might not be available in MyMarket
      ownerEmail: marketData.marketOwner?.email || '',
      marketOwner: {
        email: marketData.marketOwner?.email || '',
        // Map other fields as needed
      },
      state: marketData.state,
      createdAt: new Date(marketData.createdAt)
    };
  }

  private loadMarketData(marketId: string): void {
    // Fallback: try to load from API if navigation state is not available
    this.marketFactoryService.getMarketById(marketId).subscribe({
      next: (market) => {
        this.currentMarket = market;
        this.marketForm.patchValue({
          name: market.name,
          description: market.description,
          ownerEmail: market.marketOwner?.email,
          ownerFirstName: market.marketOwner?.name?.split(' ')[0] || '',
          ownerLastName: market.marketOwner?.name?.split(' ')[1] || '',
          region: market.region
        });
      },
      error: (error: HttpErrorResponse) => {
        // Navigate back to home since API call failed
        this.router.navigate(['/home']);
      }
    });
  }

  saveMarket(): void {
    if (this.marketForm.valid && !this.isSubmitting) {
      this.submitForm();
    }
  }

  private submitForm(): void {
    this.isSubmitting = true;
    const formValue = this.marketForm.value;

    const operation = this.isEditMode && this.marketId
      ? this.marketFactoryService.updateMarket(this.marketId, {
        name: formValue.name,
        description: formValue.description,
        region: formValue.region
      } as UpdateMarketRequest)
      : this.marketFactoryService.createMarketWithOwner({
        ...formValue,
        // dsoAddress: 'Default DSO Address' // Valor por defecto como estaba antes
      } as CreateMarketRequest);

    operation.subscribe({
      next: (market) => {
        this.isSubmitting = false;
        ToastNotificationComponent.show(
          `Market "${market.name}" ${this.isEditMode ? 'updated' : 'created'} successfully!`,
          'success'
        );
        this.router.navigate(['/markets-management']); // Navigate to /markets-management after market creation/update
      },
      error: (error: HttpErrorResponse) => {
        this.isSubmitting = false;

        // Handle validation errors from RFC7807 response
        if (error.error && error.error.errors) {
          this.formErrorHandler.applyValidationErrorsToForm(this.marketForm, error.error.errors);
          ToastNotificationComponent.show(
            `Please fix the validation errors before ${this.isEditMode ? 'updating' : 'creating'} the market`,
            'error'
          );
        } else {
          ToastNotificationComponent.show(
            `Failed to ${this.isEditMode ? 'update' : 'create'} market: ${error.error?.detail || error.message}`,
            'error'
          );
        }
      }
    });
  }

  onSubmit(): void {
    this.formSubmitted = true;
    if (this.marketForm.valid) {
      this.saveMarket();
    } else {
      this.markFormGroupTouched();
      ToastNotificationComponent.show(
        'Please fill in all required fields correctly',
        'error'
      );
    }
  }

  private markFormGroupTouched(): void {
    Object.keys(this.marketForm.controls).forEach(key => {
      const control = this.marketForm.get(key);
      control?.markAsTouched();
    });
  }

  goBack(): void {
    this.router.navigate(['/markets-management']);
  }
}
