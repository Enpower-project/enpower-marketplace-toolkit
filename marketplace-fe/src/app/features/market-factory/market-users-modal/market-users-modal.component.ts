import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatExpansionModule } from '@angular/material/expansion';
import { FormsModule } from '@angular/forms';
import { MarketFactoryService } from '../services/market-factory.service';
import { UserService, User } from '../../../core/services/user.service';
import { ConfirmationDialogComponent, ConfirmationDialogData, ConfirmationDialogResult } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { ToastNotificationComponent } from '../../../shared/components/toast-notification/toast-notification.component';

export interface MarketUsersDialogData {
  market: any;
}

@Component({
  selector: 'app-market-users-modal',
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatSelectModule,
    MatFormFieldModule,
    MatExpansionModule,
    FormsModule
  ],
  templateUrl: './market-users-modal.component.html',
  styleUrls: ['./market-users-modal.component.css']
})
export class MarketUsersModalComponent implements OnInit {
  loading = false;
  assignedUsers: User[] = [];
  availableUsers: User[] = [];
  selectedUserIds: string[] = [];

  constructor(
    public dialogRef: MatDialogRef<MarketUsersModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: MarketUsersDialogData,
    private marketFactoryService: MarketFactoryService,
    private userService: UserService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  private loadData(): void {
    this.loading = true;

    // Load users in market and all available users
    Promise.all([
      this.marketFactoryService.getUsersInMarket(this.data.market._id).toPromise(),
      this.userService.getAllUsers().toPromise()
    ]).then(([usersInMarketResponse, allUsersResponse]) => {
      this.assignedUsers = usersInMarketResponse?.users || [];
      const allUsers = allUsersResponse?.data?.users || [];

      // Filter out already assigned users
      const assignedUserIds = this.assignedUsers.map(u => u.id);
      this.availableUsers = allUsers.filter(u => !assignedUserIds.includes(u.id));

      this.loading = false;
    }).catch(error => {
      this.loading = false;
    });
  }

  addUsers(): void {
    if (this.selectedUserIds.length === 0) return;

    this.loading = true;
    this.marketFactoryService.assignUsersToMarket(this.data.market._id, this.selectedUserIds)
      .subscribe({
        next: () => {
          this.selectedUserIds = [];
          this.loadData();
        },
        error: (error) => {
          this.loading = false;
        }
      });
  }

  removeUser(userId: string): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '420px',
      data: {
        title: 'Remove User from Market',
        message: 'Are you sure you want to remove this user from the market?',
        confirmText: 'Remove',
        cancelText: 'Cancel',
        type: 'warning'
      } as ConfirmationDialogData
    });

    dialogRef.afterClosed().subscribe((result: ConfirmationDialogResult) => {
      if (!result?.confirmed) return;

      this.loading = true;
      this.marketFactoryService.removeUsersFromMarket(this.data.market._id, [userId])
        .subscribe({
          next: () => {
            ToastNotificationComponent.show('User removed from market', 'success');
            this.loadData();
          },
          error: (error) => {
            ToastNotificationComponent.show('Failed to remove user from market', 'error');
            this.loading = false;
          }
        });
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  getUserDisplayName(user: User): string {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName} (${user.email})`;
    }
    return `${user.username} (${user.email})`;
  }
}
