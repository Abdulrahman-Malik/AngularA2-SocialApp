import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { finalize, Subscription } from 'rxjs';

import { AuthService } from '../../core/auth/services/auth.service';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    RouterLinkActive,TranslatePipe
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements OnInit, OnDestroy {
  // =====================================
  // 1. Inject Services
  // =====================================

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // =====================================
  // 2. Component Properties
  // =====================================

  msgErr = '';
  loading = false;

  loginForm!: FormGroup<{
    email: FormControl<string>;
    password: FormControl<string>;
  }>;

  private loginSubscription?: Subscription;

  // =====================================
  // 3. Lifecycle Hooks
  // =====================================

  ngOnInit(): void {
    this.initializeLoginForm();
  }

  ngOnDestroy(): void {
    this.loginSubscription?.unsubscribe();
  }

  // =====================================
  // 4. Initialize Form
  // =====================================

  private initializeLoginForm(): void {
    this.loginForm = new FormGroup({
      email: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.email,
        ],
      }),

      password: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
        ],
      }),
    });
  }

  // =====================================
  // 5. Submit Form
  // =====================================

  submitForm(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    if (this.loading) {
      return;
    }

    this.msgErr = '';
    this.loading = true;

    this.loginSubscription = this.authService
      .signIn(this.loginForm.getRawValue())
      .pipe(
        finalize(() => {
          this.loading = false;
        })
      )
      .subscribe({
        next: (res) => {
          if (res.success && res.data?.token) {
            this.handleLoginSuccess(res);
          } else {
            this.msgErr = 'Email or password is incorrect.';
          }
        },

        error: (err: HttpErrorResponse) => {
          this.handleLoginError(err);
        },
      });
  }

  // =====================================
  // 6. Handle Login Success
  // =====================================

  private handleLoginSuccess(res: any): void {
    localStorage.setItem('token', res.data.token);

    localStorage.setItem(
      'user',
      JSON.stringify(res.data.user ?? null)
    );

    void this.router.navigate(['/main/home']);
  }

  // =====================================
  // 7. Handle Login Error
  // =====================================

  private handleLoginError(err: HttpErrorResponse): void {
    this.msgErr =
      err.error?.message ??
      'Unable to log in. Please try again.';
  }
}