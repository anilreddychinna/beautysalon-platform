import { Injectable, inject, signal } from '@angular/core';
import { ShopUser } from './models';
import { SupabaseService } from './supabase';

const storageKey = 'peeple-user';

@Injectable({ providedIn: 'root' })
export class Session {
  private readonly supabase = inject(SupabaseService);
  readonly user = signal<ShopUser | null>(readStored());

  constructor() {
    const client = this.supabase.client;
    if (!client) return;
    void client.auth.getSession().then(({ data }) => {
      if (data.session) return;
      this.user.set(null);
      sessionStorage.removeItem(storageKey);
    });
  }

  login(user: ShopUser): void {
    this.user.set(user);
    sessionStorage.setItem(storageKey, JSON.stringify(user));
  }

  logout(): void {
    this.user.set(null);
    sessionStorage.removeItem(storageKey);
    void this.supabase.client?.auth.signOut();
  }
}

function readStored(): ShopUser | null {
  const raw = sessionStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as ShopUser;
    if (!user?.username || !user.name || (user.role !== 'Admin' && user.role !== 'Manager')) return null;
    return user;
  } catch {
    return null;
  }
}
