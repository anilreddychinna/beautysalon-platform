import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ShopApi, messageFrom } from '../../api';
import { InrPipe } from '../../inr.pipe';
import {
  ServiceCategory,
  ServiceItem,
  StaffMember,
  categoryLabel,
  inputChecked,
  inputValue,
} from '../../models';

@Component({
  standalone: true,
  selector: 'app-catalog',
  imports: [InrPipe],
  templateUrl: './catalog.html',
})
export class Catalog {
  private readonly api = inject(ShopApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly services = signal<ServiceItem[]>([]);
  readonly staff = signal<StaffMember[]>([]);
  readonly error = signal('');
  readonly notice = signal('');
  readonly loading = signal(true);

  readonly serviceId = signal<string | null>(null);
  readonly serviceName = signal('');
  readonly category = signal<ServiceCategory>('hair');
  readonly price = signal('0');
  readonly minutes = signal('30');
  readonly serviceActive = signal(true);
  readonly savingService = signal(false);

  readonly staffId = signal<string | null>(null);
  readonly staffName = signal('');
  readonly commission = signal('');
  readonly staffActive = signal(true);
  readonly savingStaff = signal(false);

  readonly activeServiceCount = computed(() => this.services().filter((service) => service.active).length);
  readonly activeStaffCount = computed(() => this.staff().filter((member) => member.active).length);

  constructor() {
    this.load();
  }

  load(): void {
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
  }

  onText(target: { set(value: string): void }, event: Event): void {
    target.set(inputValue(event));
  }

  onCategory(event: Event): void {
    this.category.set(inputValue(event) as ServiceCategory);
  }

  onServiceActive(event: Event): void {
    this.serviceActive.set(inputChecked(event));
  }

  onStaffActive(event: Event): void {
    this.staffActive.set(inputChecked(event));
  }

  label(category: ServiceCategory): string {
    return categoryLabel(category);
  }

  editService(service: ServiceItem): void {
    this.serviceId.set(service.id);
    this.serviceName.set(service.name);
    this.category.set(service.category);
    this.price.set(String(service.price));
    this.minutes.set(String(service.minutes));
    this.serviceActive.set(service.active);
    this.error.set('');
  }

  resetService(): void {
    this.serviceId.set(null);
    this.serviceName.set('');
    this.category.set('hair');
    this.price.set('0');
    this.minutes.set('30');
    this.serviceActive.set(true);
  }

  saveService(): void {
    const name = this.serviceName().trim();
    const price = Number(this.price());
    const minutes = Number(this.minutes());
    if (!name) {
      this.error.set('Enter a service name.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      this.error.set('Enter a price of zero or more.');
      return;
    }
    if (!Number.isInteger(minutes) || minutes < 1) {
      this.error.set('Enter the minutes for this service.');
      return;
    }
    this.savingService.set(true);
    this.error.set('');
    const editing = this.serviceId();
    this.api
      .saveService(
        { name, category: this.category(), price, minutes, active: this.serviceActive() },
        editing ?? undefined,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.savingService.set(false);
          this.services.update((rows) =>
            editing ? rows.map((row) => (row.id === saved.id ? saved : row)) : [...rows, saved],
          );
          this.notice.set(editing ? 'Service updated.' : 'Service saved.');
          this.resetService();
        },
        error: (error) => {
          this.savingService.set(false);
          this.error.set(messageFrom(error, 'The service could not be saved.'));
        },
      });
  }

  editStaff(member: StaffMember): void {
    this.staffId.set(member.id);
    this.staffName.set(member.name);
    this.commission.set(member.commissionPercent == null ? '' : String(member.commissionPercent));
    this.staffActive.set(member.active);
    this.error.set('');
  }

  resetStaff(): void {
    this.staffId.set(null);
    this.staffName.set('');
    this.commission.set('');
    this.staffActive.set(true);
  }

  saveStaff(): void {
    const name = this.staffName().trim();
    const raw = this.commission().trim();
    let commissionPercent: number | null = null;
    if (!name) {
      this.error.set('Enter a staff name.');
      return;
    }
    if (raw !== '') {
      commissionPercent = Number(raw);
      if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
        this.error.set('Commission percent must be between 0 and 100.');
        return;
      }
    }
    this.savingStaff.set(true);
    this.error.set('');
    const editing = this.staffId();
    this.api
      .saveStaff({ name, commissionPercent, active: this.staffActive() }, editing ?? undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.savingStaff.set(false);
          this.staff.update((rows) => (editing ? rows.map((row) => (row.id === saved.id ? saved : row)) : [...rows, saved]));
          this.notice.set(editing ? 'Staff updated.' : 'Staff saved.');
          this.resetStaff();
        },
        error: (error) => {
          this.savingStaff.set(false);
          this.error.set(messageFrom(error, 'The staff record could not be saved.'));
        },
      });
  }
}
