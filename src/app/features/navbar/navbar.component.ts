
import { Component, inject, OnInit } from '@angular/core';
import {
  RouterLink,
  RouterLinkActive,
} from '@angular/router';
import { initFlowbite } from 'flowbite';
import { AuthService } from '../../core/auth/services/auth.service';
@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
})
export class NavbarComponent implements OnInit {
  private readonly authService = inject(AuthService);

  isDarkMode = true;
  isProfileMenuOpen = false;
  isMobileMenuOpen = false;
  isSearchOpen = false;

  searchText = '';
  userName = 'My Account';
  profileImage = '/assets/default-profile.png';

  ngOnInit(): void {
    this.loadTheme();
    this.loadUser();
    initFlowbite();
  }

  logOut(): void {
    this.closeMenus();
    this.authService.logOut();
  }

  private loadTheme(): void {
    const savedTheme = localStorage.getItem('theme');

    this.isDarkMode = savedTheme
      ? savedTheme === 'dark'
      : true;

    this.applyTheme();
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;

    localStorage.setItem(
      'theme',
      this.isDarkMode ? 'dark' : 'light'
    );

    this.applyTheme();
  }

  private applyTheme(): void {
    document.documentElement.classList.toggle(
      'dark',
      this.isDarkMode
    );
  }

  private loadUser(): void {
    const savedUser = localStorage.getItem('user');

    if (!savedUser) {
      return;
    }

    try {
      const user = JSON.parse(savedUser);

      this.userName =
        user.name ||
        user.username ||
        [user.firstName, user.lastName]
          .filter(Boolean)
          .join(' ') ||
        user.email ||
        'My Account';

      this.profileImage =
        user.photo ||
        user.profilePhoto ||
        user.image ||
        '/assets/default-profile.png';
    } catch {
      this.userName = 'My Account';
      this.profileImage = '/assets/default-profile.png';
    }
  }

  toggleProfileMenu(): void {
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
    this.isMobileMenuOpen = false;
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
    this.isProfileMenuOpen = false;
  }

  toggleSearch(): void {
    this.isSearchOpen = !this.isSearchOpen;

    if (!this.isSearchOpen) {
      this.searchText = '';
    }
  }

  onSearchInput(event: Event): void {
    this.searchText = (
      event.target as HTMLInputElement
    ).value;
  }

  closeMenus(): void {
    this.isProfileMenuOpen = false;
    this.isMobileMenuOpen = false;
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    const fallback = '/assets/default-profile.png';

    if (!img.src.endsWith(fallback)) {
      img.src = fallback;
    }
  }
}
