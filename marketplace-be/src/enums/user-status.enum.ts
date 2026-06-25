export enum UserStatus {
  // Initial state - User needs to create wallet
  PENDING_WALLET_CREATION = 'PENDING_WALLET_CREATION',
  
  // User has completed all steps and is active
  ACTIVE = 'ACTIVE',
  
  // User is inactive/suspended
  INACTIVE = 'INACTIVE',
  
  // User is blocked
  BLOCKED = 'BLOCKED'
}

/**
 * Utility class to manage user status transitions and validations
 */
export class UserStatusManager {
  
  /**
   * Determines the user status based on current boolean flags
   * This method helps in migration from boolean flags to status enum
   */
  static determineStatusFromFlags(flags: {
    temporaryPassword: boolean;
    firstLoginCompleted: boolean;
    profileCompleted: boolean;
    walletCreated: boolean;
    isVerified: boolean;
  }): UserStatus {
    
    // If wallet is created and verified, user is active
    if (flags.walletCreated && flags.isVerified) {
      return UserStatus.ACTIVE;
    }
    
    // Default state - waiting for wallet creation
    return UserStatus.PENDING_WALLET_CREATION;
  }
  
  /**
   * Gets the next required step based on current status
   */
  static getNextRequiredStep(status: UserStatus): string {
    switch (status) {
      case UserStatus.PENDING_WALLET_CREATION:
        return 'Create and configure wallet';
      case UserStatus.ACTIVE:
        return 'User account is fully activated';
      case UserStatus.INACTIVE:
        return 'Account is inactive - contact administrator';
      case UserStatus.BLOCKED:
        return 'Account is blocked - contact administrator';
      default:
        return 'Unknown status';
    }
  }
  
  /**
   * Checks if user can perform certain actions based on status
   */
  static canPerformAction(status: UserStatus, action: string): boolean {
    switch (action) {
      case 'login':
        return status !== UserStatus.BLOCKED;
      case 'trade':
      case 'create_offers':
      case 'bid':
        return status === UserStatus.ACTIVE;
      case 'update_profile':
        return status !== UserStatus.BLOCKED && status !== UserStatus.INACTIVE;
      case 'create_wallet':
        return status === UserStatus.PENDING_WALLET_CREATION || 
               status === UserStatus.ACTIVE;
      default:
        return false;
    }
  }
  
  /**
   * Gets all possible status transitions from current status
   */
  static getPossibleTransitions(currentStatus: UserStatus): UserStatus[] {
    switch (currentStatus) {
      case UserStatus.PENDING_WALLET_CREATION:
        return [UserStatus.ACTIVE, UserStatus.BLOCKED];
      case UserStatus.ACTIVE:
        return [UserStatus.INACTIVE, UserStatus.BLOCKED];
      case UserStatus.INACTIVE:
        return [UserStatus.ACTIVE, UserStatus.BLOCKED];
      case UserStatus.BLOCKED:
        return [UserStatus.ACTIVE, UserStatus.INACTIVE];
      default:
        return [];
    }
  }
}
