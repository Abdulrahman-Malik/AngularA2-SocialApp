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

/* ------------------------------------------------------------------ */
/*  Models                                                             */
/* ------------------------------------------------------------------ */
export type ReactionKey = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry';

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
  /** Name of the person this reply answers (only for replies to a reply). */
  replyTo?: string | null;
  reactions?: Partial<Record<ReactionKey, number>>;
  myReaction?: ReactionKey | null;
  replies?: CommentModel[];
  /** UI-only: highlights a just-posted comment. */
  isNew?: boolean;
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

const emptyDraft = (): Draft => ({ text: '', file: null, preview: null, error: null });

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
@Component({
  selector: 'app-comment',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './comment.component.html',
  styleUrls: ['./comment.component.css'],
})
export class CommentComponent implements OnInit, OnDestroy {
  /* ---------- Inputs / Outputs ---------- */
  @Input() set comments(value: CommentModel[] | null | undefined) {
    this._comments = value ? [...value] : [];
    this._comments.forEach((c) => this.normalize(c));
    this.shown = this.pageSize;
    this.refresh();
  }
  @Input() currentUser: CommentUser = { id: 'me', name: 'You', avatar: '' };
  @Input() maxLength = 1000;
  @Input() maxImageMB = 5;
  @Input() pageSize = 5;

  /** Emitted when the user posts a comment/reply. `file` is the attached image (upload it yourself). */
  @Output() commentAdded = new EventEmitter<{ comment: CommentModel; parentId: string | null; file: File | null }>();
  @Output() commentEdited = new EventEmitter<{ id: string; text: string }>();
  @Output() commentDeleted = new EventEmitter<{ id: string; parentId: string | null }>();
  @Output() reacted = new EventEmitter<{ id: string; reaction: ReactionKey | null }>();
  @Output() reported = new EventEmitter<{ id: string }>();
  @Output() profileOpened = new EventEmitter<CommentUser>();

  /* ---------- Static data ---------- */
  readonly reactions: Reaction[] = [
    { key: 'like', emoji: '👍', label: 'Like', color: '#0866ff' },
    { key: 'love', emoji: '❤️', label: 'Love', color: '#f33e58' },
    { key: 'haha', emoji: '😂', label: 'Haha', color: '#d99a00' },
    { key: 'wow', emoji: '😮', label: 'Wow', color: '#d99a00' },
    { key: 'sad', emoji: '😢', label: 'Sad', color: '#d99a00' },
    { key: 'angry', emoji: '😡', label: 'Angry', color: '#e9710f' },
  ];
  readonly emojis = ['😀', '😂', '😍', '🥰', '😎', '🤔', '😢', '😡', '👍', '👏', '🙏', '🔥', '🎉', '❤️', '💯', '✨', '👀', '😅', '🤝', '💪', '🙌', '😭', '🤩', '😴'];

  /* ---------- State ---------- */
  sort: 'top' | 'newest' = 'top';
  view: CommentModel[] = [];
  paged: CommentModel[] = [];
  shown = 5;

  drafts: Record<string, Draft> = {};
  expanded = new Set<string>(); // threads showing all replies
  fullText = new Set<string>(); // long comments expanded

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
    typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

  constructor(private host: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    // Re-render every 30s so "6s", "2m" labels stay fresh.
    this.tick = setInterval(() => {}, 30000);
    this.shown = this.pageSize;
    this.refresh();
  }

  ngOnDestroy(): void {
    if (this.tick) clearInterval(this.tick);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    Object.values(this.drafts).forEach((d) => d.preview && URL.revokeObjectURL(d.preview));
  }

  /* ------------------------------------------------------------------ */
  /*  Derived data                                                       */
  /* ------------------------------------------------------------------ */
  trackById = (_: number, c: CommentModel) => c.id;

  get totalCount(): number {
    return this._comments.reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0);
  }

  reactionTotal(c: CommentModel): number {
    return Object.values((c.reactions ?? {}) as Record<string, number>).reduce((a, b) => a + (b || 0), 0);
  }

  /** Up to 3 most-used reaction emojis, as one string (e.g. "❤️👍"). */
  reactionEmojis(c: CommentModel): string {
    const counts = (c.reactions ?? {}) as Record<string, number>;
    return this.reactions
      .filter((r) => (counts[r.key] || 0) > 0)
      .sort((a, b) => (counts[b.key] || 0) - (counts[a.key] || 0))
      .slice(0, 3)
      .map((r) => r.emoji)
      .join('');
  }

  reactionOf(key: ReactionKey | null | undefined): Reaction | undefined {
    return this.reactions.find((r) => r.key === key);
  }

  isOwn(c: CommentModel): boolean {
    return c.author.id === this.currentUser.id;
  }

  isLong(c: CommentModel): boolean {
    return (c.text?.length ?? 0) > 280 || (c.text?.split('\n').length ?? 0) > 6;
  }

  replyLimit(c: CommentModel): number {
    return this.expanded.has(c.id) ? Number.MAX_SAFE_INTEGER : 1;
  }

  getReplyTarget(c: CommentModel): CommentModel {
    if (this.replyingId === c.id) return c;
    return c.replies?.find((r) => r.id === this.replyingId) ?? c;
  }

  initials(name: string): string {
    return (name || '?')
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('');
  }

  iso(d: Date | string | number): string {
    return new Date(d).toISOString();
  }

  timeAgo(d: Date | string | number): string {
    const diff = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
    if (diff < 5) return 'Just now';
    if (diff < 60) return `${diff}s`;
    const m = Math.floor(diff / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const days = Math.floor(h / 24);
    if (days < 7) return `${days}d`;
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: days > 300 ? 'numeric' : undefined });
  }

  /* ------------------------------------------------------------------ */
  /*  Sorting / paging                                                   */
  /* ------------------------------------------------------------------ */
  setSort(s: 'top' | 'newest'): void {
    if (this.sort === s) return;
    this.sort = s;
    this.shown = this.pageSize;
    this.refresh();
  }

  showMore(): void {
    this.shown += this.pageSize;
    this.paged = this.view.slice(0, this.shown);
  }

  private score(c: CommentModel): number {
    return this.reactionTotal(c) + (c.replies?.length ?? 0) * 0.5;
  }

  private refresh(): void {
    const time = (c: CommentModel) => new Date(c.createdAt).getTime();
    const list = [...this._comments];
    list.sort(
      this.sort === 'newest'
        ? (a, b) => time(b) - time(a)
        : (a, b) => this.score(b) - this.score(a) || time(b) - time(a)
    );
    this.view = list;
    this.paged = list.slice(0, this.shown);
  }

  private normalize(c: CommentModel): void {
    c.reactions ??= {};
    c.replies ??= [];
    c.myReaction ??= null;
    c.replies.forEach((r) => this.normalize(r));
  }

  /* ------------------------------------------------------------------ */
  /*  Reactions                                                          */
  /* ------------------------------------------------------------------ */
  react(c: CommentModel, key: ReactionKey): void {
    c.reactions ??= {};
    const prev = c.myReaction ?? null;
    if (prev) c.reactions[prev] = Math.max(0, (c.reactions[prev] ?? 0) - 1);
    const next = prev === key ? null : key;
    if (next) c.reactions[next] = (c.reactions[next] ?? 0) + 1;
    c.myReaction = next;
    this.pickerFor = null;
    this.reacted.emit({ id: c.id, reaction: next });
  }

  onLikeDown(e: PointerEvent, c: CommentModel): void {
    if (e.pointerType === 'mouse') return;
    this.cancelPress();
    this.pressTimer = setTimeout(() => {
      this.longPressed = true;
      this.menuFor = null;
      this.emojiFor = null;
      this.pickerFor = c.id;
    }, 380);
  }

  onLikeUp(): void {
    this.cancelPress();
  }

  onLikeClick(c: CommentModel): void {
    if (this.longPressed) {
      this.longPressed = false;
      return;
    }
    this.react(c, c.myReaction ?? 'like');
  }

  private cancelPress(): void {
    if (this.pressTimer) clearTimeout(this.pressTimer);
    this.pressTimer = null;
  }

  /* ------------------------------------------------------------------ */
  /*  Menu: edit / delete / copy / report                                */
  /* ------------------------------------------------------------------ */
  toggleMenu(c: CommentModel, ev: Event): void {
    ev.stopPropagation();
    this.pickerFor = null;
    this.emojiFor = null;
    this.menuFor = this.menuFor === c.id ? null : c.id;
  }

  startEdit(c: CommentModel): void {
    this.menuFor = null;
    this.confirmDeleteId = null;
    this.editingId = c.id;
    this.editText = c.text;
    setTimeout(() => {
      const el = document.getElementById('edit-' + c.id) as HTMLTextAreaElement | null;
      if (el) {
        this.autosize(el);
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }

  onEditInput(ev: Event): void {
    const el = ev.target as HTMLTextAreaElement;
    this.editText = el.value;
    this.autosize(el);
  }

  onEditEnter(ev: Event, c: CommentModel): void {
    const k = ev as KeyboardEvent;
    if (k.shiftKey || k.isComposing || !this.enterToSend) return;
    k.preventDefault();
    this.saveEdit(c);
  }

  saveEdit(c: CommentModel): void {
    const text = this.editText.trim();
    if (!text) return;
    if (text === c.text) return this.cancelEdit();
    c.text = text;
    c.editedAt = new Date();
    this.editingId = null;
    this.commentEdited.emit({ id: c.id, text });
  }

  cancelEdit(): void {
    this.editingId = null;
  }

  askDelete(c: CommentModel): void {
    this.menuFor = null;
    this.confirmDeleteId = c.id;
  }

  confirmDelete(c: CommentModel, parent: CommentModel | null): void {
    if (parent) {
      parent.replies = (parent.replies ?? []).filter((r) => r.id !== c.id);
    } else {
      this._comments = this._comments.filter((x) => x.id !== c.id);
      this.view = this.view.filter((x) => x.id !== c.id);
      this.paged = this.view.slice(0, this.shown);
    }
    this.releaseImages(c);
    this.confirmDeleteId = null;
    if (this.replyingParentId === c.id || this.replyingId === c.id) this.cancelReply();
    this.commentDeleted.emit({ id: c.id, parentId: parent?.id ?? null });
    this.showToast('Comment deleted');
  }

  copy(c: CommentModel): void {
    this.menuFor = null;
    if (!navigator.clipboard) return this.showToast('Copy is not supported in this browser');
    navigator.clipboard.writeText(c.text).then(
      () => this.showToast('Copied to clipboard'),
      () => this.showToast('Could not copy')
    );
  }

  report(c: CommentModel): void {
    this.menuFor = null;
    this.reported.emit({ id: c.id });
    this.showToast('Thanks, we received your report');
  }

  /* ------------------------------------------------------------------ */
  /*  Replies / threads                                                  */
  /* ------------------------------------------------------------------ */
  openReply(target: CommentModel, parent: CommentModel | null): void {
    const root = parent ?? target;
    this.replyingId = target.id;
    this.replyingParentId = root.id;
    this.expanded.add(root.id);
    this.menuFor = null;
    setTimeout(() => this.focusKey('reply:' + root.id));
  }

  cancelReply(): void {
    this.replyingId = null;
    this.replyingParentId = null;
  }

  toggleReplies(c: CommentModel): void {
    this.expanded.has(c.id) ? this.expanded.delete(c.id) : this.expanded.add(c.id);
  }

  toggleText(c: CommentModel): void {
    this.fullText.has(c.id) ? this.fullText.delete(c.id) : this.fullText.add(c.id);
  }

  /* ------------------------------------------------------------------ */
  /*  Composer                                                           */
  /* ------------------------------------------------------------------ */
  getDraft(key: string): Draft {
    return (this.drafts[key] ??= emptyDraft());
  }

  canSend(d: Draft): boolean {
    return !!d.text.trim() || !!d.file;
  }

  onInput(key: string, ta: HTMLTextAreaElement): void {
    this.getDraft(key).text = ta.value;
    this.autosize(ta);
  }

  onEnter(ev: Event, key: string, ta: HTMLTextAreaElement, parent: CommentModel | null, target: CommentModel | null): void {
    const k = ev as KeyboardEvent;
    if (k.shiftKey || k.isComposing || !this.enterToSend) return;
    k.preventDefault();
    this.send(key, ta, parent, target);
  }

  send(key: string, ta: HTMLTextAreaElement, parent?: CommentModel | null, target?: CommentModel | null): void {
    const d = this.getDraft(key);
    const text = d.text.trim();
    if (!text && !d.file) return;

    const comment: CommentModel = {
      id: this.uid(),
      author: this.currentUser,
      text,
      image: d.preview,
      createdAt: new Date(),
      reactions: {},
      myReaction: null,
      replies: [],
      isNew: true,
      replyTo: parent && target && target.id !== parent.id ? target.author.name : null,
    };

    if (parent) {
      parent.replies = [...(parent.replies ?? []), comment];
      this.expanded.add(parent.id);
      this.cancelReply();
    } else {
      this._comments.unshift(comment);
      this.view.unshift(comment);
      this.paged = this.view.slice(0, this.shown);
    }

    this.commentAdded.emit({ comment, parentId: parent?.id ?? null, file: d.file });
    this.drafts[key] = emptyDraft(); // the preview URL now belongs to the comment
    this.emojiFor = null;
    ta.style.height = '';
    setTimeout(() => (comment.isNew = false), 2000);
  }

  onFile(key: string, ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const d = this.getDraft(key);
    if (!file.type.startsWith('image/')) {
      d.error = 'Please choose an image file.';
      return;
    }
    if (file.size > this.maxImageMB * 1024 * 1024) {
      d.error = `Image must be smaller than ${this.maxImageMB} MB.`;
      return;
    }
    this.clearImage(key);
    d.file = file;
    d.preview = URL.createObjectURL(file);
    d.error = null;
  }

  clearImage(key: string): void {
    const d = this.getDraft(key);
    if (d.preview) URL.revokeObjectURL(d.preview);
    d.file = null;
    d.preview = null;
  }

  toggleEmoji(key: string, ev: Event): void {
    ev.stopPropagation();
    this.pickerFor = null;
    this.menuFor = null;
    this.emojiFor = this.emojiFor === key ? null : key;
  }

  insertEmoji(key: string, emoji: string, ta: HTMLTextAreaElement): void {
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    if (ta.value.length + emoji.length > this.maxLength) return;
    ta.setRangeText(emoji, start, end, 'end');
    this.getDraft(key).text = ta.value;
    this.autosize(ta);
    ta.focus();
  }

  /* ------------------------------------------------------------------ */
  /*  Global listeners                                                   */
  /* ------------------------------------------------------------------ */
  @HostListener('document:click', ['$event'])
  onDocClick(e: Event): void {
    if ((e.target as HTMLElement)?.closest?.('[data-popover]')) return;
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

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                            */
  /* ------------------------------------------------------------------ */
  autosize(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }

  private focusKey(key: string): void {
    const el = this.host.nativeElement.querySelector<HTMLTextAreaElement>(`textarea[data-key="${key}"]`);
    el?.focus();
  }

  private showToast(msg: string): void {
    this.toast = msg;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), 2400);
  }

  private releaseImages(c: CommentModel): void {
    if (c.image?.startsWith('blob:')) URL.revokeObjectURL(c.image);
    c.replies?.forEach((r) => this.releaseImages(r));
  }

  private uid(): string {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
}