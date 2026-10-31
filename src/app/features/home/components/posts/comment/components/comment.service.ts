import {
  HttpClient,
  HttpHeaders,
  HttpParams,
} from '@angular/common/http';

import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { CommentsResponse } from '../../models/comments.interface';
import { environment } from '../../../../../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class CommentService {
  private readonly httpClient = inject(HttpClient);

  // Use the existing environment configuration.
  private readonly baseUrl = environment.baseUrl.endsWith('/')
    ? environment.baseUrl
    : `${environment.baseUrl}/`;

  // Authorization headers
  private get headers(): HttpHeaders {
    const token =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('token')
        : null;

    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set(
        'Authorization',
        `Bearer ${token}`,
      );
    }

    return headers;
  }

  // =====================================================
  // GET ALL COMMENTS
  // =====================================================

 getAllcommets(
  postId: string,
  limit: number = 10
): Observable<CommentsResponse> {
  const params = new HttpParams()
    .set('page', 1)
    .set('limit', limit);

  return this.httpClient.get<CommentsResponse>(
    `${this.baseUrl}posts/${postId}/comments`,
    {
      headers: this.headers,
      params,
    }
  );
}

  // =====================================================
  // CREATE COMMENT
  // =====================================================

  createComment(
    postId: string,
    content: string,
    image?: File | null
  ): Observable<unknown> {

    const formData = new FormData();

    // Comment content
    formData.append('content', content.trim());

    // Optional comment image
    if (image) {
      formData.append('image', image, image.name);
    }

    return this.httpClient.post<unknown>(
      `${this.baseUrl}posts/${encodeURIComponent(postId)}/comments`,
      formData,
      {
        headers: this.headers,
      }
    );
  }

}
