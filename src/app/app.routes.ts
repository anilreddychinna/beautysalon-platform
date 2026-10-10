import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './auth.guard';
import { Catalog } from './pages/catalog/catalog';
import { Counter } from './pages/counter/counter';
import { CustomerView } from './pages/customers/customer-view';
import { Customers } from './pages/customers/customers';
import { Login } from './pages/login/login';
import { Reports } from './pages/reports/reports';
import { Settings } from './pages/settings/settings';
import { Today } from './pages/today/today';
import { Users } from './pages/users/users';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: '', pathMatch: 'full', redirectTo: 'counter' },
  { path: 'counter', component: Counter, canActivate: [authGuard] },
  { path: 'today', component: Today, canActivate: [authGuard] },
  { path: 'customers', component: Customers, canActivate: [authGuard] },
  { path: 'customers/:id', component: CustomerView, canActivate: [authGuard] },
  { path: 'services', component: Catalog, canActivate: [adminGuard] },
  { path: 'reports', component: Reports, canActivate: [authGuard] },
  { path: 'users', component: Users, canActivate: [adminGuard] },
  { path: 'settings', component: Settings, canActivate: [adminGuard] },
  { path: '**', redirectTo: 'counter' },
];
