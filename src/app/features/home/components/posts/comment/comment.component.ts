import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';

import { CommonModule } from '@angular/common';

/* =========================================================
   MODELS
========================================================= */

export type ReactionKey =
  | 'like'
  | 'love'
  | 'haha'
  | 'wow'
  | 'sad'
  | 'angry';

export interface CommentUser {
  id: string;
  name: string;
  avatar?: string;
}

export interface CommentModel {
  id: string;
  author: CommentUser;
  text: string;
  image?: string | null;
  createdAt: Date | string | number;
  editedAt?: Date | string | number | null;
  isPostAuthor?: boolean;
  replyTo?: string | null;
  reactions?: Partial<Record<ReactionKey, number>>;
  myReaction?: ReactionKey | null;
  replies?: CommentModel[];
  isNew?: boolean;
}

/**
 * Shape currently used by PostsComponent.
 * It does not contain an `author` object.
 */
export interface FeedCommentInput {
  id: string;
  userName: string;
  text: string;
  createdAt: Date | string | number;
}

export interface Reaction {
  key: ReactionKey;
  emoji: string;
  label: string;
  color: string;
}

interface Draft {
  text: string;
  file: File | null;
  preview: string | null;
  error: string | null;
}

const emptyDraft = (): Draft => ({
  text: '',
  file: null,
  preview: null,
  error: null,
});

/* =========================================================
   COMPONENT
========================================================= */

@Component({
  selector: 'app-comment',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './comment.component.html',
  styleUrls: ['./comment.component.css'],
})
export class CommentComponent implements OnInit, OnDestroy {
  /* =======================================================
     INPUTS / OUTPUTS
  ======================================================= */

  /**
   * Accepts both CommentModel[] and FeedCommentInput[].
   * Incoming feed comments are normalized into CommentModel.
   */
  @Input()
  set comments(
    value: CommentModel[] | FeedCommentInput[] | null | undefined,
  ) {
    this._comments = (value ?? []).map((comment) =>
      this.toCommentModel(comment),
    );

    this._comments.forEach((comment) =>
      this.normalize(comment),
    );

    this.shown = this.pageSize;
    this.refresh();
  }

  @Input() currentUser: CommentUser = {
    id: 'me',
    name: 'You',
    avatar: '',
  };

  @Input() maxLength = 1000;
  @Input() maxImageMB = 5;
  @Input() pageSize = 5;

  @Output()
  commentAdded = new EventEmitter<{
    comment: CommentModel;
    parentId: string | null;
    file: File | null;
  }>();

  @Output()
  commentEdited = new EventEmitter<{
    id: string;
    text: string;
  }>();

  @Output()
  commentDeleted = new EventEmitter<{
    id: string;
    parentId: string | null;
  }>();

  @Output()
  reacted = new EventEmitter<{
    id: string;
    reaction: ReactionKey | null;
  }>();

  @Output()
  reported = new EventEmitter<{ id: string }>();

  @Output()
  profileOpened = new EventEmitter<CommentUser>();

  /* =======================================================
     STATIC DATA
  ======================================================= */

  readonly reactions: Reaction[] = [
    {
      key: 'like',
      emoji: '👍',
      label: 'Like',
      color: '#0866ff',
    },
    {
      key: 'love',
      emoji: '❤️',
      label: 'Love',
      color: '#f33e58',
    },
    {
      key: 'haha',
      emoji: '😂',
      label: 'Haha',
      color: '#d99a00',
    },
    {
      key: 'wow',
      emoji: '😮',
      label: 'Wow',
      color: '#d99a00',
    },
    {
      key: 'sad',
      emoji: '😢',
      label: 'Sad',
      color: '#d99a00',
    },
    {
      key: 'angry',
      emoji: '😡',
      label: 'Angry',
      color: '#e9710f',
    },
  ];

  readonly emojis = [
    '😀',
    '😂',
    '😍',
    '🥰',
    '😎',
    '🤔',
    '😢',
    '😡',
    '👍',
    '👏',
    '🙏',
    '🔥',
    '🎉',
    '❤️',
    '💯',
    '✨',
    '👀',
    '😅',
    '🤝',
    '💪',
    '🙌',
    '😭',
    '🤩',
    '😴',
  ];

  /* =======================================================
     STATE
  ======================================================= */

  sort: 'top' | 'newest' = 'top';

  view: CommentModel[] = [];

  paged: CommentModel[] = [];

  shown = 5;

  drafts: Record<string, Draft> = {};

  expanded = new Set<string>();

  fullText = new Set<string>();

  pickerFor: string | null = null;

  menuFor: string | null = null;

  emojiFor: string | null = null;

  editingId: string | null = null;

  editText = '';

  confirmDeleteId: string | null = null;

  replyingId: string | null = null;

  replyingParentId: string | null = null;

  toast: string | null = null;

  private _comments: CommentModel[] = [];

  private pressTimer: ReturnType<typeof setTimeout> | null = null;

  private longPressed = false;

  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  private tick: ReturnType<typeof setInterval> | null = null;

  private readonly enterToSend =
    typeof matchMedia === 'function' &&
    matchMedia('(hover: hover) and (pointer: fine)').matches;

  constructor(private host: ElementRef<HTMLElement>) {}

  /* =======================================================
     LIFECYCLE
  ======================================================= */

  ngOnInit(): void {
    this.tick = setInterval(() => {
      // Keeps a timer available for relative-time refreshes.
    }, 30000);

    this.shown = this.pageSize;

    this.refresh();
  }

  ngOnDestroy(): void {
    if (this.tick) {
      clearInterval(this.tick);
    }

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    if (this.pressTimer) {
      clearTimeout(this.pressTimer);
    }

    Object.values(this.drafts).forEach((draft) => {
      if (draft.preview) {
        URL.revokeObjectURL(draft.preview);
      }
    });

    this._comments.forEach((comment) =>
      this.releaseImages(comment),
    );
  }

  /* =======================================================
     NORMALIZE INCOMING COMMENTS
  ======================================================= */

  /**
   * Converts the post-feed shape:
   * { id, userName, text, createdAt }
   *
   * into the component shape:
   * { id, author: { id, name }, text, createdAt }.
   *
   * Existing CommentModel values are preserved.
   */
  private toCommentModel(
    input: CommentModel | FeedCommentInput,
  ): CommentModel {
    const raw = input as Partial<CommentModel> &
      Partial<FeedCommentInput>;

    const rawName =
      raw.author?.name?.trim() ||
      raw.userName?.trim() ||
      'User';

    const fallbackAuthorId =
      `feed-user-${rawName.toLowerCase().replace(/\s+/g, '-')}`;

    const author: CommentUser = {
      id: String(raw.author?.id ?? fallbackAuthorId),
      name: rawName,
      avatar: raw.author?.avatar ?? '',
    };

    const replies = (raw.replies ?? []).map((reply) =>
      this.toCommentModel(reply),
    );

    return {
      id: String(raw.id ?? this.uid()),
      author,
      text: String(raw.text ?? ''),
      image: raw.image ?? null,
      createdAt: raw.createdAt ?? new Date(),
      editedAt: raw.editedAt ?? null,
      isPostAuthor: raw.isPostAuthor ?? false,
      replyTo: raw.replyTo ?? null,
      reactions: raw.reactions ?? {},
      myReaction: raw.myReaction ?? null,
      replies,
      isNew: raw.isNew ?? false,
    };
  }

  /* =======================================================
     DERIVED DATA
  ======================================================= */

  trackById = (_: number, comment: CommentModel) =>
    comment.id;

  get totalCount(): number {
    return this._comments.reduce(
      (count, comment) =>
        count + 1 + (comment.replies?.length ?? 0),
      0,
    );
  }

  reactionTotal(comment: CommentModel): number {
    return Object.values(
      comment.reactions ?? {},
    ).reduce(
      (total, count) => total + (count || 0),
      0,
    );
  }

  reactionEmojis(comment: CommentModel): string {
    const counts = comment.reactions ?? {};

    return this.reactions
      .filter((reaction) => (counts[reaction.key] || 0) > 0)
      .sort(
        (a, b) =>
          (counts[b.key] || 0) -
          (counts[a.key] || 0),
      )
      .slice(0, 3)
      .map((reaction) => reaction.emoji)
      .join('');
  }

  reactionOf(
    key: ReactionKey | null | undefined,
  ): Reaction | undefined {
    return this.reactions.find(
      (reaction) => reaction.key === key,
    );
  }

  isOwn(comment: CommentModel): boolean {
    return comment.author.id === this.currentUser.id;
  }

  isLong(comment: CommentModel): boolean {
    return (
      (comment.text?.length ?? 0) > 280 ||
      (comment.text?.split('\n').length ?? 0) > 6
    );
  }

  replyLimit(comment: CommentModel): number {
    return this.expanded.has(comment.id)
      ? Number.MAX_SAFE_INTEGER
      : 1;
  }

  getReplyTarget(comment: CommentModel): CommentModel {
    if (this.replyingId === comment.id) {
      return comment;
    }

    return (
      comment.replies?.find(
        (reply) => reply.id === this.replyingId,
      ) ?? comment
    );
  }

  initials(name: string): string {
    return (name || '?')
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  iso(date: Date | string | number): string {
    const parsedDate = new Date(date);

    return Number.isNaN(parsedDate.getTime())
      ? new Date().toISOString()
      : parsedDate.toISOString();
  }

  timeAgo(date: Date | string | number): string {
    const timestamp = new Date(date).getTime();

    if (Number.isNaN(timestamp)) {
      return '';
    }

    const diff = Math.max(
      0,
      Math.floor((Date.now() - timestamp) / 1000),
    );

    if (diff < 5) return 'Just now';
    if (diff < 60) return `${diff}s`;

    const minutes = Math.floor(diff / 60);

    if (minutes < 60) {
      return `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
      return `${hours}h`;
    }

    const days = Math.floor(hours / 24);

    if (days < 7) {
      return `${days}d`;
    }

    return new Date(date).toLocaleDateString(
      undefined,
      {
        month: 'short',
        day: 'numeric',
        year: days > 300 ? 'numeric' : undefined,
      },
    );
  }

  /* =======================================================
     SORTING / PAGING
  ======================================================= */

  setSort(sort: 'top' | 'newest'): void {
    if (this.sort === sort) {
      return;
    }

    this.sort = sort;
    this.shown = this.pageSize;
    this.refresh();
  }

  showMore(): void {
    this.shown += this.pageSize;
    this.paged = this.view.slice(0, this.shown);
  }

  private score(comment: CommentModel): number {
    return (
      this.reactionTotal(comment) +
      (comment.replies?.length ?? 0) * 0.5
    );
  }

  private refresh(): void {
    const timestamp = (comment: CommentModel) =>
      new Date(comment.createdAt).getTime();

    const list = [...this._comments];

    list.sort(
      this.sort === 'newest'
        ? (a, b) => timestamp(b) - timestamp(a)
        : (a, b) =>
            this.score(b) - this.score(a) ||
            timestamp(b) - timestamp(a),
    );

    this.view = list;
    this.paged = list.slice(0, this.shown);
  }

  private normalize(comment: CommentModel): void {
    comment.reactions ??= {};
    comment.replies ??= [];
    comment.myReaction ??= null;

    comment.replies.forEach((reply) =>
      this.normalize(reply),
    );
  }

  /* =======================================================
     REACTIONS
  ======================================================= */

  react(
    comment: CommentModel,
    key: ReactionKey,
  ): void {
    comment.reactions ??= {};

    const previous = comment.myReaction ?? null;

    if (previous) {
      comment.reactions[previous] = Math.max(
        0,
        (comment.reactions[previous] ?? 0) - 1,
      );
    }

    const next = previous === key ? null : key;

    if (next) {
      comment.reactions[next] =
        (comment.reactions[next] ?? 0) + 1;
    }

    comment.myReaction = next;
    this.pickerFor = null;

    this.reacted.emit({
      id: comment.id,
      reaction: next,
    });
  }

  onLikeDown(
    event: PointerEvent,
    comment: CommentModel,
  ): void {
    if (event.pointerType === 'mouse') {
      return;
    }

    this.cancelPress();

    this.pressTimer = setTimeout(() => {
      this.longPressed = true;
      this.menuFor = null;
      this.emojiFor = null;
      this.pickerFor = comment.id;
    }, 380);
  }

  onLikeUp(): void {
    this.cancelPress();
  }

  onLikeClick(comment: CommentModel): void {
    if (this.longPressed) {
      this.longPressed = false;
      return;
    }

    this.react(comment, comment.myReaction ?? 'like');
  }

  private cancelPress(): void {
    if (this.pressTimer) {
      clearTimeout(this.pressTimer);
    }

    this.pressTimer = null;
  }

  /* =======================================================
     MENU: EDIT / DELETE / COPY / REPORT
  ======================================================= */

  toggleMenu(
    comment: CommentModel,
    event: Event,
  ): void {
    event.stopPropagation();

    this.pickerFor = null;
    this.emojiFor = null;

    this.menuFor =
      this.menuFor === comment.id
        ? null
        : comment.id;
  }

  startEdit(comment: CommentModel): void {
    this.menuFor = null;
    this.confirmDeleteId = null;
    this.editingId = comment.id;
    this.editText = comment.text;

    setTimeout(() => {
      const element = document.getElementById(
        'edit-' + comment.id,
      ) as HTMLTextAreaElement | null;

      if (element) {
        this.autosize(element);
        element.focus();

        element.setSelectionRange(
          element.value.length,
          element.value.length,
        );
      }
    });
  }

  onEditInput(event: Event): void {
    const element =
      event.target as HTMLTextAreaElement;

    this.editText = element.value;
    this.autosize(element);
  }

  onEditEnter(
    event: Event,
    comment: CommentModel,
  ): void {
    const keyboardEvent = event as KeyboardEvent;

    if (
      keyboardEvent.shiftKey ||
      keyboardEvent.isComposing ||
      !this.enterToSend
    ) {
      return;
    }

    keyboardEvent.preventDefault();
    this.saveEdit(comment);
  }

  saveEdit(comment: CommentModel): void {
    const text = this.editText.trim();

    if (!text) {
      return;
    }

    if (text === comment.text) {
      this.cancelEdit();
      return;
    }

    comment.text = text;
    comment.editedAt = new Date();

    this.editingId = null;

    this.commentEdited.emit({
      id: comment.id,
      text,
    });
  }

  cancelEdit(): void {
    this.editingId = null;
  }

  askDelete(comment: CommentModel): void {
    this.menuFor = null;
    this.confirmDeleteId = comment.id;
  }

  confirmDelete(
    comment: CommentModel,
    parent: CommentModel | null,
  ): void {
    if (parent) {
      parent.replies = (parent.replies ?? []).filter(
        (reply) => reply.id !== comment.id,
      );
    } else {
      this._comments = this._comments.filter(
        (item) => item.id !== comment.id,
      );

      this.view = this.view.filter(
        (item) => item.id !== comment.id,
      );

      this.paged = this.view.slice(0, this.shown);
    }

    this.releaseImages(comment);
    this.confirmDeleteId = null;

    if (
      this.replyingParentId === comment.id ||
      this.replyingId === comment.id
    ) {
      this.cancelReply();
    }

    this.commentDeleted.emit({
      id: comment.id,
      parentId: parent?.id ?? null,
    });

    this.showToast('Comment deleted');
  }

  copy(comment: CommentModel): void {
    this.menuFor = null;

    if (!navigator.clipboard) {
      this.showToast(
        'Copy is not supported in this browser',
      );
      return;
    }

    navigator.clipboard.writeText(comment.text).then(
      () => this.showToast('Copied to clipboard'),
      () => this.showToast('Could not copy'),
    );
  }

  report(comment: CommentModel): void {
    this.menuFor = null;

    this.reported.emit({
      id: comment.id,
    });

    this.showToast(
      'Thanks, we received your report',
    );
  }

  /* =======================================================
     REPLIES / THREADS
  ======================================================= */

  openReply(
    target: CommentModel,
    parent: CommentModel | null,
  ): void {
    const root = parent ?? target;

    this.replyingId = target.id;
    this.replyingParentId = root.id;

    this.expanded.add(root.id);
    this.menuFor = null;

    setTimeout(() =>
      this.focusKey('reply:' + root.id),
    );
  }

  cancelReply(): void {
    this.replyingId = null;
    this.replyingParentId = null;
  }

  toggleReplies(comment: CommentModel): void {
    if (this.expanded.has(comment.id)) {
      this.expanded.delete(comment.id);
    } else {
      this.expanded.add(comment.id);
    }
  }

  toggleText(comment: CommentModel): void {
    if (this.fullText.has(comment.id)) {
      this.fullText.delete(comment.id);
    } else {
      this.fullText.add(comment.id);
    }
  }

  /* =======================================================
     COMPOSER
  ======================================================= */

  getDraft(key: string): Draft {
    return (this.drafts[key] ??= emptyDraft());
  }

  canSend(draft: Draft): boolean {
    return !!draft.text.trim() || !!draft.file;
  }

  onInput(
    key: string,
    textarea: HTMLTextAreaElement,
  ): void {
    this.getDraft(key).text = textarea.value;
    this.autosize(textarea);
  }

  onEnter(
    event: Event,
    key: string,
    textarea: HTMLTextAreaElement,
    parent: CommentModel | null,
    target: CommentModel | null,
  ): void {
    const keyboardEvent = event as KeyboardEvent;

    if (
      keyboardEvent.shiftKey ||
      keyboardEvent.isComposing ||
      !this.enterToSend
    ) {
      return;
    }

    keyboardEvent.preventDefault();

    this.send(key, textarea, parent, target);
  }

  send(
    key: string,
    textarea: HTMLTextAreaElement,
    parent?: CommentModel | null,
    target?: CommentModel | null,
  ): void {
    const draft = this.getDraft(key);
    const text = draft.text.trim();

    if (!text && !draft.file) {
      return;
    }

    const comment: CommentModel = {
      id: this.uid(),
      author: this.currentUser,
      text,
      image: draft.preview,
      createdAt: new Date(),
      reactions: {},
      myReaction: null,
      replies: [],
      isNew: true,
      replyTo:
        parent &&
        target &&
        target.id !== parent.id
          ? target.author.name
          : null,
    };

    if (parent) {
      parent.replies = [
        ...(parent.replies ?? []),
        comment,
      ];

      this.expanded.add(parent.id);
      this.cancelReply();
    } else {
      this._comments.unshift(comment);
      this.view.unshift(comment);

      this.paged = this.view.slice(0, this.shown);
    }

    this.commentAdded.emit({
      comment,
      parentId: parent?.id ?? null,
      file: draft.file,
    });

    // The preview URL is now attached to the comment.
    this.drafts[key] = emptyDraft();

    this.emojiFor = null;
    textarea.style.height = '';

    setTimeout(() => {
      comment.isNew = false;
    }, 2000);
  }

  onFile(key: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    input.value = '';

    if (!file) {
      return;
    }

    const draft = this.getDraft(key);

    if (!file.type.startsWith('image/')) {
      draft.error = 'Please choose an image file.';
      return;
    }

    if (file.size > this.maxImageMB * 1024 * 1024) {
      draft.error =
        `Image must be smaller than ${this.maxImageMB} MB.`;
      return;
    }

    this.clearImage(key);

    draft.file = file;
    draft.preview = URL.createObjectURL(file);
    draft.error = null;
  }

  clearImage(key: string): void {
    const draft = this.getDraft(key);

    if (draft.preview) {
      URL.revokeObjectURL(draft.preview);
    }

    draft.file = null;
    draft.preview = null;
  }

  toggleEmoji(key: string, event: Event): void {
    event.stopPropagation();

    this.pickerFor = null;
    this.menuFor = null;

    this.emojiFor =
      this.emojiFor === key ? null : key;
  }

  insertEmoji(
    key: string,
    emoji: string,
    textarea: HTMLTextAreaElement,
  ): void {
    const start =
      textarea.selectionStart ?? textarea.value.length;

    const end =
      textarea.selectionEnd ?? textarea.value.length;

    if (
      textarea.value.length + emoji.length >
      this.maxLength
    ) {
      return;
    }

    textarea.setRangeText(
      emoji,
      start,
      end,
      'end',
    );

    this.getDraft(key).text = textarea.value;

    this.autosize(textarea);
    textarea.focus();
  }

  /* =======================================================
     GLOBAL LISTENERS
  ======================================================= */

  @HostListener('document:click', ['$event'])
  onDocClick(event: Event): void {
    const target = event.target as HTMLElement | null;

    if (target?.closest?.('[data-popover]')) {
      return;
    }

    this.closePopovers();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.closePopovers();
  }

  private closePopovers(): void {
    this.pickerFor = null;
    this.menuFor = null;
    this.emojiFor = null;
  }

  /* =======================================================
     HELPERS
  ======================================================= */

  autosize(element: HTMLTextAreaElement): void {
    element.style.height = 'auto';

    element.style.height =
      Math.min(element.scrollHeight, 160) + 'px';
  }

  private focusKey(key: string): void {
    const element =
      this.host.nativeElement.querySelector<HTMLTextAreaElement>(
        `textarea[data-key="${key}"]`,
      );

    element?.focus();
  }

  private showToast(message: string): void {
    this.toast = message;

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toastTimer = setTimeout(() => {
      this.toast = null;
    }, 2400);
  }

  private releaseImages(comment: CommentModel): void {
    if (comment.image?.startsWith('blob:')) {
      URL.revokeObjectURL(comment.image);
    }

    comment.replies?.forEach((reply) =>
      this.releaseImages(reply),
    );
  }

  private uid(): string {
    return (
      'c' +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 7)
    );
  }
}
