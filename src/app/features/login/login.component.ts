import { Component, inject, OnDestroy } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, RouterLinkActive],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  msgErr = '';
  loading = false;

  private loginSubscription?: Subscription;

  loginForm = new FormGroup({
    email: new FormControl('', {
      validators: [Validators.required, Validators.email],
    }),

    password: new FormControl('', [Validators.required]),
  });

  
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
    .subscribe({
      next: (res) => {
        if (res.success) {
          localStorage.setItem('token', res.data.token);
          localStorage.setItem(
            'user',
            JSON.stringify(res.data.user)
          );

          void this.router.navigate(['/main/home']);
        } else {
          this.msgErr = 'Email or password is incorrect.';
        }

        this.loading = false;
      },

      error: (err: HttpErrorResponse) => {
        this.msgErr =
          err.error?.message ?? 'Unable to log in. Please try again.';

        this.loading = false;
      },
    });
}


  ngOnDestroy(): void {
    this.loginSubscription?.unsubscribe();
  }
}
