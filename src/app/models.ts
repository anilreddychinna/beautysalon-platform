export type ServiceCategory = 'hair' | 'skin' | 'nails' | 'special';
export type PaymentMethod = 'cash' | 'card' | 'upi';
export type UserRole = 'Admin' | 'Manager';

export interface ShopUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
}

export interface StaffLogin {
  id: string;
  username: string;
  name: string;
  role: UserRole;
}

export type CustomerGender = '' | 'Female' | 'Male' | 'Other';

export interface Customer {
  id: string;
  customerId: string;
  name: string;
  phone: string;
  notes: string;
  gender: CustomerGender;
  createdAt: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  category: ServiceCategory;
  price: number;
  minutes: number;
  active: boolean;
  color?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  commissionPercent: number | null;
  active: boolean;
}

export interface BillLine {
  serviceId: string;
  serviceName: string;
  category: ServiceCategory;
  price: number;
  minutes: number;
  staffId: string;
  staffName: string;
  commissionPercent: number | null;
  quantity: number;
  lineTotal: number;
}

export interface Bill {
  id: string;
  billNumber: string;
  createdAt: string;
  businessDate: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  lines: BillLine[];
  subtotal: number;
  discount: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  cancelledAt?: string;
}

export interface DayClose {
  date: string;
  cashCounted: number;
  note: string;
  closedAt: string;
}

export interface DraftLine {
  key: string;
  serviceId: string;
  serviceName: string;
  category: ServiceCategory;
  price: number;
  minutes: number;
  staffId: string;
  quantity: number;
}

export interface DayTotal {
  date: string;
  bills: number;
  total: number;
  cash: number;
  card: number;
  upi: number;
}

export interface ServiceTotal {
  serviceId: string;
  name: string;
  category: ServiceCategory;
  quantity: number;
  amount: number;
}

export interface StaffTotal {
  staffId: string;
  name: string;
  services: number;
  sales: number;
  commission: number;
}

export interface Report {
  from: string;
  to: string;
  bills: Bill[];
  byDay: DayTotal[];
  byService: ServiceTotal[];
  byStaff: StaffTotal[];
}

export interface Quote {
  subtotal: number;
  discount: number;
  taxAmount: number;
  total: number;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function quoteDraft(
  lines: { price: number; quantity: number }[],
  discount: number,
  taxPercent: number,
): Quote {
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + roundMoney(line.price * line.quantity), 0));
  const safeDiscount = Number.isFinite(discount) ? roundMoney(Math.max(0, discount)) : 0;
  const taxable = roundMoney(Math.max(0, subtotal - safeDiscount));
  const safeTax = Number.isFinite(taxPercent) ? taxPercent : 0;
  const taxAmount = roundMoney((taxable * safeTax) / 100);
  return {
    subtotal,
    discount: safeDiscount,
    taxAmount,
    total: roundMoney(taxable + taxAmount),
  };
}

export function todayIso(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function shiftIso(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return todayIso(date);
}

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

export function formatDay(iso: string): string {
  const [year, month, day] = iso.split('-').map((part) => Number(part));
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

export function categoryLabel(category: ServiceCategory): string {
  if (category === 'hair') return 'Hair';
  if (category === 'skin') return 'Skin';
  if (category === 'nails') return 'Nails';
  return 'Special';
}

export function paymentLabel(method: PaymentMethod): string {
  if (method === 'cash') return 'Cash';
  if (method === 'card') return 'Card';
  return 'UPI';
}

export function indianMobile(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length >= 12) digits = digits.slice(-10);
  else if (digits.startsWith('0') && digits.length >= 11) digits = digits.slice(-10);
  return digits.slice(0, 10);
}

export function isIndianMobile(value: string): boolean {
  return /^[6-9]\d{9}$/.test(value);
}

export function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value;
}

export function inputChecked(event: Event): boolean {
  return (event.target as HTMLInputElement).checked;
}
