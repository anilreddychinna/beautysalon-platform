import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly enabled = Boolean(environment.supabaseUrl && environment.supabaseAnonKey);
  readonly client: SupabaseClient | null = this.enabled
    ? createClient(environment.supabaseUrl, environment.supabaseAnonKey)
    : null;

  authEmail(username: string): string {
    const name = username.trim().toLowerCase();
    if (name.includes('@')) return name;
    return `${name}@${environment.supabaseAuthDomain}`;
  }
}
