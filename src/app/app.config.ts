import {
  ApplicationConfig,
  importProvidersFrom,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';

import {
  provideRouter,
  withHashLocation,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';

import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { provideServiceWorker } from '@angular/service-worker';
import { NgxSpinnerModule } from 'ngx-spinner';

import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { loadingInterceptor } from './core/interceptors/loading-interceptor';
import { authInterceptor } from './core/interceptors/auth-interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    // Global Error Handling
    provideBrowserGlobalErrorListeners(),

    // Router Configuration
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'top',
      }),
      withViewTransitions(),
      withHashLocation(),
    ),

    // HTTP Client + Interceptors
    provideHttpClient(withInterceptors([authInterceptor,loadingInterceptor])),

    // Service Worker
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),

    // Ngx Spinner
    importProvidersFrom(NgxSpinnerModule),

    // Translation Configuration
    provideTranslateService({
      loader: provideTranslateHttpLoader({
        prefix: '/assets/i18n/',
        suffix: '.json',
      }),
      fallbackLang: 'en',
      lang: 'en',
    }),
    provideAppInitializer(() => {
      const translate = inject(TranslateService);
      // `lang` and `fallbackLang` from provideTranslateService() are already applied;
      // call addLangs() to register additional languages the user can switch to.
      translate.addLangs(['ar', 'en']);
      translate.use(localStorage.getItem('lang') || 'en');
    }),
  ],
};
