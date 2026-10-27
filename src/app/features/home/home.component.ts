import { Component } from '@angular/core';
import { SideLeftComponent } from './components/side-left/side-left.component';
import { SideRightComponent } from './components/side-right/side-right.component';
import { PostsComponent } from './components/posts/posts.component';

@Component({
  selector: 'app-home',
  imports: [SideLeftComponent,SideRightComponent,PostsComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {}
