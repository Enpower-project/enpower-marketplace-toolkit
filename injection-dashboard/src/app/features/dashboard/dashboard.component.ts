import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DashboardHeaderComponent } from './components/dashboard-header/dashboard-header.component';

@Component({
  selector: 'app-dashboard',
  imports: [RouterOutlet, DashboardHeaderComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent { }
