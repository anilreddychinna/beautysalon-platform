import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ShopApi, messageFrom } from '../../api';
import { InrPipe } from '../../inr.pipe';
import { Receipt } from '../../receipt/receipt';
import {
  Bill,
  Customer,
  DraftLine,
  PaymentMethod,
  ServiceCategory,
  ServiceItem,
  StaffMember,
  categoryLabel,
  indianMobile,
  inputValue,
  isIndianMobile,
  quoteDraft,
  todayIso,
} from '../../models';

@Component({
  standalone: true,
  selector: 'app-counter',
  imports: [InrPipe, Receipt],
  templateUrl: './counter.html',
})
export class Counter {
  private readonly api = inject(ShopApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly customers = signal<Customer[]>([]);
  readonly services = signal<ServiceItem[]>([]);
  readonly staff = signal<StaffMember[]>([]);
  readonly query = signal('');
  readonly newName = signal('');
  readonly newGender = signal('');
  readonly customer = signal<Customer | null>(null);
  readonly billNo = signal('');
  readonly now = signal(new Date());
  readonly todayLabel = computed(() =>
    new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(this.now()),
  );
  readonly timeLabel = computed(() =>
    new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).format(this.now()),
  );
  readonly category = signal<ServiceCategory | 'all'>('all');
  readonly lines = signal<DraftLine[]>([]);
  readonly discountText = signal('0');
  readonly payment = signal<PaymentMethod | ''>('');
  readonly error = signal('');
  readonly saving = signal(false);
  readonly saved = signal<Bill | null>(null);
  readonly lastBill = signal<Bill | null>(null);
  readonly loading = signal(true);

  readonly activeServices = computed(() => this.services().filter((service) => service.active));
  readonly activeStaff = computed(() => this.staff().filter((member) => member.active));
  readonly visibleServices = computed(() => {
    const category = this.category();
    return this.activeServices().filter((service) => category === 'all' || service.category === category);
  });
  readonly matches = computed(() => {
    const digits = this.query();
    if (digits.length < 5 || !/^[6-9]/.test(digits)) return [];
    return this.customers().filter((row) => row.phone.replace(/\D/g, '').startsWith(digits));
  });
  readonly mobileHint = computed(() => {
    const digits = this.query();
    if (!digits || this.customer()) return '';
    if (!/^[6-9]/.test(digits) || (digits.length === 10 && !isIndianMobile(digits))) {
      return 'Enter an Indian mobile number starting with 6, 7, 8, or 9.';
    }
    return '';
  });
  readonly discount = computed(() => Number(this.discountText()));
  readonly quote = computed(() => quoteDraft(this.lines(), this.discount(), 0));
  readonly problem = computed(() => this.draftProblem());

  constructor() {
    this.reload();
    const timer = setInterval(() => this.now.set(new Date()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  reload(): void {
    this.loading.set(true);
    this.api
      .customers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.customers.set(rows);
          const id = this.route.snapshot.queryParamMap.get('customer');
          if (!id) return;
          const person = rows.find((row) => row.id === id);
          if (person) {
            this.customer.set(person);
            this.query.set('');
            this.newName.set('');
            this.newGender.set('');
          }
          void this.router.navigate([], { queryParams: { customer: null }, queryParamsHandling: 'merge', replaceUrl: true });
        },
        error: (error) => this.error.set(messageFrom(error, 'Could not load customers.')),
      });
    this.api
      .services()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.services.set(rows);
          this.loading.set(false);
        },
        error: (error) => {
          this.loading.set(false);
          this.error.set(messageFrom(error, 'Could not load services.'));
        },
      });
    this.api
      .staff()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => this.staff.set(rows),
        error: (error) => this.error.set(messageFrom(error, 'Could not load staff.')),
      });
    this.api
      .bills()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => this.lastBill.set(rows.find((bill) => !bill.cancelledAt) ?? null),
      });
  }

  onMobile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = indianMobile(input.value);
    input.value = digits;
    this.query.set(digits);
    this.saved.set(null);
    this.error.set('');
    if (!isIndianMobile(digits)) return;
    const found = this.customers().filter((row) => row.phone.replace(/\D/g, '') === digits);
    if (found.length !== 1) return;
    this.customer.set(found[0]);
    this.newName.set('');
  }

  pickMatch(event: Event): void {
    const id = inputValue(event);
    const person = this.matches().find((row) => row.id === id);
    if (!person) return;
    this.customer.set(person);
    this.query.set('');
    this.newName.set('');
    this.error.set('');
    this.saved.set(null);
  }

  onName(event: Event): void {
    const input = event.target as HTMLInputElement;
    const name = input.value.slice(0, 20);
    input.value = name;
    this.newName.set(name);
  }

  setNewGender(value: 'Female' | 'Male'): void {
    this.newGender.set(this.newGender() === value ? '' : value);
  }

  onBillNo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 5);
    input.value = digits;
    this.billNo.set(digits);
    this.saved.set(null);
  }

  onText(target: { set(value: string): void }, event: Event): void {
    target.set(inputValue(event));
  }

  clearCustomer(): void {
    this.customer.set(null);
    this.query.set('');
    this.newName.set('');
    this.newGender.set('');
  }

  addCustomer(): void {
    const name = this.newName().trim();
    const phone = this.query();
    if (!isIndianMobile(phone)) {
      this.error.set('Enter an Indian mobile number starting with 6, 7, 8, or 9.');
      return;
    }
    if (!name) {
      this.error.set('Enter a customer name.');
      return;
    }
    if (name.length > 20) {
      this.error.set('Customer name can be 20 characters only.');
      return;
    }
    if (this.newGender() !== 'Female' && this.newGender() !== 'Male') {
      this.error.set('Please select gender.');
      return;
    }
    this.error.set('');
    this.api
      .saveCustomer({ name, phone, notes: '', gender: this.newGender() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (person) => {
          this.customers.update((rows) => [...rows, person]);
          this.customer.set(person);
          this.newName.set('');
          this.newGender.set('');
          this.query.set('');
        },
        error: (error) => this.error.set(messageFrom(error, 'The customer could not be saved.')),
      });
  }

  setCategory(value: ServiceCategory | 'all'): void {
    this.category.set(value);
  }

  isSelected(serviceId: string): boolean {
    return this.lines().some((line) => line.serviceId === serviceId);
  }

  toggleService(service: ServiceItem): void {
    this.saved.set(null);
    if (this.isSelected(service.id)) {
      this.lines.update((rows) => rows.filter((line) => line.serviceId !== service.id));
      return;
    }
    this.lines.update((rows) => [
      ...rows,
      {
        key: crypto.randomUUID(),
        serviceId: service.id,
        serviceName: service.name,
        category: service.category,
        price: service.price,
        minutes: service.minutes,
        staffId: '',
        quantity: 1,
      },
    ]);
  }

  setStaff(key: string, event: Event): void {
    const staffId = inputValue(event);
    this.lines.update((rows) => rows.map((line) => (line.key === key ? { ...line, staffId } : line)));
  }

  setQuantity(key: string, event: Event): void {
    const quantity = Number(inputValue(event));
    if (!Number.isInteger(quantity) || quantity < 1) return;
    this.lines.update((rows) => rows.map((line) => (line.key === key ? { ...line, quantity } : line)));
  }

  removeLine(key: string): void {
    this.lines.update((rows) => rows.filter((line) => line.key !== key));
  }

  choosePayment(method: PaymentMethod): void {
    this.payment.set(method);
    this.saved.set(null);
  }

  categoryName(category: ServiceCategory): string {
    return categoryLabel(category);
  }

  lineTotal(line: DraftLine): number {
    return quoteDraft([line], 0, 0).subtotal;
  }

  save(): void {
    const problem = this.draftProblem();
    if (problem) {
      this.error.set(problem);
      return;
    }
    const person = this.customer();
    if (!person) return;
    this.saving.set(true);
    this.error.set('');
    this.api
      .saveBill({
        businessDate: todayIso(),
        customerId: person.id,
        lines: this.lines().map((line) => ({
          serviceId: line.serviceId,
          staffId: line.staffId,
          quantity: line.quantity,
        })),
        discount: this.discount(),
        taxPercent: 0,
        paymentMethod: this.payment(),
        billNumber: this.billNo().trim(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (bill) => {
          this.saving.set(false);
          this.saved.set(bill);
          this.lastBill.set(bill);
          this.lines.set([]);
          this.discountText.set('0');
          this.payment.set('');
          this.customer.set(null);
          this.query.set('');
          this.newName.set('');
          this.newGender.set('');
          this.billNo.set('');
        },
        error: (error) => {
          this.saving.set(false);
          this.error.set(messageFrom(error, 'The bill could not be saved.'));
        },
      });
  }

  newBill(): void {
    this.saved.set(null);
    this.error.set('');
  }

  printReceipt(): void {
    window.print();
  }

  private draftProblem(): string {
    if (!/^\d{1,5}$/.test(this.billNo())) return 'Enter a bill number of up to 5 digits.';
    if (!this.customer()) return 'Choose a customer before saving the bill.';
    if (this.lines().length === 0) return 'Add at least one service.';
    if (this.lines().some((line) => !line.staffId)) return 'Choose a stylist for each service.';
    if (!Number.isFinite(this.discount()) || this.discount() < 0) return 'Enter a discount of zero or more.';
    if (this.discount() > this.quote().subtotal) return 'Discount cannot be more than the subtotal.';
    if (this.payment() !== 'cash' && this.payment() !== 'upi') return 'Choose Cash or UPI.';
    return '';
  }
}
