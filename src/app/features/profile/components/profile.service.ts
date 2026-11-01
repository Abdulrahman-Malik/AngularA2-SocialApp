import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';

export interface UserProfile {
  _id?: string;
  id?: string;
  name: string;
  username: string;
  photo: string;
  cover: string;
  bio: string;
  [key: string]: unknown;
}

@Injectable({
  providedIn: 'root',
})
export class ProfileService {
  private readonly http = inject(HttpClient);

  /**
   * TODO: use the same base URL your PostsService uses
   * (e.g. environment.apiUrl). Auth headers are expected to be added
   * by your HTTP interceptor, same as for the other post requests.
   */
  private readonly baseUrl = 'https://route-posts.routemisr.com';

  readonly defaultAvatar = '/assets/default-profile.png';

  private readonly profile = signal<UserProfile>({
    name: 'My Account',
    username: '',
    photo: this.defaultAvatar,
    cover: '',
    bio: '',
  });

  readonly user = this.profile;

  readonly id = computed(() =>
    String(this.profile()._id ?? this.profile().id ?? ''),
  );

  readonly name = computed(() => this.profile().name);
  readonly username = computed(() => this.profile().username);
  readonly photo = computed(() => this.profile().photo);
  readonly cover = computed(() => this.profile().cover);
  readonly bio = computed(() => this.profile().bio);

  /* ---------- profile storage ---------- */

  loadFromStorage(): void {
    try {
      const savedUser = localStorage.getItem('user');

      if (!savedUser) return;

      const parsed: unknown = JSON.parse(savedUser);

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return;
      }

      const root = parsed as Record<string, unknown>;
      const data = this.asRecord(root['data']);

      const candidate =
        this.asRecord(root['user']) ??
        this.asRecord(data?.['user']) ??
        data ??
        root;

      this.profile.update((current) => ({
        ...current,
        ...candidate,
        name: String(candidate['name'] ?? current.name),
        username: String(candidate['username'] ?? current.username),
        photo: String(
          candidate['photo'] ??
          candidate['profilePhoto'] ??
          candidate['avatar'] ??
          current.photo,
        ),
        cover: String(candidate['cover'] ?? current.cover),
        bio: String(candidate['bio'] ?? current.bio),
      }));
    } catch (error) {
      console.error('Unable to load profile:', error);
    }
  }

  updateUser(patch: Partial<UserProfile>): void {
    this.profile.update((current) => ({
      ...current,
      ...patch,
    }));

    try {
      const updatedUser = this.profile();
      const savedUser = localStorage.getItem('user');

      if (!savedUser) {
        localStorage.setItem('user', JSON.stringify(updatedUser));
        return;
      }

      const parsed: unknown = JSON.parse(savedUser);

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        localStorage.setItem('user', JSON.stringify(updatedUser));
        return;
      }

      const root = parsed as Record<string, unknown>;
      const data = this.asRecord(root['data']);

      let updatedStorage: Record<string, unknown>;

      if (this.asRecord(root['user'])) {
        updatedStorage = {
          ...root,
          user: { ...this.asRecord(root['user']), ...updatedUser },
        };
      } else if (data && this.asRecord(data['user'])) {
        updatedStorage = {
          ...root,
          data: {
            ...data,
            user: { ...this.asRecord(data['user']), ...updatedUser },
          },
        };
      } else if (data) {
        updatedStorage = {
          ...root,
          data: { ...data, ...updatedUser },
        };
      } else {
        updatedStorage = { ...root, ...updatedUser };
      }

      localStorage.setItem('user', JSON.stringify(updatedStorage));
    } catch (error) {
      console.error('Unable to save profile:', error);
      throw error;
    }
  }

  /* ---------- post engagement (likes / comments) ---------- */

  toggleLike(postId: string): Observable<unknown> {
    return this.http.put<unknown>(`${this.baseUrl}/posts/${postId}/like`, {});
  }

  getComments(postId: string): Observable<unknown> {
    return this.http.get<unknown>(`${this.baseUrl}/posts/${postId}/comments`);
  }

  addComment(postId: string, content: string): Observable<unknown> {
    return this.http.post<unknown>(`${this.baseUrl}/posts/${postId}/comments`, { content });
  }

  /* ---------- helpers ---------- */

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return null;
  }
}
