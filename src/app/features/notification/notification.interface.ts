/* =========================================================
   NOTIFICATION TYPES
========================================================= */

export type NotificationFilter = 'all' | 'unread';

export type NotificationType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'mention'
  | 'share';

/* =========================================================
   API ACTOR
   Person who triggered the notification
========================================================= */

export interface NotificationActor {
  _id?: string;
  id?: string;

  name?: string;
  username?: string;

  photo?: string;
  profilePhoto?: string;
  avatar?: string;
}

/* =========================================================
   API COMMENT
========================================================= */

export interface NotificationComment {
  _id?: string;
  id?: string;

  content?: string;

  commentCreator?: NotificationActor;

  post?: string;

  parentComment?: string | null;

  createdAt?: string;
}

/* =========================================================
   API POST / ENTITY
========================================================= */

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

/* =========================================================
   API NOTIFICATION
========================================================= */

export interface Notification {
  _id?: string;
  id?: string;
  notificationId?: string;

  /* Notification type:
     like_post
     comment_post
     share_post
     follow_user
     mention_post
  */
  type?: string;

  message?: string;
  text?: string;
  body?: string;

  /* Read status */
  isRead?: boolean | number | string;
  read?: boolean | number | string;

  /* Dates */
  createdAt?: string;
  updatedAt?: string;
  readAt?: string;

  /* Users */
  actor?: NotificationActor | unknown;
  recipient?: NotificationActor | unknown;
  sender?: NotificationActor | unknown;
  user?: NotificationActor | unknown;
  createdBy?: NotificationActor | unknown;
  from?: NotificationActor | unknown;

  /* Related entity */
  entityType?: string;
  entityId?: string;

  entity?: NotificationEntity | unknown;

  /* Alternative API fields */
  post?: NotificationEntity | unknown;
  target?: string;

  [key: string]: unknown;
}

/* =========================================================
   NORMALIZED NOTIFICATION ITEM
   Data used inside Angular components
========================================================= */

export interface NotificationItem {
  /* Notification ID */
  id: string;

  /* Normalized notification type */
  type: NotificationType;

  /* Actor information */
  actor: string;
  actorId?: string;

  username: string;
  avatar: string;

  /* Display text */
  message: string;
  target?: string;

  /* Related post/comment/user */
  entityType?: string;
  entityId?: string;
  commentId?: string;

  /* Post availability */
  unavailable?: boolean;

  /* Notification status */
  createdAt: Date;
  isRead: boolean;
}

/* =========================================================
   PAGINATION
========================================================= */

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

  /* Actual API structure */
  pagination?: NotificationsPagination;

  feedMode?: string;
}

/* =========================================================
   NOTIFICATIONS LIST RESPONSE
========================================================= */

export interface NotificationsListResponse {
  notifications?: Notification[];
  meta?: NotificationsMeta;
}

/* =========================================================
   UNREAD COUNT RESPONSE
========================================================= */

export interface UnreadCountResponse {
  unreadCount?: number;
}

/* =========================================================
   GENERIC API RESPONSE
========================================================= */

export interface ApiResponse<T> {
  success?: boolean;
  message?: string;
  data?: T;
}

/* =========================================================
   HELPER: SAFE OBJECT
========================================================= */

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

/* =========================================================
   HELPER: SAFE STRING
========================================================= */

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

/* =========================================================
   NORMALIZE NOTIFICATION TYPE
========================================================= */

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

/* =========================================================
   DEFAULT NOTIFICATION MESSAGE
   Used when API does not return message
========================================================= */

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

/* =========================================================
   NORMALIZE READ STATUS
========================================================= */

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

/* =========================================================
   CONVERT API NOTIFICATION TO UI MODEL
========================================================= */

export function toNotificationItem(
  notification: Notification,
): NotificationItem {
  /* -------------------------
     ACTOR
  ------------------------- */

  const actor = asRecord(
    notification.actor ??
    notification.sender ??
    notification.user ??
    notification.createdBy ??
    notification.from,
  );

  /* -------------------------
     ENTITY / POST
  ------------------------- */

  const entity = asRecord(notification.entity);

  const post = asRecord(
    notification.post ?? notification.entity,
  );

  /* -------------------------
     TOP COMMENT
  ------------------------- */

  const topComment = asRecord(
    entity['topComment'],
  );

  /* -------------------------
     NOTIFICATION ID
  ------------------------- */

  const id = getString(
    notification._id ??
    notification.id ??
    notification.notificationId,
  );

  /* -------------------------
     ACTOR NAME
  ------------------------- */

  const actorName = getString(
    actor['name'] ??
    actor['fullName'] ??
    notification['actorName'] ??
    notification['userName'],
    'Route Posts User',
  );

  /* -------------------------
     ACTOR ID
  ------------------------- */

  const actorId = getString(
    actor['_id'] ??
    actor['id'],
  );

  /* -------------------------
     USERNAME
  ------------------------- */

  const username = getString(
    actor['username'] ??
    notification['username'],
  );

  /* -------------------------
     AVATAR
  ------------------------- */

  const avatar = getString(
    actor['photo'] ??
    actor['profilePhoto'] ??
    actor['avatar'],
    '/assets/default-profile.png',
  );

  /* -------------------------
     NOTIFICATION TYPE
  ------------------------- */

  const type = normalizeType(
    notification.type,
  );

  /* -------------------------
     MESSAGE
  ------------------------- */

  const message = getString(
    notification.message ??
    notification.text,
    getDefaultMessage(type),
  );

  /* -------------------------
     RELATED ENTITY TYPE
  ------------------------- */

  const entityType = getString(
    notification.entityType,
  );

  /* -------------------------
     RELATED ENTITY ID
  ------------------------- */

  const entityId = getString(
    notification.entityId ??
    entity['_id'] ??
    entity['id'],
  );

  /* -------------------------
     COMMENT ID
  ------------------------- */

  const commentId = getString(
    topComment['_id'] ??
    topComment['id'],
  );

  /* -------------------------
     POST / COMMENT TARGET
  ------------------------- */

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

  /* -------------------------
     POST AVAILABILITY
  ------------------------- */

  const unavailable =
    entity['unavailable'] === true;

  /* -------------------------
     DATE
  ------------------------- */

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

  /* -------------------------
     READ STATUS
  ------------------------- */

  const readValue =
    notification.isRead ??
    notification.read;

  const isRead = normalizeReadStatus(
    readValue,
  );

  /* -------------------------
     RETURN NORMALIZED ITEM
  ------------------------- */

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
