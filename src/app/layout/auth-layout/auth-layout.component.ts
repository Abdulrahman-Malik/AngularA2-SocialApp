import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface Star {
  x: number;
  y: number;
  r: number;
  alpha: number;
  twinkle: number;
  phase: number;
  vx: number;
  vy: number;
  color: string;
}

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  // CommonModule removed: the template uses no *ngIf / *ngFor / pipes.
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './auth-layout.component.html',
  styleUrls: ['./auth-layout.component.css'],
})
export class AuthLayoutComponent implements AfterViewInit, OnDestroy {
  @ViewChild('starfieldCanvas', { static: true })
  private readonly starfieldCanvas!: ElementRef<HTMLCanvasElement>;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);

  /** Root element that receives --px / --py (read by auth-page-ultra.css). */
  private root: HTMLElement | null = null;

  private ctx: CanvasRenderingContext2D | null = null;
  private stars: Star[] = [];
  private width = 0;
  private height = 0;
  private dpr = 1;

  private readonly pointer = { x: -9999, y: -9999 };
  private pointerTarget: EventTarget | null = null;

  private reduceMotion = false;
  private starFrame = 0;
  private moveFrame = 0;
  private resizeFrame = 0;

  private readonly palette = [
    'rgba(255, 255, 255,',
    'rgba(180, 236, 255,',
    'rgba(120, 190, 255,',
    'rgba(56, 200, 255,',
  ];

  private readonly cleanups: Array<() => void> = [];

  ngAfterViewInit(): void {
    this.root = this.host.nativeElement.querySelector<HTMLElement>('.constellation-theme');
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Everything below is purely visual: keep it outside Angular's change detection
    // so mouse movement never triggers a re-render of the app.
    this.zone.runOutsideAngular(() => {
      this.setupCanvas();
      this.bindEvents();

      if (this.reduceMotion) {
        this.drawFrame(0); // one still frame, no animation
      } else {
        this.starFrame = requestAnimationFrame(this.loop);
      }
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.starFrame);
    cancelAnimationFrame(this.moveFrame);
    cancelAnimationFrame(this.resizeFrame);
    this.cleanups.forEach((off) => off());
    this.cleanups.length = 0;
  }

  /* =========================================================
     MOUSE: parallax variables + per-card spotlight
     (matches --px / --py / --mouse-x / --mouse-y in the CSS)
  ========================================================= */

  private bindEvents(): void {
    this.listen(window, 'pointermove', this.onPointerMove as EventListener, { passive: true });
    this.listen(window, 'resize', this.onResize, { passive: true });
    this.listen(document, 'visibilitychange', this.onVisibility);
    this.listen(document.documentElement, 'mouseleave', this.onPointerLeave);
  }

  private listen(
    target: EventTarget,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler, options);
    this.cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return; // touch devices: no tilt / spotlight

    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
    this.pointerTarget = event.target;

    if (this.moveFrame) return;
    this.moveFrame = requestAnimationFrame(this.applyPointer);
  };

  private readonly applyPointer = (): void => {
    this.moveFrame = 0;
    if (this.reduceMotion) return;

    if (this.root) {
      const px = (this.pointer.x / window.innerWidth) * 2 - 1;
      const py = (this.pointer.y / window.innerHeight) * 2 - 1;
      this.root.style.setProperty('--px', px.toFixed(3));
      this.root.style.setProperty('--py', py.toFixed(3));
    }

    // Spotlight follows the cursor on whichever glass card it is over.
    const card = (this.pointerTarget as HTMLElement | null)?.closest?.(
      '.spotlight-card',
    ) as HTMLElement | null;

    if (card) {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mouse-x', `${this.pointer.x - rect.left}px`);
      card.style.setProperty('--mouse-y', `${this.pointer.y - rect.top}px`);
    }
  };

  private readonly onPointerLeave = (): void => {
    this.pointer.x = -9999;
    this.pointer.y = -9999;
    this.root?.style.setProperty('--px', '0');
    this.root?.style.setProperty('--py', '0');
  };

  /* =========================================================
     STARFIELD: twinkling stars + constellation lines
     that reach toward the cursor
  ========================================================= */

  private setupCanvas(): void {
    const canvas = this.starfieldCanvas.nativeElement;
    this.ctx = canvas.getContext('2d');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    this.resizeCanvas(true);
  }

  private resizeCanvas(initial = false): void {
    const canvas = this.starfieldCanvas.nativeElement;
    if (!this.ctx) return;

    const prevW = this.width;
    const prevH = this.height;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    canvas.width = Math.round(this.width * this.dpr);
    canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const target = Math.max(55, Math.min(130, Math.round((this.width * this.height) / 14000)));

    if (initial || this.stars.length === 0) {
      this.stars = Array.from({ length: target }, () => this.createStar());
    } else {
      // keep existing stars, rescale their positions, then trim / top up
      this.stars.forEach((s) => {
        s.x = (s.x / prevW) * this.width;
        s.y = (s.y / prevH) * this.height;
      });
      if (this.stars.length > target) this.stars.length = target;
      while (this.stars.length < target) this.stars.push(this.createStar());
    }
  }

  private createStar(): Star {
    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      r: Math.random() * 1.5 + 0.35,
      alpha: Math.random() * 0.55 + 0.35,
      twinkle: Math.random() * 1.6 + 0.4,
      phase: Math.random() * Math.PI * 2,
      vx: (Math.random() - 0.5) * 0.08,
      vy: -(Math.random() * 0.22 + 0.06),
      color: this.palette[Math.floor(Math.random() * this.palette.length)],
    };
  }

  private readonly onResize = (): void => {
    if (this.resizeFrame) return;
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = 0;
      this.resizeCanvas();
      if (this.reduceMotion) this.drawFrame(0);
    });
  };

  private readonly onVisibility = (): void => {
    if (this.reduceMotion) return;

    if (document.hidden) {
      cancelAnimationFrame(this.starFrame);
      this.starFrame = 0;
    } else if (!this.starFrame) {
      this.starFrame = requestAnimationFrame(this.loop);
    }
  };

  private readonly loop = (time: number): void => {
    this.drawFrame(time);
    this.starFrame = requestAnimationFrame(this.loop);
  };

  private drawFrame(time: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const t = time / 1000;
    const { width, height, stars } = this;
    const linkDist = 115;
    const mouseDist = 170;
    const animate = !this.reduceMotion;

    ctx.clearRect(0, 0, width, height);

    // 1) move + draw stars
    for (const s of stars) {
      if (animate) {
        s.x += s.vx;
        s.y += s.vy;
        if (s.y < -4) {
          s.y = height + 4;
          s.x = Math.random() * width;
        }
        if (s.x < -4) s.x = width + 4;
        if (s.x > width + 4) s.x = -4;
      }

      const a = s.alpha * (0.65 + 0.35 * Math.sin(t * s.twinkle + s.phase));

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `${s.color} ${a.toFixed(3)})`;
      ctx.fill();
    }

    // 2) constellation lines between close stars
    ctx.lineWidth = 0.6;
    for (let i = 0; i < stars.length; i++) {
      const a = stars[i];
      for (let j = i + 1; j < stars.length; j++) {
        const b = stars[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < linkDist) {
          ctx.strokeStyle = `rgba(110, 185, 255, ${((1 - d / linkDist) * 0.2).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // 3) lines from the cursor to nearby stars
    if (animate && this.pointer.x > -9000) {
      for (const s of stars) {
        const d = Math.hypot(s.x - this.pointer.x, s.y - this.pointer.y);
        if (d < mouseDist) {
          ctx.strokeStyle = `rgba(56, 200, 255, ${((1 - d / mouseDist) * 0.5).toFixed(3)})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(this.pointer.x, this.pointer.y);
          ctx.lineTo(s.x, s.y);
          ctx.stroke();
        }
      }
    }
  }
}
