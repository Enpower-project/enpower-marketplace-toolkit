import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../../schemas/User.schema';
import { Market, MarketDocument, MarketState } from '../../../schemas/Market.schema';

@Injectable()
export class MarketValidationService {
  private readonly logger = new Logger(MarketValidationService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Market.name) private readonly marketModel: Model<MarketDocument>,
  ) {}

  /**
   * Valida que un usuario tenga acceso a un market específico
   */
  async validateAccess(keycloakUserId: string, marketId: string): Promise<boolean> {
    try {
      // Buscar el usuario por keycloakId
      const user = await this.userModel.findOne({ keycloakId: keycloakUserId }).populate('accessibleMarkets');
      if (!user) {
        this.logger.warn(`User with keycloakId ${keycloakUserId} not found`);
        return false;
      }

      // Buscar el market
      const market = await this.marketModel.findById(marketId);
      if (!market) {
        this.logger.warn(`Market ${marketId} not found`);
        return false;
      }

      // Verificar que el market no esté rechazado o expirado
      if (market.state === MarketState.CREATED_OFFLINE_REJECTED) {
        this.logger.warn(`Market ${marketId} is rejected and not accessible`);
        return false;
      }

      if (market.state === MarketState.CREATED_OFFLINE_EXPIRED) {
        this.logger.warn(`Market ${marketId} is expired and not accessible`);
        return false;
      }

      // Verificar si el usuario es owner del market
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const isOwner = market.marketOwner.toString() === (user._id as Types.ObjectId).toString();
      
      if (isOwner) {
        this.logger.debug(`User ${keycloakUserId} is owner of market ${marketId}`);
        return true;
      }

      // Verificar si el market está en la lista de accessibleMarkets del usuario
      const hasAccessibleMarket = user.accessibleMarkets?.some(
        (accessibleMarket: any) => accessibleMarket._id.toString() === marketId
      );

      if (hasAccessibleMarket) {
        this.logger.debug(`User ${keycloakUserId} has explicit access to market ${marketId}`);
        return true;
      }

      // Aquí se pueden agregar más validaciones en el futuro:
      // - Usuarios invitados al market
      // - Roles específicos del market
      // - Permisos especiales
      
      this.logger.debug(`User ${keycloakUserId} does not have access to market ${marketId}`);
      return false;

    } catch (error) {
      this.logger.error(`Access validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Obtiene todos los markets a los que un usuario tiene acceso
   * Incluye verificación automática de mercados expirados
   */
  async getUserAccessibleMarkets(keycloakUserId: string): Promise<string[]> {
    try {
      // 🎯 NUEVO: Verificar y actualizar mercados expirados ANTES de obtener la lista
      const expiredCount = await this.checkAndUpdateExpiredMarkets();
      if (expiredCount > 0) {
        this.logger.debug(`Expired ${expiredCount} markets for user ${keycloakUserId}`);
      }
      
      const user = await this.userModel.findOne({ keycloakId: keycloakUserId }).populate('accessibleMarkets');
      if (!user) {
        return [];
      }

      // Buscar markets donde el usuario es owner (excluir mercados rechazados y expirados)
      const ownedMarkets = await this.marketModel
        .find({ 
          marketOwner: user._id, 
          //isActive: true,
          state: { 
            $nin: [MarketState.CREATED_OFFLINE_REJECTED, MarketState.CREATED_OFFLINE_EXPIRED] // Excluir mercados rechazados y expirados
          }
        })
        .select('_id')
        .lean();

      // Combinar markets owned + markets in accessibleMarkets array
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const ownedMarketIds = ownedMarkets.map(market => market._id.toString());
      const accessibleMarketIds = user.accessibleMarkets
        .filter((market: any) => 
          market.isActive && 
          market.state !== MarketState.CREATED_OFFLINE_REJECTED && 
          market.state !== MarketState.CREATED_OFFLINE_EXPIRED
        ) // Solo markets activos, no rechazados y no expirados
        .map((market: any) => market._id.toString());

      // Unir ambos arrays y eliminar duplicados
      const allMarketIds = [...new Set([...ownedMarketIds, ...accessibleMarketIds])];

      this.logger.debug(`User ${keycloakUserId} has access to markets: ${allMarketIds.join(', ')}`);
      return allMarketIds;

    } catch (error) {
      this.logger.error(`Failed to get user accessible markets: ${error.message}`);
      return [];
    }
  }

  /**
   * Obtiene todos los markets con nombres a los que un usuario tiene acceso
   * Incluye verificación automática de mercados expirados
   */
  async getUserAccessibleMarketsWithNames(keycloakUserId: string): Promise<{ id: string; name: string }[]> {
    try {
      // 🎯 NUEVO: Verificar y actualizar mercados expirados ANTES de obtener la lista
      const expiredCount = await this.checkAndUpdateExpiredMarkets();
      if (expiredCount > 0) {
        this.logger.debug(`Expired ${expiredCount} markets for user ${keycloakUserId}`);
      }
      
      const user = await this.userModel.findOne({ keycloakId: keycloakUserId }).populate('accessibleMarkets');
      if (!user) {
        return [];
      }

      // Buscar markets donde el usuario es owner (excluir mercados rechazados y expirados)
      const ownedMarkets = await this.marketModel
        .find({ 
          marketOwner: user._id, 
          //isActive: true,
          state: { 
            $nin: [MarketState.CREATED_OFFLINE_REJECTED, MarketState.CREATED_OFFLINE_EXPIRED] // Excluir mercados rechazados y expirados
          }
        })
        .select('_id name')
        .lean();

      // Markets in accessibleMarkets array con nombres
      const accessibleMarkets = user.accessibleMarkets
        .filter((market: any) => 
          //market.isActive && 
          market.state !== MarketState.CREATED_OFFLINE_REJECTED && 
          market.state !== MarketState.CREATED_OFFLINE_EXPIRED
        ) // Solo markets activos, no rechazados y no expirados
        .map((market: any) => ({
          id: market._id.toString(),
          name: market.name
        }));

      // Markets owned con nombres
      const ownedMarketsWithNames = ownedMarkets.map(market => ({
        id: market._id.toString(),
        name: market.name
      }));

      // Combinar y eliminar duplicados por ID
      const allMarkets = [...ownedMarketsWithNames, ...accessibleMarkets];
      const uniqueMarkets = allMarkets.filter((market, index, self) => 
        index === self.findIndex(m => m.id === market.id)
      );

      this.logger.debug(`User ${keycloakUserId} has access to ${uniqueMarkets.length} markets with names: ${uniqueMarkets.map(m => `${m.id}:${m.name}`).join(', ')}`);
      this.logger.debug(`Markets breakdown - Owned: ${ownedMarketsWithNames.length}, Accessible: ${accessibleMarkets.length}, Unique: ${uniqueMarkets.length}`);
      this.logger.log(`Owned markets found: ${JSON.stringify(ownedMarkets)}`);
      this.logger.log(`User accessibleMarkets: ${JSON.stringify(user.accessibleMarkets)}`)
      
      return uniqueMarkets;

    } catch (error) {
      this.logger.error(`Failed to get user accessible markets with names: ${error.message}`);
      return [];
    }
  }

  /**
   * Obtiene el usuario de la base de datos por su Keycloak ID
   */
  async getUserByKeycloakId(keycloakUserId: string): Promise<UserDocument | null> {
    try {
      const user = await this.userModel.findOne({ keycloakId: keycloakUserId });
      if (!user) {
        this.logger.warn(`User with keycloakId ${keycloakUserId} not found`);
        return null;
      }

      return user;

    } catch (error) {
      this.logger.error(`Failed to get user by Keycloak ID ${keycloakUserId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Valida que un market esté activo y disponible
   */
  async validateMarketStatus(marketId: string): Promise<boolean> {
    try {
      const market = await this.marketModel.findById(marketId);
      
      if (!market) {
        this.logger.warn(`Market ${marketId} not found`);
        return false;
      }

      const isNotRejected = market.state !== MarketState.CREATED_OFFLINE_REJECTED;
      const isNotExpired = market.state !== MarketState.CREATED_OFFLINE_EXPIRED;
      
      this.logger.debug(`Market not rejected: ${isNotRejected}, not expired: ${isNotExpired}`);
      
      return isNotRejected && isNotExpired;

    } catch (error) {
      this.logger.error(`Market status validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Actualiza el campo assignedMarket del usuario en la base de datos MongoDB
   * Este método se llama cuando un usuario selecciona o cambia de mercado
   */
  async updateUserAssignedMarket(keycloakUserId: string, marketId: string): Promise<void> {
    try {
      this.logger.debug(`Updating assignedMarket for user ${keycloakUserId} to market ${marketId}`);

      // Buscar el usuario por keycloakId
      const user = await this.userModel.findOne({ keycloakId: keycloakUserId });
      if (!user) {
        this.logger.error(`User with keycloakId ${keycloakUserId} not found`);
        throw new Error(`User with keycloakId ${keycloakUserId} not found`);
      }

      // Actualizar el campo assignedMarket
      await this.userModel.updateOne(
        { _id: user._id },
        { $set: { assignedMarket: new Types.ObjectId(marketId) } }
      );

      this.logger.debug(`Successfully updated assignedMarket for user ${keycloakUserId} to market ${marketId}`);

    } catch (error) {
      this.logger.error(`Failed to update assignedMarket: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check and update expired markets to CREATED_OFFLINE_EXPIRED state
   */
  private async checkAndUpdateExpiredMarkets(): Promise<number> {
    try {
      const now = new Date();
      
      // Find markets that are pending acceptance and have expired
      const expiredMarkets = await this.marketModel.updateMany(
        {
          state: MarketState.CREATED_OFFLINE_PENDING_ACCEPTATION,
          expireMarketAcceptationDate: { $lt: now }
        },
        {
          state: MarketState.CREATED_OFFLINE_EXPIRED,
          expireMarketAcceptationDate: undefined // Clear expiration date
        }
      );

      if (expiredMarkets.modifiedCount > 0) {
        this.logger.log(`Updated ${expiredMarkets.modifiedCount} expired markets to EXPIRED state`);
      }

      return expiredMarkets.modifiedCount;

    } catch (error) {
      this.logger.error('Error checking expired markets:', error);
      return 0;
    }
  }
}
