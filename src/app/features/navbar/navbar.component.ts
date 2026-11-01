import {
  AfterViewInit,
  Component,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';

import {
  RouterLink,
  RouterLinkActive,
} from '@angular/router';

import { initFlowbite } from 'flowbite';

import { AuthService } from '../../core/auth/services/auth.service';

import { NotificationService } from '../../features/notification/notification.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
  ],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
})
export class NavbarComponent
  implements OnInit, AfterViewInit, OnDestroy {

  /* =====================================================
     1. SERVICES
  ====================================================== */

  private readonly authService = inject(AuthService);

  private readonly notificationService =
    inject(NotificationService);

  /* =====================================================
     2. NOTIFICATIONS
  ====================================================== */

  // Reactive unread notifications count.
  readonly unreadNotificationsCount =
    this.notificationService.unreadCount;

  // Use these getters when needed in the HTML.
  get hasUnreadNotifications(): boolean {
    return this.unreadNotificationsCount() > 0;
  }

  get notificationBadgeText(): string {
    const count = this.unreadNotificationsCount();

    return count > 99 ? '99+' : String(count);
  }

  /* =====================================================
     3. THEME SETTINGS
  ====================================================== */

  isDarkMode = true;

  /* =====================================================
     4. MENU STATES
  ====================================================== */

  isProfileMenuOpen = false;

  isMobileMenuOpen = false;

  isSearchOpen = false;

  /* =====================================================
     5. USER INFORMATION
  ====================================================== */

  searchText = '';

  userName = 'My Account';

  profileImage = '/assets/default-profile.png';

  private readonly defaultAvatar =
    '/assets/default-profile.png';

  /* =====================================================
     6. LIFECYCLE
  ====================================================== */

  ngOnInit(): void {
    this.loadTheme();

    this.loadUser();

    // Get the current unread notifications count.
    this.notificationService.refreshUnreadCount();

    // Keep the navbar counter updated every 30 seconds.
    // NavbarComponent is the owner of notification polling.
    this.notificationService.startPolling(30000);
  }

  ngAfterViewInit(): void {
    // Initialize Flowbite after the view is rendered.
    try {
      initFlowbite();
    } catch (error) {
      console.error('Flowbite initialization error:', error);
    }
  }

  ngOnDestroy(): void {
    // Stop polling when navbar is destroyed.
    this.notificationService.stopPolling();
  }

  /* =====================================================
     7. LOGOUT
  ====================================================== */

  logOut(): void {
    this.closeMenus();

    this.notificationService.stopPolling();

    this.authService.logOut();
  }

  /* =====================================================
     8. THEME MANAGEMENT
  ====================================================== */

  private loadTheme(): void {
    try {
      const savedTheme = localStorage.getItem('theme');

      this.isDarkMode = savedTheme
        ? savedTheme === 'dark'
        : true;

    } catch (error) {
      console.error('Unable to load theme:', error);

      this.isDarkMode = true;
    }

    this.applyTheme();
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;

    try {
      localStorage.setItem(
        'theme',
        this.isDarkMode ? 'dark' : 'light',
      );
    } catch (error) {
      console.error('Unable to save theme:', error);
    }

    this.applyTheme();
  }

  private applyTheme(): void {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.classList.toggle(
      'dark',
      this.isDarkMode,
    );
  }

  /* =====================================================
     9. LOAD USER INFORMATION
  ====================================================== */

  private loadUser(): void {
    let savedUser: string | null = null;

    try {
      savedUser = localStorage.getItem('user');
    } catch (error) {
      console.error('Unable to access user storage:', error);
    }

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
      console.error(
        'Unable to parse user information:',
        error,
      );

      this.setDefaultUser();
    }
  }

  private setDefaultUser(): void {
    this.userName = 'My Account';

    this.profileImage = this.defaultAvatar;
  }

  /* =====================================================
     10. PROFILE MENU
  ====================================================== */

  toggleProfileMenu(): void {
    this.isProfileMenuOpen = !this.isProfileMenuOpen;

    // Close other menus.
    this.isMobileMenuOpen = false;

    this.closeSearch();
  }

  /* =====================================================
     11. MOBILE MENU
  ====================================================== */

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;

    // Close the profile menu.
    this.isProfileMenuOpen = false;

    this.closeSearch();
  }

  /* =====================================================
     12. SEARCH
  ====================================================== */

  toggleSearch(): void {
    this.isSearchOpen = !this.isSearchOpen;

    // Close other menus.
    this.isProfileMenuOpen = false;

    this.isMobileMenuOpen = false;

    if (!this.isSearchOpen) {
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

  /* =====================================================
     13. CLOSE MENUS
  ====================================================== */

  closeMenus(): void {
    this.isProfileMenuOpen = false;

    this.isMobileMenuOpen = false;

    this.closeSearch();
  }

  /* =====================================================
     14. NOTIFICATION COUNTER HELPERS
  ====================================================== */

  refreshNotificationCount(): void {
    this.notificationService.refreshUnreadCount();
  }

  /* =====================================================
     15. PROFILE IMAGE FALLBACK
  ====================================================== */

  onImageError(event: Event): void {
    const image = event.currentTarget as HTMLImageElement;

    if (!image) {
      return;
    }

    image.onerror = null;

    image.src = this.defaultAvatar;
  }

  /* =====================================================
     16. SAFE DATA HELPERS
  ====================================================== */

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
