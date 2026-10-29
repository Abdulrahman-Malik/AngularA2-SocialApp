import { Component, ElementRef, inject, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';

import { Subscription } from 'rxjs';

import { PostsService } from './components/posts.service';
import { Post } from './models/post.interface';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

export type ReactionType = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry';

export type PostPrivacy = 'public' | 'followers' | 'private';

export interface Reaction {
  readonly type: ReactionType;
  readonly emoji: string;
  readonly label: string;
}

export interface FeedComment {
  id: string;
  userName: string;
  text: string;
  createdAt: string;
}

type ApiPost = Omit<Post, 'privacy' | 'likesCount' | 'commentsCount' | 'sharesCount'> & {
  privacy?: PostPrivacy | null;
  likesCount?: unknown;
  commentsCount?: unknown;
  sharesCount?: unknown;
  likes?: unknown;
  comments?: unknown;
  shares?: unknown;
};

export type FeedPost = Omit<Post, 'privacy' | 'likesCount' | 'commentsCount' | 'sharesCount'> & {
  privacy: PostPrivacy;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  myReaction: ReactionType | null;
  isReactionPickerOpen: boolean;
  isSaved: boolean;
  isFollowing: boolean;
  isCommentsOpen: boolean;
  commentText: string;
  isCommentPreviewOpen: boolean;
  commentsList: FeedComment[];
};

@Component({
  selector: 'app-posts',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './posts.component.html',
  styleUrl: './posts.component.css',
})
export class PostsComponent implements OnInit, OnDestroy {
  private readonly postsService = inject(PostsService);

  private postsSubscription?: Subscription;
  private createPostSubscription?: Subscription;

  // =====================================================
  // FORM CONTROLS
  // =====================================================

  // Post content is optional.
  readonly content = new FormControl('', {
    nonNullable: true,
  });

  // Privacy defaults to public and has no required validator.
  readonly privacy = new FormControl<PostPrivacy>('public', {
    nonNullable: true,
  });

  readonly publishing = signal(false);

  readonly postActionMessage = signal('');

  readonly postActionIsError = signal(false);

  // =====================================================
  // CURRENT USER AND POSTS
  // =====================================================

  readonly userId = signal<string | null>(null);

  readonly allposts = signal<FeedPost[]>([]);

  readonly loading = signal(false);

  readonly errorMessage = signal('');

  // =====================================================
  // NEW POST PRIVACY
  // =====================================================

  newPostPrivacy: PostPrivacy = 'public';

  // =====================================================
  // IMAGE / VIDEO FILE SIGNALS
  // =====================================================

  // Stores the original selected File object.
  readonly selectedMediaFile = signal<File | null>(null);

  // Temporary URL used to preview the selected media.
  readonly mediaPreviewUrl = signal<string | null>(null);

  readonly mediaType = signal<'image' | 'video' | null>(null);

  readonly mediaError = signal('');

  @ViewChild('postMediaInput')
  private postMediaInput?: ElementRef<HTMLInputElement>;

  // =====================================================
  // AVAILABLE REACTIONS
  // =====================================================

  readonly reactions: readonly Reaction[] = [
    { type: 'like', emoji: '👍', label: 'Like' },
    { type: 'love', emoji: '❤️', label: 'Love' },
    { type: 'haha', emoji: '😂', label: 'Haha' },
    { type: 'wow', emoji: '😮', label: 'Wow' },
    { type: 'sad', emoji: '😢', label: 'Sad' },
    { type: 'angry', emoji: '😡', label: 'Angry' },
  ];

  // =====================================================
  // LIFECYCLE
  // =====================================================

  ngOnInit(): void {
    this.loadCurrentUserId();
    this.getPostsData();
  }

  ngOnDestroy(): void {
    this.postsSubscription?.unsubscribe();
    this.createPostSubscription?.unsubscribe();

    this.releaseMediaPreview();
  }

  // =====================================================
  // CURRENT USER
  // =====================================================

  private loadCurrentUserId(): void {
    if (typeof localStorage === 'undefined') {
      this.userId.set(null);
      return;
    }

    const storedUser = localStorage.getItem('user');

    if (!storedUser) {
      this.userId.set(null);
      return;
    }

    try {
      const parsedUser: unknown = JSON.parse(storedUser);
      const user = this.asRecord(parsedUser);

      const id = user['_id'] ?? user['id'] ?? user['userId'];

      this.userId.set(
        id === null || id === undefined || String(id).trim() === '' ? null : String(id),
      );
    } catch (error) {
      console.error('Unable to read the current user:', error);
      this.userId.set(null);
    }
  }

  // =====================================================
  // CHECK POST OWNERSHIP
  // =====================================================

  isOwnPost(post: FeedPost): boolean {
    const currentUserId = this.userId();

    if (currentUserId === null) {
      return false;
    }

    const record = post as unknown as Record<string, unknown>;

    const ownerSource =
      record['user'] ?? record['owner'] ?? record['author'] ?? record['createdBy'];

    const owner = this.asRecord(ownerSource);

    const ownerId =
      owner['_id'] ??
      owner['id'] ??
      owner['userId'] ??
      record['userId'] ??
      record['ownerId'] ??
      record['authorId'] ??
      record['createdById'] ??
      (typeof ownerSource === 'string' || typeof ownerSource === 'number'
        ? ownerSource
        : undefined);

    if (ownerId === null || ownerId === undefined) {
      return false;
    }

    return String(ownerId) === currentUserId;
  }

  // =====================================================
  // NEW POST PRIVACY
  // =====================================================

  selectNewPostPrivacy(privacy: PostPrivacy, menu: HTMLDetailsElement): void {
    this.newPostPrivacy = privacy;

    // Keep the FormControl synchronized with the privacy dropdown.
    this.privacy.setValue(privacy);

    menu.open = false;
  }

  // =====================================================
  // SUBMIT POST
  // =====================================================

  submitForm(event?: Event): void {
    event?.preventDefault();

    if (this.publishing()) {
      return;
    }

    // 1. Get privacy from FormControl.
    const privacy = this.privacy.value;

    // 2. Get content from FormControl.
    const content = this.content.value.trim();

    // 3. Get the actual selected file from the Signal.
    const file = this.selectedMediaFile();

    // Content and image are both optional,
    // but at least one must be supplied.
    if (!content && !file) {
      this.postActionIsError.set(true);

      this.postActionMessage.set('Please write a post or select an image.');

      return;
    }

    // This request currently sends images through the image field.
    if (file && !file.type.startsWith('image/')) {
      this.mediaError.set('Please select an image. Video publishing requires backend support.');

      return;
    }

    // Prepare multipart/form-data.
    const formData = new FormData();

    // Privacy value.
    formData.append('privacy', this.privacy.value);

    // Content value is optional.
    if (content) {
      formData.append('body', this.content.value);
    }

    // Image file is optional.
    if (file) {
      formData.append('image', file, file.name);
    }

    // Verify the three values before sending.
    console.log('Privacy:', privacy);
    console.log('Content:', content);
    console.log('File:', file);

    this.publishing.set(true);
    this.postActionMessage.set('');
    this.postActionIsError.set(false);
    this.mediaError.set('');

    this.createPostSubscription?.unsubscribe();

    // Use the actual method name from PostsService.
    this.createPostSubscription = this.postsService.createPosts(formData).subscribe({
      next: () => {
        // Reset the form after successful creation.
        this.content.reset('');
        this.privacy.setValue('public');
        this.newPostPrivacy = 'public';

        this.removeSelectedMedia();

        this.publishing.set(false);
        this.postActionIsError.set(false);

        this.postActionMessage.set('Post published successfully.');

        // Refresh posts from the backend.
        this.getPostsData();
      },

      error: (error: unknown) => {
        console.error('Failed to publish post:', error);

        const errorRecord = this.asRecord(error);
        const errorBody = this.asRecord(errorRecord['error']);
        const apiMessage = errorBody['message'];

        this.publishing.set(false);
        this.postActionIsError.set(true);

        this.postActionMessage.set(
          typeof apiMessage === 'string'
            ? apiMessage
            : 'Unable to publish post. Check your login and try again.',
        );
      },
    });
  }

  // =====================================================
  // SELECT IMAGE OR VIDEO
  // =====================================================

  onMediaSelected(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;

    // Read the selected File object.
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    // Reject unsupported file types.
    if (!isImage && !isVideo) {
      this.mediaError.set('Please select an image or video file.');

      input.value = '';
      return;
    }

    // Release the previous attachment and preview.
    this.releaseMediaPreview();

    // Save the original File object in the Signal.
    this.selectedMediaFile.set(file);

    // Determine the selected media type.
    this.mediaType.set(isImage ? 'image' : 'video');

    // Create a temporary URL for preview only.
    this.mediaPreviewUrl.set(URL.createObjectURL(file));

    this.mediaError.set('');

    // Allow selecting the same file again.
    input.value = '';
  }

  // =====================================================
  // REMOVE SELECTED MEDIA
  // =====================================================

  removeSelectedMedia(): void {
    this.releaseMediaPreview();

    this.mediaError.set('');

    if (this.postMediaInput) {
      this.postMediaInput.nativeElement.value = '';
    }
  }

  // =====================================================
  // RELEASE MEDIA PREVIEW
  // =====================================================

  private releaseMediaPreview(): void {
    const previewUrl = this.mediaPreviewUrl();

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    this.mediaPreviewUrl.set(null);
    this.mediaType.set(null);
    this.selectedMediaFile.set(null);
  }

  // =====================================================
  // GET POSTS
  // =====================================================

  getPostsData(): void {
    if (this.loading()) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.postsSubscription?.unsubscribe();

    this.postsSubscription = this.postsService.getAllposts().subscribe({
      next: (res) => {
        const apiPosts = (res?.data?.posts ?? []) as ApiPost[];

        const previousPosts = new Map(
          this.allposts().map((post) => [String(post.id), post] as const),
        );

        const updatedPosts: FeedPost[] = apiPosts.map((apiPost): FeedPost => {
          const previous = previousPosts.get(String(apiPost.id));

          const apiComments = this.normalizeComments(apiPost.comments);

          const commentsList = this.mergeComments(apiComments, previous?.commentsList ?? []);

          const commentsCount = Math.max(
            this.normalizeCount(
              apiPost.commentsCount,
              apiPost.comments ?? previous?.commentsCount ?? 0,
            ),
            commentsList.length,
          );

          return {
            ...apiPost,

            privacy: this.normalizePrivacy(apiPost.privacy) ?? previous?.privacy ?? 'public',

            likesCount: this.normalizeCount(
              apiPost.likesCount,
              apiPost.likes ?? previous?.likesCount ?? 0,
            ),

            commentsCount,

            sharesCount: this.normalizeCount(
              apiPost.sharesCount,
              apiPost.shares ?? previous?.sharesCount ?? 0,
            ),

            myReaction: previous?.myReaction ?? null,

            isReactionPickerOpen: false,

            isSaved: previous?.isSaved ?? false,

            isFollowing: previous?.isFollowing ?? false,

            isCommentsOpen: previous?.isCommentsOpen ?? false,

            commentText: previous?.commentText ?? '',

            isCommentPreviewOpen: previous?.isCommentPreviewOpen ?? false,

            commentsList,
          } as FeedPost;
        });

        this.allposts.set(updatedPosts);
        this.loading.set(false);

        console.log('Posts loaded:', updatedPosts);
        console.log('Posts count:', updatedPosts.length);
      },

      error: (error: unknown) => {
        console.error('Failed to load posts:', error);

        if (this.allposts().length === 0) {
          this.errorMessage.set('Unable to load posts. Please try again.');
        }

        this.loading.set(false);
      },
    });
  }

  // =====================================================
  // DATA HELPERS
  // =====================================================

  private normalizePrivacy(value: unknown): PostPrivacy | null {
    if (value === 'public' || value === 'followers' || value === 'private') {
      return value;
    }

    return null;
  }

  private normalizeCount(value: unknown, fallback: unknown = 0): number {
    const candidate = value ?? fallback ?? 0;

    if (Array.isArray(candidate)) {
      return candidate.length;
    }

    if (typeof candidate === 'object' && candidate !== null && 'length' in candidate) {
      const length = Number(candidate.length);

      if (Number.isFinite(length) && length >= 0) {
        return length;
      }
    }

    const count = Number(candidate);

    return Number.isFinite(count) && count >= 0 ? count : 0;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return {};
  }

  private normalizeComments(value: unknown): FeedComment[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item, index): FeedComment => {
        const comment = this.asRecord(item);

        const commentUser = this.asRecord(
          comment['user'] ?? comment['commentCreator'] ?? comment['author'],
        );

        const rawText =
          comment['text'] ?? comment['content'] ?? comment['body'] ?? comment['comment'] ?? '';

        const rawId = comment['id'] ?? comment['_id'] ?? comment['commentId'] ?? `api-${index}`;

        const rawUserName =
          comment['userName'] ??
          comment['name'] ??
          commentUser['name'] ??
          commentUser['username'] ??
          'مستخدم';

        const rawCreatedAt = comment['createdAt'] ?? comment['created_at'] ?? comment['date'] ?? '';

        return {
          id: String(rawId),
          userName: String(rawUserName),
          text: String(rawText),
          createdAt: String(rawCreatedAt),
        };
      })
      .filter((comment) => comment.text.trim().length > 0);
  }

  private mergeComments(
    apiComments: FeedComment[],
    previousComments: FeedComment[],
  ): FeedComment[] {
    const uniqueComments = new Map<string, FeedComment>();

    for (const comment of [...apiComments, ...previousComments]) {
      if (!uniqueComments.has(comment.id)) {
        uniqueComments.set(comment.id, comment);
      }
    }

    return Array.from(uniqueComments.values());
  }

  private updatePost(postId: Post['id'], update: (post: FeedPost) => FeedPost): void {
    this.allposts.update((posts) =>
      posts.map((post) => (String(post.id) === String(postId) ? update(post) : post)),
    );
  }

  // =====================================================
  // REACTIONS
  // =====================================================

  getCurrentReaction(post: FeedPost): Reaction | undefined {
    return this.reactions.find((reaction) => reaction.type === post.myReaction);
  }

  toggleLike(post: FeedPost): void {
    this.updatePost(post.id, (current) => {
      if (current.myReaction === 'like') {
        return {
          ...current,
          myReaction: null,
          likesCount: Math.max(0, current.likesCount - 1),
          isReactionPickerOpen: false,
        };
      }

      const likesCount = current.myReaction === null ? current.likesCount + 1 : current.likesCount;

      return {
        ...current,
        myReaction: 'like',
        likesCount,
        isReactionPickerOpen: false,
      };
    });
  }

  selectReaction(post: FeedPost, type: ReactionType): void {
    this.updatePost(post.id, (current) => {
      if (current.myReaction === type) {
        return {
          ...current,
          myReaction: null,
          likesCount: Math.max(0, current.likesCount - 1),
          isReactionPickerOpen: false,
        };
      }

      const likesCount = current.myReaction === null ? current.likesCount + 1 : current.likesCount;

      return {
        ...current,
        myReaction: type,
        likesCount,
        isReactionPickerOpen: false,
      };
    });
  }

  toggleReactionPicker(post: FeedPost): void {
    this.updatePost(post.id, (current) => ({
      ...current,
      isReactionPickerOpen: !current.isReactionPickerOpen,
    }));
  }

  closeReactionPicker(post: FeedPost): void {
    this.updatePost(post.id, (current) => ({
      ...current,
      isReactionPickerOpen: false,
    }));
  }

  // =====================================================
  // POST PRIVACY, SAVING AND FOLLOWING
  // =====================================================

  setPrivacy(post: FeedPost, privacy: PostPrivacy): void {
    if (!this.isOwnPost(post)) {
      return;
    }

    this.updatePost(post.id, (current) => ({
      ...current,
      privacy,
    }));
  }

  toggleSave(post: FeedPost): void {
    this.updatePost(post.id, (current) => ({
      ...current,
      isSaved: !current.isSaved,
    }));
  }

  toggleFollow(post: FeedPost): void {
    this.updatePost(post.id, (current) => ({
      ...current,
      isFollowing: !current.isFollowing,
    }));
  }

  // =====================================================
  // COMMENTS
  // =====================================================

  toggleComments(post: FeedPost): void {
    this.updatePost(post.id, (current) => ({
      ...current,
      isCommentsOpen: !current.isCommentsOpen,
    }));
  }

  setCommentText(post: FeedPost, value: string): void {
    this.updatePost(post.id, (current) => ({
      ...current,
      commentText: value,
    }));
  }

  previewComment(post: FeedPost): void {
    this.updatePost(post.id, (current) => {
      if (!current.commentText.trim()) {
        return {
          ...current,
          isCommentPreviewOpen: false,
        };
      }

      return {
        ...current,
        isCommentPreviewOpen: true,
        isCommentsOpen: true,
      };
    });
  }

  editComment(post: FeedPost): void {
    this.updatePost(post.id, (current) => ({
      ...current,
      isCommentPreviewOpen: false,
    }));
  }

  addComment(post: FeedPost): void {
    this.updatePost(post.id, (current) => {
      const text = current.commentText.trim();

      if (!text) {
        return current;
      }

      const newComment: FeedComment = {
        id: `${String(current.id)}-local-${Date.now()}`,
        userName: 'أنت',
        text,
        createdAt: new Date().toLocaleTimeString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      const commentsList = [...current.commentsList, newComment];

      return {
        ...current,
        commentsList,
        commentsCount: Math.max(current.commentsCount, current.commentsList.length) + 1,
        commentText: '',
        isCommentPreviewOpen: false,
        isCommentsOpen: true,
      };
    });
  }

  // =====================================================
  // SHARE POST
  // =====================================================

  async sharePost(post: FeedPost): Promise<void> {
    const text = String(post.body ?? '');

    if (typeof navigator === 'undefined') {
      return;
    }

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Route Posts',
          text,
        });

        return;
      }

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      // The user may cancel the native share dialog.
    }
  }
}
