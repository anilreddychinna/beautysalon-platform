import { Component, effect, inject, signal } from '@angular/core';
import { Shop, defaultShop, shopError } from '../../shop';
import { SupabaseService } from '../../supabase';

@Component({
  standalone: true,
  selector: 'app-settings',
  templateUrl: './settings.html',
})
export class Settings {
  private readonly shop = inject(Shop);
  private readonly supabase = inject(SupabaseService);
  private dirty = false;

  readonly name = signal(this.shop.profile().name);
  readonly address = signal(this.shop.profile().address);
  readonly phone = signal(this.shop.profile().phone);
  readonly email = signal(this.shop.profile().email);
  readonly logo = signal(this.shop.profile().logo);
  readonly error = signal('');
  readonly notice = signal('');

  constructor() {
    effect(() => {
      const profile = this.shop.profile();
      if (this.dirty) return;
      this.name.set(profile.name);
      this.address.set(profile.address);
      this.phone.set(profile.phone);
      this.email.set(profile.email);
      this.logo.set(profile.logo);
    });
  }

  onText(target: { set(value: string): void }, event: Event): void {
    this.dirty = true;
    target.set((event.target as HTMLInputElement).value);
    this.notice.set('');
  }

  onLogo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.dirty = true;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.error.set('Choose an image file for the logo.');
      return;
    }
    if (file.size > 400_000) {
      this.error.set('Choose a logo under 400 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.logo.set(String(reader.result ?? defaultShop.logo));
      this.error.set('');
      this.notice.set('');
    };
    reader.readAsDataURL(file);
  }

  resetLogo(): void {
    this.dirty = true;
    this.logo.set(defaultShop.logo);
    this.notice.set('');
  }

  save(): void {
    const next = {
      name: this.name(),
      address: this.address(),
      phone: this.phone(),
      email: this.email(),
      logo: this.logo(),
    };
    const problem = shopError(next);
    if (problem) {
      this.error.set(problem);
      this.notice.set('');
      return;
    }
    void this.shop
      .save(next)
      .then(() => {
        this.dirty = false;
        this.error.set('');
        this.notice.set(this.supabase.enabled ? 'Shop profile saved.' : 'Shop profile saved on this browser.');
      })
      .catch((error: unknown) => {
        this.notice.set('');
        this.error.set(error instanceof Error ? error.message : 'The shop profile could not be saved.');
      });
  }
}
