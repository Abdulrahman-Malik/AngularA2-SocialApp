import {
  HttpClient,
  HttpHeaders,
  HttpParams,
} from '@angular/common/http';

import {
  Injectable,
  inject,
  signal,
} from '@angular/core';

import {
  Observable,
  Subscription,
  map,
  timer,
} from 'rxjs';

import { environment } from '../../../environments/environment';

import {
  ApiResponse,
  NotificationFilter,
  NotificationItem,
  NotificationsListResponse,
  UnreadCountResponse,
  toNotificationItem,
} from './notification.interface';

/* =========================================================
   NOTIFICATION SERVICE
========================================================= */

@Injectable({
  providedIn: 'root',
})
export class NotificationService {

  /* =====================================================
     1. CONFIGURATION
  ====================================================== */

  private readonly http = inject(HttpClient);

  private readonly base =
    `${environment.baseUrl.replace(/\/+$/, '')}/notifications`;

  private readonly limit = 10;

  private page = 1;

  // Prevent outdated list requests from changing state.
  private reqId = 0;

  // Prevent outdated unread-count responses.
  private unreadReqId = 0;

  // Prevent outdated first-page refreshes.
  private headReqId = 0;

  private pollSub?: Subscription;

  /* =====================================================
     2. PRIVATE SIGNALS
  ====================================================== */

  private readonly _items = signal<NotificationItem[]>([]);

  private readonly _unreadCount = signal(0);

  private readonly _loading = signal(false);

  private readonly _loadingMore = signal(false);

  private readonly _hasMore = signal(false);

  private readonly _error = signal<string | null>(null);

  private readonly _filter = signal<NotificationFilter>('all');

  /* =====================================================
     3. PUBLIC SIGNALS
  ====================================================== */

  readonly items = this._items.asReadonly();

  readonly unreadCount = this._unreadCount.asReadonly();

  readonly loading = this._loading.asReadonly();

  readonly loadingMore = this._loadingMore.asReadonly();

  readonly hasMore = this._hasMore.asReadonly();

  readonly error = this._error.asReadonly();

  readonly filter = this._filter.asReadonly();

  /* =====================================================
     4. AUTHENTICATION HEADERS
  ====================================================== */

  private getHeaders(): HttpHeaders {
    let token: string | null = null;

    try {
      if (typeof localStorage !== 'undefined') {
        token = localStorage.getItem('token');
      }
    } catch (error) {
      console.error('Unable to access authentication token:', error);
    }

    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set(
        'Authorization',
        `Bearer ${token}`,
      );
    }

    return headers;
  }

  /* =====================================================
     5. LOAD NOTIFICATIONS
     GET /notifications
  ====================================================== */

  load(): void {
    const requestId = ++this.reqId;

    // Invalidate an older silent refresh.
    this.headReqId++;

    this.page = 1;

    this._loading.set(true);
    this._loadingMore.set(false);
    this._error.set(null);
    this._hasMore.set(false);

    this.fetch(1).subscribe({
      next: ({ items, hasMore }) => {
        if (requestId !== this.reqId) {
          return;
        }

        this._items.set(items);

        this._hasMore.set(hasMore);

        this._loading.set(false);

        this.refreshUnreadCount();
      },

      error: (error: unknown) => {
        if (requestId !== this.reqId) {
          return;
        }

        console.error(
          'Load notifications error:',
          error,
        );

        this._error.set('تعذّر تحميل الإشعارات');

        this._loading.set(false);

        this._loadingMore.set(false);
      },
    });

    // Update navbar counter independently.
    this.refreshUnreadCount();
  }

  /* =====================================================
     6. LOAD MORE NOTIFICATIONS
  ====================================================== */

  loadMore(): void {
    if (
      this._loading() ||
      this._loadingMore() ||
      !this._hasMore()
    ) {
      return;
    }

    const requestId = this.reqId;

    const nextPage = this.page + 1;

    this._loadingMore.set(true);

    this.fetch(nextPage).subscribe({
      next: ({ items, hasMore }) => {
        if (requestId !== this.reqId) {
          return;
        }

        this.page = nextPage;

        this._items.update((currentItems) => {
          const existingIds = new Set(
            currentItems.map(item => item.id),
          );

          const newItems = items.filter(
            item => !existingIds.has(item.id),
          );

          return [...currentItems, ...newItems];
        });

        this._hasMore.set(hasMore);

        this._loadingMore.set(false);
      },

      error: (error: unknown) => {
        if (requestId !== this.reqId) {
          return;
        }

        console.error(
          'Load more notifications error:',
          error,
        );

        this._loadingMore.set(false);

        this._error.set('تعذّر تحميل المزيد من الإشعارات');
      },
    });
  }

  /* =====================================================
     7. FILTER NOTIFICATIONS
  ====================================================== */

  setFilter(filter: NotificationFilter): void {
    if (this._filter() === filter) {
      return;
    }

    this._filter.set(filter);

    this.load();
  }

  /* =====================================================
     8. REFRESH UNREAD COUNT
     GET /notifications/unread-count
  ====================================================== */

  refreshUnreadCount(): void {
    const requestId = ++this.unreadReqId;

    this.http
      .get<ApiResponse<UnreadCountResponse>>(
        `${this.base}/unread-count`,
        {
          headers: this.getHeaders(),
        },
      )
      .subscribe({
        next: response => {
          if (requestId !== this.unreadReqId) {
            return;
          }

          const count = Number(
            response.data?.unreadCount ?? 0,
          );

          this._unreadCount.set(
            Number.isFinite(count)
              ? Math.max(0, count)
              : 0,
          );
        },

        error: (error: unknown) => {
          console.error(
            'Unread count error:',
            error,
          );
        },
      });
  }

  /* =====================================================
     9. AUTOMATIC POLLING
  ====================================================== */

  startPolling(milliseconds = 30000): void {
    // Avoid multiple polling subscriptions.
    this.stopPolling();

    const interval = Math.max(
      1000,
      milliseconds,
    );

    this.pollSub = timer(
      interval,
      interval,
    ).subscribe(() => {
      this.refreshHead();
    });
  }

  /* =====================================================
     10. REFRESH LATEST NOTIFICATIONS
     SILENT REFRESH
  ====================================================== */

  refreshHead(): void {
    if (this._loading()) {
      this.refreshUnreadCount();
      return;
    }

    const requestId = ++this.headReqId;

    const listRequestId = this.reqId;

    this.fetch(1).subscribe({
      next: ({ items, hasMore }) => {
        // Ignore obsolete responses.
        if (
          requestId !== this.headReqId ||
          listRequestId !== this.reqId
        ) {
          return;
        }

        this._items.update(currentItems => {
          const firstPageIds = new Set(
            items.map(item => item.id),
          );

          // Keep previously loaded older pages.
          const olderItems = currentItems.filter(
            item => !firstPageIds.has(item.id),
          );

          // Newest notifications always stay at the top.
          return [
            ...items,
            ...olderItems,
          ];
        });

        this._hasMore.set(hasMore);

        this.refreshUnreadCount();
      },

      error: (error: unknown) => {
        console.error(
          'Refresh notifications error:',
          error,
        );
      },
    });
  }

  /* =====================================================
     11. STOP POLLING
  ====================================================== */

  stopPolling(): void {
    this.pollSub?.unsubscribe();

    this.pollSub = undefined;
  }

  /* =====================================================
     12. MARK ONE NOTIFICATION AS READ
     PATCH /notifications/:id/read
  ====================================================== */

  markRead(id: string): void {
    if (!id) {
      return;
    }

    const previousItem = this._items().find(
      item => item.id === id,
    );

    if (!previousItem || previousItem.isRead) {
      return;
    }

    // Optimistic UI update.
    if (this._filter() === 'unread') {
      this._items.update(items =>
        items.filter(item => item.id !== id),
      );
    } else {
      this._items.update(items =>
        items.map(item =>
          item.id === id
            ? { ...item, isRead: true }
            : item,
        ),
      );
    }

    // Update navbar immediately.
    this._unreadCount.update(count =>
      Math.max(0, count - 1),
    );

    this.http
      .patch(
        `${this.base}/${encodeURIComponent(id)}/read`,
        {},
        {
          headers: this.getHeaders(),
        },
      )
      .subscribe({
        next: () => {
          this.refreshUnreadCount();

          // Refresh unread list if current filter is unread.
          if (this._filter() === 'unread') {
            this.load();
          }
        },

        error: (error: unknown) => {
          console.error(
            'Mark notification as read error:',
            error,
          );

          // Restore the affected notification only.
          this._items.update(items => {
            const exists = items.some(
              item => item.id === id,
            );

            if (exists) {
              return items.map(item =>
                item.id === id
                  ? previousItem
                  : item,
              );
            }

            if (this._filter() === 'unread') {
              return [
                ...items,
                previousItem,
              ].sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() -
                  new Date(a.createdAt).getTime(),
              );
            }

            return items;
          });

          this._unreadCount.update(count => count + 1);
        },
      });
  }

  /* =====================================================
     13. MARK ALL NOTIFICATIONS AS READ
     PATCH /notifications/read-all
  ====================================================== */

  markAllRead(): void {
    if (this._unreadCount() === 0) {
      return;
    }

    const previousItems = this._items();

    const previousCount = this._unreadCount();

    // Optimistic update.
    if (this._filter() === 'unread') {
      this._items.set([]);

      this._hasMore.set(false);

      this.page = 1;
    } else {
      this._items.update(items =>
        items.map(item => ({
          ...item,
          isRead: true,
        })),
      );
    }

    this._unreadCount.set(0);

    this.http
      .patch(
        `${this.base}/read-all`,
        {},
        {
          headers: this.getHeaders(),
        },
      )
      .subscribe({
        next: () => {
          this.refreshUnreadCount();

          if (this._filter() === 'unread') {
            this.load();
          }
        },

        error: (error: unknown) => {
          console.error(
            'Mark all notifications as read error:',
            error,
          );

          // Restore previous state.
          this._items.set(previousItems);

          this._unreadCount.set(previousCount);

          if (this._filter() === 'unread') {
            this._hasMore.set(true);
          }
        },
      });
  }

  /* =====================================================
     14. FETCH NOTIFICATIONS
     INTERNAL METHOD
  ====================================================== */

  private fetch(
  page: number,
): Observable<{
  items: NotificationItem[];
  hasMore: boolean;
}> {
  let params = new HttpParams()
    .set('page', page)
    .set('limit', this.limit);

  if (this._filter() === 'unread') {
    params = params.set('unread', 'true');
  }

  return this.http
    .get<ApiResponse<NotificationsListResponse>>(
      this.base,
      {
        params,
        headers: this.getHeaders(),
      },
    )
    .pipe(
      map(response => {
        const notifications =
          response.data?.notifications ?? [];

        const meta = response.data?.meta;
        const pagination = meta?.pagination;

        const currentPage =
          pagination?.currentPage ??
          meta?.currentPage ??
          page;

        const totalPages =
          pagination?.numberOfPages ??
          meta?.numberOfPages ??
          meta?.totalPages;

        let hasMore: boolean;

        if (pagination?.nextPage !== undefined) {
          hasMore = pagination.nextPage !== null;
        } else if (totalPages !== undefined) {
          hasMore = currentPage < totalPages;
        } else {
          hasMore = notifications.length === this.limit;
        }

        return {
          items: notifications.map(toNotificationItem),
          hasMore,
        };
      }),
    );
}
}
