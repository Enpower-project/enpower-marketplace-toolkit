import { Controller, Post, Get, Body, Param, HttpStatus } from '@nestjs/common';
import { FlexibilityTokenContractService } from './flexibility-token.contract.service';
import {
  TransferTokenDto,
  ApproveTokenDto,
  MintTokenDto,
  BurnTokenDto,
  GrantRoleDto,
} from './dto/token-balance.dto';

@Controller('blockchain/flexibility-token')
export class FlexibilityTokenContractController {
  constructor(private readonly tokenService: FlexibilityTokenContractService) {}

  /** Return the FLEX token balance (in wei) held by the given address. */
  @Get('balance/:address')
  async balanceOf(@Param('address') address: string) {
    const balance = await this.tokenService.balanceOf(address);
    return {
      statusCode: HttpStatus.OK,
      data: { balance },
    };
  }

  /** Return total balance, locked collateral, and available balance for the given address. */
  @Get('available-balance/:address')
  async availableBalance(@Param('address') address: string) {
    const balance = await this.tokenService.balanceOf(address);
    const locked = await this.tokenService.getCollateralLocked(address);
    const available = await this.tokenService.availableBalance(address);

    return {
      statusCode: HttpStatus.OK,
      data: {
        balance,
        collateralLocked: locked,
        availableBalance: available,
      },
    };
  }

  /** Return the total FLEX token supply (in wei). */
  @Get('total-supply')
  async totalSupply() {
    const supply = await this.tokenService.totalSupply();
    return {
      statusCode: HttpStatus.OK,
      data: { totalSupply: supply },
    };
  }

  /** Return the ERC20 allowance granted by `owner` to `spender` (in wei). */
  @Get('allowance/:owner/:spender')
  async allowance(@Param('owner') owner: string, @Param('spender') spender: string) {
    const allowance = await this.tokenService.allowance(owner, spender);
    return {
      statusCode: HttpStatus.OK,
      data: { allowance },
    };
  }

  /** Transfer FLEX tokens from the admin wallet to the specified recipient. */
  @Post('transfer')
  async transfer(@Body() dto: TransferTokenDto) {
    const tx = await this.tokenService.transfer(dto.to, dto.amount);
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Approve a spender to transfer FLEX tokens on behalf of the admin wallet. */
  @Post('approve')
  async approve(@Body() dto: ApproveTokenDto) {
    const tx = await this.tokenService.approve(dto.spender, dto.amount);
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Mint new FLEX tokens to the specified recipient (requires MINTER_ROLE). */
  @Post('mint')
  async mint(@Body() dto: MintTokenDto) {
    const tx = await this.tokenService.mint(dto.to, dto.amount);
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.CREATED,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Burn FLEX tokens from the admin wallet's balance. */
  @Post('burn')
  async burn(@Body() dto: BurnTokenDto) {
    const tx = await this.tokenService.burn(dto.amount);
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Pause all token transfers on the FlexibilityToken contract (requires PAUSER_ROLE). */
  @Post('pause')
  async pause() {
    const tx = await this.tokenService.pause();
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Unpause token transfers on the FlexibilityToken contract (requires PAUSER_ROLE). */
  @Post('unpause')
  async unpause() {
    const tx = await this.tokenService.unpause();
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Grant MINTER_ROLE on the FlexibilityToken contract to the specified address. */
  @Post('roles/minter/grant')
  async grantMinterRole(@Body() dto: GrantRoleDto) {
    const tx = await this.tokenService.grantMinterRole(dto.address);
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Grant TREASURY_ROLE on the FlexibilityToken contract to the specified address. */
  @Post('roles/treasury/grant')
  async grantTreasuryRole(@Body() dto: GrantRoleDto) {
    const tx = await this.tokenService.grantTreasuryRole(dto.address);
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Return the deployed FlexibilityToken contract address. */
  @Get('contract-address')
  async getContractAddress() {
    const address = this.tokenService.getContractAddress();
    return {
      statusCode: HttpStatus.OK,
      data: { address },
    };
  }
}
