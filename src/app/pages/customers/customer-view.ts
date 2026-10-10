import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ShopApi, messageFrom } from '../../api';
import { InrPipe } from '../../inr.pipe';
import { Bill, Customer, formatWhen, paymentLabel, roundMoney } from '../../models';

@Component({
  standalone: true,
  selector: 'app-customer-view',
  imports: [InrPipe, RouterLink],
  templateUrl: './customer-view.html',
})
export class CustomerView {
  private readonly api = inject(ShopApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  readonly customer = signal<Customer | null>(null);
  readonly orders = signal<Bill[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly tab = signal<'general' | 'orders'>('general');

  readonly visits = computed(() => this.orders().filter((bill) => !bill.cancelledAt).length);
  readonly spent = computed(() =>
    roundMoney(this.orders().filter((bill) => !bill.cancelledAt).reduce((sum, bill) => sum + bill.total, 0)),
  );

  constructor() {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    forkJoin({ customers: this.api.customers(), bills: this.api.bills() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ customers, bills }) => {
          const person = customers.find((row) => row.id === id) ?? null;
          this.customer.set(person);
          this.orders.set(
            person
              ? bills.filter((bill) => bill.customerId === person.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              : [],
          );
          this.loading.set(false);
          if (!person) this.error.set('That customer was not found.');
        },
        error: (error) => {
          this.loading.set(false);
          this.error.set(messageFrom(error, 'Could not load this customer.'));
        },
      });
  }

  showTab(tab: 'general' | 'orders'): void {
    this.tab.set(tab);
  }

  when(iso: string): string {
    return formatWhen(iso);
  }

  pay(method: Bill['paymentMethod']): string {
    return paymentLabel(method);
  }

  serviceNames(bill: Bill): string {
    return bill.lines.map((line) => line.serviceName).join(', ');
  }
}
