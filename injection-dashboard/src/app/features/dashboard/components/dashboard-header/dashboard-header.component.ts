import { Component, inject } from '@angular/core';
import { RefreshService } from '../../../../core/services/refresh.service';

@Component({
  selector: 'app-dashboard-header',
  imports: [],
  templateUrl: './dashboard-header.component.html',
  styleUrl: './dashboard-header.component.css',
})
export class DashboardHeaderComponent { 
  refreshService = inject(RefreshService)

  refresh(){
    this.refreshService.triggerRefresh();
  }
}
