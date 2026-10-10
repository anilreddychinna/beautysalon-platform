import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, forkJoin } from 'rxjs';
import { ShopApi, messageFrom } from '../../api';
import { InrPipe } from '../../inr.pipe';
import { Bill, DayClose, formatWhen, inputValue, paymentLabel, roundMoney, todayIso } from '../../models';
import { Receipt } from '../../receipt/receipt';

@Component({
  standalone: true,
  selector: 'app-today',
  imports: [InrPipe, Receipt],
  templateUrl: './today.html',
})
export class Today {
  private readonly api = inject(ShopApi);
  private readonly destroyRef = inject(DestroyRef);
  private loadSub?: Subscription;

  readonly today = todayIso();
  readonly selected = signal(this.today);
  readonly bills = signal<Bill[]>([]);
  readonly error = signal('');
  readonly loading = signal(true);
  readonly openBill = signal<Bill | null>(null);
  readonly pendingCancel = signal<Bill | null>(null);
  readonly cancelling = signal(false);
  readonly cashCounted = signal('');
  readonly closeNote = signal('');
  readonly closing = signal<DayClose | null>(null);
  readonly savingClose = signal(false);
  readonly closeError = signal('');
  readonly confirmClose = signal(false);
  readonly closeDone = signal(false);
  private closeTimer?: ReturnType<typeof setTimeout>;

  readonly stats = computed(() => {
    const rows = this.bills().filter((bill) => !bill.cancelledAt);
    const sum = (method?: Bill['paymentMethod']) =>
      roundMoney(rows.filter((bill) => !method || bill.paymentMethod === method).reduce((total, bill) => total + bill.total, 0));
    return { count: rows.length, total: sum(), cash: sum('cash'), upi: sum('upi') };
  });
  readonly counted = computed(() => {
    const value = this.cashCounted().trim();
    if (!value) return null;
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 ? amount : null;
  });
  readonly cashGap = computed(() => {
    const counted = this.counted();
    if (counted == null) return null;
    return roundMoney(counted - this.stats().cash);
  });
  readonly gapKind = computed(() => {
    const gap = this.cashGap();
    if (gap == null) return '';
    if (gap === 0) return 'match';
    return gap > 0 ? 'over' : 'short';
  });
  readonly gapAmount = computed(() => Math.abs(this.cashGap() ?? 0));

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.closeTimer));
    this.load(this.today);
  }

  onDate(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    if (!value || value > this.today) {
      input.value = this.selected();
      return;
    }
    this.selected.set(value);
    this.load(value);
  }

  private load(date: string): void {
    this.loading.set(true);
    this.error.set('');
    this.openBill.set(null);
    this.loadSub?.unsubscribe();
    this.loadSub = forkJoin({ bills: this.api.bills(date, date), close: this.api.dayClose(date) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ bills, close }) => {
          this.bills.set(bills);
          this.closing.set(close);
          this.cashCounted.set(close ? String(close.cashCounted) : '');
          this.closeNote.set(close?.note ?? '');
          this.loading.set(false);
        },
        error: (error) => {
          this.loading.set(false);
          this.error.set(messageFrom(error, 'Could not load bills for that date.'));
        },
      });
  }

  onCash(event: Event): void {
    this.cashCounted.set(inputValue(event));
    this.closeError.set('');
  }

  onNote(event: Event): void {
    const input = event.target as HTMLInputElement;
    const note = input.value.slice(0, 80);
    input.value = note;
    this.closeNote.set(note);
  }

  askClose(): void {
    this.closeError.set('');
    this.closeDone.set(false);
    this.confirmClose.set(true);
  }

  dismissClose(): void {
    if (this.savingClose()) return;
    clearTimeout(this.closeTimer);
    this.confirmClose.set(false);
    this.closeDone.set(false);
  }

  saveClose(): void {
    const counted = this.counted();
    if (counted == null) {
      this.closeError.set('Enter the cash counted in the drawer.');
      return;
    }
    this.savingClose.set(true);
    this.closeError.set('');
    this.api
      .saveDayClose(this.selected(), counted, this.closeNote())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (close) => {
          this.savingClose.set(false);
          this.closing.set(close);
          this.cashCounted.set(String(close.cashCounted));
          this.closeDone.set(true);
          clearTimeout(this.closeTimer);
          this.closeTimer = setTimeout(() => this.dismissClose(), 1600);
        },
        error: (error) => {
          this.savingClose.set(false);
          this.closeError.set(messageFrom(error, 'The day close could not be saved.'));
        },
      });
  }

  askCancel(bill: Bill): void {
    if (bill.cancelledAt) return;
    this.pendingCancel.set(bill);
  }

  dismissCancel(): void {
    if (this.cancelling()) return;
    this.pendingCancel.set(null);
  }

  confirmCancel(): void {
    const bill = this.pendingCancel();
    if (!bill || this.cancelling()) return;
    this.cancelling.set(true);
    this.api
      .cancelBill(bill.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.cancelling.set(false);
          this.bills.update((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
          if (this.openBill()?.id === updated.id) this.openBill.set(updated);
          this.pendingCancel.set(null);
        },
        error: (error) => {
          this.cancelling.set(false);
          this.pendingCancel.set(null);
          this.error.set(messageFrom(error, 'The bill could not be cancelled.'));
        },
      });
  }

  when(iso: string): string {
    return formatWhen(iso);
  }

  pay(method: Bill['paymentMethod']): string {
    return paymentLabel(method);
  }

  open(bill: Bill): void {
    this.openBill.set(bill);
  }

  close(): void {
    this.openBill.set(null);
  }
}
