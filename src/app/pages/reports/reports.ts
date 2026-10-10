import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ShopApi, messageFrom, messageFromBlob } from '../../api';
import { InrPipe } from '../../inr.pipe';
import { Report, categoryLabel, formatDay, inputValue, roundMoney, shiftIso, todayIso } from '../../models';

@Component({
  standalone: true,
  selector: 'app-reports',
  imports: [InrPipe],
  templateUrl: './reports.html',
})
export class Reports {
  private readonly api = inject(ShopApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly from = signal(shiftIso(todayIso(), -7));
  readonly to = signal(todayIso());
  readonly report = signal<Report | null>(null);
  readonly error = signal('');
  readonly excelError = signal('');
  readonly loading = signal(false);
  readonly downloading = signal(false);

  constructor() {
    this.load();
  }

  onFrom(event: Event): void {
    this.from.set(inputValue(event));
  }

  onTo(event: Event): void {
    this.to.set(inputValue(event));
  }

  load(): void {
    if (this.from() > this.to()) {
      this.error.set('The start date is after the end date.');
      this.report.set(null);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.excelError.set('');
    this.api
      .report(this.from(), this.to())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          this.report.set(report);
          this.loading.set(false);
        },
        error: (error) => {
          this.loading.set(false);
          this.report.set(null);
          this.error.set(messageFrom(error, 'Could not load the report.'));
        },
      });
  }

  formatDate(iso: string): string {
    return formatDay(iso);
  }

  category(value: Report['byService'][number]['category']): string {
    return categoryLabel(value);
  }

  dayMax(report: Report): number {
    return Math.max(0, ...report.byDay.map((day) => day.total));
  }

  share(value: number, max: number): number {
    if (max <= 0 || value <= 0) return 0;
    return Math.max(8, Math.round((value / max) * 100));
  }

  dayLabel(iso: string): string {
    return String(Number(iso.slice(8)));
  }

  paymentBars(report: Report): { label: string; amount: number; kind: string }[] {
    const sum = (key: 'cash' | 'card' | 'upi') => report.byDay.reduce((total, day) => total + day[key], 0);
    return [
      { label: 'Cash', amount: roundMoney(sum('cash')), kind: 'cash' },
      { label: 'Card', amount: roundMoney(sum('card')), kind: 'card' },
      { label: 'UPI', amount: roundMoney(sum('upi')), kind: 'upi' },
    ];
  }

  payMax(report: Report): number {
    return Math.max(0, ...this.paymentBars(report).map((row) => row.amount));
  }

  topServices(report: Report): Report['byService'] {
    return [...report.byService].sort((a, b) => b.amount - a.amount).slice(0, 4);
  }

  serviceMax(report: Report): number {
    return Math.max(0, ...this.topServices(report).map((row) => row.amount));
  }

  download(): void {
    if (this.from() > this.to()) {
      this.excelError.set('The start date is after the end date.');
      return;
    }
    this.downloading.set(true);
    this.excelError.set('');
    const from = this.from();
    const to = this.to();
    this.api
      .excel(from, to)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.downloading.set(false);
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `saloon-bills-${from}-to-${to}.xls`;
          link.click();
          URL.revokeObjectURL(url);
        },
        error: (error) => {
          this.downloading.set(false);
          void messageFromBlob(error, 'The Excel file could not be created.').then((message) => this.excelError.set(message));
        },
      });
  }
}
