import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { finalize, Subscription } from 'rxjs';

import { AuthService } from '../../core/auth/services/auth.service';

const passwordMatchValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  const newPassword = control.get('newPassword')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;

  if (!confirmPassword) return null;

  return newPassword === confirmPassword
    ? null
    : { passwordMismatch: true };
};

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
  ],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.css',
})
export class ChangePasswordComponent implements OnInit, OnDestroy {

  // Services
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Properties
  loading = false;
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;

  msgErr = '';
  msgSuccess = '';

  private changePasswordSubscription?: Subscription;

  // Form
  changePasswordForm!: FormGroup;

  // Lifecycle
  ngOnInit(): void {
    this.initializeForm();
  }

  ngOnDestroy(): void {
    this.changePasswordSubscription?.unsubscribe();
  }

  // Initialize Form
  private initializeForm(): void {
    this.changePasswordForm = new FormGroup(
      {
        currentPassword: new FormControl('', [
          Validators.required,
        ]),

        newPassword: new FormControl('', [
          Validators.required,
          Validators.minLength(8),
        ]),

        confirmPassword: new FormControl('', [
          Validators.required,
        ]),
      },
      {
        validators: [
          passwordMatchValidator,
          this.differentPasswordValidator(),
        ],
      }
    );
  }

  // New password must differ from current password
  private differentPasswordValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const current = control.get('currentPassword')?.value;
      const next = control.get('newPassword')?.value;

      if (!current || !next) return null;

      return current === next
        ? { samePassword: true }
        : null;
    };
  }

  // Submit Form
  submitForm(): void {
    if (this.changePasswordForm.invalid) {
      this.changePasswordForm.markAllAsTouched();
      return;
    }

    if (this.loading) return;

    this.msgErr = '';
    this.msgSuccess = '';
    this.loading = true;

    const { currentPassword, newPassword, confirmPassword } =
      this.changePasswordForm.getRawValue();

    this.changePasswordSubscription = this.authService
      .changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      })
      .pipe(
        finalize(() => {
          this.loading = false;
        })
      )
      .subscribe({
        next: (res: any) => {
          if (res.success) {
            this.msgSuccess =
              'CHANGE_PASSWORD.SUCCESS';

            // The API documentation says the token is rotated.
            if (res.data?.token) {
              localStorage.setItem('token', res.data.token);
            }

            this.changePasswordForm.reset();
          } else {
            this.msgErr =
              res.message || 'CHANGE_PASSWORD.ERROR';
          }
        },

        error: (err: HttpErrorResponse) => {
          this.msgErr =
            err.error?.message ||
            'CHANGE_PASSWORD.ERROR';
        },
      });
  }

  // Password visibility
  toggleCurrentPassword(): void {
    this.showCurrentPassword = !this.showCurrentPassword;
  }

  toggleNewPassword(): void {
    this.showNewPassword = !this.showNewPassword;
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }
}
