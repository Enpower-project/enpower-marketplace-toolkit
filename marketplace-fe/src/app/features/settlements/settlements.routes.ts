import { Routes } from '@angular/router';
import { SettlementsPageComponent } from './settlements-page/settlements-page.component';
import { MySettlementsComponent } from './my-settlements/my-settlements.component';

export const SETTLEMENTS_ROUTES: Routes = [
  {
    path: '',
    component: SettlementsPageComponent,
  },
  {
    path: 'session/:sessionAddress',
    component: SettlementsPageComponent,
  },
  {
    path: 'my',
    component: MySettlementsComponent,
  },
];
