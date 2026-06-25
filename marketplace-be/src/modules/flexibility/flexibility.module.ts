import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';

// Schemas
import {
  ConsumptionData,
  ConsumptionDataSchema,
} from './schemas/consumption-data.schema';
import {
  FlexibilityData,
  FlexibilityDataSchema,
} from './schemas/flexibility-data.schema';
import {
  UserConsumptionProfile,
  UserConsumptionProfileSchema,
} from './schemas/user-consumption-profile.schema';
import { User, UsersSchema } from 'src/schemas/User.schema';
import { Session, SessionSchema } from 'src/schemas/Session.schema';
import { HourlyOffer, HourlyOfferSchema } from 'src/schemas/HourlyOffer.schema';

// Services
import { ConsumptionDataService } from './services/consumption-data.service';
import { FlexibilityDataService } from './services/flexibility-data.service';
import { UserConsumptionProfileService } from './services/user-consumption-profile.service';
import { FlexibilityCalculationService } from './services/flexibility-calculation.service';

// Utils
import { DataLoaderUtil } from './utils/loaders/data-loader.util';

// Controllers
import { ConsumptionDataController } from './controllers/consumption-data.controller';
import { FlexibilityDataController } from './controllers/flexibility-data.controller';
import { FlexibilityBatchController } from './controllers/flexibility-batch.controller';
import { HourlyOfferModule } from '../hourly-offer/hourly-offer.module';

@Module({
  imports: [
    // Import TenantModule per avere accesso a TenantContextService
    TenantModule,

    // Import UserModule per avere accesso a UserService
    UserModule,
    forwardRef(() => HourlyOfferModule),

    // Registra gli schema Mongoose
    MongooseModule.forFeature([
      { name: ConsumptionData.name, schema: ConsumptionDataSchema },
      { name: FlexibilityData.name, schema: FlexibilityDataSchema },
      { name: UserConsumptionProfile.name, schema: UserConsumptionProfileSchema },
      { name: User.name, schema: UsersSchema },
      { name: Session.name, schema: SessionSchema },
      { name: HourlyOffer.name, schema: HourlyOfferSchema },
    ]),
  ],
  controllers: [
    ConsumptionDataController,
    FlexibilityDataController,
    FlexibilityBatchController,
  ],
  providers: [
    ConsumptionDataService,
    FlexibilityDataService,
    UserConsumptionProfileService,
    FlexibilityCalculationService,
    DataLoaderUtil,
  ],
  exports: [
    ConsumptionDataService,
    FlexibilityDataService,
    UserConsumptionProfileService,
    FlexibilityCalculationService,
    DataLoaderUtil,
  ],
})
export class FlexibilityModule {}
