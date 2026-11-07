
import {
  Component,
  HostListener,
  OnInit,
  OnDestroy,
  signal,
  inject,
} from '@angular/core';

import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';

import { RouterOutlet } from '@angular/router';
import { NgxSpinnerComponent } from 'ngx-spinner';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

// =========================================
// Types
// =========================================

type AppLanguage = 'ar' | 'en';

interface PwaInstallPromptEvent extends Event {
  prompt(): Promise<void>;

  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

// =========================================
// Component
// =========================================

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    NgxSpinnerComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {

  // =========================================
  // Services
  // =========================================

  private readonly translate = inject(TranslateService);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // =========================================
  // Application
  // =========================================

  protected readonly title = signal('AngularA2-SocialApp');

  private langSubscription?: Subscription;

  private readonly DEFAULT_LANGUAGE: AppLanguage = 'en';
  private readonly LANGUAGE_STORAGE_KEY = 'lang';

  // =========================================
  // Loading Spinner Template
  // =========================================

  readonly loadingTemplate = `
    <img
      src="/assets/loading-screen.svg"
      alt="Route Posts Loading"
      style="
        width: 160px;
        height: 160px;
        object-fit: contain;
        display: block;
      "
    />
  `;

  // =========================================
  // PWA Installation
  // =========================================

  installPrompt: PwaInstallPromptEvent | null = null;

  installBannerVisible = signal(true);
  installBannerFading = signal(false);
  installMessage = signal('');

  private fadeTimer?: ReturnType<typeof setTimeout>;
  private hideTimer?: ReturnType<typeof setTimeout>;
  private messageTimer?: ReturnType<typeof setTimeout>;

  // =========================================
  // Component Initialization
  // =========================================

  ngOnInit(): void {
    this.initializeLanguage();
    this.initializePWA();
  }

  // =========================================
  // Initialize Language
  // =========================================

  private initializeLanguage(): void {

    const savedLanguage = this.getSavedLanguage();

    this.applyLanguageDirection(savedLanguage);

    this.langSubscription = this.translate.onLangChange.subscribe(
      (event) => {

        const language = this.normalizeLanguage(event.lang);

        this.applyLanguageDirection(language);
        this.saveLanguage(language);

        console.log('Language changed:', language);
      }
    );

    // Avoid loading the same language twice
    if (this.translate.currentLang()=== savedLanguage) {
      return;
    }

    this.translate.use(savedLanguage).subscribe({

      next: () => {

        this.applyLanguageDirection(savedLanguage);

        console.log(
          'Translation loaded successfully:',
          savedLanguage
        );
      },

      error: (error) => {

        console.error('Translation loading error:', error);

        if (savedLanguage !== 'en') {

          this.translate.use('en').subscribe({

            next: () => {

              this.applyLanguageDirection('en');
              this.saveLanguage('en');

              console.log('English translation loaded successfully');
            },

            error: (fallbackError) => {

              console.error(
                'English translation loading error:',
                fallbackError
              );
            },
          });
        }
      },
    });
  }

  // =========================================
  // Get Saved Language
  // =========================================

  private getSavedLanguage(): AppLanguage {

    if (!this.isBrowser) {
      return this.DEFAULT_LANGUAGE;
    }

    const savedLanguage = localStorage.getItem(
      this.LANGUAGE_STORAGE_KEY
    );

    return this.normalizeLanguage(savedLanguage);
  }

  // =========================================
  // Normalize Language
  // =========================================

  private normalizeLanguage(
    language: string | null
  ): AppLanguage {

    return language === 'ar' ? 'ar' : 'en';
  }

  // =========================================
  // Save Language
  // =========================================

  private saveLanguage(language: AppLanguage): void {

    if (!this.isBrowser) {
      return;
    }

    localStorage.setItem(
      this.LANGUAGE_STORAGE_KEY,
      language
    );
  }

  // =========================================
  // Apply RTL / LTR
  // =========================================

  private applyLanguageDirection(
    language: AppLanguage
  ): void {

    if (!this.isBrowser) {
      return;
    }

    const isArabic = language === 'ar';
    const direction = isArabic ? 'rtl' : 'ltr';

    document.documentElement.lang = language;
    document.documentElement.dir = direction;

    document.documentElement.classList.toggle('rtl', isArabic);
    document.documentElement.classList.toggle('ltr', !isArabic);

    document.body.dir = direction;
  }

  // =========================================
  // PWA Initialization
  // =========================================

  private initializePWA(): void {

    if (!this.isBrowser) {
      return;
    }

    const isInstalled =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & {
        standalone?: boolean;
      }).standalone === true;

    if (isInstalled) {

      this.installBannerVisible.set(false);

      return;
    }

    // Start fading after 6.5 seconds
    this.fadeTimer = setTimeout(() => {

      this.installBannerFading.set(true);

    }, 6500);

    // Hide banner after 7.2 seconds
    this.hideTimer = setTimeout(() => {

      this.installBannerVisible.set(false);

    }, 7200);
  }

  // =========================================
  // PWA Install Event
  // =========================================

  @HostListener('window:beforeinstallprompt', ['$event'])
  onBeforeInstallPrompt(event: Event): void {

    event.preventDefault();

    this.installPrompt = event as PwaInstallPromptEvent;

    // Show install banner when browser allows installation
    this.installBannerVisible.set(true);
    this.installBannerFading.set(false);
  }

  // =========================================
  // App Installed Event
  // =========================================

  @HostListener('window:appinstalled')
  onAppInstalled(): void {

    this.installPrompt = null;

    this.dismissInstallBanner();

    this.showMessage('تم تثبيت Route Posts بنجاح.');
  }

  // =========================================
  // Install Application
  // =========================================

  async installApp(): Promise<void> {

    if (!this.installPrompt) {

      this.showMessage(
        'افتح قائمة المتصفح ⋮ وابحث عن Install app أو إضافة إلى الشاشة الرئيسية.'
      );

      return;
    }

    const promptEvent = this.installPrompt;

    try {

      await promptEvent.prompt();

      const choice = await promptEvent.userChoice;

      if (choice.outcome === 'accepted') {

        this.showMessage(
          'تمت الموافقة على تثبيت التطبيق.'
        );

      } else {

        this.showMessage(
          'يمكنك تثبيت التطبيق لاحقًا.'
        );
      }

    } catch (error) {

      console.error('PWA installation error:', error);

      this.showMessage(
        'تعذر بدء التثبيت الآن. جرّب من قائمة المتصفح.'
      );

    } finally {

      this.installPrompt = null;

      this.dismissInstallBanner();
    }
  }

  // =========================================
  // Dismiss Install Banner
  // =========================================

  dismissInstallBanner(): void {

    if (this.fadeTimer) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = undefined;
    }

    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = undefined;
    }

    this.installBannerFading.set(true);
    this.installBannerVisible.set(false);
  }

  // =========================================
  // Show Message
  // =========================================

  private showMessage(message: string): void {

    this.installMessage.set(message);

    if (this.messageTimer) {
      clearTimeout(this.messageTimer);
    }

    this.messageTimer = setTimeout(() => {

      this.installMessage.set('');

      this.messageTimer = undefined;

    }, 4500);
  }

  // =========================================
  // Component Cleanup
  // =========================================

  ngOnDestroy(): void {

    if (this.fadeTimer) {
      clearTimeout(this.fadeTimer);
    }

    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
    }

    if (this.messageTimer) {
      clearTimeout(this.messageTimer);
    }

    this.langSubscription?.unsubscribe();
  }
}
