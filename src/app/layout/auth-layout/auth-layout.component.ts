import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive], // ← تم تضمينهم هنا لحل الخطأ نهائياً
  templateUrl: './auth-layout.component.html',
  styleUrls: ['./auth-layout.component.css']
})
export class AuthLayoutComponent implements OnInit {
  @ViewChild('starfieldCanvas', { static: true }) starfieldCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('stageContainer', { static: false }) stageContainer!: ElementRef<HTMLElement>;

  ngOnInit(): void {
    this.initStarfield();
  }

  // تأثير 7D Holographic Tilt + Dynamic Spotlight Glare
  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    const { clientX, clientY } = event;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    const rotateX = ((clientY - centerY) / centerY) * -12;
    const rotateY = ((clientX - centerX) / centerX) * 12;

    if (this.stageContainer?.nativeElement) {
      this.stageContainer.nativeElement.style.transform = `perspective(2500px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    }

    // تحديث إحداثيات الإضاءة المتفاعلة مع الماوس لكل الكروت الزجاجية الهولوغرامية
    const cards = document.querySelectorAll<HTMLElement>('.holographic-card');
    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
  }

  // خلفية نجوم كونية متطورة
  private initStarfield() {
    const canvas = this.starfieldCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    window.addEventListener('resize', () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });

    const stars = Array.from({ length: 150 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.8,
      alpha: Math.random(),
      speed: Math.random() * 0.3 + 0.1
    }));

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      stars.forEach(star => {
        star.y -= star.speed;
        if (star.y < 0) star.y = height;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
        ctx.fill();
      });
      requestAnimationFrame(animate);
    };
    animate();
  }
}
