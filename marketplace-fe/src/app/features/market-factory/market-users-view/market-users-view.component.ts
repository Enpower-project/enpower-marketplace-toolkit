import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MarketFactoryService } from '../services/market-factory.service';
import { UserService, User } from '../../../core/services/user.service';
import { MarketUser } from '../interfaces/market-user';
import { MatTooltip } from "@angular/material/tooltip";
import { DeactivateUserDialogComponent } from '../deactivate-user-dialog/deactivate-user-dialog.component';
import { ReactivateUserDialogComponent } from '../reactivate-user-dialog/reactivate-user-dialog.component';

export interface MarketUsersViewDialogData {
  market: {
    _id: string;
    name: string;
  };
}

@Component({
  selector: 'app-market-users-view',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTooltip
  ],
  templateUrl: './market-users-view.component.html',
  styleUrl: './market-users-view.component.css'
})
export class MarketUsersViewComponent implements OnInit {
  loading = false;
  users: MarketUser[] = [];

  constructor(
    public dialogRef: MatDialogRef<MarketUsersViewComponent>,
    @Inject(MAT_DIALOG_DATA) public data: MarketUsersViewDialogData,
    private marketFactoryService: MarketFactoryService,
    private dialog: MatDialog,
    private userService: UserService
  ) { }

  ngOnInit(): void {
    this.loadUsers();
  }

  private loadUsers(): void {
    this.loading = true;
    this.marketFactoryService.getUsersInMarket(this.data.market._id).subscribe({
      next: (response) => {
        this.users = response.users || [];
        this.loading = false;
      },
      error: (error) => {
        this.users = [];
        this.loading = false;
      }
    });
  }

  getUserDisplayName(user: MarketUser): string {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.username || user.email;
  }

  getRoleColor(role: string): string {
    const roleColors: { [key: string]: string } = {
      'FRP': 'accent',
      'FSP': 'primary',
      'MARKETPLACE_ADMIN': 'warn',
      'FMO_LMO': 'primary',
      'DSO': 'accent'
    };
    return roleColors[role] || 'primary';
  }

  close(): void {
    this.dialogRef.close();
  }

  openDeactivateDialog(userId: string, username: string) {
    const dialogRef = this.dialog.open(DeactivateUserDialogComponent, {
      width: '600px',
      maxWidth: '80vw',
      data: { userId, username }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadUsers();
      }
    });
  }

  openReactivateDialog(userId: string, username: string) {
    const dialogRef = this.dialog.open(ReactivateUserDialogComponent, {
      width: '600px',
      maxWidth: '80vw',
      data: { userId, username }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadUsers();
      }
    });
  }
}
