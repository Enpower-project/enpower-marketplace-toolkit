import { Module, Global } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';

// Services
import { KeycloakAdminService } from './services/keycloak-admin.service';
import { MarketValidationService } from './services/market-validation.service';
import { MarketSelectionService } from './services/market-selection.service';
import { UserMarketAccessService } from './services/user-market-access.service';
import { TenantContextService } from './services/tenant-context.service';

// Controllers
import { MarketSelectionController } from './controllers/market-selection.controller';
import { TenantTestController } from './controllers/tenant-test.controller';

// Schemas
import { User, UsersSchema } from '../../schemas/User.schema';
import { Market, MarketSchema } from '../../schemas/Market.schema';
import { UserService } from '../user/user.service';
import { Session } from 'node:inspector/promises';
import { SessionSchema } from 'src/schemas/Session.schema';

@Global() // Hacer disponible en toda la aplicación sin imports explícitos
@Module({
  imports: [
    HttpModule,
    ConfigModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UsersSchema },
      { name: Market.name, schema: MarketSchema },
      { name: Session.name, schema: SessionSchema },
    ]),
  ],
  providers: [
    KeycloakAdminService,
    MarketValidationService,
    MarketSelectionService,
    UserMarketAccessService,
    TenantContextService,
    UserService
  ],
  controllers: [
    MarketSelectionController,
    TenantTestController,
  ],
  exports: [
    KeycloakAdminService,
    MarketValidationService,
    MarketSelectionService,
    UserMarketAccessService,
    TenantContextService,
    UserService

  ],
})
export class TenantModule {}
