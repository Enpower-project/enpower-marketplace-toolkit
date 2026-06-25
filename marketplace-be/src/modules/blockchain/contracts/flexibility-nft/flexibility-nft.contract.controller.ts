import { Controller, Post, Get, Body, Param, ParseIntPipe, HttpStatus, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from 'nest-keycloak-connect';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FlexibilityNFTContractService } from './flexibility-nft.contract.service';
import { GrantRoleDto } from './dto/flexibility-nft.dto';
import { Settlement, SettlementDocument } from '../../../settlement/schemas/settlement.schema';
import { User, UserDocument } from '../../../../schemas/User.schema';

@Controller('blockchain/flexibility-nft')
export class FlexibilityNFTContractController {
  constructor(
    private readonly nftService: FlexibilityNFTContractService,
    @InjectModel(Settlement.name) private readonly settlementModel: Model<SettlementDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /** Return the session ID encoded in the NFT metadata for the given token. */
  @Get('tokens/:tokenId/session-id')
  async getSessionId(@Param('tokenId', ParseIntPipe) tokenId: number) {
    const sessionId = await this.nftService.getSessionId(tokenId);
    return {
      statusCode: HttpStatus.OK,
      data: { sessionId },
    };
  }

  /** Return the offer ID encoded in the NFT metadata for the given token. */
  @Get('tokens/:tokenId/offer-id')
  async getOfferId(@Param('tokenId', ParseIntPipe) tokenId: number) {
    const offerId = await this.nftService.getOfferId(tokenId);
    return {
      statusCode: HttpStatus.OK,
      data: { offerId },
    };
  }

  /** Return the delivery hour slot encoded in the NFT metadata. */
  @Get('tokens/:tokenId/hour-slot')
  async getHourSlot(@Param('tokenId', ParseIntPipe) tokenId: number) {
    const hourSlot = await this.nftService.getHourSlot(tokenId);
    return {
      statusCode: HttpStatus.OK,
      data: { hourSlot },
    };
  }

  /** Return the FSP address encoded in the NFT metadata. */
  @Get('tokens/:tokenId/fsp')
  async getFsp(@Param('tokenId', ParseIntPipe) tokenId: number) {
    const fsp = await this.nftService.getFsp(tokenId);
    return {
      statusCode: HttpStatus.OK,
      data: { fsp },
    };
  }

  /** Return the originally offered quantity (in wei) from the NFT metadata. */
  @Get('tokens/:tokenId/offered-quantity')
  async getOfferedQuantity(@Param('tokenId', ParseIntPipe) tokenId: number) {
    const offeredQuantity = await this.nftService.getOfferedQuantity(tokenId);
    return {
      statusCode: HttpStatus.OK,
      data: { offeredQuantity },
    };
  }

  /** Return the offer price (in wei) from the NFT metadata. */
  @Get('tokens/:tokenId/price')
  async getPrice(@Param('tokenId', ParseIntPipe) tokenId: number) {
    const price = await this.nftService.getPrice(tokenId);
    return {
      statusCode: HttpStatus.OK,
      data: { price },
    };
  }

  /** Return the collateral amount (in wei) locked for this NFT. */
  @Get('tokens/:tokenId/collateral-amount')
  async getCollateralAmount(@Param('tokenId', ParseIntPipe) tokenId: number) {
    const collateralAmount = await this.nftService.getCollateralAmount(tokenId);
    return {
      statusCode: HttpStatus.OK,
      data: { collateralAmount },
    };
  }

  /** Return the FMO/LMO address associated with this NFT. */
  @Get('tokens/:tokenId/fmo-lmo')
  async getFmoLmo(@Param('tokenId', ParseIntPipe) tokenId: number) {
    const fmoLmo = await this.nftService.getFmoLmo(tokenId);
    return {
      statusCode: HttpStatus.OK,
      data: { fmoLmo },
    };
  }

  /** Return the accepted quantity (in wei) after offer matching. */
  @Get('tokens/:tokenId/accepted-quantity')
  async getAcceptedQuantity(@Param('tokenId', ParseIntPipe) tokenId: number) {
    const acceptedQuantity = await this.nftService.getAcceptedQuantity(tokenId);
    return {
      statusCode: HttpStatus.OK,
      data: { acceptedQuantity },
    };
  }

  /** Return the quantity actually delivered during settlement (in wei). */
  @Get('tokens/:tokenId/delivered-quantity')
  async getDeliveredQuantity(@Param('tokenId', ParseIntPipe) tokenId: number) {
    const deliveredQuantity = await this.nftService.getDeliveredQuantity(tokenId);
    return {
      statusCode: HttpStatus.OK,
      data: { deliveredQuantity },
    };
  }

  /** Return the address of the final buyer after settlement. */
  @Get('tokens/:tokenId/final-buyer')
  async getFinalBuyer(@Param('tokenId', ParseIntPipe) tokenId: number) {
    const finalBuyer = await this.nftService.getFinalBuyer(tokenId);
    return {
      statusCode: HttpStatus.OK,
      data: { finalBuyer },
    };
  }

  /** Return the actual payment (in wei) made at settlement. */
  @Get('tokens/:tokenId/actual-payment')
  async getActualPayment(@Param('tokenId', ParseIntPipe) tokenId: number) {
    const actualPayment = await this.nftService.getActualPayment(tokenId);
    return {
      statusCode: HttpStatus.OK,
      data: { actualPayment },
    };
  }

  /** Return the numeric lifecycle status of the NFT (0=SUBMITTED … 4=FINALIZED). */
  @Get('tokens/:tokenId/status')
  async getStatus(@Param('tokenId', ParseIntPipe) tokenId: number) {
    const status = await this.nftService.getStatus(tokenId);
    return {
      statusCode: HttpStatus.OK,
      data: { status },
    };
  }

  /** Return whether the NFT is soulbound (non-transferable). */
  @Get('tokens/:tokenId/is-soulbound')
  async getIsSoulbound(@Param('tokenId', ParseIntPipe) tokenId: number) {
    const isSoulbound = await this.nftService.getIsSoulbound(tokenId);
    return {
      statusCode: HttpStatus.OK,
      data: { isSoulbound },
    };
  }

  /** Return the ERC1155 balance of `tokenId` held by `address`. */
  @Get('balance/:address/:tokenId')
  async balanceOf(@Param('address') address: string, @Param('tokenId', ParseIntPipe) tokenId: number) {
    const balance = await this.nftService.balanceOf(address, tokenId);
    return {
      statusCode: HttpStatus.OK,
      data: { balance },
    };
  }

  /** Return the ERC1155 metadata URI for the given token ID. */
  @Get('tokens/:tokenId/uri')
  async uri(@Param('tokenId', ParseIntPipe) tokenId: number) {
    const uri = await this.nftService.uri(tokenId);
    return {
      statusCode: HttpStatus.OK,
      data: { uri },
    };
  }

  /** Grant MINTER_ROLE on the FlexibilityNFT contract to the specified address. */
  @Post('roles/minter/grant')
  async grantMinterRole(@Body() dto: GrantRoleDto) {
    const tx = await this.nftService.grantMinterRole(dto.address);
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Grant UPDATER_ROLE on the FlexibilityNFT contract to the specified address. */
  @Post('roles/updater/grant')
  async grantUpdaterRole(@Body() dto: GrantRoleDto) {
    const tx = await this.nftService.grantUpdaterRole(dto.address);
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Return the deployed FlexibilityNFT contract address. */
  @Get('contract-address')
  async getContractAddress() {
    const address = this.nftService.getContractAddress();
    return {
      statusCode: HttpStatus.OK,
      data: { address },
    };
  }

  /**
   * Get all NFT certificates for the authenticated user
   * - FSP users: See ALL NFTs they created (any status)
   * - FRP users: See ONLY FINALIZED NFTs they purchased
   */
  @Get('my-certificates')
  async getMyCertificates(@AuthenticatedUser() user: any) {
    // Convert Keycloak ID to MongoDB ObjectId
    const userDoc = await this.userModel.findOne({ keycloakId: user.sub }).exec();
    if (!userDoc) {
      throw new NotFoundException(`User with keycloakId ${user.sub} not found`);
    }

    let settlements: any[] = [];

    // FSP: Show all NFTs they created
    if (userDoc.role === 'FSP') {
      settlements = await this.settlementModel
        .find({
          fspUserId: userDoc._id,
          flexibilityNftId: { $exists: true, $ne: null },
        })
        .populate('sessionId', 'name sessionDate')
        .populate('fspUserId', 'username email publicAddress')
        .sort({ createdAt: -1 })
        .exec();
    }
    // FRP: Show only FINALIZED NFTs they purchased
    else if (userDoc.role === 'FRP') {
      const userWalletAddress = userDoc.publicAddress?.toLowerCase();
      if (!userWalletAddress) {
        return {
          statusCode: HttpStatus.OK,
          data: {
            total: 0,
            certificates: [],
          },
        };
      }

      // Get all settlements with NFTs
      const allSettlements = await this.settlementModel
        .find({
          flexibilityNftId: { $exists: true, $ne: null },
        })
        .populate('sessionId', 'name sessionDate')
        .populate('fspUserId', 'username email publicAddress')
        .sort({ createdAt: -1 })
        .exec();

      // Filter only FINALIZED NFTs where user is the finalBuyer
      const filteredSettlements: SettlementDocument[] = [];
      for (const settlement of allSettlements) {
        try {
          const tokenId = settlement.flexibilityNftId;
          
          // Skip if tokenId is undefined
          if (tokenId === undefined || tokenId === null) {
            continue;
          }

          // Convert string to number if needed
          const tokenIdNum = typeof tokenId === 'string' ? parseInt(tokenId, 10) : tokenId;
          
          // Check NFT status on blockchain
          const nftStatus = await this.nftService.getStatus(tokenIdNum);
          
          // Only include if FINALIZED (status = 4)
          if (nftStatus === 4) {
            const finalBuyer = await this.nftService.getFinalBuyer(tokenIdNum);
            
            // Check if user is the final buyer
            if (finalBuyer?.toLowerCase() === userWalletAddress) {
              filteredSettlements.push(settlement);
            }
          }
        } catch (error) {
          // Skip NFTs that fail verification
          continue;
        }
      }

      settlements = filteredSettlements;
    }

    // Map to certificate summary
    const certificates = await Promise.all(
      settlements.map(async (settlement) => {
        const session = settlement.sessionId as any;
        const fspUser = settlement.fspUserId as any;
        
        // Get blockchain status for display
        let blockchainStatus = settlement.status;
        try {
          const nftStatus = await this.nftService.getStatus(settlement.flexibilityNftId);
          const statusMap = ['SUBMITTED', 'ACCEPTED', 'REJECTED', 'DELIVERED', 'FINALIZED'];
          blockchainStatus = statusMap[nftStatus] || settlement.status;
        } catch (error) {
          // Use settlement status as fallback
        }

        // Get current owner from blockchain
        let currentOwner: string | null = null;
        let finalBuyer: string | null = null;
        try {
          const tokenIdNum = typeof settlement.flexibilityNftId === 'string' 
            ? parseInt(settlement.flexibilityNftId, 10) 
            : settlement.flexibilityNftId;
          
          // Get FSP address (initial owner) and final buyer
          const fspAddress = await this.nftService.getFsp(tokenIdNum);
          finalBuyer = await this.nftService.getFinalBuyer(tokenIdNum);
          
          // Determine current owner based on status
          if (finalBuyer && finalBuyer !== '0x0000000000000000000000000000000000000000') {
            currentOwner = finalBuyer; // FRP is current owner
          } else {
            currentOwner = fspAddress; // FSP is current owner
          }
        } catch (error) {
          // Use settlement data as fallback
          currentOwner = settlement.fspAddress;
        }

        // Ensure nftMetadata is properly structured
        // Merge settlement data with existing nftMetadata to ensure all fields are present
        const nftMetadata = {
          ...(settlement.nftMetadata || {}),
          // Always ensure these fields are present (fallback to settlement data)
          tokenId: settlement.nftMetadata?.tokenId || settlement.flexibilityNftId,
          promisedFlexibility: settlement.nftMetadata?.promisedFlexibility || settlement.committedQuantity,
          deliveredFlexibility: settlement.nftMetadata?.deliveredFlexibility || settlement.deliveredQuantity,
          deliveryDate: settlement.nftMetadata?.deliveryDate || settlement.deliveryDate,
          hourSlot: settlement.nftMetadata?.hourSlot ?? settlement.hourSlot,
          deviationPercentage: settlement.nftMetadata?.deviationPercentage ?? settlement.deviationPercentage,
          penaltyApplied: settlement.nftMetadata?.penaltyApplied ?? (BigInt(settlement.penaltyAmount || '0') > BigInt(0)),
        };

        return {
          tokenId: settlement.flexibilityNftId,
          sessionId: settlement.sessionId,
          sessionName: session?.name || 'Unknown Session',
          sessionDate: session?.sessionDate || settlement.deliveryDate,
          offerId: settlement.offerId,
          hourSlot: settlement.hourSlot,
          deliveryDate: settlement.deliveryDate,
          status: blockchainStatus,
          nftMetadata: nftMetadata,
          // Owner information
          fspAddress: settlement.fspAddress,
          fspUsername: fspUser?.username,
          currentOwner: currentOwner,
          finalBuyer: finalBuyer && finalBuyer !== '0x0000000000000000000000000000000000000000' ? finalBuyer : null,
          createdAt: settlement.createdAt,
        };
      })
    );

    return {
      statusCode: HttpStatus.OK,
      data: {
        total: certificates.length,
        certificates,
      },
    };
  }

  /**
   * Get complete metadata for a specific NFT certificate
   * Combines on-chain data from smart contract with off-chain MongoDB data
   */
  @Get('certificate/:tokenId')
  async getCertificateDetail(@Param('tokenId', ParseIntPipe) tokenId: number) {
    // Get all on-chain data in parallel
    const [
      sessionId,
      offerId,
      hourSlot,
      fsp,
      offeredQuantity,
      price,
      collateralAmount,
      fmoLmo,
      acceptedQuantity,
      deliveredQuantity,
      finalBuyer,
      actualPayment,
      status,
      isSoulbound,
      uri,
    ] = await Promise.all([
      this.nftService.getSessionId(tokenId),
      this.nftService.getOfferId(tokenId),
      this.nftService.getHourSlot(tokenId),
      this.nftService.getFsp(tokenId),
      this.nftService.getOfferedQuantity(tokenId),
      this.nftService.getPrice(tokenId),
      this.nftService.getCollateralAmount(tokenId),
      this.nftService.getFmoLmo(tokenId),
      this.nftService.getAcceptedQuantity(tokenId),
      this.nftService.getDeliveredQuantity(tokenId),
      this.nftService.getFinalBuyer(tokenId),
      this.nftService.getActualPayment(tokenId),
      this.nftService.getStatus(tokenId),
      this.nftService.getIsSoulbound(tokenId),
      this.nftService.uri(tokenId),
    ]);

    // Try to find corresponding settlement in MongoDB for additional context
    const settlement = await this.settlementModel
      .findOne({ flexibilityNftId: tokenId })
      .populate('sessionId', 'name sessionDate')
      .populate('fspUserId', 'username email publicAddress')
      .exec();

    const session = settlement?.sessionId as any;
    const fspUser = settlement?.fspUserId as any;

    // Status enum mapping
    const statusMap = ['SUBMITTED', 'ACCEPTED', 'REJECTED', 'DELIVERED', 'FINALIZED'];

    return {
      statusCode: HttpStatus.OK,
      data: {
        tokenId,
        // On-chain data
        blockchain: {
          sessionId,
          offerId,
          hourSlot,
          fspAddress: fsp,
          offeredQuantity,
          price,
          collateralAmount,
          fmoLmoAddress: fmoLmo,
          acceptedQuantity,
          deliveredQuantity,
          finalBuyer,
          actualPayment,
          status: statusMap[status] || status,
          statusCode: status,
          isSoulbound,
          uri,
        },
        // Off-chain data (if available)
        offChain: settlement
          ? {
              settlementId: settlement._id,
              sessionName: session?.name,
              sessionDate: session?.sessionDate,
              fspUsername: fspUser?.username,
              fspEmail: fspUser?.email,
              deliveryDate: settlement.deliveryDate,
              committedQuantity: settlement.committedQuantity,
              deviationPercentage: settlement.deviationPercentage,
              deviationType: settlement.deviationType,
              penaltyAmount: settlement.penaltyAmount,
              platformFee: settlement.platformFee,
              collateralReturned: settlement.collateralReturned,
              collateralForfeited: settlement.collateralForfeited,
              submitTxHash: settlement.submitTxHash,
              executeTxHash: settlement.executeTxHash,
              nftMetadata: settlement.nftMetadata,
            }
          : null,
      },
    };
  }
}
