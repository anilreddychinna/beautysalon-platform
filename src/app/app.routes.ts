import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  { path: '', pathMatch: 'full', redirectTo: 'counter' },
  {
    path: 'counter',
    loadComponent: () => import('./pages/counter/counter').then((m) => m.Counter),
    canActivate: [authGuard],
  },
  {
    path: 'today',
    loadComponent: () => import('./pages/today/today').then((m) => m.Today),
    canActivate: [authGuard],
  },
  {
    path: 'customers',
    loadComponent: () => import('./pages/customers/customers').then((m) => m.Customers),
    canActivate: [authGuard],
  },
  {
    path: 'customers/:id',
    loadComponent: () => import('./pages/customers/customer-view').then((m) => m.CustomerView),
    canActivate: [authGuard],
  },
  {
    path: 'services',
    loadComponent: () => import('./pages/catalog/catalog').then((m) => m.Catalog),
    canActivate: [adminGuard],
  },
  {
    path: 'reports',
    loadComponent: () => import('./pages/reports/reports').then((m) => m.Reports),
    canActivate: [authGuard],
  },
  {
    path: 'users',
    loadComponent: () => import('./pages/users/users').then((m) => m.Users),
    canActivate: [adminGuard],
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings),
    canActivate: [adminGuard],
  },
  { path: '**', redirectTo: 'counter' },
];
