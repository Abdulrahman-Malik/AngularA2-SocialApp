
import {
  Component,
  HostListener,
  OnInit,
  OnDestroy,
  signal
} from '@angular/core';

import { RouterOutlet } from '@angular/router';

interface PwaInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('AngularA2-SocialApp');

  installPrompt: PwaInstallPromptEvent | null = null;

  installBannerVisible = signal(true);
  installBannerFading = signal(false);
  installMessage = signal('');

  private fadeTimer?: ReturnType<typeof setTimeout>;
  private hideTimer?: ReturnType<typeof setTimeout>;
  private messageTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    // لا تظهر بطاقة التثبيت إذا كان التطبيق مثبتًا بالفعل.
    const isInstalled =
      typeof window !== 'undefined' &&
      (
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
      );

    if (isInstalled) {
      this.installBannerVisible.set(false);
      return;
    }

    // بدء الإخفاء التدريجي بعد 6.5 ثانية.
    this.fadeTimer = setTimeout(() => {
      this.installBannerFading.set(true);
    }, 6500);

    // إخفاء البطاقة بالكامل بعد 7.2 ثانية.
    this.hideTimer = setTimeout(() => {
      this.installBannerVisible.set(false);
    }, 7200);
  }

  @HostListener('window:beforeinstallprompt', ['$event'])
  onBeforeInstallPrompt(event: Event): void {
    event.preventDefault();
    this.installPrompt = event as PwaInstallPromptEvent;
  }

  @HostListener('window:appinstalled')
  onAppInstalled(): void {
    this.installPrompt = null;
    this.dismissInstallBanner();
    this.showMessage('تم تثبيت Route Posts بنجاح.');
  }

  async installApp(): Promise<void> {
    if (!this.installPrompt) {
      this.showMessage(
        'افتح قائمة المتصفح ⋮ وابحث عن Install app أو إضافة إلى الشاشة الرئيسية.'
      );
      return;
    }

    const promptEvent = this.installPrompt;

    try {
      await promptEvent.prompt();

      const choice = await promptEvent.userChoice;

      if (choice.outcome === 'accepted') {
        this.showMessage('تمت الموافقة على تثبيت التطبيق.');
      } else {
        this.showMessage('يمكنك تثبيت التطبيق لاحقًا.');
      }
    } catch (error) {
      console.error('PWA installation error:', error);

      this.showMessage(
        'تعذر بدء التثبيت الآن. جرّب من قائمة المتصفح.'
      );
    } finally {
      this.installPrompt = null;
      this.dismissInstallBanner();
    }
  }

  dismissInstallBanner(): void {
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    if (this.hideTimer) clearTimeout(this.hideTimer);

    this.installBannerFading.set(true);
    this.installBannerVisible.set(false);
  }

  private showMessage(message: string): void {
    this.installMessage.set(message);

    if (this.messageTimer) clearTimeout(this.messageTimer);

    this.messageTimer = setTimeout(() => {
      this.installMessage.set('');
    }, 4500);
  }

  ngOnDestroy(): void {
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    if (this.messageTimer) clearTimeout(this.messageTimer);
  }
}
