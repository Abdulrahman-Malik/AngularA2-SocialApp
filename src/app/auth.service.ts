import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  signIn(value: Partial<{ email: string | null; password: string | null; }>) {
    throw new Error('Method not implemented.');
  }
}
