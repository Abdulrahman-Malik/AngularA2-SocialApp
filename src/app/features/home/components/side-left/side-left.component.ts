import { Component } from '@angular/core';

@Component({
  selector: 'app-side-left',
  imports: [],
  templateUrl: './side-left.component.html',
  styleUrl: './side-left.component.css',
})
export class SideLeftComponent {
  showProfileMenu = false;

toggleProfileMenu(): void {
  this.showProfileMenu = !this.showProfileMenu;
}

closeProfileMenu(): void {
  this.showProfileMenu = false;
}
}
