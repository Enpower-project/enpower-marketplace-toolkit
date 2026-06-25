import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';
import { Settlement, SettlementSchema } from './schemas/settlement.schema';
import { FrpPaymentRequest, FrpPaymentRequestSchema } from './schemas/frp-payment-request.schema';
import { HourlyOffer, HourlyOfferSchema } from '../../schemas/HourlyOffer.schema';
import { Session, SessionSchema } from '../../schemas/Session.schema';
import { User, UsersSchema } from '../../schemas/User.schema';
import { Market, MarketSchema } from '../../schemas/Market.schema';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { FlexibilityModule } from '../flexibility/flexibility.module';
import { WalletModule } from '../wallet/wallet.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';
import { EmailModule } from '../email/email.module';

/**
 * Módulo de Settlement
 *
 * Gestiona el proceso de liquidación de flexibilidad:
 * - Cálculo de settlements basándose en datos de consumo
 * - Envío de settlements a blockchain con firma de usuario (PIN)
 * - Ejecución de settlements para procesar pagos
 * - Persistencia y consulta de settlements
 * - Solicitud de depósito de fondos al FRP
 */
@Module({
  imports: [
    // Schemas MongoDB
    MongooseModule.forFeature([
      { name: Settlement.name, schema: SettlementSchema },
      { name: FrpPaymentRequest.name, schema: FrpPaymentRequestSchema },
      { name: HourlyOffer.name, schema: HourlyOfferSchema },
      { name: Session.name, schema: SessionSchema },
      { name: User.name, schema: UsersSchema },
      { name: Market.name, schema: MarketSchema },
    ]),

    // Módulos dependientes
    BlockchainModule,    // Para interactuar con smart contracts
    FlexibilityModule,   // Para obtener datos de consumo
    WalletModule,        // Para obtener wallet del usuario con PIN
    TenantModule,        // Para contexto de tenant/mercado
    UserModule,          // Para obtener información del usuario
    EmailModule,         // Para enviar notificaciones por email
  ],
  controllers: [SettlementController],
  providers: [SettlementService],
  exports: [SettlementService],
})
export class SettlementModule {}
