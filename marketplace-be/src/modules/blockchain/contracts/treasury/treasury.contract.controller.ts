import { Controller, Post, Get, Body, Param, HttpStatus } from '@nestjs/common';
import { TreasuryContractService } from './treasury.contract.service';
import {
  DepositDto,
  WithdrawDto,
  DepositPaymentForSessionDto,
  GrantRoleDto,
} from './dto/treasury.dto';

@Controller('blockchain/treasury')
export class TreasuryContractController {
  constructor(private readonly treasuryService: TreasuryContractService) {}

  /** Deposit FLEX tokens into the Treasury contract from the admin wallet. */
  @Post('deposit')
  async deposit(@Body() dto: DepositDto) {
    const tx = await this.treasuryService.deposit(dto.amount);
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Withdraw FLEX tokens from the Treasury contract to the admin wallet. */
  @Post('withdraw')
  async withdraw(@Body() dto: WithdrawDto) {
    const tx = await this.treasuryService.withdraw(dto.amount);
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** FRP deposits settlement payment for a specific session into the Treasury. */
  @Post('deposit-payment')
  async depositPaymentForSession(@Body() dto: DepositPaymentForSessionDto) {
    const tx = await this.treasuryService.depositPaymentForSession(dto.sessionId, dto.amount);
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Return the total Treasury balance (in wei) held by the given address. */
  @Get('balance/:address')
  async getBalance(@Param('address') address: string) {
    const balance = await this.treasuryService.getBalance(address);
    return {
      statusCode: HttpStatus.OK,
      data: { balance },
    };
  }

  /** Return the available (unlocked) Treasury balance (in wei) for the given address. */
  @Get('available-balance/:address')
  async getAvailableBalance(@Param('address') address: string) {
    const availableBalance = await this.treasuryService.getAvailableBalance(address);
    return {
      statusCode: HttpStatus.OK,
      data: { availableBalance },
    };
  }

  /** Return the total collateral deposited (in wei) by the given address. */
  @Get('collateral-deposited/:address')
  async getCollateralDeposited(@Param('address') address: string) {
    const collateralDeposited = await this.treasuryService.getCollateralDeposited(address);
    return {
      statusCode: HttpStatus.OK,
      data: { collateralDeposited },
    };
  }

  /** Return the currently locked collateral (in wei) for the given address. */
  @Get('collateral-locked/:address')
  async getCollateralLocked(@Param('address') address: string) {
    const collateralLocked = await this.treasuryService.getCollateralLocked(address);
    return {
      statusCode: HttpStatus.OK,
      data: { collateralLocked },
    };
  }

  /** Return collateral information for a specific offer within a session. */
  @Get('offer-collateral/:sessionContract/:sessionId/:offerId')
  async getOfferCollateral(
    @Param('sessionContract') sessionContract: string,
    @Param('sessionId') sessionId: string,
    @Param('offerId') offerId: string,
  ) {
    const offerCollateral = await this.treasuryService.getOfferCollateral(
      sessionContract,
      parseInt(sessionId),
      parseInt(offerId),
    );
    return {
      statusCode: HttpStatus.OK,
      data: offerCollateral,
    };
  }

  /** Grant the SESSION_CONTRACT role to the specified address on the Treasury contract. */
  @Post('roles/session-contract/grant')
  async grantSessionContractRole(@Body() dto: GrantRoleDto) {
    const tx = await this.treasuryService.grantSessionContractRole(dto.address);
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Grant the FRP_ROLE to the specified address on the Treasury contract. */
  @Post('roles/frp/grant')
  async grantFRPRole(@Body() dto: GrantRoleDto) {
    const tx = await this.treasuryService.grantFRPRole(dto.address);
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Return the deployed Treasury contract address. */
  @Get('contract-address')
  async getContractAddress() {
    const address = this.treasuryService.getContractAddress();
    return {
      statusCode: HttpStatus.OK,
      data: { address },
    };
  }

  /** Check whether the given address holds the SESSION_CONTRACT role on the Treasury contract. */
  @Get('roles/session-contract/check/:address')
  async checkSessionContractRole(@Param('address') address: string) {
    const hasRole = await this.treasuryService.hasSessionContractRole(address);
    return {
      statusCode: HttpStatus.OK,
      data: {
        address,
        hasSessionContractRole: hasRole,
      },
    };
  }

  /** Check whether the given address holds the DEFAULT_ADMIN_ROLE on the Treasury contract. */
  @Get('roles/admin/check/:address')
  async checkAdminRole(@Param('address') address: string) {
    const hasRole = await this.treasuryService.hasAdminRole(address);
    return {
      statusCode: HttpStatus.OK,
      data: {
        address,
        hasAdminRole: hasRole,
      },
    };
  }

  /** Return diagnostic information: Treasury address, admin signer address, and admin role status. */
  @Get('diagnostics')
  async getDiagnostics() {
    const adminAddress = this.treasuryService.getAdminSignerAddress();
    const hasAdminRole = await this.treasuryService.hasAdminRole(adminAddress);
    const contractAddress = this.treasuryService.getContractAddress();

    return {
      statusCode: HttpStatus.OK,
      data: {
        treasuryContractAddress: contractAddress,
        backendAdminAddress: adminAddress,
        backendAdminHasAdminRole: hasAdminRole,
        message: hasAdminRole
          ? '✅ Backend admin can grant roles on Treasury'
          : '❌ Backend admin CANNOT grant roles on Treasury - need to grant DEFAULT_ADMIN_ROLE to this address',
      },
    };
  }

  /**
   * Get aggregated treasury balance information for an address
   * Returns all balance components in a single call
   */
  @Get('balance-summary/:address')
  async getBalanceSummary(@Param('address') address: string) {
    // Get all balance components in parallel
    const [collateralDeposited, collateralLocked, availableBalance] = await Promise.all([
      this.treasuryService.getCollateralDeposited(address),
      this.treasuryService.getCollateralLocked(address),
      this.treasuryService.getAvailableBalance(address),
    ]);

    return {
      statusCode: HttpStatus.OK,
      data: {
        address,
        collateralDeposited,
        collateralLocked,
        availableBalance,
        // Helper calculations (percentage in basis points: 10000 = 100%)
        lockedPercentage:
          collateralDeposited === '0'
            ? '0'
            : ((BigInt(collateralLocked) * BigInt(10000)) / BigInt(collateralDeposited)).toString(),
      },
    };
  }
}
