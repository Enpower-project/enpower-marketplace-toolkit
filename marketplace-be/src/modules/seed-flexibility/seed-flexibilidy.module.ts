import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { SeedFlexibilityController } from './seed-flexibility.controller';
import { SeedFlexibilityService } from './seed-flexibility.service';
import {
  ConsumptionData,
  ConsumptionDataSchema,
} from '../flexibility/schemas/consumption-data.schema';
import {
  FlexibilityData,
  FlexibilityDataSchema,
} from '../flexibility/schemas/flexibility-data.schema';
import { CsvDataParser } from '../flexibility/utils/parsers/csv-data.parser';
import { GreekCsvDataParser } from '../flexibility/utils/parsers/csv-greek-data.parser';
import { PortugueseCsvDataParser } from '../flexibility/utils/parsers/csv-portuguese-data.parser';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ConsumptionData.name, schema: ConsumptionDataSchema },
      { name: FlexibilityData.name, schema: FlexibilityDataSchema },
    ]),
  ],
  providers: [SeedFlexibilityService, CsvDataParser, GreekCsvDataParser, PortugueseCsvDataParser],
  controllers: [SeedFlexibilityController],
  exports: [SeedFlexibilityService],
})
export class SeedFlexibilityModule {}
