import { Routes } from '@angular/router';
import { PublishedSessionsListComponent } from './published-sessions-list/published-sessions-list.component';
import { SessionBidsViewComponent } from './session-bids-view/session-bids-view.component';

export const PROSUMER_OFFERS_ROUTES: Routes = [
  {
    path: '',
    component: PublishedSessionsListComponent
  },
  {
    path: 'session/:id',
    component: SessionBidsViewComponent
  }
];
