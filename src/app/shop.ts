import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase';

export interface ShopProfile {
  name: string;
  address: string;
  phone: string;
  email: string;
  logo: string;
}

const storageKey = 'peeple-shop';

export const defaultShop: ShopProfile = {
  name: 'Peeple Tree',
  address: 'Chandanagar, beside Union Bank',
  phone: '888888888',
  email: 'peeple@gmail.com',
  logo: 'logo.png',
};

@Injectable({ providedIn: 'root' })
export class Shop {
  private readonly supabase = inject(SupabaseService);
  private shopId: string | null = null;

  readonly profile = signal<ShopProfile>(readShop());

  constructor() {
    const client = this.supabase.client;
    if (!client) return;
    void client.auth.getSession().then(({ data }) => {
      if (data.session) void this.loadRemote();
    });
    client.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) void this.loadRemote();
      if (event === 'SIGNED_OUT') this.shopId = null;
    });
  }

  async save(input: ShopProfile): Promise<ShopProfile> {
    const profile = cleanShop(input);
    this.profile.set(profile);
    localStorage.setItem(storageKey, JSON.stringify(profile));
    if (this.supabase.enabled) await this.persistRemote(profile);
    return profile;
  }

  private async loadRemote(): Promise<void> {
    const client = this.supabase.client;
    if (!client) return;
    const existing = await client.from('shops').select('id, name, address, phone, email, logo').limit(1).maybeSingle();
    if (existing.error) return;
    if (!existing.data) {
      const created = await client.from('shops').insert(defaultShop).select('id, name, address, phone, email, logo').single();
      if (created.error || !created.data) return;
      this.applyRemote(created.data);
      return;
    }
    this.applyRemote(existing.data);
  }

  private applyRemote(row: { id: string; name: string; address: string; phone: string; email: string; logo: string }): void {
    this.shopId = row.id;
    const profile: ShopProfile = {
      name: row.name,
      address: row.address,
      phone: row.phone,
      email: row.email,
      logo: row.logo || defaultShop.logo,
    };
    if (shopError(profile)) return;
    this.profile.set(profile);
    localStorage.setItem(storageKey, JSON.stringify(profile));
  }

  private async persistRemote(profile: ShopProfile): Promise<void> {
    const client = this.supabase.client;
    if (!client) throw new Error('Supabase is not configured.');
    const payload = {
      name: profile.name,
      address: profile.address,
      phone: profile.phone,
      email: profile.email,
      logo: profile.logo,
    };
    if (!this.shopId) {
      const existing = await client.from('shops').select('id').limit(1).maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      this.shopId = existing.data?.id ?? null;
    }
    if (this.shopId) {
      const saved = await client.from('shops').update(payload).eq('id', this.shopId);
      if (saved.error) throw new Error(saved.error.message || 'The shop profile could not be saved.');
      return;
    }
    const created = await client.from('shops').insert(payload).select('id').single();
    if (created.error || !created.data) throw new Error(created.error?.message || 'The shop profile could not be saved.');
    this.shopId = created.data.id;
  }
}

export function shopError(input: ShopProfile): string {
  const name = input.name.trim();
  const address = input.address.trim();
  const phone = input.phone.trim();
  const email = input.email.trim();
  if (!name) return 'Enter the salon name.';
  if (name.length > 40) return 'Salon name can be 40 characters only.';
  if (!address) return 'Enter the address.';
  if (address.length > 80) return 'Address can be 80 characters only.';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return 'Enter a phone number of 8 to 15 digits.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
  if (email.length > 80) return 'Email can be 80 characters only.';
  return '';
}

function cleanShop(input: ShopProfile): ShopProfile {
  const problem = shopError(input);
  if (problem) throw new Error(problem);
  return {
    name: input.name.trim(),
    address: input.address.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    logo: input.logo.trim() || defaultShop.logo,
  };
}

function readShop(): ShopProfile {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { ...defaultShop };
    const parsed = JSON.parse(raw) as Partial<ShopProfile>;
    const profile = {
      name: parsed.name?.trim() || defaultShop.name,
      address: parsed.address?.trim() || defaultShop.address,
      phone: parsed.phone?.trim() || defaultShop.phone,
      email: parsed.email?.trim() || defaultShop.email,
      logo: parsed.logo?.trim() || defaultShop.logo,
    };
    return shopError(profile) ? { ...defaultShop } : profile;
  } catch {
    return { ...defaultShop };
  }
}
