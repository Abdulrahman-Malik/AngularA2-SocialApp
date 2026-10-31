
import {
  Component,
  HostListener,
  OnInit,
  signal,
} from '@angular/core';

import { CommonModule } from '@angular/common';

import {
  RouterLink,
  RouterLinkActive,
} from '@angular/router';

/* =========================================================
   SIDE LEFT COMPONENT
   Responsive Sidebar — Route Posts
========================================================= */

@Component({
  selector: 'app-side-left',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
  ],
  templateUrl: './side-left.component.html',
  styleUrl: './side-left.component.css',
})
export class SideLeftComponent implements OnInit {

  /* =========================================================
     SECTION 1: SIDEBAR STATE
  ========================================================= */

  readonly isSidebarOpen = signal(false);

  /* =========================================================
     SECTION 2: PROFILE MENU
  ========================================================= */

  showProfileMenu = false;

  /* =========================================================
     SECTION 3: CURRENT USER DATA
  ========================================================= */

  readonly defaultAvatar = '/assets/default-profile.png';

  readonly currentUserName = signal('User');

  readonly currentUserUsername = signal('');

  readonly currentUserPhoto = signal(
    this.defaultAvatar,
  );

  /* =========================================================
     SECTION 4: LIFECYCLE
  ========================================================= */

  ngOnInit(): void {
    this.loadCurrentUser();
  }

  /* =========================================================
     SECTION 5: LOAD CURRENT USER
     قراءة بيانات المستخدم من localStorage
  ========================================================= */

  private loadCurrentUser(): void {

    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const storedUser = localStorage.getItem('user');

      if (!storedUser) {
        this.resetUserData();
        return;
      }

      const parsedUser: unknown = JSON.parse(storedUser);

      const root = this.asRecord(parsedUser);

      const data = this.asRecord(root['data']);

      const nestedUser = this.asRecord(
        root['user'] ?? data['user'] ?? data,
      );

      const user =
        Object.keys(nestedUser).length > 0
          ? nestedUser
          : root;

      // USER NAME
      const rawName =
        user['name'] ??
        user['fullName'] ??
        user['displayName'] ??
        user['username'] ??
        user['email'];

      this.currentUserName.set(
        typeof rawName === 'string' && rawName.trim()
          ? rawName.trim()
          : 'User',
      );

      // USERNAME
      const rawUsername =
        user['username'] ??
        user['userName'] ??
        '';

      this.currentUserUsername.set(
        typeof rawUsername === 'string' && rawUsername.trim()
          ? `@${rawUsername.trim().replace(/^@/, '')}`
          : '',
      );

      // PROFILE PHOTO
      const rawPhoto =
        user['photo'] ??
        user['profilePhoto'] ??
        user['avatar'] ??
        user['image'];

      const photo =
        typeof rawPhoto === 'string' && rawPhoto.trim()
          ? rawPhoto.trim()
          : this.defaultAvatar;

      this.currentUserPhoto.set(photo);

      console.log('Sidebar user updated:', {
        name: this.currentUserName(),
        username: this.currentUserUsername(),
        photo: this.currentUserPhoto(),
      });

    } catch (error) {
      console.error('Failed to load sidebar user:', error);
      this.resetUserData();
    }
  }

  /* =========================================================
     SECTION 6: RESET USER DATA
  ========================================================= */

  private resetUserData(): void {
    this.currentUserName.set('User');
    this.currentUserUsername.set('');
    this.currentUserPhoto.set(this.defaultAvatar);
  }

  /* =========================================================
     SECTION 7: SAFE OBJECT
  ========================================================= */

  private asRecord(
    value: unknown,
  ): Record<string, unknown> {
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      return value as Record<string, unknown>;
    }

    return {};
  }

  /* =========================================================
     SECTION 8: PROFILE IMAGE ERROR
  ========================================================= */

  onProfilePhotoError(event: Event): void {
    const image = event.currentTarget as HTMLImageElement;

    image.onerror = null;
    image.src = this.defaultAvatar;
  }

  /* =========================================================
     SECTION 9: LIVE PROFILE SYNC
     تحديث الاسم والصورة عند تعديل البروفايل
  ========================================================= */

  @HostListener('window:user-profile-updated')
  onUserProfileUpdated(): void {
    this.loadCurrentUser();
  }

  @HostListener('window:storage', ['$event'])
  onStorageChange(event: StorageEvent): void {
    if (event.key === 'user' || event.key === null) {
      this.loadCurrentUser();
    }
  }

  /* =========================================================
     SECTION 10: SIDEBAR ACTIONS
  ========================================================= */

  toggleSidebar(): void {
    this.isSidebarOpen.update(open => !open);
    this.showProfileMenu = false;
  }

  openSidebar(): void {
    this.isSidebarOpen.set(true);
  }

  closeSidebar(): void {
    this.isSidebarOpen.set(false);
    this.showProfileMenu = false;
  }

  /* =========================================================
     SECTION 11: PROFILE MENU ACTIONS
  ========================================================= */

  toggleProfileMenu(): void {
    this.showProfileMenu = !this.showProfileMenu;
  }

  closeProfileMenu(): void {
    this.showProfileMenu = false;
  }

  /* =========================================================
     SECTION 12: KEYBOARD
  ========================================================= */

  @HostListener('window:keydown.escape')
  onEscapeKey(): void {
    this.closeSidebar();
  }
}
