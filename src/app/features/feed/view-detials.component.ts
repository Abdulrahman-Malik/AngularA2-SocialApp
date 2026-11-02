import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, map, switchMap } from 'rxjs';

import { PostsService } from '../home/components/posts/components/posts.service';

// =====================================================
// FAST-LOAD CACHE (memory + sessionStorage)
// Lets the page paint instantly on revisit / refresh,
// then refresh the data silently in the background.
// =====================================================

const CACHE_PREFIX = 'route-posts:post:';
const memoryCache = new Map<string, any>();

function readCache(id: string): any | null {
  if (memoryCache.has(id)) return memoryCache.get(id);

  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + id);
    if (raw) {
      const post = JSON.parse(raw);
      memoryCache.set(id, post);
      return post;
    }
  } catch {
    /* storage unavailable or corrupted: ignore */
  }

  return null;
}

function writeCache(id: string, post: any): void {
  memoryCache.set(id, post);

  try {
    sessionStorage.setItem(CACHE_PREFIX + id, JSON.stringify(post));
  } catch {
    /* quota exceeded or storage disabled: memory cache is enough */
  }
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

@Component({
  selector: 'app-view-detials',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './view-detials.component.html',
  styleUrl: './view-detials.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewDetialsComponent {

  // =====================================================
  // INJECTIONS
  // =====================================================

  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly postsService = inject(PostsService);

  // =====================================================
  // STATE (signals)
  // =====================================================

  readonly postDetails = signal<any>(null);

  readonly isLoading = signal(true);
  readonly isRefreshing = signal(false);
  readonly errorMessage = signal('');
  readonly staleNotice = signal(false);
  readonly imageFailed = signal(false);

  private currentId = '';
  private readonly request$ = new Subject<string>();

  // =====================================================
  // DERIVED DATA
  // =====================================================

  readonly postAuthor = computed<any>(() => {
    const post = this.postDetails();
    return post?.user ?? post?.author ?? post?.createdBy ?? {};
  });

  readonly postBody = computed<string>(() => {
    const post = this.postDetails();
    return post?.body ?? post?.content ?? post?.description ?? '';
  });

  readonly postImage = computed<string | null>(() => {
    if (this.imageFailed()) return null;
    const post = this.postDetails();
    return post?.image ?? post?.media?.url ?? null;
  });

  readonly postId = computed<string>(() => {
    const post = this.postDetails();
    return String(post?._id ?? post?.id ?? 'N/A');
  });

  readonly postPrivacy = computed(() => {
    const post = this.postDetails();
    const value = String(post?.privacy ?? post?.visibility ?? 'public');

    switch (value) {
      case 'private':
        return { label: 'Only me', icon: 'fa-solid fa-lock' };
      case 'followers':
        return { label: 'Followers', icon: 'fa-solid fa-user-group' };
      default:
        return { label: 'Public', icon: 'fa-solid fa-earth-americas' };
    }
  });

  readonly postLikesCount = computed<number>(() => {
    const post = this.postDetails();
    return post?.likesCount ?? post?.likes?.length ?? 0;
  });

  readonly postCommentsCount = computed<number>(() => {
    const post = this.postDetails();
    return post?.commentsCount ?? post?.comments?.length ?? 0;
  });

  readonly postSharesCount = computed<number>(
    () => this.postDetails()?.sharesCount ?? 0,
  );

  readonly postComments = computed<any[]>(() => {
    const comments = this.postDetails()?.comments;
    return Array.isArray(comments) ? comments.slice(0, 5) : [];
  });

  readonly postDate = computed(() => {
    const value = this.postDetails()?.createdAt;
    if (!value) return { text: 'Date unavailable', iso: '' };

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { text: String(value), iso: '' };

    return { text: dateFormatter.format(date), iso: date.toISOString() };
  });

  // =====================================================
  // INITIALIZATION
  // =====================================================

  constructor() {
    // One request stream: a new id cancels the previous request.
    this.request$
      .pipe(
        switchMap((id) =>
          this.postsService.getSinglePosts(id).pipe(
            map((res: any) => ({ id, post: this.extractPost(res) })),
            catchError((err) => {
              this.handleError(err);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ id, post }) => this.handleSuccess(id, post));

    this.activatedRoute.paramMap
      .pipe(
        map((params) => params.get('id')),
        takeUntilDestroyed(),
      )
      .subscribe((id) => {
        if (!id) {
          this.postDetails.set(null);
          this.isLoading.set(false);
          this.errorMessage.set('Post ID was not found.');
          return;
        }

        this.load(id);
      });
  }

  // =====================================================
  // LOADING
  // =====================================================

  private load(id: string): void {
    this.currentId = id;

    this.errorMessage.set('');
    this.staleNotice.set(false);
    this.imageFailed.set(false);

    // Show something immediately if we already have it:
    // 1) post passed through router state from the feed
    // 2) cached copy from an earlier visit
    const seed = this.seedFor(id);

    if (seed) {
      this.postDetails.set(seed);
      this.isLoading.set(false);
      this.isRefreshing.set(true);
    } else {
      this.postDetails.set(null);
      this.isLoading.set(true);
      this.isRefreshing.set(false);
    }

    this.request$.next(id);
  }

  private seedFor(id: string): any | null {
    const fromState =
      typeof history !== 'undefined' ? history.state?.post : null;

    if (fromState && String(fromState._id ?? fromState.id) === id) {
      return fromState;
    }

    return readCache(id);
  }

  private extractPost(res: any): any | null {
    // Support common API response structures.
    const data = res?.data ?? res;

    const post =
      data?.post ??
      data?.singlePost ??
      data?.data?.post ??
      res?.post ??
      data;

    return post && typeof post === 'object' && !Array.isArray(post)
      ? post
      : null;
  }

  private handleSuccess(id: string, post: any | null): void {
    if (id !== this.currentId) return;

    if (post) {
      this.postDetails.set(post);
      writeCache(id, post);
    } else if (!this.postDetails()) {
      this.errorMessage.set('Post details are unavailable.');
    }

    this.isLoading.set(false);
    this.isRefreshing.set(false);
  }

  private handleError(err: any): void {
    console.error('Get Single Post Error:', err);

    this.isLoading.set(false);
    this.isRefreshing.set(false);

    if (this.postDetails()) {
      // We are already showing a saved copy: keep it, just tell the user.
      this.staleNotice.set(true);
      return;
    }

    this.errorMessage.set(
      err?.error?.message || 'Unable to load post details. Please try again.',
    );
  }

  // =====================================================
  // ACTIONS
  // =====================================================

  retryGetPost(): void {
    if (!this.currentId) {
      this.errorMessage.set('Post ID was not found.');
      return;
    }

    this.load(this.currentId);
  }

  onImageError(): void {
    this.imageFailed.set(true);
  }
}