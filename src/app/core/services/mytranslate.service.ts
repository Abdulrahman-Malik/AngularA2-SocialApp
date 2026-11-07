
import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

type AppLanguage = 'ar' | 'en';

@Injectable({
  providedIn: 'root',
})
export class MytranslateService {
  private translate = inject(TranslateService);

  private readonly STORAGE_KEY = 'lang';
  private readonly DEFAULT_LANGUAGE: AppLanguage = 'en';

  constructor() {
    this.initLanguage();
  }

  // Initialize application language
  initLanguage(): void {
    const savedLanguage = localStorage.getItem(
      this.STORAGE_KEY
    ) as AppLanguage | null;

    const language: AppLanguage =
      savedLanguage === 'ar' || savedLanguage === 'en'
        ? savedLanguage
        : this.DEFAULT_LANGUAGE;

    this.setLanguage(language);
  }

  // Change application language
  changeLanguage(language: AppLanguage): void {
    this.setLanguage(language);
  }

  // Apply language and direction
  private setLanguage(language: AppLanguage): void {
    localStorage.setItem(this.STORAGE_KEY, language);

    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';

    this.translate.use(language);
  }

  // Get current language
  getCurrentLanguage(): AppLanguage {
    return (localStorage.getItem(this.STORAGE_KEY) as AppLanguage) ||
      this.DEFAULT_LANGUAGE;
  }

  // Check current direction
  isRTL(): boolean {
    return this.getCurrentLanguage() === 'ar';
  }

  // Toggle between Arabic and English
  toggleLanguage(): void {
    const newLanguage: AppLanguage =
      this.getCurrentLanguage() === 'ar' ? 'en' : 'ar';

    this.changeLanguage(newLanguage);
  }
}
