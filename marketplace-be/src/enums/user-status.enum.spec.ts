import { UserStatus, UserStatusManager } from './user-status.enum';

/**
 * The participant account lifecycle. A user is created pending wallet creation,
 * becomes active once a wallet exists and the account is verified, and may be
 * deactivated or blocked by an administrator thereafter.
 *
 * These are pure functions over the status model, so the suite needs no database,
 * identity provider or blockchain connection.
 */
describe('UserStatusManager', () => {
  describe('determineStatusFromFlags', () => {
    const flags = (overrides: Partial<Parameters<typeof UserStatusManager.determineStatusFromFlags>[0]> = {}) => ({
      temporaryPassword: false,
      firstLoginCompleted: true,
      profileCompleted: true,
      walletCreated: true,
      isVerified: true,
      ...overrides,
    });

    it('reports an account as active once a wallet exists and it is verified', () => {
      expect(UserStatusManager.determineStatusFromFlags(flags())).toBe(
        UserStatus.ACTIVE,
      );
    });

    it('waits for wallet creation while no wallet exists', () => {
      expect(
        UserStatusManager.determineStatusFromFlags(flags({ walletCreated: false })),
      ).toBe(UserStatus.PENDING_WALLET_CREATION);
    });

    it('waits for wallet creation while the account is unverified', () => {
      expect(
        UserStatusManager.determineStatusFromFlags(flags({ isVerified: false })),
      ).toBe(UserStatus.PENDING_WALLET_CREATION);
    });

    it('does not activate an account on the remaining onboarding flags alone', () => {
      expect(
        UserStatusManager.determineStatusFromFlags({
          temporaryPassword: false,
          firstLoginCompleted: true,
          profileCompleted: true,
          walletCreated: false,
          isVerified: false,
        }),
      ).toBe(UserStatus.PENDING_WALLET_CREATION);
    });
  });

  describe('canPerformAction', () => {
    it('allows trading only to active accounts', () => {
      for (const action of ['trade', 'create_offers', 'bid']) {
        expect(UserStatusManager.canPerformAction(UserStatus.ACTIVE, action)).toBe(true);
        for (const status of [
          UserStatus.PENDING_WALLET_CREATION,
          UserStatus.INACTIVE,
          UserStatus.BLOCKED,
        ]) {
          expect(UserStatusManager.canPerformAction(status, action)).toBe(false);
        }
      }
    });

    it('denies login only to blocked accounts', () => {
      expect(UserStatusManager.canPerformAction(UserStatus.BLOCKED, 'login')).toBe(false);
      for (const status of [
        UserStatus.PENDING_WALLET_CREATION,
        UserStatus.ACTIVE,
        UserStatus.INACTIVE,
      ]) {
        expect(UserStatusManager.canPerformAction(status, 'login')).toBe(true);
      }
    });

    it('denies profile updates to inactive and blocked accounts', () => {
      expect(
        UserStatusManager.canPerformAction(UserStatus.ACTIVE, 'update_profile'),
      ).toBe(true);
      expect(
        UserStatusManager.canPerformAction(
          UserStatus.PENDING_WALLET_CREATION,
          'update_profile',
        ),
      ).toBe(true);
      expect(
        UserStatusManager.canPerformAction(UserStatus.INACTIVE, 'update_profile'),
      ).toBe(false);
      expect(
        UserStatusManager.canPerformAction(UserStatus.BLOCKED, 'update_profile'),
      ).toBe(false);
    });

    it('allows wallet creation while pending, and again once active', () => {
      expect(
        UserStatusManager.canPerformAction(
          UserStatus.PENDING_WALLET_CREATION,
          'create_wallet',
        ),
      ).toBe(true);
      expect(
        UserStatusManager.canPerformAction(UserStatus.ACTIVE, 'create_wallet'),
      ).toBe(true);
      expect(
        UserStatusManager.canPerformAction(UserStatus.INACTIVE, 'create_wallet'),
      ).toBe(false);
    });

    it('refuses an unrecognised action from any status', () => {
      for (const status of Object.values(UserStatus)) {
        expect(UserStatusManager.canPerformAction(status, 'mint_tokens')).toBe(false);
      }
    });
  });

  describe('getPossibleTransitions', () => {
    it('allows a pending account to activate or be blocked, but not to go inactive', () => {
      const transitions = UserStatusManager.getPossibleTransitions(
        UserStatus.PENDING_WALLET_CREATION,
      );
      expect(transitions).toEqual([UserStatus.ACTIVE, UserStatus.BLOCKED]);
      expect(transitions).not.toContain(UserStatus.INACTIVE);
    });

    it('does not allow an active account to return to pending', () => {
      const transitions = UserStatusManager.getPossibleTransitions(UserStatus.ACTIVE);
      expect(transitions).toEqual([UserStatus.INACTIVE, UserStatus.BLOCKED]);
      expect(transitions).not.toContain(UserStatus.PENDING_WALLET_CREATION);
    });

    it('allows a blocked account to be restored', () => {
      expect(UserStatusManager.getPossibleTransitions(UserStatus.BLOCKED)).toEqual([
        UserStatus.ACTIVE,
        UserStatus.INACTIVE,
      ]);
    });

    it('never offers a transition to the status already held', () => {
      for (const status of Object.values(UserStatus)) {
        expect(UserStatusManager.getPossibleTransitions(status)).not.toContain(status);
      }
    });

    it('offers only states defined by the enum', () => {
      const valid = Object.values(UserStatus);
      for (const status of valid) {
        for (const next of UserStatusManager.getPossibleTransitions(status)) {
          expect(valid).toContain(next);
        }
      }
    });
  });

  describe('getNextRequiredStep', () => {
    it('describes the outstanding step for every defined status', () => {
      for (const status of Object.values(UserStatus)) {
        const step = UserStatusManager.getNextRequiredStep(status);
        expect(step).toBeTruthy();
        expect(step).not.toBe('Unknown status');
      }
    });

    it('points a pending account at wallet creation', () => {
      expect(
        UserStatusManager.getNextRequiredStep(UserStatus.PENDING_WALLET_CREATION),
      ).toContain('wallet');
    });
  });
});
