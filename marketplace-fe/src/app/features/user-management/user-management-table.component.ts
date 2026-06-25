import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { UserService } from '../../core/services/user/user.service';

export interface User {
  _id: string;
  username: string;
  email: string;
  role: string;
  status: string;
  publicAddress?: string;
  assignedMarket?: any;
  accessibleMarkets?: any[];
  createdAt: Date;
  lastLoginAt?: Date;
}

@Component({
  selector: 'app-user-management-table',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatSelectModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatCardModule
  ],
  templateUrl: './user-management-table.component.html',
  styleUrls: ['./user-management-table.component.css']
})
export class UserManagementTableComponent implements OnInit {
  displayedColumns: string[] = [
    'username',
    'email',
    'role',
    'status',
    'walletAddress',
    'assignedMarket',
    'createdAt',
    'actions'
  ];

  dataSource: MatTableDataSource<User>;
  users: User[] = [];
  loading: boolean = false;
  error: string | null = null;

  // Filters
  searchTerm: string = '';
  selectedRole: string = '';
  selectedStatus: string = '';

  roles: string[] = ['MARKETPLACE_ADMIN', 'FMO_LMO', 'FRP', 'FSP'];
  statuses: string[] = ['ACTIVE', 'INACTIVE', 'PENDING_WALLET_CREATION', 'BLOCKED'];

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(private userService: UserService) {
    this.dataSource = new MatTableDataSource<User>([]);
  }

  ngOnInit(): void {
    this.loadUsers();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;

    this.dataSource.filterPredicate = (data: User, filter: string): boolean => {
      const searchStr = filter.toLowerCase();
      return (
        data.username.toLowerCase().includes(searchStr) ||
        data.email.toLowerCase().includes(searchStr) ||
        (data.publicAddress?.toLowerCase().includes(searchStr) ?? false)
      );
    };
  }

  /** Fetches all users from the API and refreshes the table data source. */
  loadUsers(): void {
    this.loading = true;
    this.error = null;

    this.userService.getAllUsers().subscribe({
      next: (response: any) => {
        this.users = response.data || response;
        this.applyFilters();
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load users';
        this.loading = false;
      }
    });
  }

  /** Applies the active role and status filters then re-runs the text search. */
  applyFilters(): void {
    let filteredUsers = [...this.users];

    if (this.selectedRole) {
      filteredUsers = filteredUsers.filter(u => u.role === this.selectedRole);
    }

    if (this.selectedStatus) {
      filteredUsers = filteredUsers.filter(u => u.status === this.selectedStatus);
    }

    this.dataSource.data = filteredUsers;
    this.applySearch();
  }

  /** Triggers the Material table text filter and resets pagination to the first page. */
  applySearch(): void {
    this.dataSource.filter = this.searchTerm.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  /** Clears all active filters and reloads the full user list. */
  clearFilters(): void {
    this.searchTerm = '';
    this.selectedRole = '';
    this.selectedStatus = '';
    this.applyFilters();
  }

  /** Returns the Material color token for the given role chip. */
  getRoleColor(role: string): string {
    const colors: { [key: string]: string } = {
      'MARKETPLACE_ADMIN': 'warn',
      'FMO_LMO': 'primary',
      'FRP': 'accent',
      'FSP': ''
    };
    return colors[role] || '';
  }

  /** Returns the Material color token for the given status chip. */
  getStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'ACTIVE': 'primary',
      'INACTIVE': 'warn',
      'PENDING_WALLET_CREATION': 'accent',
      'BLOCKED': 'warn'
    };
    return colors[status] || '';
  }

  /** Returns a truncated wallet address for display (first 10 + last 8 chars). */
  getTruncatedAddress(address?: string): string {
    if (!address) return 'N/A';
    return `${address.slice(0, 10)}...${address.slice(-8)}`;
  }

  /** Copies the given wallet address to the clipboard. */
  copyAddress(address?: string): void {
    if (!address) return;
    navigator.clipboard.writeText(address);
  }

  viewUserDetail(_user: User): void {
    // Detail navigation not yet implemented
  }

  editUser(_user: User): void {
    // Edit dialog not yet implemented
  }

  /** Prompts for confirmation and deletes the given user. */
  deleteUser(user: User): void {
    if (confirm(`Are you sure you want to delete user ${user.username}?`)) {
      this.userService.deleteUser(user._id).subscribe({
        next: () => {
          this.loadUsers();
        },
        error: () => {
          alert('Failed to delete user');
        }
      });
    }
  }

  exportToCSV(): void {
    const headers = ['Username', 'Email', 'Role', 'Status', 'Wallet Address', 'Created At'];
    const csvData = this.dataSource.filteredData.map(user => [
      user.username,
      user.email,
      user.role,
      user.status,
      user.publicAddress || 'N/A',
      new Date(user.createdAt).toLocaleDateString()
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `users_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  refresh(): void {
    this.loadUsers();
  }
}
