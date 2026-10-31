import {
  Component,
  inject,
  input,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

import { CommentService } from './components/comment.service';

import type {
  PostComment,
  CommentsResponse,
} from '../models/comments.interface';

/* =========================================================
   COMMENT COMPONENT
========================================================= */

@Component({
  selector: 'app-comment',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './comment.component.html',
  styleUrls: ['./comment.component.css'],
  host: {
    '[style.display]': "'block'",
    '[style.width]': "'100%'",
    '[style.minWidth]': "'0'",
    '[style.backgroundColor]': "'#ffffff'",
    '[style.color]': "'#0f172a'",
    '[style.colorScheme]': "'light'",
  },
})
export class CommentComponent implements OnInit, OnDestroy {

  private readonly commentService = inject(CommentService);

  /* =========================================================
     SECTION 1: INPUTS
     البيانات القادمة من المكون الأب
  ========================================================= */

  readonly postId = input.required<string>();

  // صورة المستخدم الحالي
  readonly profilePhoto = input<string | null>(null);

  // الصورة الافتراضية عند عدم وجود صورة بروفايل
  readonly defaultAvatar = '/assets/default-profile.png';

  /* =========================================================
     SECTION 2: SUBSCRIPTIONS
     إدارة طلبات API
  ========================================================= */

  private commentsSubscription?: Subscription;

  private createCommentSubscription?: Subscription;

  /* =========================================================
     SECTION 3: COMMENTS STATE
     حالات التعليقات
  ========================================================= */

  readonly allComments = signal<PostComment[]>([]);

  readonly loading = signal(false);

  readonly errorMessage = signal('');

  get totalCount(): number {
    return this.allComments().length;
  }

  /* =========================================================
     SECTION 4: CREATE COMMENT STATE
     حالات إنشاء التعليق
  ========================================================= */

  readonly commentText = signal('');

  readonly selectedImage = signal<File | null>(null);

  readonly isCreatingComment = signal(false);

  readonly createCommentError = signal('');

  /* =========================================================
     SECTION 5: EMOJI PICKER
     اختيار الإيموجي
  ========================================================= */

  readonly showEmojiPicker = signal(false);

  readonly emojis: string[] = [
    '😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😉',
    '😎', '🥳', '😭', '😢', '😡', '🤔', '👍', '👎',
    '👏', '🙌', '🙏', '❤️', '🔥', '💯', '✨', '🎉',
    '💙', '💚', '🌹', '☀️', '🚀', '💪', '🤝', '❤️‍🔥',
  ];

  /* =========================================================
     SECTION 6: LIFECYCLE
     تشغيل وإيقاف المكون
  ========================================================= */

  ngOnInit(): void {
    this.getComment();
  }

  ngOnDestroy(): void {
    this.commentsSubscription?.unsubscribe();
    this.createCommentSubscription?.unsubscribe();
  }

  /* =========================================================
     SECTION 7: GET COMMENTS
     تحميل التعليقات
  ========================================================= */

  getComment(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.commentsSubscription?.unsubscribe();

    this.commentsSubscription = this.commentService
      .getAllcommets(this.postId())
      .subscribe({
        next: (res: CommentsResponse) => {
          const comments = res?.data?.comments;

          if (!Array.isArray(comments)) {
            this.allComments.set([]);
            this.errorMessage.set('Invalid comments response.');
            this.loading.set(false);

            console.error('Comments not found:', res);
            return;
          }

          this.allComments.set(comments);
          this.loading.set(false);

          console.log('Comments loaded:', comments);
        },

        error: (err: unknown) => {
          console.error('Comments API Error:', err);

          this.errorMessage.set(
            'Unable to load comments. Please try again.',
          );

          this.loading.set(false);
        },
      });
  }

  /* =========================================================
     SECTION 8: COMMENT HELPERS
     دوال مساعدة للتعليقات
  ========================================================= */

  trackByCommentId(
    index: number,
    comment: PostComment,
  ): string {
    return comment._id || String(index);
  }

  getCommentAuthor(comment: PostComment): string {
    return comment.commentCreator?.name || 'User';
  }

  getCommentAvatar(comment: PostComment): string {
    return comment.commentCreator?.photo || this.defaultAvatar;
  }

  /* =========================================================
     SECTION 9: COMMENT TEXT
     التعامل مع نص التعليق
  ========================================================= */

  onCommentTextChange(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;

    this.commentText.set(textarea.value);
  }

  /* =========================================================
     SECTION 10: IMAGE UPLOAD
     اختيار صورة التعليق
  ========================================================= */

  onCommentFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;

    const file = input.files?.[0] ?? null;

    this.createCommentError.set('');

    if (!file) {
      this.selectedImage.set(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.createCommentError.set(
        'Please select a valid image.',
      );

      this.selectedImage.set(null);
      input.value = '';

      return;
    }

    this.selectedImage.set(file);
  }

  /* =========================================================
     SECTION 11: REMOVE IMAGE
     حذف الصورة المختارة
  ========================================================= */

  removeSelectedImage(input: HTMLInputElement): void {
    this.selectedImage.set(null);
    input.value = '';

    this.createCommentError.set('');
  }

  /* =========================================================
     SECTION 12: CREATE COMMENT
     إرسال التعليق إلى السيرفر
  ========================================================= */

  submitComment(fileInput: HTMLInputElement): void {

    const content = this.commentText().trim();

    const image = this.selectedImage();

    if (!content && !image) {
      return;
    }

    if (this.isCreatingComment()) {
      return;
    }

    this.isCreatingComment.set(true);
    this.createCommentError.set('');

    this.createCommentSubscription = this.commentService
      .createComment(this.postId(), content, image)
      .subscribe({
        next: () => {
          console.log('Comment created successfully');

          // Reset form
          this.commentText.set('');
          this.selectedImage.set(null);

          fileInput.value = '';

          this.showEmojiPicker.set(false);

          this.isCreatingComment.set(false);

          // Reload comments
          this.getComment();
        },

        error: (err: unknown) => {
          console.error('Create comment API Error:', err);

          this.isCreatingComment.set(false);

          this.createCommentError.set(
            'Unable to send your comment. Please try again.',
          );
        },
      });
  }

  /* =========================================================
     SECTION 13: EMOJI ACTIONS
     التحكم في الإيموجي
  ========================================================= */

  toggleEmojiPicker(): void {
    this.showEmojiPicker.update(value => !value);
  }

  addEmoji(emoji: string): void {
    this.commentText.update(text => text + emoji);

    this.showEmojiPicker.set(false);
  }

}