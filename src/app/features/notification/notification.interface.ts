export type NotificationFilter = 'all' | 'unread';

export type NotificationType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'mention'
  | 'share';

export interface NotificationActor {
  _id?: string;
  id?: string;
  name?: string;
  username?: string;
  photo?: string;
  profilePhoto?: string;
  avatar?: string;
}

export interface NotificationComment {
  _id?: string;
  id?: string;
  content?: string;
  commentCreator?: NotificationActor;
  post?: string;
  parentComment?: string | null;
  createdAt?: string;
}

export interface NotificationEntity {
  _id?: string;
  id?: string;
  body?: string;
  content?: string;
  image?: string;
  user?: string | NotificationActor;
  commentsCount?: number;
  likesCount?: number;
  sharesCount?: number;
  isShare?: boolean;
  topComment?: NotificationComment | null;
  unavailable?: boolean;
}

export interface Notification {
  _id?: string;
  id?: string;
  notificationId?: string;
  type?: string;
  message?: string;
  text?: string;
  body?: string;
  isRead?: boolean | number | string;
  read?: boolean | number | string;
  createdAt?: string;
  updatedAt?: string;
  readAt?: string;
  actor?: NotificationActor | unknown;
  recipient?: NotificationActor | unknown;
  sender?: NotificationActor | unknown;
  user?: NotificationActor | unknown;
  createdBy?: NotificationActor | unknown;
  from?: NotificationActor | unknown;
  entityType?: string;
  entityId?: string;
  entity?: NotificationEntity | unknown;
  post?: NotificationEntity | unknown;
  target?: string;
  [key: string]: unknown;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  actor: string;
  actorId?: string;
  username: string;
  avatar: string;
  message: string;
  target?: string;
  entityType?: string;
  entityId?: string;
  commentId?: string;
  unavailable?: boolean;
  createdAt: Date;
  isRead: boolean;
}

export interface NotificationsPagination {
  currentPage?: number;
  limit?: number;
  total?: number;
  numberOfPages?: number;
  nextPage?: number | null;
}

export interface NotificationsMeta {
  currentPage?: number;
  numberOfPages?: number;
  totalPages?: number;
  totalItems?: number;
  pagination?: NotificationsPagination;
  feedMode?: string;
}

export interface NotificationsListResponse {
  notifications?: Notification[];
  meta?: NotificationsMeta;
}

export interface UnreadCountResponse {
  unreadCount?: number;
}

export interface ApiResponse<T> {
  success?: boolean;
  message?: string;
  data?: T;
}

function asRecord(
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

function getString(
  value: unknown,
  fallback = '',
): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return fallback;
}

function normalizeType(
  value: unknown,
): NotificationType {
  const type = String(value ?? '').toLowerCase();

  if (
    type.includes('like') ||
    type.includes('react')
  ) {
    return 'like';
  }

  if (
    type.includes('comment') ||
    type.includes('reply')
  ) {
    return 'comment';
  }

  if (type.includes('follow')) {
    return 'follow';
  }

  if (type.includes('share')) {
    return 'share';
  }

  if (type.includes('mention')) {
    return 'mention';
  }

  return 'mention';
}

function getDefaultMessage(
  type: NotificationType,
): string {
  switch (type) {
    case 'like':
      return 'liked your post.';

    case 'comment':
      return 'commented on your post.';

    case 'follow':
      return 'started following you.';

    case 'share':
      return 'shared your post.';

    case 'mention':
      return 'mentioned you.';

    default:
      return 'interacted with you.';
  }
}

function normalizeReadStatus(
  value: unknown,
): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase();

    return (
      normalizedValue === 'true' ||
      normalizedValue === '1' ||
      normalizedValue === 'read'
    );
  }

  return false;
}

export function toNotificationItem(
  notification: Notification,
): NotificationItem {
  const actor = asRecord(
    notification.actor ??
    notification.sender ??
    notification.user ??
    notification.createdBy ??
    notification.from,
  );

  const entity = asRecord(notification.entity);

  const post = asRecord(
    notification.post ?? notification.entity,
  );

  const topComment = asRecord(
    entity['topComment'],
  );

  const id = getString(
    notification._id ??
    notification.id ??
    notification.notificationId,
  );

  const actorName = getString(
    actor['name'] ??
    actor['fullName'] ??
    notification['actorName'] ??
    notification['userName'],
    'Route Posts User',
  );

  const actorId = getString(
    actor['_id'] ??
    actor['id'],
  );

  const username = getString(
    actor['username'] ??
    notification['username'],
  );

  const avatar = getString(
    actor['photo'] ??
    actor['profilePhoto'] ??
    actor['avatar'],
    '/assets/default-profile.png',
  );

  const type = normalizeType(
    notification.type,
  );

  const message = getString(
    notification.message ??
    notification.text,
    getDefaultMessage(type),
  );

  const entityType = getString(
    notification.entityType,
  );

  const entityId = getString(
    notification.entityId ??
    entity['_id'] ??
    entity['id'],
  );

  const commentId = getString(
    topComment['_id'] ??
    topComment['id'],
  );

  const target =
    type === 'comment'
      ? getString(
          topComment['content'] ??
          notification.target,
        )
      : getString(
          notification.target ??
          post['body'] ??
          post['content'],
        );

  const unavailable =
    entity['unavailable'] === true;

  const dateValue =
    notification.createdAt ??
    notification.updatedAt;

  const parsedDate = dateValue
    ? new Date(dateValue)
    : new Date();

  const createdAt =
    Number.isNaN(parsedDate.getTime())
      ? new Date()
      : parsedDate;

  const readValue =
    notification.isRead ??
    notification.read;

  const isRead = normalizeReadStatus(
    readValue,
  );

  return {
    id,
    type,
    actor: actorName,
    actorId,
    username,
    avatar,
    message,
    target: target || undefined,
    entityType: entityType || undefined,
    entityId: entityId || undefined,
    commentId: commentId || undefined,
    unavailable,
    createdAt,
    isRead,
  };
}
