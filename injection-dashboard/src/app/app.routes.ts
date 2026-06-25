import { Routes } from '@angular/router';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { HomeComponent } from './features/home/home.component';
import { ArchiveComponent } from './features/archive/archive.component';
import { ArchiveDetailsComponent } from './features/archive-details/archive-details.component';

export const routes: Routes = [
    {
        path: '', component: DashboardComponent,
        children: [
            {
                path: '', component: HomeComponent
            },
            {
                path: 'archives',
                component: ArchiveComponent
            },
            {
                path: 'archives/:entryId',
                component: ArchiveDetailsComponent
            }
        
        ]
    },
    {path: '**', redirectTo: ''}
];
