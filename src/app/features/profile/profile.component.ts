import {
  AfterViewInit,
  Component,
  ElementRef,
  HostBinding,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
  WritableSignal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, finalize } from 'rxjs';

import { PostsService } from '../home/components/posts/components/posts.service';
import { Post } from '../home/components/posts/models/post.interface';
import { ProfileService } from './components/profile.service';

type ProfileTab = 'posts' | 'photos' | 'about';

interface ProfilePostsResponse {
  data?: { posts?: Post[] };
}

interface Toast {
  message: string;
  type: 'success' | 'error';
}

interface PostComment {
  id: string;
  content: string;
  createdAt: string;
  authorName: string;
  authorPhoto: string;
}

type BusyImage = 'cover' | 'avatar' | 'post' | null;
type ThemeMode = 'dark' | 'light';

const THEME_KEY = 'profile-theme';

const MB = 1024 * 1024;
const MAX_INPUT_MB = 40; // raw upload ceiling; everything is optimized before use
const IMAGE_READ_ERROR = "We couldn't read that image. Try a JPG, PNG or WebP file.";
const LONG_POST_LENGTH = 280;
const USERNAME_PATTERN = /^[a-zA-Z0-9._]{3,30}$/;

/* =========================================================
   IMAGE OPTIMIZER (inlined helpers)
========================================================= */

/**
 * Client-side image optimizer.
 * - Accepts any browser-decodable image (JPG, PNG, WebP, GIF, BMP, AVIF, SVG, HEIC on Safari).
 * - Fixes EXIF rotation, optionally center-crops to an aspect ratio,
 *   downsizes (never upscales) and re-encodes to WebP (JPEG fallback).
 */
interface ProcessOptions {
  maxWidth: number;
  maxHeight: number;
  /** 0–1, default 0.84 */
  quality?: number;
  /** Center-crop to width/height (e.g. 1 for square, 3 for a wide cover). */
  aspect?: number;
}

const KEEP_GIF_UNDER = 8 * 1024 * 1024;

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
}

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall through to <img> decoding */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function processImage(file: File, options: ProcessOptions): Promise<File> {
  // Keep animated GIFs intact when they're reasonably small and not being cropped.
  if (file.type === 'image/gif' && !options.aspect && file.size <= KEEP_GIF_UNDER) {
    return file;
  }

  const image = await decode(file);

  try {
    let sx = 0, sy = 0, sw = image.width, sh = image.height;

    if (options.aspect) {
      if (sw / sh > options.aspect) {
        sw = sh * options.aspect;
        sx = (image.width - sw) / 2;
      } else {
        sh = sw / options.aspect;
        sy = (image.height - sh) / 2;
      }
    }

    const scale = Math.min(1, options.maxWidth / sw, options.maxHeight / sh);
    const width = Math.max(1, Math.round(sw * scale));
    const height = Math.max(1, Math.round(sh * scale));
    const resized = scale < 1 || !!options.aspect;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not supported');

    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image.source, sx, sy, sw, sh, 0, 0, width, height);

    const quality = options.quality ?? 0.84;
    let blob = await toBlob(canvas, 'image/webp', quality);

    // Some browsers silently return PNG when WebP isn't supported.
    if (!blob || blob.type !== 'image/webp') {
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      blob = await toBlob(canvas, 'image/jpeg', quality);
    }

    if (!blob) throw new Error('Could not encode image');

    // Don't make a file bigger when nothing was resized.
    if (!resized && blob.size >= file.size && file.type !== 'image/svg+xml') return file;

    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${base}.${ext}`, { type: blob.type, lastModified: Date.now() });
  } finally {
    image.close?.();
  }
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unreadable file'));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
})
export class ProfileComponent implements OnInit, AfterViewInit, OnDestroy {
  /* ---------- services ---------- */
  private readonly postsService = inject(PostsService);
  readonly profileService = inject(ProfileService);

  private postsSubscription?: Subscription;
  private postSubscription?: Subscription;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private objectUrls: string[] = [];

  @ViewChild('composerBox') private composerBox?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('headerEl') private headerEl?: ElementRef<HTMLElement>;
  @ViewChild('starCanvas') private starCanvas?: ElementRef<HTMLCanvasElement>;
  private stopStars?: () => void;
  private redrawStars?: () => void;

  /* ---------- static ---------- */
  readonly defaultCover =
    'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1600&auto=format&fit=crop';

  readonly tabs: { id: ProfileTab; label: string; icon: string }[] = [
    { id: 'posts', label: 'Timeline', icon: 'fa-solid fa-house' },
    { id: 'photos', label: 'Photos', icon: 'fa-regular fa-images' },
    { id: 'about', label: 'About', icon: 'fa-regular fa-id-card' },
  ];

  /* ---------- profile ---------- */
  readonly userName = this.profileService.name;
  readonly username = this.profileService.username;
  readonly profilePhoto = this.profileService.photo;
  readonly profileCover = this.profileService.cover;
  readonly bio = this.profileService.bio;

  readonly firstName = computed(() => (this.userName() || '').trim().split(/\s+/)[0] || 'there');

  /* ---------- theme ---------- */
  readonly theme = signal<ThemeMode>(this.readStoredTheme());

  @HostBinding('attr.data-theme')
  get themeAttr(): ThemeMode {
    return this.theme();
  }

  /* ---------- state ---------- */
  readonly allPosts = signal<Post[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly activeTab = signal<ProfileTab>('posts');
  readonly condensed = signal(false);
  readonly toast = signal<Toast | null>(null);
  readonly expandedPosts = signal<ReadonlySet<string | number>>(new Set());
  readonly isProcessingImage = signal<BusyImage>(null);

  /* engagement */
  readonly likedPosts = signal<ReadonlySet<string>>(new Set());
  readonly commentsOpen = signal<ReadonlySet<string>>(new Set());
  readonly commentsLoading = signal<ReadonlySet<string>>(new Set());
  readonly commentsSending = signal<ReadonlySet<string>>(new Set());
  readonly comments = signal<Record<string, PostComment[]>>({});
  readonly commentDrafts = signal<Record<string, string>>({});
  private readonly pendingLikes = new Set<string>();

  /* ---------- derived ---------- */
  readonly myPosts = computed(() => {
    const currentId = String(this.profileService.id() ?? '').trim();
    const currentUsername = this.normalizeUsername(this.profileService.username());

    return this.allPosts().filter((post) => {
      const record = post as unknown as Record<string, unknown>;
      const ownerValue = record['user'] ?? record['owner'] ?? record['author'] ?? record['createdBy'];
      const owner = this.asRecord(ownerValue);

      const ownerId = String(
        owner['_id'] ??
          owner['id'] ??
          owner['userId'] ??
          record['userId'] ??
          record['ownerId'] ??
          (typeof ownerValue === 'string' ? ownerValue : ''),
      ).trim();

      const ownerUsername = this.normalizeUsername(
        String(owner['username'] ?? owner['userName'] ?? ''),
      );

      const matchesId = !!currentId && !!ownerId && currentId === ownerId;
      const matchesUsername = !!currentUsername && !!ownerUsername && currentUsername === ownerUsername;
      return matchesId || matchesUsername;
    });
  });

  readonly photos = computed(() => this.myPosts().filter((p) => !!p.image));
  readonly sidebarPhotos = computed(() => this.photos().slice(0, 6));
  readonly postsCount = computed(() => this.myPosts().length);
  readonly photosCount = computed(() => this.photos().length);

  readonly likesCount = computed(() =>
    this.myPosts().reduce((total, post) => {
      const record = post as unknown as Record<string, unknown>;
      const value = record['likesCount'] ?? record['likes'] ?? 0;
      const n = Array.isArray(value) ? value.length : Number(value);
      return total + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0),
  );

  readonly completion = computed(() => {
    const items = [
      { label: 'Add a profile photo', done: !!this.profilePhoto() && !this.isDefaultAvatar(this.profilePhoto()) },
      { label: 'Add a cover photo', done: !!this.profileCover() },
      { label: 'Write a short bio', done: !!this.bio()?.trim() },
      { label: 'Publish your first post', done: this.postsCount() > 0 },
    ];
    const done = items.filter((i) => i.done).length;
    return { items, percent: Math.round((done / items.length) * 100) };
  });

  /* ---------- edit profile ---------- */
  readonly isEditOpen = signal(false);
  readonly editName = signal('');
  readonly editUsername = signal('');
  readonly editBio = signal('');
  readonly avatarPreview = signal<string | null>(null);
  readonly profileMessage = signal('');
  readonly isSavingProfile = signal(false);

  readonly usernameError = computed(() => {
    const value = this.normalizeUsername(this.editUsername());
    if (!value) return 'Username is required.';
    if (!USERNAME_PATTERN.test(value)) return 'Use 3–30 letters, numbers, dots or underscores.';
    return '';
  });

  readonly isDirty = computed(
    () =>
      this.editName().trim() !== (this.userName() ?? '') ||
      this.normalizeUsername(this.editUsername()) !== this.normalizeUsername(this.username()) ||
      this.editBio().trim() !== (this.bio() ?? '') ||
      !!this.avatarPreview(),
  );

  /* ---------- composer ---------- */
  readonly newPostContent = signal('');
  readonly selectedPostImage = signal<File | null>(null);
  readonly postImagePreview = signal<string | null>(null);
  readonly isPublishingPost = signal(false);
  readonly postPublishError = signal('');
  readonly isDragging = signal(false);

  readonly canPublish = computed(
    () =>
      !this.isPublishingPost() &&
      this.isProcessingImage() === null &&
      (!!this.newPostContent().trim() || !!this.selectedPostImage()),
  );

  /* ---------- lightbox ---------- */
  readonly lightboxIndex = signal<number | null>(null);
  readonly currentPhoto = computed(() => {
    const i = this.lightboxIndex();
    return i === null ? null : (this.photos()[i] ?? null);
  });

  constructor() {
    // Lock page scroll while a modal or the lightbox is open.
    effect(() => {
      const locked = this.isEditOpen() || this.lightboxIndex() !== null;
      document.body.style.overflow = locked ? 'hidden' : '';
    });
  }

  /* ---------- lifecycle ---------- */
  ngOnInit(): void {
    this.profileService.loadFromStorage();
    this.getMyPosts();
  }

  ngAfterViewInit(): void {
    this.stopStars = this.startStarfield();
  }

  ngOnDestroy(): void {
    this.stopStars?.();
    this.postsSubscription?.unsubscribe();
    this.postSubscription?.unsubscribe();
    clearTimeout(this.toastTimer);
    this.objectUrls.forEach((u) => URL.revokeObjectURL(u));
    document.body.style.overflow = '';
  }

  /* ---------- cosmos effects ---------- */

  /** Cursor-following glow on every glass card (CSS reads --mx / --my). */
  @HostListener('pointermove', ['$event'])
  onPointerMove(event: PointerEvent): void {
    const card = (event.target as HTMLElement | null)?.closest?.('.surface-card') as HTMLElement | null;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    card.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }

  /** Drifting constellation on the cover; reacts to the pointer, pauses off-screen. */
  private startStarfield(): (() => void) | undefined {
    const canvas = this.starCanvas?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pointer = { x: -999, y: -999 };
    let stars: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(18, Math.round((width * height) / 9000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.14,
        vy: (Math.random() - 0.5) * 0.14,
        r: Math.random() * 1.3 + 0.35,
      }));
    };

    const draw = () => {
      const light = this.theme() === 'light';
      ctx.clearRect(0, 0, width, height);

      for (const s of stars) {
        if (!reduceMotion) {
          s.x = (s.x + s.vx + width) % width;
          s.y = (s.y + s.vy + height) % height;
        }
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = light ? 'rgba(50, 70, 160, 0.65)' : 'rgba(225, 233, 255, 0.85)';
        ctx.fill();
      }

      ctx.lineWidth = 0.7;
      for (let i = 0; i < stars.length; i++) {
        const a = stars[i];
        for (let j = i + 1; j < stars.length; j++) {
          const b = stars[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 95) {
            ctx.strokeStyle = `rgba(${light ? '60, 90, 200' : '150, 175, 255'}, ${(1 - d / 95) * 0.35})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        const dp = Math.hypot(a.x - pointer.x, a.y - pointer.y);
        if (dp < 150) {
          ctx.strokeStyle = `rgba(${light ? '124, 77, 255' : '190, 150, 255'}, ${(1 - dp / 150) * 0.7})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.stroke();
        }
      }

      if (!reduceMotion && visible && !document.hidden) frame = requestAnimationFrame(draw);
    };

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    };
    const onLeave = () => { pointer.x = pointer.y = -999; };
    const onVisibility = () => { if (!document.hidden && visible && !reduceMotion) { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); } };

    const resizeObserver = new ResizeObserver(() => { resize(); cancelAnimationFrame(frame); draw(); });
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !reduceMotion) { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); }
    });

    resizeObserver.observe(canvas);
    intersection.observe(canvas);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onVisibility);

    resize();
    draw();
    this.redrawStars = () => { if (reduceMotion) draw(); };

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersection.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }

  /* ---------- global listeners ---------- */
  @HostListener('window:scroll')
  onScroll(): void {
    const header = this.headerEl?.nativeElement;
    if (!header) return;
    this.condensed.set(header.getBoundingClientRect().bottom < 0);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.lightboxIndex() !== null) {
      if (event.key === 'Escape') this.closeLightbox();
      if (event.key === 'ArrowRight') this.stepLightbox(1);
      if (event.key === 'ArrowLeft') this.stepLightbox(-1);
      return;
    }
    if (event.key === 'Escape' && this.isEditOpen()) this.closeEditProfile();
  }

  /* ---------- posts ---------- */
  getMyPosts(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.postsSubscription?.unsubscribe();

    this.postsSubscription = this.postsService.getAllposts().subscribe({
      next: (res: ProfilePostsResponse) => {
        const posts = res?.data?.posts ?? [];
        this.allPosts.set(posts);
        this.hydrateLikes(posts);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        console.error('Profile posts error:', error);
        this.errorMessage.set('Check your connection and try again.');
        this.loading.set(false);
      },
    });
  }

  setTab(tab: ProfileTab): void {
    this.activeTab.set(tab);
    if (this.condensed()) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  focusComposer(): void {
    this.activeTab.set('posts');
    setTimeout(() => {
      this.composerBox?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this.composerBox?.nativeElement.focus();
    });
  }

  /* ---------- composer ---------- */
  onPostContentChange(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    this.newPostContent.set(textarea.value);
    this.postPublishError.set('');

    // Grow with content, up to a limit.
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 260)}px`;
  }

  onPostImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.setPostImage(file);
  }

  onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      this.isDragging.set(true);
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.setPostImage(file);
  }

  onPaste(event: ClipboardEvent): void {
    const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
    if (file) {
      event.preventDefault();
      this.setPostImage(file);
    }
  }

  private async setPostImage(file: File): Promise<void> {
    const error = this.validateImage(file);
    if (error) {
      this.postPublishError.set(error);
      return;
    }

    this.postPublishError.set('');
    this.isProcessingImage.set('post');

    try {
      const optimized = await processImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.84 });
      this.releasePostPreview();
      const url = URL.createObjectURL(optimized);
      this.objectUrls.push(url);
      this.selectedPostImage.set(optimized);
      this.postImagePreview.set(url);
    } catch (e) {
      console.error('Post image error:', e);
      this.postPublishError.set(IMAGE_READ_ERROR);
    } finally {
      this.isProcessingImage.set(null);
    }
  }

  removePostImage(): void {
    this.releasePostPreview();
    this.selectedPostImage.set(null);
    this.postImagePreview.set(null);
    this.postPublishError.set('');
  }

  private releasePostPreview(): void {
    const url = this.postImagePreview();
    if (url) {
      URL.revokeObjectURL(url);
      this.objectUrls = this.objectUrls.filter((u) => u !== url);
    }
  }

  publishPost(): void {
    if (!this.canPublish()) return;

    const body = this.newPostContent().trim();
    const image = this.selectedPostImage();

    const formData = new FormData();
    formData.append('body', body);
    if (image) formData.append('image', image);

    this.isPublishingPost.set(true);
    this.postPublishError.set('');
    this.postSubscription?.unsubscribe();

    this.postSubscription = this.postsService.createPosts(formData).subscribe({
      next: () => {
        this.newPostContent.set('');
        this.removePostImage();
        if (this.composerBox) this.composerBox.nativeElement.style.height = '';
        this.isPublishingPost.set(false);
        this.activeTab.set('posts');
        this.showToast('Post published');
        this.getMyPosts();
      },
      error: (error: unknown) => {
        console.error('Create post error:', error);
        this.isPublishingPost.set(false);
        this.postPublishError.set('Your post wasn\'t published. Check your connection and try again.');
      },
    });
  }

  /* ---------- post helpers ---------- */
  isLong(text: string): boolean {
    return (text?.length ?? 0) > LONG_POST_LENGTH;
  }

  isExpanded(id: string | number): boolean {
    return this.expandedPosts().has(id);
  }

  toggleExpanded(id: string | number): void {
    const next = new Set(this.expandedPosts());
    next.has(id) ? next.delete(id) : next.add(id);
    this.expandedPosts.set(next);
  }

  timeAgo(value: string | number | Date): string {
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';

    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const abs = Math.abs(seconds);
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

    if (abs < 60) return 'Just now';
    if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
    if (abs < 604800) return rtf.format(Math.round(seconds / 86400), 'day');

    return date.toLocaleDateString('en', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    });
  }

  /* ---------- likes / comments / share ---------- */
  bg(url: string | undefined | null): string {
    return url ? `url("${url}")` : 'none';
  }

  isLiked(post: Post): boolean {
    return this.likedPosts().has(String(post.id));
  }

  isCommentsOpen(post: Post): boolean {
    return this.commentsOpen().has(String(post.id));
  }

  isLoadingComments(post: Post): boolean {
    return this.commentsLoading().has(String(post.id));
  }

  isSendingComment(post: Post): boolean {
    return this.commentsSending().has(String(post.id));
  }

  commentsFor(post: Post): PostComment[] {
    return this.comments()[String(post.id)] ?? [];
  }

  commentDraft(post: Post): string {
    return this.commentDrafts()[String(post.id)] ?? '';
  }

  toggleLike(post: Post): void {
    const key = String(post.id);
    if (this.pendingLikes.has(key)) return;

    const wasLiked = this.likedPosts().has(key);
    this.setLiked(key, !wasLiked); // optimistic
    this.pendingLikes.add(key);

    this.profileService
      .toggleLike(key)
      .pipe(finalize(() => this.pendingLikes.delete(key)))
      .subscribe({
        error: (e: unknown) => {
          console.error('Like error:', e);
          this.setLiked(key, wasLiked); // roll back
          this.showToast("Couldn't update your like. Try again.", 'error');
        },
      });
  }

  toggleComments(post: Post): void {
    const key = String(post.id);
    const open = this.commentsOpen().has(key);
    this.updateSet(this.commentsOpen, key, !open);
    if (!open && !(key in this.comments())) this.loadComments(key);
  }

  onCommentInput(post: Post, event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.commentDrafts.update((d) => ({ ...d, [String(post.id)]: value }));
  }

  onCommentKeydown(post: Post, event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.submitComment(post);
    }
  }

  submitComment(post: Post): void {
    const key = String(post.id);
    const content = this.commentDraft(post).trim();
    if (!content || this.commentsSending().has(key)) return;

    this.updateSet(this.commentsSending, key, true);

    this.profileService
      .addComment(key, content)
      .pipe(finalize(() => this.updateSet(this.commentsSending, key, false)))
      .subscribe({
        next: () => {
          this.commentDrafts.update((d) => ({ ...d, [key]: '' }));
          this.patchPost(key, (p) => ({ ...p, commentsCount: (p.commentsCount || 0) + 1 }));
          this.loadComments(key);
        },
        error: (e: unknown) => {
          console.error('Comment error:', e);
          this.showToast("Your comment wasn't posted. Try again.", 'error');
        },
      });
  }

  async sharePost(post: Post): Promise<void> {
    const url = window.location.href;
    const text = (post.body || 'Check out this post on Route Posts').slice(0, 140);

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Route Posts', text, url });
        return;
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return;
      }
    }
    await this.copyProfileLink();
  }

  private loadComments(key: string): void {
    this.updateSet(this.commentsLoading, key, true);

    this.profileService
      .getComments(key)
      .pipe(finalize(() => this.updateSet(this.commentsLoading, key, false)))
      .subscribe({
        next: (res: unknown) => this.comments.update((c) => ({ ...c, [key]: this.normalizeComments(res) })),
        error: (e: unknown) => {
          console.error('Load comments error:', e);
          this.showToast("Couldn't load comments.", 'error');
        },
      });
  }

  private setLiked(key: string, liked: boolean): void {
    this.updateSet(this.likedPosts, key, liked);
    this.patchPost(key, (p) => ({ ...p, likesCount: Math.max(0, (p.likesCount || 0) + (liked ? 1 : -1)) }));
  }

  private patchPost(key: string, fn: (post: Post) => Post): void {
    this.allPosts.update((list) => list.map((p) => (String(p.id) === key ? fn(p) : p)));
  }

  private updateSet(target: WritableSignal<ReadonlySet<string>>, key: string, add: boolean): void {
    const next = new Set(target());
    add ? next.add(key) : next.delete(key);
    target.set(next);
  }

  private hydrateLikes(posts: Post[]): void {
    const me = String(this.profileService.id() ?? '').trim();
    if (!me) return;

    const liked = posts
      .filter((post) => {
        const likes = (post as unknown as Record<string, unknown>)['likes'];
        return (
          Array.isArray(likes) &&
          likes.some((l) => {
            const r = this.asRecord(l);
            return String(typeof l === 'object' ? (r['_id'] ?? r['id'] ?? '') : l) === me;
          })
        );
      })
      .map((p) => String(p.id));

    this.likedPosts.set(new Set(liked));
  }

  private normalizeComments(res: unknown): PostComment[] {
    const root = this.asRecord(res);
    const data = this.asRecord(root['data']);
    const raw = ([data['comments'], root['comments'], root['data'], res].find(Array.isArray) ?? []) as unknown[];

    return raw
      .map((item, i) => {
        const r = this.asRecord(item);
        const creator = this.asRecord(r['commentCreator'] ?? r['user'] ?? r['creator']);
        const photo = creator['photo'];
        return {
          id: String(r['_id'] ?? r['id'] ?? i),
          content: String(r['content'] ?? r['body'] ?? ''),
          createdAt: String(r['createdAt'] ?? ''),
          authorName: String(creator['name'] ?? 'Member'),
          authorPhoto: typeof photo === 'string' ? photo : '',
        };
      })
      .filter((c) => !!c.content);
  }

  /* ---------- lightbox ---------- */
  openLightbox(postId: string | number): void {
    const index = this.photos().findIndex((p) => p.id === postId);
    if (index >= 0) this.lightboxIndex.set(index);
  }

  closeLightbox(): void {
    this.lightboxIndex.set(null);
  }

  stepLightbox(direction: 1 | -1): void {
    const total = this.photos().length;
    const current = this.lightboxIndex();
    if (!total || current === null) return;
    this.lightboxIndex.set((current + direction + total) % total);
  }

  /* ---------- edit profile ---------- */
  openEditProfile(): void {
    this.editName.set(this.userName() ?? '');
    this.editUsername.set(this.normalizeUsername(this.username()));
    this.editBio.set(this.bio() ?? '');
    this.avatarPreview.set(null);
    this.profileMessage.set('');
    this.isEditOpen.set(true);
  }

  closeEditProfile(): void {
    if (this.isDirty() && !window.confirm('Discard your changes?')) return;
    this.isEditOpen.set(false);
    this.avatarPreview.set(null);
    this.profileMessage.set('');
  }

  onNameChange(event: Event): void {
    this.editName.set((event.target as HTMLInputElement).value);
  }

  onUsernameChange(event: Event): void {
    this.editUsername.set((event.target as HTMLInputElement).value);
  }

  onBioChange(event: Event): void {
    this.editBio.set((event.target as HTMLTextAreaElement).value);
  }

  async onAvatarSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.profileMessage.set('');
    if (!file) return;

    const error = this.validateImage(file);
    if (error) {
      this.profileMessage.set(error);
      return;
    }

    this.isProcessingImage.set('avatar');
    try {
      const optimized = await processImage(file, { maxWidth: 512, maxHeight: 512, aspect: 1, quality: 0.86 });
      this.avatarPreview.set(await fileToDataUrl(optimized));
    } catch (e) {
      console.error('Avatar error:', e);
      this.profileMessage.set(IMAGE_READ_ERROR);
    } finally {
      this.isProcessingImage.set(null);
    }
  }

  async onCoverSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const error = this.validateImage(file);
    if (error) {
      this.showToast(error, 'error');
      return;
    }

    this.isProcessingImage.set('cover');
    try {
      const optimized = await processImage(file, { maxWidth: 1800, maxHeight: 700, aspect: 18 / 7, quality: 0.82 });
      const cover = await fileToDataUrl(optimized);

      // NOTE: ProfileService.updateUser must accept `cover` (see notes).
      this.profileService.updateUser({
        name: this.userName(),
        username: this.username(),
        bio: this.bio(),
        photo: this.profilePhoto(),
        cover,
      } as Parameters<ProfileService['updateUser']>[0]);

      this.showToast('Cover updated');
    } catch (e) {
      console.error('Cover update error:', e);
      this.showToast(IMAGE_READ_ERROR, 'error');
    } finally {
      this.isProcessingImage.set(null);
    }
  }

  saveProfile(): void {
    const name = this.editName().trim();
    const username = this.normalizeUsername(this.editUsername());
    const bio = this.editBio().trim();

    if (!name) {
      this.profileMessage.set('Name is required.');
      return;
    }
    if (this.usernameError()) {
      this.profileMessage.set(this.usernameError());
      return;
    }

    this.isSavingProfile.set(true);
    this.profileMessage.set('');

    try {
      this.profileService.updateUser({
        name,
        username,
        bio,
        photo: this.avatarPreview() ?? this.profilePhoto(),
      });

      this.isSavingProfile.set(false);
      this.isEditOpen.set(false);
      this.avatarPreview.set(null);
      this.showToast('Profile updated');
    } catch (error) {
      console.error('Profile update error:', error);
      this.isSavingProfile.set(false);
      this.profileMessage.set('Your changes weren\'t saved. Try again.');
    }
  }

  /* ---------- misc ---------- */
  toggleTheme(): void {
    const next: ThemeMode = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable: theme still applies for this session */
    }
    this.redrawStars?.();
  }

  private readStoredTheme(): ThemeMode {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      /* ignore */
    }
    return 'dark';
  }

  async copyProfileLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(window.location.href);
      this.showToast('Profile link copied');
    } catch {
      this.showToast('Couldn\'t copy the link.', 'error');
    }
  }

  onImageError(event: Event): void {
    const image = event.currentTarget as HTMLImageElement;
    image.onerror = null;
    image.src = this.profileService.defaultAvatar;
  }

  private showToast(message: string, type: Toast['type'] = 'success'): void {
    clearTimeout(this.toastTimer);
    this.toast.set({ message, type });
    this.toastTimer = setTimeout(() => this.toast.set(null), 3200);
  }

  /** Accepts any image type; size is only capped to protect the browser. */
  private validateImage(file: File): string | null {
    const looksLikeImage = file.type.startsWith('image/') || /\.(heic|heif|avif|webp|bmp|tiff?)$/i.test(file.name);
    if (!looksLikeImage) return 'Choose an image file.';
    if (file.size > MAX_INPUT_MB * MB) return `That file is too large (max ${MAX_INPUT_MB} MB).`;
    return null;
  }

  private isDefaultAvatar(src: string): boolean {
    return src === this.profileService.defaultAvatar;
  }

  private normalizeUsername(value: string | null | undefined): string {
    return String(value ?? '').trim().replace(/^@/, '').toLowerCase();
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
