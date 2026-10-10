import { Injectable, afterNextRender, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const dismissKey = 'peeple-install-dismissed';
const pullThreshold = 80;

@Injectable({ providedIn: 'root' })
export class Pwa {
  private readonly updates = inject(SwUpdate);
  readonly offerInstall = signal(false);
  readonly iosSteps = signal(false);
  readonly pull = signal(0);
  readonly message = signal('');

  private promptEvent: BeforeInstallPromptEvent | null = null;
  private updateReady = false;
  private busy = false;
  private tracking = false;
  private startX = 0;
  private startY = 0;
  private hideTimer = 0;

  constructor() {
    afterNextRender(() => this.start());
  }

  async install(): Promise<void> {
    const event = this.promptEvent;
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    this.promptEvent = null;
    this.offerInstall.set(false);
  }

  dismiss(): void {
    sessionStorage.setItem(dismissKey, '1');
    this.offerInstall.set(false);
  }

  private start(): void {
    if (this.updates.isEnabled) {
      this.updates.versionUpdates.subscribe((event) => {
        if (event.type === 'VERSION_READY') this.updateReady = true;
      });
      this.updates.unrecoverable.subscribe(() => document.location.reload());
    }

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.promptEvent = event as BeforeInstallPromptEvent;
      this.iosSteps.set(false);
      if (!this.installed() && !this.dismissed()) this.offerInstall.set(true);
    });
    window.addEventListener('appinstalled', () => {
      this.promptEvent = null;
      this.offerInstall.set(false);
    });

    if (this.ios() && !this.installed() && !this.dismissed()) {
      this.iosSteps.set(true);
      this.offerInstall.set(true);
    }

    document.addEventListener('touchstart', this.onTouchStart, { passive: true });
    document.addEventListener('touchmove', this.onTouchMove, { passive: false });
    document.addEventListener('touchend', this.onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', this.onTouchCancel, { passive: true });
  }

  private readonly onTouchStart = (event: TouchEvent): void => {
    if (event.touches.length !== 1 || this.busy) return;
    const touch = event.touches[0];
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.tracking = this.canPull(event.target);
  };

  private readonly onTouchMove = (event: TouchEvent): void => {
    if (!this.tracking || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - this.startX;
    const dy = touch.clientY - this.startY;
    if (Math.abs(dx) > dy) {
      this.tracking = false;
      this.pull.set(0);
      return;
    }
    if (dy <= 0) {
      this.pull.set(0);
      return;
    }
    if (dy > 8) event.preventDefault();
    this.pull.set(Math.min(dy, 110));
  };

  private readonly onTouchEnd = (): void => {
    const shouldUpdate = this.tracking && this.pull() >= pullThreshold;
    this.tracking = false;
    this.pull.set(0);
    if (shouldUpdate) void this.updateApp();
  };

  private readonly onTouchCancel = (): void => {
    this.tracking = false;
    this.pull.set(0);
  };

  private async updateApp(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    window.clearTimeout(this.hideTimer);
    this.message.set('Checking for update…');
    try {
      const found = this.updates.isEnabled ? await this.updates.checkForUpdate() : false;
      if (!found && !this.updateReady) {
        this.flash("You're on the latest version");
        return;
      }
      this.message.set('Updating…');
      const activated = await this.updates.activateUpdate();
      if (!activated) {
        this.flash("You're on the latest version");
        return;
      }
      document.location.reload();
    } catch {
      this.flash('Could not check for an update');
    } finally {
      this.busy = false;
    }
  }

  private flash(text: string): void {
    this.message.set(text);
    this.hideTimer = window.setTimeout(() => this.message.set(''), 1600);
  }

  private canPull(target: EventTarget | null): boolean {
    if (document.querySelector('.shell.menu-open')) return false;
    if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return false;
    if (window.scrollY > 4) return false;
    let node = target instanceof Element ? target.parentElement : null;
    while (node) {
      const scrollable = /(auto|scroll)/.test(getComputedStyle(node).overflowY);
      if (scrollable && node.scrollHeight > node.clientHeight + 8 && node.scrollTop > 0) return false;
      node = node.parentElement;
    }
    return true;
  }

  private installed(): boolean {
    const nav = navigator as Navigator & { standalone?: boolean };
    return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
  }

  private dismissed(): boolean {
    return sessionStorage.getItem(dismissKey) === '1';
  }

  private ios(): boolean {
    const ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
}
