import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { NgxSpinnerService } from 'ngx-spinner';
import { finalize } from 'rxjs';

let activeRequests = 0;

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const spinner = inject(NgxSpinnerService);

  activeRequests++;

  if (activeRequests === 1) {
    spinner.show('httpLoader');
  }

  return next(req).pipe(
    finalize(() => {
      activeRequests = Math.max(0, activeRequests - 1);

      if (activeRequests === 0) {
        spinner.hide('httpLoader');
      }
    })
  );
};
