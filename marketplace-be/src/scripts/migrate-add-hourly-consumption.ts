import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Module } from '@nestjs/common';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import {
  ConsumptionData,
  ConsumptionDataSchema,
} from '../modules/flexibility/schemas/consumption-data.schema';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(process.env.MONGO_URI!),
    MongooseModule.forFeature([
      { name: ConsumptionData.name, schema: ConsumptionDataSchema },
    ]),
  ],
})
class MigrationModule {}

/**
 * Script per aggiungere aggregazione oraria (60min) ai ConsumptionData esistenti
 * che hanno solo granularità 15min
 *
 * Usage:
 *   npm run migrate:hourly
 */
async function bootstrap() {
  console.log('🔄 Starting migration: Add hourly aggregation to ConsumptionData...\n');

  const app = await NestFactory.createApplicationContext(MigrationModule, {
    logger: ['log', 'error', 'warn'],
  });

  const consumptionModel = app.get<Model<ConsumptionData>>(
    getModelToken(ConsumptionData.name),
  );

  try {
    // Trova tutti i ConsumptionData che NON hanno measurements con periodInMinutes=60
    const records = await consumptionModel.find({
      'measurements.periodInMinutes': { $ne: 60 },
    });

    console.log(`Found ${records.length} ConsumptionData records without hourly aggregation\n`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const record of records) {
      try {
        // Per ogni measurement a 15min, crea aggregazione a 60min
        const hourlyMeasurements: any[] = [];

        for (const measurement of record.measurements) {
          if (measurement.periodInMinutes === 15 && measurement.values.length === 96) {
            const hourlyValues = aggregateToHourly(measurement.values);

            hourlyMeasurements.push({
              periodInMinutes: 60,
              unit: 'Wh',
              type: measurement.type,
              values: hourlyValues,
            });
          }
        }

        if (hourlyMeasurements.length > 0) {
          record.measurements.push(...hourlyMeasurements);
          await record.save();
          updatedCount++;

          console.log(`✅ Updated ${record._id} (${record.fspUserId}, ${record.profileType})`);
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Error updating ${record._id}: ${(error as Error).message}`);
      }
    }

    console.log(`\n📊 Migration complete:`);
    console.log(`   Updated: ${updatedCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log(`   Total: ${records.length}`);
  } catch (error) {
    console.error('\n❌ Migration failed:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

/**
 * Aggrega valori da 15min a 60min (somma 4 quarti d'ora per ogni ora)
 */
function aggregateToHourly(quarterlyValues: number[]): number[] {
  if (quarterlyValues.length !== 96) {
    throw new Error(`Expected 96 values, got ${quarterlyValues.length}`);
  }

  const hourlyValues: number[] = [];
  for (let h = 0; h < 24; h++) {
    const sum =
      quarterlyValues[h * 4 + 0] +
      quarterlyValues[h * 4 + 1] +
      quarterlyValues[h * 4 + 2] +
      quarterlyValues[h * 4 + 3];
    hourlyValues.push(sum);
  }
  return hourlyValues;
}

// Run script
bootstrap();
