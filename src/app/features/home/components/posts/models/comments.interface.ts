interface Comments {
  _id: string;
  content: string;
  commentCreator: CommentCreator;
  post: string;
  parentComment: null;
  likes: string[];
  createdAt: string;
  repliesCount: number;
}

interface CommentCreator {
  _id: string;
  name: string;
  username: string;
  photo: string;
}
export type { CommentCreator } from './post.interface';

export interface PostComment {
  _id: string;
  content: string;
  commentCreator: CommentCreator;
  post: string;
  parentComment: string | null;
  likes: unknown[];
  createdAt: string;
  repliesCount: number;
  image?: string | null;
}

export interface CommentsResponse {
  success?: boolean;
  message?: string;

  data?: {
    comments?: PostComment[];
  };
}