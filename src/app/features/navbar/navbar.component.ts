import {
  Component,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';

import { isPlatformBrowser } from '@angular/common';

import {
  RouterLink,
  RouterLinkActive,
} from '@angular/router';

import {
  TranslatePipe,
  TranslateService,
} from '@ngx-translate/core';

import { take } from 'rxjs';

import { AuthService } from '../../core/auth/services/auth.service';
import { NotificationService } from '../../features/notification/notification.service';

type AppLanguage = 'ar' | 'en';

/** Breakpoints (px) must match navbar.component.css */
const TABLET_MIN_WIDTH = 768;
const LAPTOP_MIN_WIDTH = 992;

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    TranslatePipe,
  ],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
})
export class NavbarComponent implements OnInit, OnDestroy {

  // =====================================================
  // 1. SERVICES & PLATFORM
  // =====================================================

  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);
  private readonly translate = inject(TranslateService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly isBrowser = isPlatformBrowser(
    inject(PLATFORM_ID)
  );

  // =====================================================
  // 2. LANGUAGE
  // =====================================================

  currentLang: AppLanguage = 'en';

  private loadLanguage(): void {
    const savedLang = this.getStorageItem('lang');

    this.currentLang = savedLang === 'ar' ? 'ar' : 'en';

    this.translate
      .use(this.currentLang)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.applyLanguageDirection(this.currentLang);
        },
        error: (error) => {
          console.error('Language initialization error:', error);
        },
      });
  }

  toggleLanguage(): void {
    const newLang: AppLanguage =
      this.currentLang === 'ar' ? 'en' : 'ar';

    this.translate
      .use(newLang)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.currentLang = newLang;

          this.setStorageItem('lang', newLang);
          this.applyLanguageDirection(newLang);
          this.closeMenus();
        },
        error: (error) => {
          console.error('Language change error:', error);
        },
      });
  }

  private applyLanguageDirection(lang: AppLanguage): void {
    if (!this.isBrowser) return;

    const direction = lang === 'ar' ? 'rtl' : 'ltr';

    document.documentElement.lang = lang;
    document.documentElement.dir = direction;
    document.body.dir = direction;
  }

  // =====================================================
  // 3. NOTIFICATIONS
  // =====================================================

  readonly unreadNotificationsCount =
    this.notificationService.unreadCount;

  get hasUnreadNotifications(): boolean {
    return this.unreadNotificationsCount() > 0;
  }

  get notificationBadgeText(): string {
    const count = this.unreadNotificationsCount();

    return count > 99 ? '99+' : String(count);
  }

  refreshNotificationCount(): void {
    this.notificationService.refreshUnreadCount();
  }

  // =====================================================
  // 4. THEME
  // =====================================================

  isDarkMode = true;

  private loadTheme(): void {
    const savedTheme = this.getStorageItem('theme');

    this.isDarkMode = savedTheme
      ? savedTheme === 'dark'
      : true;

    this.applyTheme();
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;

    this.setStorageItem(
      'theme',
      this.isDarkMode ? 'dark' : 'light'
    );

    this.applyTheme();
  }

  private applyTheme(): void {
    if (!this.isBrowser) return;

    document.documentElement.classList.toggle(
      'dark',
      this.isDarkMode
    );
  }

  // =====================================================
  // 5. MENU STATES
  // =====================================================

  isProfileMenuOpen = false;
  isMobileMenuOpen = false;
  isSearchOpen = false;

  // =====================================================
  // 6. USER INFORMATION
  // =====================================================

  searchText = '';

  userName = 'My Account';

  profileImage = '/assets/default-profile.png';

  private readonly defaultAvatar =
    '/assets/default-profile.png';

  // =====================================================
  // 7. LIFECYCLE
  // =====================================================

  ngOnInit(): void {
    this.loadLanguage();
    this.loadTheme();
    this.loadUser();

    if (this.isBrowser) {
      this.notificationService.refreshUnreadCount();
      this.notificationService.startPolling(30000);
    }
  }

  ngOnDestroy(): void {
    if (this.isBrowser) {
      cancelAnimationFrame(this.glowFrame);
      this.notificationService.stopPolling();
    }
  }

  // =====================================================
  // 8. LOGOUT
  // =====================================================

  logOut(): void {
    this.closeMenus();

    this.notificationService.stopPolling();
    this.authService.logOut();
  }

  // =====================================================
  // 9. LOAD USER
  // =====================================================

  private loadUser(): void {
    const savedUser = this.getStorageItem('user');

    if (!savedUser) {
      this.setDefaultUser();
      return;
    }

    try {
      const parsedUser: unknown = JSON.parse(savedUser);
      const user = this.asRecord(parsedUser);

      if (!Object.keys(user).length) {
        this.setDefaultUser();
        return;
      }

      const firstName = this.getString(user['firstName']);
      const lastName = this.getString(user['lastName']);

      const fullName = [firstName, lastName]
        .filter(Boolean)
        .join(' ');

      this.userName =
        this.getString(user['name']) ||
        this.getString(user['username']) ||
        fullName ||
        this.getString(user['email']) ||
        'My Account';

      this.profileImage =
        this.getString(user['photo']) ||
        this.getString(user['profilePhoto']) ||
        this.getString(user['image']) ||
        this.defaultAvatar;

    } catch (error) {
      console.error('Unable to parse user information:', error);
      this.setDefaultUser();
    }
  }

  private setDefaultUser(): void {
    this.userName = 'My Account';
    this.profileImage = this.defaultAvatar;
  }

  // =====================================================
  // 10. PROFILE MENU
  // =====================================================

  toggleProfileMenu(): void {
    this.isProfileMenuOpen = !this.isProfileMenuOpen;

    this.isMobileMenuOpen = false;
    this.closeSearch();
  }

  // =====================================================
  // 11. MOBILE MENU
  // =====================================================

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;

    this.isProfileMenuOpen = false;
    this.closeSearch();
  }

  // =====================================================
  // 12. SEARCH
  // =====================================================

  toggleSearch(): void {
    this.isSearchOpen = !this.isSearchOpen;

    this.isProfileMenuOpen = false;
    this.isMobileMenuOpen = false;

    if (this.isSearchOpen) {
      this.focusSearchInput();
    } else {
      this.searchText = '';
    }
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchText = input.value;
  }

  private closeSearch(): void {
    this.isSearchOpen = false;
    this.searchText = '';
  }

  /** `autofocus` is unreliable with @if, so focus after the panel renders. */
  private focusSearchInput(): void {
    if (!this.isBrowser) return;

    setTimeout(() => {
      this.host.nativeElement
        .querySelector<HTMLInputElement>('#mobile-search-panel input')
        ?.focus();
    });
  }

  // =====================================================
  // 13. CLOSE MENUS
  // =====================================================

  closeMenus(): void {
    this.isProfileMenuOpen = false;
    this.isMobileMenuOpen = false;

    this.closeSearch();
  }

  // =====================================================
  // 14. KEYBOARD & RESIZE
  // =====================================================

  /** Escape closes any open panel and returns focus to the profile button. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (
      !this.isProfileMenuOpen &&
      !this.isMobileMenuOpen &&
      !this.isSearchOpen
    ) {
      return;
    }

    const wasProfileOpen = this.isProfileMenuOpen;

    this.closeMenus();

    if (wasProfileOpen && this.isBrowser) {
      setTimeout(() => {
        this.host.nativeElement
          .querySelector<HTMLButtonElement>('.profile-trigger')
          ?.focus();
      });
    }
  }

  /** Close panels that the current breakpoint no longer shows. */
  @HostListener('window:resize')
  onResize(): void {
    if (!this.isBrowser) return;

    const width = window.innerWidth;

    if (width >= TABLET_MIN_WIDTH) {
      this.isMobileMenuOpen = false;
    }

    if (width >= LAPTOP_MIN_WIDTH) {
      this.closeSearch();
    }
  }

  // =====================================================
  // 15. POINTER GLOW
  // =====================================================

  private glowFrame = 0;

  /** Feeds --mx / --my to the CSS so a soft light follows the cursor. */
  onPointerMove(event: PointerEvent): void {
    if (!this.isBrowser || event.pointerType === 'touch') return;

    const shell = event.currentTarget as HTMLElement | null;
    if (!shell) return;

    const { clientX, clientY } = event;

    cancelAnimationFrame(this.glowFrame);

    this.glowFrame = requestAnimationFrame(() => {
      const rect = shell.getBoundingClientRect();

      shell.style.setProperty('--mx', `${clientX - rect.left}px`);
      shell.style.setProperty('--my', `${clientY - rect.top}px`);
    });
  }

  onPointerLeave(event: PointerEvent): void {
    const shell = event.currentTarget as HTMLElement | null;
    if (!shell) return;

    cancelAnimationFrame(this.glowFrame);

    shell.style.removeProperty('--mx');
    shell.style.removeProperty('--my');
  }

  // =====================================================
  // 16. PROFILE IMAGE FALLBACK
  // =====================================================

  onImageError(event: Event): void {
    const image = event.currentTarget as HTMLImageElement;

    if (!image) return;

    image.onerror = null;
    image.src = this.defaultAvatar;
  }

  // =====================================================
  // 17. STORAGE HELPERS
  // =====================================================

  private getStorageItem(key: string): string | null {
    if (!this.isBrowser) return null;

    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error(`Unable to read ${key}:`, error);
      return null;
    }
  }

  private setStorageItem(key: string, value: string): void {
    if (!this.isBrowser) return;

    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error(`Unable to save ${key}:`, error);
    }
  }

  // =====================================================
  // 18. SAFE DATA HELPERS
  // =====================================================

  private asRecord(value: unknown): Record<string, unknown> {
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      return value as Record<string, unknown>;
    }

    return {};
  }

  private getString(value: unknown): string {
    return typeof value === 'string'
      ? value.trim()
      : '';
  }
}
