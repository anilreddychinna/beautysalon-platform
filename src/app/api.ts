import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, from, map, of, switchMap, tap, throwError } from 'rxjs';
import {
  Bill,
  BillLine,
  Customer,
  CustomerGender,
  DayClose,
  PaymentMethod,
  Report,
  ServiceCategory,
  ServiceItem,
  ShopUser,
  StaffLogin,
  StaffMember,
  UserRole,
  quoteDraft,
  roundMoney,
} from './models';
import { SupabaseService } from './supabase';

export interface BillDraft {
  businessDate: string;
  customerId: string;
  lines: { serviceId: string; staffId: string; quantity: number }[];
  discount: number;
  taxPercent: number;
  paymentMethod: string;
  billNumber: string;
}

/**
 * Shop data starts in public/Data. After the first load it is kept in localStorage
 * on this browser, so saves survive a refresh on GitHub Pages.
 */
const files = {
  customers: '/Data/customers.json',
  services: '/Data/services.json',
  staff: '/Data/staff.json',
  bills: '/Data/bills.json',
  users: '/Data/users.json',
};

const specialSeedKey = 'peeple-special-seeded';

const storageKeys = {
  customers: 'peeple-customers',
  services: 'peeple-services',
  staff: 'peeple-staff',
  bills: 'peeple-bills',
  users: 'peeple-users',
  dayCloses: 'peeple-day-closes',
};

interface UserRecord extends ShopUser {
  password: string;
}

const payments = new Set<PaymentMethod>(['cash', 'upi']);

@Injectable({ providedIn: 'root' })
export class ShopApi {
  private readonly http = inject(HttpClient);
  private readonly supabase = inject(SupabaseService);
  private customersCache: Customer[] | null = null;
  private servicesCache: ServiceItem[] | null = null;
  private staffCache: StaffMember[] | null = null;
  private billsCache: Bill[] | null = null;
  private usersCache: UserRecord[] | null = null;
  private staffLoginsCache: StaffLogin[] | null = null;
  private dayClosesCache: DayClose[] | null = null;

  login(username: string, password: string): Observable<ShopUser> {
    if (this.supabase.enabled) return from(this.loginRemote(username, password));
    const name = username.trim().toLowerCase();
    return this.users().pipe(
      map((rows) => {
        const found = rows.find((row) => row.username.trim().toLowerCase() === name && row.password === password);
        if (!found) throw new Error('That username or password is not correct.');
        return { id: found.id, username: found.username, name: found.name, role: found.role };
      }),
    );
  }

  private users(): Observable<UserRecord[]> {
    if (this.usersCache) return of(this.usersCache);
    return this.read<UserRecord>(files.users, 'users.json', storageKeys.users).pipe(
      tap((rows) => (this.usersCache = rows.map((row) => this.asUser(row)))),
    );
  }

  private asUser(row: UserRecord): UserRecord {
    const roles = new Set<UserRole>(['Admin', 'Manager']);
    if (!row.username?.trim() || !row.password || !row.name?.trim() || !roles.has(row.role)) {
      throw new Error('A user record in users.json is missing a username, password, name, or role.');
    }
    return row;
  }

  staffLogins(): Observable<StaffLogin[]> {
    if (this.staffLoginsCache) return of(this.staffLoginsCache);
    if (this.supabase.enabled) return from(this.listStaffLoginsRemote());
    return this.users().pipe(
      map((rows) => rows.map(asStaffLogin)),
      tap((rows) => (this.staffLoginsCache = rows)),
    );
  }

  createStaffLogin(input: { username: string; name: string; role: string; password: string }): Observable<StaffLogin> {
    const login = checkedStaffLogin(input);
    if (this.supabase.enabled) return from(this.createStaffLoginRemote(login));
    return this.users().pipe(
      map((rows) => {
        const taken = rows.some((row) => row.username.trim().toLowerCase() === login.username);
        if (taken) throw new Error('That username is already used.');
        const created: UserRecord = { id: crypto.randomUUID(), ...login };
        this.usersCache = [...rows, created];
        writeStored(storageKeys.users, this.usersCache);
        const person = asStaffLogin(created);
        this.staffLoginsCache = [...(this.staffLoginsCache ?? rows.map(asStaffLogin)), person];
        return person;
      }),
    );
  }

  customers(): Observable<Customer[]> {
    if (this.customersCache) return of(this.customersCache);
    if (this.supabase.enabled) return this.loadRemoteCustomers();
    return this.read<Customer>(files.customers, 'customers.json', storageKeys.customers).pipe(
      map((rows) => {
        const numbered = assignCustomerNumbers(rows);
        if (numbered.changed) writeStored(storageKeys.customers, numbered.rows);
        return numbered.rows;
      }),
      tap((rows) => (this.customersCache = [...rows])),
    );
  }

  saveCustomer(input: { name: string; phone: string; notes: string; gender?: string }, id?: string): Observable<Customer> {
    if (this.supabase.enabled) return from(this.saveCustomerRemote(input, id));
    return this.customers().pipe(map((rows) => this.storeCustomer(rows, input, id)));
  }

  services(): Observable<ServiceItem[]> {
    if (this.servicesCache) return of(this.servicesCache);
    if (this.supabase.enabled) return this.loadRemoteServices();
    const stored = readStored<ServiceItem>(storageKeys.services);
    if (!stored) {
      return this.read<ServiceItem>(files.services, 'services.json', storageKeys.services).pipe(
        tap((rows) => {
          this.servicesCache = [...rows];
          localStorage.setItem(specialSeedKey, '1');
        }),
      );
    }
    if (localStorage.getItem(specialSeedKey) === '1') {
      this.servicesCache = [...stored];
      return of(this.servicesCache);
    }
    return this.http.get<ServiceItem[]>(files.services).pipe(
      map((seed) => mergeSpecialServices(stored, seed)),
      catchError(() => of(stored)),
      tap((rows) => (this.servicesCache = [...rows])),
    );
  }

  saveService(input: Omit<ServiceItem, 'id'>, id?: string): Observable<ServiceItem> {
    if (this.supabase.enabled) return from(this.saveServiceRemote(input, id));
    return this.services().pipe(map((rows) => this.storeService(rows, input, id)));
  }

  staff(): Observable<StaffMember[]> {
    if (this.staffCache) return of(this.staffCache);
    if (this.supabase.enabled) return this.loadRemoteStaff();
    return this.read<StaffMember>(files.staff, 'staff.json', storageKeys.staff).pipe(tap((rows) => (this.staffCache = [...rows])));
  }

  saveStaff(input: Omit<StaffMember, 'id'>, id?: string): Observable<StaffMember> {
    if (this.supabase.enabled) return from(this.saveStaffRemote(input, id));
    return this.staff().pipe(map((rows) => this.storeStaff(rows, input, id)));
  }

  bills(from?: string, to?: string): Observable<Bill[]> {
    return this.loadBills().pipe(
      map((rows) =>
        rows
          .filter((bill) => (!from || bill.businessDate >= from) && (!to || bill.businessDate <= to))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      ),
    );
  }

  saveBill(draft: BillDraft): Observable<Bill> {
    return forkJoin({
      customers: this.customers(),
      services: this.services(),
      staff: this.staff(),
      bills: this.loadBills(),
    }).pipe(
      switchMap((data) => {
        const bill = this.assembleBill(draft, data.customers, data.services, data.staff, data.bills);
        if (!this.supabase.enabled) {
          this.billsCache = [...data.bills, bill];
          writeStored(storageKeys.bills, this.billsCache);
          return of(bill);
        }
        return from(this.insertBillRemote(bill));
      }),
    );
  }

  report(from: string, to: string): Observable<Report> {
    return this.loadBills().pipe(map((rows) => buildReport(rows, from, to)));
  }

  excel(from: string, to: string): Observable<Blob> {
    return this.report(from, to).pipe(map((report) => excelBlob(report.bills)));
  }

  private read<T>(url: string, label: string, storageKey: string): Observable<T[]> {
    const stored = readStored<T>(storageKey);
    if (stored) return of(stored);
    return this.http.get<T[]>(url).pipe(
      tap((rows) => writeStored(storageKey, rows)),
      catchError(() =>
        throwError(() => new Error(`Could not read ${label}. Check that the file is in public/Data.`)),
      ),
    );
  }

  private async loginRemote(username: string, password: string): Promise<ShopUser> {
    const client = this.supabase.client;
    if (!client) throw new Error('Supabase is not configured.');
    const signedIn = await client.auth.signInWithPassword({
      email: this.supabase.authEmail(username),
      password,
    });
    if (signedIn.error || !signedIn.data.user) throw new Error('That username or password is not correct.');
    const profile = await client
      .from('users')
      .select('id, username, name, role')
      .eq('auth_user_id', signedIn.data.user.id)
      .maybeSingle();
    if (profile.error || !profile.data) throw new Error('This login is not linked to a staff user.');
    const role = profile.data.role;
    if (role !== 'Admin' && role !== 'Manager') throw new Error('This login is not linked to a staff user.');
    return { id: profile.data.id, username: profile.data.username, name: profile.data.name, role };
  }

  private async listStaffLoginsRemote(): Promise<StaffLogin[]> {
    const client = this.supabase.client;
    if (!client) throw new Error('Supabase is not configured.');
    const listed = await client.rpc('list_staff_users');
    if (listed.error) throw staffLoginError(listed.error.message, 'Users could not be loaded.');
    const rows = ((listed.data ?? []) as StaffLoginRecord[]).map(asStaffLoginRow);
    this.staffLoginsCache = rows;
    return rows;
  }

  private async createStaffLoginRemote(login: CheckedStaffLogin): Promise<StaffLogin> {
    const client = this.supabase.client;
    if (!client) throw new Error('Supabase is not configured.');
    const created = await client.rpc('create_staff_login', {
      p_username: login.username,
      p_name: login.name,
      p_role: login.role,
      p_password: login.password,
    });
    if (created.error || !created.data) {
      throw staffLoginError(created.error?.message ?? '', 'The user could not be saved.');
    }
    const person = asStaffLoginRow(created.data as StaffLoginRecord);
    this.staffLoginsCache = [...(this.staffLoginsCache ?? []).filter((row) => row.id !== person.id), person];
    return person;
  }

  private loadRemoteCustomers(): Observable<Customer[]> {
    const client = this.supabase.client;
    if (!client) return throwError(() => new Error('Supabase is not configured.'));
    return from(
      client.from('customers').select('id, customer_number, name, phone, gender, notes, created_at').order('name'),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []).map(asCustomerRow);
      }),
      tap((rows) => (this.customersCache = rows)),
    );
  }

  private async saveCustomerRemote(
    input: { name: string; phone: string; notes: string; gender?: string },
    id?: string,
  ): Promise<Customer> {
    const client = this.supabase.client;
    if (!client) throw new Error('Supabase is not configured.');
    const fields = checkedCustomer(input, id);
    const payload = {
      name: fields.name,
      phone: fields.phone,
      notes: fields.notes,
      gender: fields.gender || null,
    };
    const saved = id
      ? await client.from('customers').update(payload).eq('id', id).select('id, customer_number, name, phone, gender, notes, created_at').single()
      : await client.from('customers').insert(payload).select('id, customer_number, name, phone, gender, notes, created_at').single();
    if (saved.error || !saved.data) {
      if (saved.error?.code === '23505') throw new Error('A customer with this phone number already exists.');
      throw new Error(saved.error?.message || 'The customer could not be saved.');
    }
    const person = asCustomerRow(saved.data);
    this.customersCache = this.customersCache
      ? id
        ? this.customersCache.map((row) => (row.id === id ? person : row))
        : [...this.customersCache, person]
      : [person];
    return person;
  }

  private loadRemoteServices(): Observable<ServiceItem[]> {
    const client = this.supabase.client;
    if (!client) return throwError(() => new Error('Supabase is not configured.'));
    return from(client.from('services').select('id, name, category, price, minutes, active, color').order('name')).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []).map(asServiceRow);
      }),
      tap((rows) => (this.servicesCache = rows)),
    );
  }

  private async saveServiceRemote(input: Omit<ServiceItem, 'id'>, id?: string): Promise<ServiceItem> {
    const client = this.supabase.client;
    if (!client) throw new Error('Supabase is not configured.');
    const name = input.name.trim();
    const categories = new Set<ServiceCategory>(['hair', 'skin', 'nails', 'special']);
    if (!name) throw new Error('Enter a service name.');
    if (!categories.has(input.category)) throw new Error('Choose a category: hair, skin, nails, or special.');
    if (!Number.isFinite(input.price) || input.price < 0) throw new Error('Enter a price of zero or more.');
    if (!Number.isInteger(input.minutes) || input.minutes < 1) throw new Error('Enter the minutes for this service.');
    const payload = {
      name,
      category: input.category,
      price: roundMoney(input.price),
      minutes: input.minutes,
      active: input.active,
      color: input.color ?? null,
    };
    const saved = id
      ? await client.from('services').update(payload).eq('id', id).select('id, name, category, price, minutes, active, color').single()
      : await client.from('services').insert(payload).select('id, name, category, price, minutes, active, color').single();
    if (saved.error || !saved.data) throw new Error(saved.error?.message || 'The service could not be saved.');
    const service = asServiceRow(saved.data);
    this.servicesCache = id
      ? (this.servicesCache ?? []).map((row) => (row.id === id ? service : row))
      : [...(this.servicesCache ?? []), service];
    return service;
  }

  private loadRemoteStaff(): Observable<StaffMember[]> {
    const client = this.supabase.client;
    if (!client) return throwError(() => new Error('Supabase is not configured.'));
    return from(client.from('staff').select('id, name, commission_percent, active').order('name')).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []).map(asStaffRow);
      }),
      tap((rows) => (this.staffCache = rows)),
    );
  }

  private async saveStaffRemote(input: Omit<StaffMember, 'id'>, id?: string): Promise<StaffMember> {
    const client = this.supabase.client;
    if (!client) throw new Error('Supabase is not configured.');
    const name = input.name.trim();
    if (!name) throw new Error('Enter a staff name.');
    if (
      input.commissionPercent != null &&
      (!Number.isFinite(input.commissionPercent) || input.commissionPercent < 0 || input.commissionPercent > 100)
    ) {
      throw new Error('Commission percent must be between 0 and 100.');
    }
    const payload = {
      name,
      commission_percent: input.commissionPercent == null ? null : roundMoney(input.commissionPercent),
      active: input.active,
    };
    const saved = id
      ? await client.from('staff').update(payload).eq('id', id).select('id, name, commission_percent, active').single()
      : await client.from('staff').insert(payload).select('id, name, commission_percent, active').single();
    if (saved.error || !saved.data) throw new Error(saved.error?.message || 'The staff member could not be saved.');
    const member = asStaffRow(saved.data);
    this.staffCache = id
      ? (this.staffCache ?? []).map((row) => (row.id === id ? member : row))
      : [...(this.staffCache ?? []), member];
    return member;
  }

  private loadRemoteBills(): Observable<Bill[]> {
    const client = this.supabase.client;
    if (!client) return throwError(() => new Error('Supabase is not configured.'));
    return from(
      client
        .from('bills')
        .select(
          'id, bill_number, business_date, customer_id, customer_name, customer_phone, subtotal, discount, tax_percent, tax_amount, total, payment_method, created_at, cancelled_at, bill_lines(service_id, service_name, category, price, minutes, staff_id, staff_name, commission_percent, quantity, line_total)',
        )
        .order('created_at', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []).map(asBillRow);
      }),
      tap((rows) => (this.billsCache = rows)),
    );
  }

  private async insertBillRemote(bill: Bill): Promise<Bill> {
    const client = this.supabase.client;
    if (!client) throw new Error('Supabase is not configured.');
    const inserted = await client
      .from('bills')
      .insert({
        bill_number: bill.billNumber,
        business_date: bill.businessDate,
        customer_id: bill.customerId,
        customer_name: bill.customerName,
        customer_phone: bill.customerPhone,
        subtotal: bill.subtotal,
        discount: bill.discount,
        tax_percent: bill.taxPercent,
        tax_amount: bill.taxAmount,
        total: bill.total,
        payment_method: bill.paymentMethod,
      })
      .select('id, created_at')
      .single();
    if (inserted.error || !inserted.data) {
      if (inserted.error?.code === '23505') throw new Error('That bill number is already used.');
      throw new Error(inserted.error?.message || 'The bill could not be saved.');
    }
    const lines = await client.from('bill_lines').insert(
      bill.lines.map((line) => ({
        bill_id: inserted.data.id,
        service_id: line.serviceId,
        service_name: line.serviceName,
        category: line.category,
        price: line.price,
        minutes: line.minutes,
        staff_id: line.staffId,
        staff_name: line.staffName,
        commission_percent: line.commissionPercent,
        quantity: line.quantity,
        line_total: line.lineTotal,
      })),
    );
    if (lines.error) {
      await client.from('bills').delete().eq('id', inserted.data.id);
      throw new Error(lines.error.message || 'The bill lines could not be saved.');
    }
    const saved: Bill = { ...bill, id: inserted.data.id, createdAt: inserted.data.created_at };
    this.billsCache = [saved, ...(this.billsCache ?? []).filter((row) => row.id !== bill.id)];
    return saved;
  }

  private async cancelBillRemote(id: string): Promise<Bill> {
    const client = this.supabase.client;
    if (!client) throw new Error('Supabase is not configured.');
    const rows = this.billsCache ?? [];
    const current = rows.find((bill) => bill.id === id);
    if (!current) throw new Error('That bill was not found.');
    if (current.cancelledAt) throw new Error('That bill is already cancelled.');
    const cancelledAt = new Date().toISOString();
    const saved = await client.from('bills').update({ cancelled_at: cancelledAt }).eq('id', id);
    if (saved.error) throw new Error(saved.error.message || 'The bill could not be cancelled.');
    const updated = { ...current, cancelledAt };
    this.billsCache = rows.map((bill) => (bill.id === id ? updated : bill));
    return updated;
  }

  private loadRemoteDayCloses(): Observable<DayClose[]> {
    const client = this.supabase.client;
    if (!client) return throwError(() => new Error('Supabase is not configured.'));
    return from(client.from('day_closes').select('business_date, cash_counted, note, closed_at')).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []).map(asDayCloseRow);
      }),
      tap((rows) => (this.dayClosesCache = rows)),
    );
  }

  private async saveDayCloseRemote(date: string, cashCounted: number, note: string): Promise<DayClose> {
    const client = this.supabase.client;
    if (!client) throw new Error('Supabase is not configured.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a date.');
    if (!Number.isFinite(cashCounted) || cashCounted < 0) throw new Error('Enter the cash counted in the drawer.');
    const close: DayClose = {
      date,
      cashCounted: roundMoney(cashCounted),
      note: note.trim(),
      closedAt: new Date().toISOString(),
    };
    const saved = await client.from('day_closes').upsert(
      {
        business_date: close.date,
        cash_counted: close.cashCounted,
        note: close.note,
        closed_at: close.closedAt,
      },
      { onConflict: 'business_date' },
    );
    if (saved.error) throw new Error(saved.error.message || 'The day close could not be saved.');
    this.dayClosesCache = [...(this.dayClosesCache ?? []).filter((row) => row.date !== date), close];
    return close;
  }

  private loadBills(): Observable<Bill[]> {
    if (this.billsCache) return of(this.billsCache);
    if (this.supabase.enabled) return this.loadRemoteBills();
    return this.read<Bill>(files.bills, 'bills.json', storageKeys.bills).pipe(tap((rows) => (this.billsCache = [...rows])));
  }

  private storeCustomer(
    rows: Customer[],
    input: { name: string; phone: string; notes: string; gender?: string },
    id?: string,
  ): Customer {
    const { name, phone, notes, gender } = checkedCustomer(input, id);
    if (rows.some((row) => row.phone === phone && row.id !== id)) {
      throw new Error('A customer with this phone number already exists.');
    }
    if (id) {
      const current = rows.find((row) => row.id === id);
      if (!current) throw new Error('That customer was not found.');
      const customerId = numericCustomerId(current.customerId) ? current.customerId : String(nextCustomerNumber(rows));
      const updated = { ...current, name, phone, notes, gender, customerId };
      this.customersCache = rows.map((row) => (row.id === id ? updated : row));
      writeStored(storageKeys.customers, this.customersCache);
      return updated;
    }
    const created: Customer = {
      id: crypto.randomUUID(),
      customerId: String(nextCustomerNumber(rows)),
      name,
      phone,
      notes,
      gender,
      createdAt: new Date().toISOString(),
    };
    this.customersCache = [...rows, created];
    writeStored(storageKeys.customers, this.customersCache);
    return created;
  }

  private storeService(rows: ServiceItem[], input: Omit<ServiceItem, 'id'>, id?: string): ServiceItem {
    const name = input.name.trim();
    const categories = new Set<ServiceCategory>(['hair', 'skin', 'nails', 'special']);
    if (!name) throw new Error('Enter a service name.');
    if (!categories.has(input.category)) throw new Error('Choose a category: hair, skin, nails, or special.');
    if (!Number.isFinite(input.price) || input.price < 0) throw new Error('Enter a price of zero or more.');
    if (!Number.isInteger(input.minutes) || input.minutes < 1) throw new Error('Enter the minutes for this service.');
    const next = {
      name,
      category: input.category,
      price: roundMoney(input.price),
      minutes: input.minutes,
      active: input.active,
    };
    if (id) {
      const current = rows.find((row) => row.id === id);
      if (!current) throw new Error('That service was not found.');
      const updated = { ...current, ...next, id };
      this.servicesCache = rows.map((row) => (row.id === id ? updated : row));
      writeStored(storageKeys.services, this.servicesCache);
      return updated;
    }
    const created = { ...next, id: crypto.randomUUID() };
    this.servicesCache = [...rows, created];
    writeStored(storageKeys.services, this.servicesCache);
    return created;
  }

  private storeStaff(rows: StaffMember[], input: Omit<StaffMember, 'id'>, id?: string): StaffMember {
    const name = input.name.trim();
    if (!name) throw new Error('Enter a staff name.');
    if (
      input.commissionPercent != null &&
      (!Number.isFinite(input.commissionPercent) || input.commissionPercent < 0 || input.commissionPercent > 100)
    ) {
      throw new Error('Commission percent must be between 0 and 100.');
    }
    const next = {
      name,
      commissionPercent: input.commissionPercent == null ? null : roundMoney(input.commissionPercent),
      active: input.active,
    };
    if (id) {
      const current = rows.find((row) => row.id === id);
      if (!current) throw new Error('That staff member was not found.');
      const updated = { ...current, ...next, id };
      this.staffCache = rows.map((row) => (row.id === id ? updated : row));
      writeStored(storageKeys.staff, this.staffCache);
      return updated;
    }
    const created = { ...next, id: crypto.randomUUID() };
    this.staffCache = [...rows, created];
    writeStored(storageKeys.staff, this.staffCache);
    return created;
  }

  private assembleBill(
    draft: BillDraft,
    customers: Customer[],
    services: ServiceItem[],
    staff: StaffMember[],
    bills: Bill[],
  ): Bill {
    const customer = customers.find((row) => row.id === draft.customerId);
    if (!customer) throw new Error('Choose a customer before saving the bill.');
    if (!draft.lines.length) throw new Error('Add at least one service.');
    if (!payments.has(draft.paymentMethod as PaymentMethod)) throw new Error('Choose Cash or UPI.');

    const lines: BillLine[] = draft.lines.map((line) => {
      const service = services.find((row) => row.id === line.serviceId && row.active);
      const member = staff.find((row) => row.id === line.staffId && row.active);
      if (!service) throw new Error('One of the services is not active. Refresh the counter and try again.');
      if (!member) throw new Error('Choose a stylist for each service.');
      if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new Error('Quantity must be at least 1.');
      return {
        serviceId: service.id,
        serviceName: service.name,
        category: service.category,
        price: service.price,
        minutes: service.minutes,
        staffId: member.id,
        staffName: member.name,
        commissionPercent: member.commissionPercent,
        quantity: line.quantity,
        lineTotal: roundMoney(service.price * line.quantity),
      };
    });

    const quote = quoteDraft(lines, Number(draft.discount ?? 0), Number(draft.taxPercent ?? 0));
    if (!Number.isFinite(Number(draft.discount)) || Number(draft.discount) < 0) {
      throw new Error('Enter a discount of zero or more.');
    }
    if (Number(draft.discount) > quote.subtotal) throw new Error('Discount cannot be more than the subtotal.');
    const taxPercent = Number(draft.taxPercent ?? 0);
    if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) {
      throw new Error('Tax percent must be between 0 and 100.');
    }

    const billNumber = draft.billNumber.trim();
    if (!/^\d{1,5}$/.test(billNumber)) throw new Error('Enter a bill number of up to 5 digits.');
    if (bills.some((bill) => !bill.cancelledAt && bill.billNumber === billNumber)) {
      throw new Error('That bill number is already used.');
    }
    const bill: Bill = {
      id: crypto.randomUUID(),
      billNumber,
      createdAt: new Date().toISOString(),
      businessDate: draft.businessDate,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      lines,
      subtotal: quote.subtotal,
      discount: quote.discount,
      taxPercent: roundMoney(taxPercent),
      taxAmount: quote.taxAmount,
      total: quote.total,
      paymentMethod: draft.paymentMethod as PaymentMethod,
    };
    return bill;
  }

  cancelBill(id: string): Observable<Bill> {
    if (this.supabase.enabled) return from(this.cancelBillRemote(id));
    return this.loadBills().pipe(map((rows) => this.storeCancel(rows, id)));
  }

  dayClose(date: string): Observable<DayClose | null> {
    return this.loadDayCloses().pipe(map((rows) => rows.find((row) => row.date === date) ?? null));
  }

  saveDayClose(date: string, cashCounted: number, note: string): Observable<DayClose> {
    if (this.supabase.enabled) return from(this.saveDayCloseRemote(date, cashCounted, note));
    return this.loadDayCloses().pipe(map((rows) => this.storeDayClose(rows, date, cashCounted, note)));
  }

  private loadDayCloses(): Observable<DayClose[]> {
    if (this.dayClosesCache) return of(this.dayClosesCache);
    if (this.supabase.enabled) return this.loadRemoteDayCloses();
    this.dayClosesCache = readStored<DayClose>(storageKeys.dayCloses) ?? [];
    return of(this.dayClosesCache);
  }

  private storeCancel(bills: Bill[], id: string): Bill {
    const current = bills.find((bill) => bill.id === id);
    if (!current) throw new Error('That bill was not found.');
    if (current.cancelledAt) throw new Error('That bill is already cancelled.');
    const updated: Bill = { ...current, cancelledAt: new Date().toISOString() };
    this.billsCache = bills.map((bill) => (bill.id === id ? updated : bill));
    writeStored(storageKeys.bills, this.billsCache);
    return updated;
  }

  private storeDayClose(rows: DayClose[], date: string, cashCounted: number, note: string): DayClose {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a date.');
    if (!Number.isFinite(cashCounted) || cashCounted < 0) throw new Error('Enter the cash counted in the drawer.');
    const close: DayClose = {
      date,
      cashCounted: roundMoney(cashCounted),
      note: note.trim(),
      closedAt: new Date().toISOString(),
    };
    this.dayClosesCache = [...rows.filter((row) => row.date !== date), close];
    writeStored(storageKeys.dayCloses, this.dayClosesCache);
    return close;
  }
}

function buildReport(bills: Bill[], from: string, to: string): Report {
  const selected = bills
    .filter((bill) => !bill.cancelledAt && bill.businessDate >= from && bill.businessDate <= to)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const days = new Map<string, Report['byDay'][number]>();
  const services = new Map<string, Report['byService'][number]>();
  const staff = new Map<string, Report['byStaff'][number]>();

  for (const bill of selected) {
    const day = days.get(bill.businessDate) ?? {
      date: bill.businessDate,
      bills: 0,
      total: 0,
      cash: 0,
      card: 0,
      upi: 0,
    };
    day.bills += 1;
    day.total = roundMoney(day.total + bill.total);
    day[bill.paymentMethod] = roundMoney(day[bill.paymentMethod] + bill.total);
    days.set(bill.businessDate, day);

    for (const line of bill.lines) {
      const amount = roundMoney(line.price * line.quantity);
      const service = services.get(line.serviceId) ?? {
        serviceId: line.serviceId,
        name: line.serviceName,
        category: line.category,
        quantity: 0,
        amount: 0,
      };
      service.quantity += line.quantity;
      service.amount = roundMoney(service.amount + amount);
      services.set(line.serviceId, service);

      const member = staff.get(line.staffId) ?? {
        staffId: line.staffId,
        name: line.staffName,
        services: 0,
        sales: 0,
        commission: 0,
      };
      const rate = line.commissionPercent ?? 0;
      member.services += line.quantity;
      member.sales = roundMoney(member.sales + amount);
      member.commission = roundMoney(member.commission + roundMoney((amount * rate) / 100));
      staff.set(line.staffId, member);
    }
  }

  return {
    from,
    to,
    bills: selected,
    byDay: [...days.values()],
    byService: [...services.values()].sort((a, b) => b.amount - a.amount),
    byStaff: [...staff.values()].sort((a, b) => b.sales - a.sales),
  };
}

function excelBlob(bills: Bill[]): Blob {
  const header = ['Bill number', 'Date', 'Customer', 'Phone', 'Services', 'Subtotal', 'Discount', 'Tax', 'Total', 'Payment'];
  const body = bills.map((bill) => [
    bill.billNumber,
    bill.businessDate,
    bill.customerName,
    bill.customerPhone,
    bill.lines.map((line) => `${line.serviceName} x ${line.quantity}`).join(', '),
    bill.subtotal,
    bill.discount,
    bill.taxAmount,
    bill.total,
    bill.paymentMethod,
  ]);
  const rows = [header, ...body]
    .map(
      (row) =>
        `<Row>${row
          .map((value) => {
            const type = typeof value === 'number' ? 'Number' : 'String';
            return `<Cell><Data ss:Type="${type}">${escapeXml(String(value))}</Data></Cell>`;
          })
          .join('')}</Row>`,
    )
    .join('');
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Bills"><Table>${rows}</Table></Worksheet>
</Workbook>`;
  return new Blob([xml], { type: 'application/vnd.ms-excel' });
}

interface StaffLoginRecord {
  id: string;
  username: string;
  name: string;
  role: UserRole;
}

interface CheckedStaffLogin {
  username: string;
  name: string;
  role: UserRole;
  password: string;
}

function asStaffLogin(row: UserRecord): StaffLogin {
  return { id: row.id, username: row.username, name: row.name, role: row.role };
}

function asStaffLoginRow(row: StaffLoginRecord): StaffLogin {
  return { id: row.id, username: row.username, name: row.name, role: row.role };
}

function checkedStaffLogin(input: { username: string; name: string; role: string; password: string }): CheckedStaffLogin {
  const username = input.username.trim().toLowerCase();
  const name = input.name.trim();
  if (!/^[a-z][a-z0-9]{2,19}$/.test(username)) {
    throw new Error('Username must start with a letter and use 3 to 20 letters or numbers.');
  }
  if (!name || name.length > 40) throw new Error('Enter a name up to 40 characters.');
  if (input.role !== 'Admin' && input.role !== 'Manager') throw new Error('Choose Admin or Manager.');
  if (input.password.length < 6) throw new Error('Password must be at least 6 characters.');
  return { username, name, role: input.role, password: input.password };
}

function staffLoginError(message: string, fallback: string): Error {
  if (message.includes('list_staff_users') || message.includes('create_staff_login')) {
    return new Error('Run db-scripts/005-staff-logins.sql in the Supabase SQL editor, then try again.');
  }
  return new Error(message || fallback);
}

interface CustomerRecord {
  id: string;
  customer_number: number;
  name: string;
  phone: string;
  gender: CustomerGender | null;
  notes: string;
  created_at: string;
}

function asCustomerRow(row: CustomerRecord): Customer {
  return {
    id: row.id,
    customerId: String(row.customer_number),
    name: row.name,
    phone: row.phone,
    gender: row.gender || '',
    notes: row.notes ?? '',
    createdAt: row.created_at,
  };
}

function checkedCustomer(
  input: { name: string; phone: string; notes: string; gender?: string },
  id?: string,
): { name: string; phone: string; notes: string; gender: CustomerGender } {
  const name = input.name.trim();
  const phone = input.phone.trim();
  const notes = input.notes.trim();
  const gender = customerGender(input.gender);
  if (!name) throw new Error('Enter a customer name.');
  if (name.length > 20) throw new Error('Customer name can be 20 characters only.');
  if (!/^[6-9]\d{9}$/.test(phone)) throw new Error('Enter an Indian mobile number starting with 6, 7, 8, or 9.');
  if (!id && gender !== 'Female' && gender !== 'Male') throw new Error('Please select gender.');
  return { name, phone, notes, gender };
}

function numericCustomerId(value: string | undefined): boolean {
  return !!value && /^\d+$/.test(value);
}

function nextCustomerNumber(rows: Customer[]): number {
  let max = 0;
  for (const row of rows) {
    if (numericCustomerId(row.customerId)) max = Math.max(max, Number(row.customerId));
  }
  return max + 1;
}

function assignCustomerNumbers(rows: Customer[]): { rows: Customer[]; changed: boolean } {
  let max = 0;
  for (const row of rows) {
    if (numericCustomerId(row.customerId)) max = Math.max(max, Number(row.customerId));
  }
  const pending = rows
    .map((row, index) => ({ row, index }))
    .filter((item) => !numericCustomerId(item.row.customerId))
    .sort((a, b) => (a.row.createdAt || '').localeCompare(b.row.createdAt || '') || a.index - b.index);
  if (!pending.length) return { rows, changed: false };
  const numbers = new Map<string, string>();
  for (const item of pending) {
    max += 1;
    numbers.set(item.row.id, String(max));
  }
  return {
    changed: true,
    rows: rows.map((row) => {
      const customerId = numbers.get(row.id);
      return customerId ? { ...row, customerId } : row;
    }),
  };
}

function customerGender(value: string | undefined): Customer['gender'] {
  if (value === 'Female' || value === 'Male' || value === 'Other') return value;
  return '';
}

function mergeSpecialServices(stored: ServiceItem[], seed: ServiceItem[]): ServiceItem[] {
  const specials = seed.filter((row) => row.category === 'special');
  if (!specials.length) return stored;
  const ids = new Set(stored.map((row) => row.id));
  const added = specials.filter((row) => !ids.has(row.id));
  const rows = added.length ? [...stored, ...added] : stored;
  if (added.length) writeStored(storageKeys.services, rows);
  localStorage.setItem(specialSeedKey, '1');
  return rows;
}

function readStored<T>(key: string): T[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error('Could not save on this device. Browser storage is full.');
  }
}

interface ServiceRecord {
  id: string;
  name: string;
  category: ServiceCategory;
  price: number | string;
  minutes: number;
  active: boolean;
  color: string | null;
}

interface StaffRecord {
  id: string;
  name: string;
  commission_percent: number | string | null;
  active: boolean;
}

interface BillLineRecord {
  service_id: string;
  service_name: string;
  category: ServiceCategory;
  price: number | string;
  minutes: number;
  staff_id: string;
  staff_name: string;
  commission_percent: number | string | null;
  quantity: number;
  line_total: number | string;
}

interface BillRecord {
  id: string;
  bill_number: string;
  business_date: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  subtotal: number | string;
  discount: number | string;
  tax_percent: number | string;
  tax_amount: number | string;
  total: number | string;
  payment_method: PaymentMethod;
  created_at: string;
  cancelled_at: string | null;
  bill_lines: BillLineRecord[] | null;
}

interface DayCloseRecord {
  business_date: string;
  cash_counted: number | string;
  note: string;
  closed_at: string;
}

function asServiceRow(row: ServiceRecord): ServiceItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: money(row.price),
    minutes: Number(row.minutes),
    active: row.active,
    color: row.color || undefined,
  };
}

function asStaffRow(row: StaffRecord): StaffMember {
  return {
    id: row.id,
    name: row.name,
    commissionPercent: row.commission_percent == null ? null : money(row.commission_percent),
    active: row.active,
  };
}

function asBillRow(row: BillRecord): Bill {
  return {
    id: row.id,
    billNumber: row.bill_number,
    createdAt: row.created_at,
    businessDate: String(row.business_date).slice(0, 10),
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    lines: (row.bill_lines ?? []).map((line) => ({
      serviceId: line.service_id,
      serviceName: line.service_name,
      category: line.category,
      price: money(line.price),
      minutes: Number(line.minutes),
      staffId: line.staff_id,
      staffName: line.staff_name,
      commissionPercent: line.commission_percent == null ? null : money(line.commission_percent),
      quantity: Number(line.quantity),
      lineTotal: money(line.line_total),
    })),
    subtotal: money(row.subtotal),
    discount: money(row.discount),
    taxPercent: money(row.tax_percent),
    taxAmount: money(row.tax_amount),
    total: money(row.total),
    paymentMethod: row.payment_method,
    cancelledAt: row.cancelled_at ?? undefined,
  };
}

function asDayCloseRow(row: DayCloseRecord): DayClose {
  return {
    date: String(row.business_date).slice(0, 10),
    cashCounted: money(row.cash_counted),
    note: row.note ?? '',
    closedAt: row.closed_at,
  };
}

function money(value: number | string | null | undefined): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function messageFrom(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error;
    if (typeof body === 'object' && body && typeof body.message === 'string') return body.message;
    if (typeof body === 'string' && body.trim() && !body.trim().startsWith('<')) return body;
    return fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export async function messageFromBlob(error: unknown, fallback: string): Promise<string> {
  if (error instanceof HttpErrorResponse && error.error instanceof Blob) {
    try {
      const text = await error.error.text();
      const body = JSON.parse(text) as { message?: string };
      if (body.message) return body.message;
    } catch {
      return fallback;
    }
  }
  return messageFrom(error, fallback);
}
