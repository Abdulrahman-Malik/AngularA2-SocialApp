import {
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { NotificationService } from './notification.service';

import {
  NotificationFilter,
  NotificationItem,
  NotificationType,
} from './notification.interface';

@Component({
  selector: 'app-notification',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification.component.html',
  styleUrl: './notification.component.css',
})
export class NotificationComponent implements OnInit, OnDestroy {

  /* =====================================================
     1. SERVICES
  ====================================================== */

  readonly notificationService = inject(NotificationService);

  private readonly router = inject(Router);

  /* =====================================================
     2. NOTIFICATION SIGNALS
  ====================================================== */

  readonly notifications = this.notificationService.items;

  readonly unreadCount = this.notificationService.unreadCount;

  readonly loading = this.notificationService.loading;

  readonly loadingMore = this.notificationService.loadingMore;

  readonly hasMore = this.notificationService.hasMore;

  readonly error = this.notificationService.error;

  readonly activeFilter = this.notificationService.filter;

  /* =====================================================
     3. COMPUTED STATISTICS
  ====================================================== */

  readonly readCount = computed(() =>
    this.notifications().filter(item => item.isRead).length
  );

  readonly loadedCount = computed(() =>
    this.notifications().length
  );

  /* =====================================================
     4. SOUND SETTINGS
  ====================================================== */

  readonly soundOn = signal(this.getInitialSoundState());

  private audioContext: AudioContext | null = null;

  /* =====================================================
     5. LIVE NOTIFICATIONS STATE
  ====================================================== */

  readonly justArrived = signal(false);

  readonly newCount = signal(0);

  private initialized = false;

  // Detect whether the initial API request has started.
  private hasObservedInitialLoading = false;

  // Prevent notifications from refresh/filter operations
  // from being treated as newly received.
  private suppressNextUpdate = false;

  private readonly knownIds = new Set<string>();

  private newestSeen = 0;

  private toastTimer?: ReturnType<typeof setTimeout>;

  /* =====================================================
     6. DETECT NEW NOTIFICATIONS
  ====================================================== */

  constructor() {
    effect(() => {

      const list = this.notifications();

      const busy = this.loading();

      const failed = this.error();

      // Wait for the API request.
      if (busy) {

        if (!this.initialized) {
          this.hasObservedInitialLoading = true;
        }

        return;
      }

      // Handle API errors.
      if (failed) {

        this.suppressNextUpdate = false;

        if (!this.initialized) {
          this.hasObservedInitialLoading = false;
        }

        return;
      }

      // First successful API response:
      // register existing notifications silently.
      if (!this.initialized) {

        // Avoid initializing before the first request begins.
        if (!this.hasObservedInitialLoading) {
          return;
        }

        this.registerExistingNotifications(list);

        this.initialized = true;

        this.hasObservedInitialLoading = false;

        return;
      }

      // Ignore updates caused by manual refresh or filters.
      if (this.suppressNextUpdate) {

        this.registerExistingNotifications(list);

        this.suppressNextUpdate = false;

        return;
      }

      // Find newly received unread notifications.
      const freshNotifications = list.filter(item => {

        const timestamp = this.getTimestamp(item);

        return (
          !!item.id &&
          !item.isRead &&
          !this.knownIds.has(item.id) &&
          timestamp >= this.newestSeen
        );
      });

      // Register IDs to prevent duplicate notifications.
      this.registerExistingNotifications(list);

      // Show toast and play sound only for new unread items.
      if (freshNotifications.length > 0) {
        this.onNewArrived(freshNotifications.length);
      }

    });
  }

  /* =====================================================
     7. LIFECYCLE
  ====================================================== */

  ngOnInit(): void {

    // Load notifications only.
    // Polling is managed by NavbarComponent.
    this.notificationService.load();

  }

  ngOnDestroy(): void {

    // NavbarComponent owns notification polling.

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = undefined;
    }

    // Release audio resources.
    if (this.audioContext) {

      void this.audioContext.close().catch(error => {
        console.warn('Unable to close audio context:', error);
      });

      this.audioContext = null;
    }

  }

  /* =====================================================
     8. REGISTER EXISTING NOTIFICATIONS
  ====================================================== */

  private registerExistingNotifications(
    list: NotificationItem[],
  ): void {

    for (const item of list) {

      if (item.id) {
        this.knownIds.add(item.id);
      }

    }

    this.newestSeen = Math.max(
      this.newestSeen,
      this.newestTime(list),
    );

  }

  /* =====================================================
     9. FILTER NOTIFICATIONS
  ====================================================== */

  setFilter(filter: NotificationFilter): void {

    if (this.activeFilter() === filter) {
      return;
    }

    this.suppressNextUpdate = true;

    this.notificationService.setFilter(filter);

  }

  /* =====================================================
     10. MARK ONE NOTIFICATION AS READ
  ====================================================== */

  markAsRead(notification: NotificationItem): void {

    if (
      !notification ||
      notification.isRead ||
      !notification.id
    ) {
      return;
    }

    this.notificationService.markRead(notification.id);

  }

  /* =====================================================
     11. MARK ALL AS READ
  ====================================================== */

  markAllAsRead(): void {

    if (this.unreadCount() === 0) {
      return;
    }

    this.notificationService.markAllRead();

  }

  /* =====================================================
     12. OPEN NOTIFICATION

     Like / Comment / Share / Mention:
     Open related post.

     Follow:
     Open actor profile.
  ====================================================== */

  openNotification(notification: NotificationItem): void {

    if (!notification?.id) {
      return;
    }

    // Mark as read before navigation.
    this.markAsRead(notification);

    const entityType =
      notification.entityType?.trim().toLowerCase();

    /* -------------------------
       POST NOTIFICATION
    ------------------------- */

    const isPostNotification =
      entityType === 'post' ||
      (
        ['like', 'comment', 'share', 'mention']
          .includes(notification.type) &&
        !!notification.entityId
      );

    if (isPostNotification) {

      if (
        !notification.entityId ||
        notification.unavailable
      ) {
        return;
      }

      const queryParams: Record<string, string> = {
        postId: notification.entityId,
      };

      // Pass comment ID if available.
      if (
        notification.type === 'comment' &&
        notification.commentId
      ) {
        queryParams['commentId'] = notification.commentId;
      }

      void this.router.navigate(
        ['/main/home'],
        {
          queryParams,
        },
      );

      return;
    }

    /* -------------------------
       FOLLOW / USER NOTIFICATION
    ------------------------- */

    if (
      notification.type === 'follow' ||
      entityType === 'user'
    ) {

      if (!notification.actorId) {
        return;
      }

      void this.router.navigate(
        ['/main/profile'],
        {
          queryParams: {
            userId: notification.actorId,
          },
        },
      );

      return;
    }

    // No supported destination found.
  }

  /* =====================================================
     13. LOAD MORE
  ====================================================== */

  loadMore(): void {

    if (
      this.loadingMore() ||
      this.loading() ||
      !this.hasMore()
    ) {
      return;
    }

    this.notificationService.loadMore();

  }

  /* =====================================================
     14. REFRESH
  ====================================================== */

  refresh(): void {

    if (this.loading()) {
      return;
    }

    this.suppressNextUpdate = true;

    this.notificationService.load();

  }

  /* =====================================================
     15. SOUND PREFERENCE
  ====================================================== */

  private getInitialSoundState(): boolean {

    try {

      if (typeof localStorage === 'undefined') {
        return false;
      }

      return localStorage.getItem('notification-sound') === 'true';

    } catch {

      return false;

    }

  }

  toggleSound(): void {

    const enabled = !this.soundOn();

    this.soundOn.set(enabled);

    try {

      localStorage.setItem(
        'notification-sound',
        String(enabled),
      );

    } catch (error) {

      console.error(
        'Unable to save sound preference:',
        error,
      );

    }

    // Resume audio after explicit user interaction.
    if (enabled) {

      const context = this.getAudioContext();

      if (context?.state === 'suspended') {

        void context.resume().catch(error => {
          console.warn('Unable to resume audio:', error);
        });

      }

    }

  }

  /* =====================================================
     16. AUDIO CONTEXT
  ====================================================== */

  private getAudioContext(): AudioContext | null {

    if (
      typeof window === 'undefined' ||
      !window.AudioContext
    ) {
      return null;
    }

    if (
      !this.audioContext ||
      this.audioContext.state === 'closed'
    ) {

      this.audioContext = new window.AudioContext();

    }

    return this.audioContext;

  }

  /* =====================================================
     17. PLAY NOTIFICATION SOUND
  ====================================================== */

  private playSound(): void {

    if (!this.soundOn()) {
      return;
    }

    const context = this.getAudioContext();

    if (!context) {
      return;
    }

    if (context.state === 'suspended') {

      void context.resume()
        .then(() => this.playTone(context))
        .catch(error => {
          console.warn(
            'Notification audio unavailable:',
            error,
          );
        });

      return;
    }

    this.playTone(context);

  }

  /* =====================================================
     18. PLAY SOUND TONE
  ====================================================== */

  private playTone(context: AudioContext): void {

    try {

      if (context.state !== 'running') {
        return;
      }

      const oscillator = context.createOscillator();

      const gain = context.createGain();

      const now = context.currentTime;

      oscillator.type = 'sine';

      oscillator.frequency.setValueAtTime(
        880,
        now,
      );

      oscillator.frequency.setValueAtTime(
        1174.66,
        now + 0.12,
      );

      gain.gain.setValueAtTime(
        0.0001,
        now,
      );

      gain.gain.exponentialRampToValueAtTime(
        0.12,
        now + 0.025,
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + 0.28,
      );

      oscillator.connect(gain);

      gain.connect(context.destination);

      oscillator.start(now);

      oscillator.stop(now + 0.3);

      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };

    } catch (error) {

      console.error(
        'Notification sound error:',
        error,
      );

    }

  }

  /* =====================================================
     19. NEW NOTIFICATIONS TOAST
  ====================================================== */

  showNew(): void {

    this.justArrived.set(false);

    this.newCount.set(0);

    if (typeof window !== 'undefined') {

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });

    }

  }

  private onNewArrived(count: number): void {

    this.playSound();

    this.newCount.update(current => current + count);

    this.justArrived.set(true);

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toastTimer = setTimeout(() => {

      this.justArrived.set(false);

      this.toastTimer = undefined;

    }, 5000);

  }

  /* =====================================================
     20. NEW / EARLIER GROUPING
  ====================================================== */

  isRecent(notification: NotificationItem): boolean {

    const elapsed =
      Date.now() - this.getTimestamp(notification);

    return (
      elapsed >= 0 &&
      elapsed < 24 * 60 * 60 * 1000
    );

  }

  isSectionStart(index: number): boolean {

    const list = this.notifications();

    if (index === 0) {
      return true;
    }

    const current = list[index];

    const previous = list[index - 1];

    if (!current || !previous) {
      return false;
    }

    return (
      this.isRecent(current) !==
      this.isRecent(previous)
    );

  }

  /* =====================================================
     21. NOTIFICATION ICONS
  ====================================================== */

  getNotificationIcon(type: NotificationType): string {

    const icons: Record<NotificationType, string> = {

      like: 'fa-solid fa-heart',

      comment: 'fa-solid fa-comment',

      follow: 'fa-solid fa-user-plus',

      mention: 'fa-solid fa-at',

      share: 'fa-solid fa-share',

    };

    return icons[type] ?? 'fa-solid fa-bell';

  }

  /* =====================================================
     22. NOTIFICATION COLORS
  ====================================================== */

  getNotificationColor(type: NotificationType): string {

    const colors: Record<NotificationType, string> = {

      like: 'notification-like',

      comment: 'notification-comment',

      follow: 'notification-follow',

      mention: 'notification-mention',

      share: 'notification-share',

    };

    return colors[type] ?? 'notification-mention';

  }

  /* =====================================================
     23. IMAGE FALLBACK
  ====================================================== */

  onAvatarError(event: Event): void {

    const image = event.currentTarget as HTMLImageElement;

    if (!image) {
      return;
    }

    image.onerror = null;

    image.src = '/assets/default-profile.png';

  }

  /* =====================================================
     24. RELATIVE TIME
  ====================================================== */

  getRelativeTime(
    value: Date | string | number,
  ): string {

    const date = new Date(value);

    const timestamp = date.getTime();

    if (!Number.isFinite(timestamp)) {
      return '';
    }

    const seconds = Math.round(
      (timestamp - Date.now()) / 1000,
    );

    if (Math.abs(seconds) < 10) {
      return 'Just now';
    }

    const formatter = new Intl.RelativeTimeFormat(
      'en',
      {
        numeric: 'auto',
      },
    );

    if (Math.abs(seconds) < 60) {
      return formatter.format(seconds, 'second');
    }

    const minutes = Math.round(seconds / 60);

    if (Math.abs(minutes) < 60) {
      return formatter.format(minutes, 'minute');
    }

    const hours = Math.round(minutes / 60);

    if (Math.abs(hours) < 24) {
      return formatter.format(hours, 'hour');
    }

    const days = Math.round(hours / 24);

    if (Math.abs(days) < 7) {
      return formatter.format(days, 'day');
    }

    const weeks = Math.round(days / 7);

    if (Math.abs(weeks) < 5) {
      return formatter.format(weeks, 'week');
    }

    const months = Math.round(days / 30);

    if (Math.abs(months) < 12) {
      return formatter.format(months, 'month');
    }

    return formatter.format(
      Math.round(days / 365),
      'year',
    );

  }

  /* =====================================================
     25. DATE HELPERS
  ====================================================== */

  private getTimestamp(
    notification: NotificationItem,
  ): number {

    const timestamp = new Date(
      notification.createdAt,
    ).getTime();

    return Number.isFinite(timestamp)
      ? timestamp
      : 0;

  }

  private newestTime(
    list: NotificationItem[],
  ): number {

    return list.reduce(
      (maximum, notification) =>
        Math.max(
          maximum,
          this.getTimestamp(notification),
        ),
      0,
    );

  }

}
