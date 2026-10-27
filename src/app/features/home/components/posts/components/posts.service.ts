import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class PostsService {
  private readonly httpClient = inject(HttpClient);

  // دالة مساعدة لإنشاء الهيدرز وضمان وجود مسافة بعد كلمة Bearer وجلب التوكن الحقيقي
  private getHeaders() {
    const token = localStorage.getItem('token');
    return {
      headers: new HttpHeaders({
        'Authorization': `Bearer ${token}`
      })
    };
  }

  getAllposts(): Observable<any> {
    // تم إضافة الشرطة المائلة / بوضوح لضمان سلامة الرابط
    return this.httpClient.get(`${environment.baseUrl}/posts`, this.getHeaders());
  }

  getSinglePosts(postId: string): Observable<any> {
    return this.httpClient.get(`${environment.baseUrl}/posts/${postId}`, this.getHeaders());
  }

  deletePosts(postId: string): Observable<any> {
    return this.httpClient.delete(`${environment.baseUrl}/posts/${postId}`, this.getHeaders());
  }

  createPosts(data: object): Observable<any> {
    return this.httpClient.post(`${environment.baseUrl}/posts`, data, this.getHeaders());
  }
}
