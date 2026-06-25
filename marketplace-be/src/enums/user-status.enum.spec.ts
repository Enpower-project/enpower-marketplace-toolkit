import { Test, TestingModule } from '@nestjs/testing';
import { UserStatus, UserStatusManager } from './user-status.enum';

describe('UserStatusManager', () => {
  
  describe('determineStatusFromFlags', () => {
    it('should return PENDING_FIRST_LOGIN for user with temporary password', () => {
      const flags = {
        temporaryPassword: true,
        firstLoginCompleted: false,
        profileCompleted: false,
        walletCreated: false,
        isVerified: false
      };
      
      const status = UserStatusManager.determineStatusFromFlags(flags);
      expect(status).toBe(UserStatus.PENDING_FIRST_LOGIN);
    });

    it('should return PENDING_PROFILE_COMPLETION after first login', () => {
      const flags = {
        temporaryPassword: false,
        firstLoginCompleted: true,
        profileCompleted: false,
        walletCreated: false,
        isVerified: false
      };
      
      const status = UserStatusManager.determineStatusFromFlags(flags);
      expect(status).toBe(UserStatus.PENDING_PROFILE_COMPLETION);
    });

    it('should return PENDING_WALLET_CREATION after profile completion', () => {
      const flags = {
        temporaryPassword: false,
        firstLoginCompleted: true,
        profileCompleted: true,
        walletCreated: false,
        isVerified: false
      };
      
      const status = UserStatusManager.determineStatusFromFlags(flags);
      expect(status).toBe(UserStatus.PENDING_WALLET_CREATION);
    });

    it('should return PENDING_EMAIL_VERIFICATION after wallet creation', () => {
      const flags = {
        temporaryPassword: false,
        firstLoginCompleted: true,
        profileCompleted: true,
        walletCreated: true,
        isVerified: false
      };
      
      const status = UserStatusManager.determineStatusFromFlags(flags);
      expect(status).toBe(UserStatus.PENDING_EMAIL_VERIFICATION);
    });

    it('should return ACTIVE when all steps are completed', () => {
      const flags = {
        temporaryPassword: false,
        firstLoginCompleted: true,
        profileCompleted: true,
        walletCreated: true,
        isVerified: true
      };
      
      const status = UserStatusManager.determineStatusFromFlags(flags);
      expect(status).toBe(UserStatus.ACTIVE);
    });
  });

  describe('getNextRequiredStep', () => {
    it('should return correct next step for each status', () => {
      expect(UserStatusManager.getNextRequiredStep(UserStatus.PENDING_FIRST_LOGIN))
        .toBe('Complete first login and change temporary password');
      
      expect(UserStatusManager.getNextRequiredStep(UserStatus.PENDING_PROFILE_COMPLETION))
        .toBe('Complete user profile information');
      
      expect(UserStatusManager.getNextRequiredStep(UserStatus.PENDING_WALLET_CREATION))
        .toBe('Create and configure wallet');
      
      expect(UserStatusManager.getNextRequiredStep(UserStatus.PENDING_EMAIL_VERIFICATION))
        .toBe('Verify email address');
      
      expect(UserStatusManager.getNextRequiredStep(UserStatus.ACTIVE))
        .toBe('User account is fully activated');
    });
  });

  describe('canPerformAction', () => {
    it('should allow login for all statuses except BLOCKED', () => {
      expect(UserStatusManager.canPerformAction(UserStatus.PENDING_FIRST_LOGIN, 'login')).toBe(true);
      expect(UserStatusManager.canPerformAction(UserStatus.ACTIVE, 'login')).toBe(true);
      expect(UserStatusManager.canPerformAction(UserStatus.BLOCKED, 'login')).toBe(false);
    });

    it('should only allow trading for ACTIVE users', () => {
      expect(UserStatusManager.canPerformAction(UserStatus.PENDING_FIRST_LOGIN, 'trade')).toBe(false);
      expect(UserStatusManager.canPerformAction(UserStatus.PENDING_PROFILE_COMPLETION, 'trade')).toBe(false);
      expect(UserStatusManager.canPerformAction(UserStatus.ACTIVE, 'trade')).toBe(true);
    });

    it('should allow profile updates for non-blocked users', () => {
      expect(UserStatusManager.canPerformAction(UserStatus.PENDING_PROFILE_COMPLETION, 'update_profile')).toBe(true);
      expect(UserStatusManager.canPerformAction(UserStatus.ACTIVE, 'update_profile')).toBe(true);
      expect(UserStatusManager.canPerformAction(UserStatus.BLOCKED, 'update_profile')).toBe(false);
    });
  });

  describe('getPossibleTransitions', () => {
    it('should return correct possible transitions', () => {
      const transitions = UserStatusManager.getPossibleTransitions(UserStatus.PENDING_FIRST_LOGIN);
      expect(transitions).toContain(UserStatus.PENDING_PROFILE_COMPLETION);
      expect(transitions).toContain(UserStatus.BLOCKED);
    });

    it('should allow blocking from any status', () => {
      Object.values(UserStatus).forEach(status => {
        if (status !== UserStatus.BLOCKED) {
          const transitions = UserStatusManager.getPossibleTransitions(status);
          expect(transitions).toContain(UserStatus.BLOCKED);
        }
      });
    });
  });
});
