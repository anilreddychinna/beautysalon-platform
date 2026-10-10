import { Component, inject, signal } from '@angular/core';
import { ShopApi, messageFrom } from '../../api';
import { StaffLogin, UserRole } from '../../models';

@Component({
  standalone: true,
  selector: 'app-users',
  templateUrl: './users.html',
})
export class Users {
  private readonly api = inject(ShopApi);

  readonly rows = signal<StaffLogin[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly formOpen = signal(false);
  readonly saving = signal(false);
  readonly name = signal('');
  readonly username = signal('');
  readonly password = signal('');
  readonly role = signal<UserRole | ''>('');

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.staffLogins().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(messageFrom(error, 'Users could not be loaded.'));
      },
    });
  }

  beginAdd(): void {
    this.name.set('');
    this.username.set('');
    this.password.set('');
    this.role.set('');
    this.error.set('');
    this.notice.set('');
    this.formOpen.set(true);
  }

  cancel(): void {
    this.formOpen.set(false);
    this.error.set('');
  }

  onText(target: { set(value: string): void }, event: Event): void {
    target.set((event.target as HTMLInputElement).value);
    this.error.set('');
  }

  onRole(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.role.set(value === 'Admin' || value === 'Manager' ? value : '');
    this.error.set('');
  }

  save(): void {
    const role = this.role();
    if (role !== 'Admin' && role !== 'Manager') {
      this.error.set('Please select a role.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api
      .createStaffLogin({
        name: this.name(),
        username: this.username(),
        password: this.password(),
        role,
      })
      .subscribe({
        next: (person) => {
          this.rows.update((rows) => [...rows.filter((row) => row.id !== person.id), person].sort((a, b) => a.name.localeCompare(b.name)));
          this.saving.set(false);
          this.formOpen.set(false);
          this.notice.set(`${person.name} can sign in as ${person.username}.`);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.error.set(messageFrom(error, 'The user could not be saved.'));
        },
      });
  }
}
