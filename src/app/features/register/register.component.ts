import { Component, inject } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/services/auth.service';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
showPassword = false;
showRePassword = false;
  msgErr: string = '';
  registerForm = new FormGroup(
    {
      name: new FormControl('', [Validators.required, Validators.minLength(3)]),
      username: new FormControl(''),
      email: new FormControl('', [Validators.required, Validators.email]),
      dateOfBirth: new FormControl('', Validators.required),
      gender: new FormControl('', Validators.required),
      password: new FormControl('', [
        Validators.required,
        Validators.pattern(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*-]).{8,}$/),
      ]),
      rePassword: new FormControl('', Validators.required),
    },
              {validators:[this.confirmPasswrod],updateOn: 'submit'}
  );
  loading: boolean = false;
  registerSubscribe: Subscription = new Subscription();
confirmPasswrod(group:AbstractControl){
  const password = group.get('password')?.value
  const rePassword =group.get('rePassword')?.value
  if(rePassword !==password && rePassword !== ""){
    group.get(rePassword)?.setErrors({mismatch:true})
    return {mismatch : true}


  }else{
    return null
  }
}



  submitForm(): void {
    if (this.registerForm.valid) {
      this.loading = true;
      this.registerSubscribe.unsubscribe();
      console.log(this.registerForm.value);
      this.registerSubscribe = this.authService.signUp(this.registerForm.value).subscribe({
        next: (res) => {
          if (res.success) {
            console.log(res);
            this.router.navigate(['/login'])
          }
        },
        error: (err: HttpErrorResponse) => {
          this.msgErr = err.error.message;
          this.loading = false;
        },
        complete: () => {
          this.loading = false;
        },
      });
    } else {
      this.registerForm.markAllAsTouched();
    }
  }
}
