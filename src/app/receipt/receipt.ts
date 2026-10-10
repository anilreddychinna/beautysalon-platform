import { Component, computed, inject, input } from '@angular/core';
import { InrPipe } from '../inr.pipe';
import { Bill, categoryLabel, formatWhen, paymentLabel } from '../models';
import { Shop } from '../shop';

@Component({
  standalone: true,
  selector: 'app-receipt',
  imports: [InrPipe],
  templateUrl: './receipt.html',
})
export class Receipt {
  readonly shop = inject(Shop);
  readonly bill = input.required<Bill>();
  readonly when = computed(() => formatWhen(this.bill().createdAt));
  readonly payment = computed(() => paymentLabel(this.bill().paymentMethod));
  readonly maskedPhone = computed(() => {
    const digits = this.bill().customerPhone.replace(/\D/g, '');
    return `XXXXX${digits.slice(-5)}`;
  });

  category(value: Bill['lines'][number]['category']): string {
    return categoryLabel(value);
  }

  print(): void {
    window.print();
  }
}
