import { Component, HostListener, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import packageInfo from '../../package.json';
import { Pwa } from './pwa';
import { Session } from './session';
import { Shop } from './shop';

@Component({
  standalone: true,
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  readonly session = inject(Session);
  readonly shop = inject(Shop);
  readonly pwa = inject(Pwa);
  readonly menuOpen = signal(false);
  readonly year = new Date().getFullYear();
  readonly version = packageInfo.version;
  readonly online = signal(navigator.onLine);

  constructor() {
    effect(() => {
      const name = this.shop.profile().name;
      document.title = name;
      document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', name);
    });
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  logout(): void {
    this.closeMenu();
    this.session.logout();
    void this.router.navigateByUrl('/login');
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
  }

  @HostListener('window:online')
  onOnline(): void {
    this.online.set(true);
  }

  @HostListener('window:offline')
  onOffline(): void {
    this.online.set(false);
  }
}
