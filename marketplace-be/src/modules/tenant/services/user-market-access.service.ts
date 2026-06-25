import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../../schemas/User.schema';
import { Market, MarketDocument } from '../../../schemas/Market.schema';
import { KeycloakAdminService } from './keycloak-admin.service';

@Injectable()
export class UserMarketAccessService {
  private readonly logger = new Logger(UserMarketAccessService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Market.name) private readonly marketModel: Model<MarketDocument>,
    private readonly keycloakAdmin: KeycloakAdminService,
  ) {}

  /**
   * Agrega acceso a un market para un usuario (por keycloakId)
   */
  async grantMarketAccess(keycloakUserId: string, marketId: string): Promise<void> {
    try {
      // Verificar que el usuario existe
      const user = await this.userModel.findOne({ keycloakId: keycloakUserId });
      if (!user) {
        throw new NotFoundException(`User with keycloakId ${keycloakUserId} not found`);
      }

      // Verificar que el market existe y está activo
      const market = await this.marketModel.findById(marketId);
      if (!market) {
        throw new NotFoundException(`Market ${marketId} not found`);
      }

      if (!market.isActive) {
        throw new BadRequestException(`Market ${marketId} is not active`);
      }

      // Verificar si ya tiene acceso
      const alreadyHasAccess = user.accessibleMarkets?.some(
        marketObjId => marketObjId.toString() === marketId
      );

      if (alreadyHasAccess) {
        this.logger.warn(`User ${keycloakUserId} already has access to market ${marketId}`);
        return;
      }

      // Agregar el market a accessibleMarkets
      await this.userModel.updateOne(
        { _id: user._id },
        { $addToSet: { accessibleMarkets: marketId } }
      );

      // Sync: Add user to Market.users array
      await this.marketModel.updateOne(
        { _id: marketId },
        { $addToSet: { users: user._id } }
      );

      // Actualizar Keycloak attributes
      await this.updateKeycloakMarketAttributes(user.keycloakId, (user._id as any).toString());

      this.logger.debug(`Granted market access: user ${keycloakUserId} → market ${marketId}`);

    } catch (error) {
      this.logger.error(`Failed to grant market access: ${error.message}`);
      throw error;
    }
  }

  /**
   * Revoca acceso a un market para un usuario (por keycloakId)
   */
  async revokeMarketAccess(keycloakUserId: string, marketId: string): Promise<void> {
    try {
      // Verificar que el usuario existe
      const user = await this.userModel.findOne({ keycloakId: keycloakUserId });
      if (!user) {
        throw new NotFoundException(`User with keycloakId ${keycloakUserId} not found`);
      }

      // Verificar que el market existe
      const market = await this.marketModel.findById(marketId);
      if (!market) {
        throw new NotFoundException(`Market ${marketId} not found`);
      }

      // No permitir revocación si el usuario es owner del market
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      if (market.marketOwner.toString() === (user._id as any).toString()) {
        throw new BadRequestException(`Cannot revoke access: user ${keycloakUserId} is owner of market ${marketId}`);
      }

      // Remover el market de accessibleMarkets
      await this.userModel.updateOne(
        { _id: user._id },
        { $pull: { accessibleMarkets: marketId } }
      );

      // Sync: Remove user from Market.users array
      await this.marketModel.updateOne(
        { _id: marketId },
        { $pull: { users: user._id } }
      );

      // Actualizar Keycloak attributes
      await this.updateKeycloakMarketAttributes(user.keycloakId, (user._id as any).toString());

      this.logger.debug(`Revoked market access: user ${keycloakUserId} ✗ market ${marketId}`);

    } catch (error) {
      this.logger.error(`Failed to revoke market access: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene todos los usuarios con acceso a un market específico
   */
  async getUsersWithMarketAccess(marketId: string): Promise<UserDocument[]> {
    try {
      // Verificar que el market existe
      const market = await this.marketModel.findById(marketId);
      if (!market) {
        throw new NotFoundException(`Market ${marketId} not found`);
      }

      // Buscar usuarios que tienen este market en accessibleMarkets O son owners
      const users = await this.userModel.find({
        $or: [
          { accessibleMarkets: marketId },
          { _id: market.marketOwner }
        ]
      }).select('username email role accessibleMarkets');

      this.logger.debug(`Found ${users.length} users with access to market ${marketId}`);
      return users;

    } catch (error) {
      this.logger.error(`Failed to get users with market access: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sincroniza los market attributes en Keycloak basándose en la BD
   */
  private async updateKeycloakMarketAttributes(keycloakId: string, userId: string): Promise<void> {
    try {
      // Obtener markets accessibles del usuario
      const user = await this.userModel.findById(userId).populate('accessibleMarkets');
      if (!user) return;

      // Obtener markets owned
      const ownedMarkets = await this.marketModel
        .find({ marketOwner: userId, isActive: true })
        .select('_id')
        .lean();

      // Combinar ambos arrays
      const ownedMarketIds = ownedMarkets.map(market => 
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        market._id.toString()
      );
      const accessibleMarketIds = (user.accessibleMarkets || [])
        .filter((market: any) => market.isActive)
        .map((market: any) => market._id.toString());

      const allMarketIds = [...new Set([...ownedMarketIds, ...accessibleMarketIds])];

      // Actualizar Keycloak - get admin client already configured for user realm operations
      const adminClient = await this.keycloakAdmin.getAdminClientForUserOperations();

      const currentUser = await adminClient.users.findOne({
        id: keycloakId
      });

      if (currentUser) {
        const updatedAttributes = {
          ...currentUser.attributes,
          accessible_markets: allMarketIds,
          markets_updated_at: [new Date().toISOString()],
        };

        await adminClient.users.update(
          { id: keycloakId },
          {
            ...currentUser,
            attributes: updatedAttributes
          }
        );

        this.logger.debug(`Updated Keycloak attributes for user ${userId} with ${allMarketIds.length} markets`);
      }

    } catch (error) {
      this.logger.error(`Failed to update Keycloak market attributes: ${error.message}`);
      // No lanzar error - esto es un update auxiliar
    }
  }
}
