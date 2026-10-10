import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ShopApi, messageFrom } from '../../api';
import { InrPipe } from '../../inr.pipe';
import { Bill, Customer, indianMobile, inputValue, isIndianMobile, roundMoney } from '../../models';

interface CustomerRow extends Customer {
  visits: number;
  spent: number;
}

@Component({
  standalone: true,
  selector: 'app-customers',
  imports: [InrPipe],
  templateUrl: './customers.html',
})
export class Customers {
  private readonly api = inject(ShopApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  readonly rows = signal<CustomerRow[]>([]);
  readonly query = signal('');
  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly name = signal('');
  readonly phone = signal('');
  readonly notes = signal('');
  readonly gender = signal('');
  readonly customerId = signal('');
  readonly error = signal('');
  readonly notice = signal('');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly saved = signal(false);
  private savedCustomerId = '';
  private closeTimer?: ReturnType<typeof setTimeout>;
  readonly page = signal(1);
  readonly pageSize = 8;

  readonly orderCount = computed(() => this.rows().reduce((sum, row) => sum + row.visits, 0));
  readonly visible = computed(() => {
    const query = this.query().trim().toLowerCase();
    if (!query) return this.rows();
    return this.rows().filter((row) => row.name.toLowerCase().includes(query) || row.phone.includes(query));
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.visible().length / this.pageSize)));
  readonly paged = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.visible().slice(start, start + this.pageSize);
  });
  readonly pageStart = computed(() => (this.visible().length === 0 ? 0 : (this.page() - 1) * this.pageSize + 1));
  readonly pageEnd = computed(() => Math.min(this.page() * this.pageSize, this.visible().length));

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.closeTimer));
    effect(() => {
      const count = this.pageCount();
      if (this.page() > count) this.page.set(count);
    });
    this.load();
  }

  load(): void {
    forkJoin({ customers: this.api.customers(), bills: this.api.bills() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ customers, bills }) => {
          this.rows.set(customers.map((customer) => this.withStats(customer, bills)).sort((a, b) => a.name.localeCompare(b.name)));
          this.loading.set(false);
        },
        error: (error) => {
          this.loading.set(false);
          this.error.set(messageFrom(error, 'Could not load customers.'));
        },
      });
  }

  onQuery(event: Event): void {
    this.query.set(inputValue(event));
    this.page.set(1);
  }

  go(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.pageCount()));
  }

  view(row: CustomerRow): void {
    void this.router.navigate(['/customers', row.id]);
  }

  onText(target: { set(value: string): void }, event: Event): void {
    target.set(inputValue(event));
  }

  setGender(value: 'Female' | 'Male'): void {
    this.gender.set(this.gender() === value ? '' : value);
  }

  onName(event: Event): void {
    const input = event.target as HTMLInputElement;
    const name = input.value.slice(0, 20);
    input.value = name;
    this.name.set(name);
  }

  onPhone(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = indianMobile(input.value);
    input.value = digits;
    this.phone.set(digits);
  }

  beginAdd(): void {
    this.resetForm();
    this.formOpen.set(true);
  }

  edit(row: CustomerRow): void {
    this.editingId.set(row.id);
    this.name.set(row.name.slice(0, 20));
    this.phone.set(row.phone);
    this.notes.set(row.notes);
    this.gender.set(row.gender || '');
    this.customerId.set(row.customerId || row.id);
    this.error.set('');
    this.notice.set('');
    this.formOpen.set(true);
  }

  cancel(): void {
    if (this.saving()) return;
    if (this.saved()) {
      this.openSaved();
      return;
    }
    this.resetForm();
    this.formOpen.set(false);
  }

  private resetForm(): void {
    this.editingId.set(null);
    this.name.set('');
    this.phone.set('');
    this.notes.set('');
    this.gender.set('');
    this.customerId.set('');
    this.error.set('');
    this.saved.set(false);
  }

  private openSaved(): void {
    const id = this.savedCustomerId;
    clearTimeout(this.closeTimer);
    this.saved.set(false);
    this.formOpen.set(false);
    this.resetForm();
    if (id) void this.router.navigate(['/customers', id]);
  }

  save(): void {
    const name = this.name().trim();
    const phone = this.phone().trim();
    if (!name) {
      this.error.set('Enter a customer name.');
      return;
    }
    if (name.length > 20) {
      this.error.set('Customer name can be 20 characters only.');
      return;
    }
    if (!isIndianMobile(phone)) {
      this.error.set('Enter an Indian mobile number starting with 6, 7, 8, or 9.');
      return;
    }
    if (!this.editingId() && this.gender() !== 'Female' && this.gender() !== 'Male') {
      this.error.set('Please select gender.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api
      .saveCustomer(
        { name, phone, notes: this.notes().trim(), gender: this.gender() },
        this.editingId() ?? undefined,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (person) => {
          const updated = !!this.editingId();
          this.saving.set(false);
          this.savedCustomerId = person.id;
          this.notice.set(updated ? 'Customer updated.' : 'Customer saved.');
          this.saved.set(true);
          clearTimeout(this.closeTimer);
          this.closeTimer = setTimeout(() => this.openSaved(), 1400);
        },
        error: (error) => {
          this.saving.set(false);
          this.error.set(messageFrom(error, 'The customer could not be saved.'));
        },
      });
  }

  private withStats(customer: Customer, bills: Bill[]): CustomerRow {
    const own = bills.filter((bill) => bill.customerId === customer.id && !bill.cancelledAt);
    return {
      ...customer,
      visits: own.length,
      spent: roundMoney(own.reduce((sum, bill) => sum + bill.total, 0)),
    };
  }
}
