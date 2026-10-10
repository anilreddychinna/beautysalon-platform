import { Component, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ShopApi, messageFrom } from '../../api';
import { inputValue } from '../../models';
import { Session } from '../../session';
import { Shop } from '../../shop';

@Component({
  standalone: true,
  selector: 'app-login',
  templateUrl: './login.html',
})
export class Login {
  private readonly api = inject(ShopApi);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  readonly shop = inject(Shop);

  readonly username = signal('');
  readonly password = signal('');
  readonly error = signal('');
  readonly busy = signal(false);
  readonly online = signal(navigator.onLine);

  constructor() {
    if (this.session.user()) {
      void this.router.navigateByUrl('/counter');
    }
  }

  onText(target: { set(value: string): void }, event: Event): void {
    target.set(inputValue(event));
  }

  submit(): void {
    const username = this.username().trim();
    const password = this.password();
    if (!username || !password) {
      this.error.set('Enter a username and password.');
      return;
    }
    if (!navigator.onLine) {
      this.error.set('No internet connection. Connect and try again.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.api.login(username, password).subscribe({
      next: (user) => {
        this.busy.set(false);
        this.session.login(user);
        void this.router.navigateByUrl('/counter');
      },
      error: (error) => {
        this.busy.set(false);
        const message = messageFrom(error, 'Could not sign in.');
        this.error.set(
          message === 'Failed to fetch' ? 'No internet connection. Connect and try again.' : message,
        );
      },
    });
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
