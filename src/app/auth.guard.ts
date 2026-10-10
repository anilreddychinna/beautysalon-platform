import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Session } from './session';

export const authGuard: CanActivateFn = () => {
  const session = inject(Session);
  if (session.user()) return true;
  return inject(Router).createUrlTree(['/login']);
};

export const adminGuard: CanActivateFn = () => {
  const session = inject(Session);
  const user = session.user();
  if (!user) return inject(Router).createUrlTree(['/login']);
  if (user.role !== 'Admin') return inject(Router).createUrlTree(['/counter']);
  return true;
};
