import { Routes } from '@angular/router';
import { SessionListComponent } from './session-list/session-list.component';
import { SessionCreateComponent } from './session-create/session-create.component';

export const SESSIONS_ROUTES: Routes = [
  {
    path: '',
    component: SessionListComponent,
    data: { title: 'Market Sessions' }
  },
  {
    path: 'create',
    component: SessionCreateComponent,
    data: { title: 'Create Session' }
  },
  {
    path: ':id',
    loadComponent: () => import('./session-detail/session-detail.component').then(m => m.SessionDetailComponent),
    data: { title: 'Session Details' }
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./session-edit/session-edit.component').then(m => m.SessionEditComponent),
    data: { title: 'Edit Session' }
  }
];