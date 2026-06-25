import { NestFactory } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Module } from '@nestjs/common';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { PortugueseCsvDataParser } from '../modules/flexibility/utils/parsers/csv-portuguese-data.parser';
import {
  ConsumptionData,
  ConsumptionDataSchema,
} from '../modules/flexibility/schemas/consumption-data.schema';
import {
  FlexibilityData,
  FlexibilityDataSchema,
} from '../modules/flexibility/schemas/flexibility-data.schema';
import { ProfileType, FlexibilityType, MeasurementType } from '../modules/flexibility/schemas/interfaces';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Módulo mínimo para seed - solo MongoDB y los Model, sin autenticación
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI'),
      }),
    }),
    MongooseModule.forFeature([
      { name: ConsumptionData.name, schema: ConsumptionDataSchema },
      { name: FlexibilityData.name, schema: FlexibilityDataSchema },
    ]),
  ],
  providers: [PortugueseCsvDataParser],
})
class SeedPortugueseModule {}

/**
 * Script para poblar la base de datos con datos del Pilot Portugués.
 *
 * Diferencias respecto al Irish Pilot:
 *   - 3 columnas: timestamp, consumption [W], injection [W]
 *   - injection [W] = energía solar inyectada a la red → PV_PRODUCTION
 *   - Intervalos de 15 minutos (96 valores/día), igual que Irish
 *   - Timestamps con timezone offset (+01:00)
 *   - Sin storage_dispatch, net_load_with_flex, net_load_without_flex
 *
 * Usage:
 *   # Cargar perfil ACTUAL (datos reales con fecha)
 *   npm run seed:portuguese -- --market=PT --fsp=fsp_pt_001 --file=test-data/flexibility/PT/P3.csv
 *
 *   # Cargar perfil de REFERENCIA STANDARD
 *   npm run seed:portuguese -- --market=PT --fsp=fsp_pt_001 --file=test-data/flexibility/PT/P3_STD.csv --reference=STANDARD
 *
 *   # Cargar perfil de REFERENCIA MIN
 *   npm run seed:portuguese -- --market=PT --fsp=fsp_pt_001 --file=test-data/flexibility/PT/P3_MIN.csv --reference=MIN
 *
 *   # Cargar perfil de REFERENCIA MAX
 *   npm run seed:portuguese -- --market=PT --fsp=fsp_pt_001 --file=test-data/flexibility/PT/P3_MAX.csv --reference=MAX
 *
 *   # Cargar todos los archivos de test-data/flexibility/PT/ automáticamente
 *   npm run seed:portuguese -- --all --market=PT
 *
 *   Convenciones de nombre de archivo para el modo --all:
 *     P3.csv          → perfil ACTUAL
 *     P3_STD.csv      → REFERENCE_STANDARD
 *     P3_MIN.csv      → REFERENCE_MIN
 *     P3_MAX.csv      → REFERENCE_MAX
 */
async function bootstrap() {
  console.log('🌱 Starting Portuguese Pilot Flexibility Data Seed Script...\n');
  console.log('   Format: 15-min intervals | 3 columns | injection → PV_PRODUCTION\n');

  const app = await NestFactory.createApplicationContext(SeedPortugueseModule, {
    logger: ['error', 'warn'],
  });

  const parser = app.get(PortugueseCsvDataParser);
  const consumptionModel = app.get<Model<ConsumptionData>>(
    getModelToken(ConsumptionData.name),
  );
  const flexibilityModel = app.get<Model<FlexibilityData>>(
    getModelToken(FlexibilityData.name),
  );

  try {
    const args = process.argv.slice(2);
    const mode = args.find((arg) => arg === '--all') ? 'all' : 'single';

    if (mode === 'all') {
      const marketId = getArg(args, '--market');
      await seedAllPortugueseData(parser, consumptionModel, flexibilityModel, marketId);
    } else {
      await seedSingleFile(parser, consumptionModel, flexibilityModel, args);
    }

    console.log('\n✅ Portuguese Pilot seed script completed successfully!');
  } catch (error) {
    console.error('\n❌ Seed script failed:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

/**
 * Seed desde un único archivo CSV portugués
 */
async function seedSingleFile(
  parser: PortugueseCsvDataParser,
  consumptionModel: Model<ConsumptionData>,
  flexibilityModel: Model<FlexibilityData>,
  args: string[],
) {
  const marketId = getArg(args, '--market');
  const fspUserId = getArg(args, '--fsp');
  const filePath = getArg(args, '--file');
  const referenceType = getArg(args, '--reference');
  const validFromStr = getArg(args, '--valid-from');

  if (!marketId || !fspUserId || !filePath) {
    throw new Error(
      'Missing required arguments. Usage: --market=<id> --fsp=<id> --file=<path>',
    );
  }

  let profileType: ProfileType;
  let validFrom: Date | undefined;

  if (referenceType) {
    const normalizedRef = referenceType.toUpperCase() === 'STD' ? 'STANDARD' : referenceType.toUpperCase();
    if (!['STANDARD', 'MIN', 'MAX'].includes(normalizedRef)) {
      throw new Error('--reference must be STD (or STANDARD), MIN, or MAX');
    }
    const refTypeKey = `REFERENCE_${normalizedRef}` as keyof typeof ProfileType;
    profileType = ProfileType[refTypeKey];
    validFrom = validFromStr ? new Date(validFromStr) : new Date();

    console.log(`📋 Loading REFERENCE profile (${normalizedRef})`);
  } else {
    profileType = ProfileType.ACTUAL;
    console.log(`📊 Loading ACTUAL profile`);
  }

  console.log(`📁 File: ${filePath}`);
  console.log(`🏪 Market: ${marketId}`);
  console.log(`👤 FSP User: ${fspUserId}`);
  console.log(`⏱️  Interval: 15 min (96 values/day)\n`);

  const dataArray = await parser.parseMultipleDays(filePath, {
    marketId,
    fspUserId,
  });

  if (referenceType && dataArray.length > 1) {
    console.warn(
      `⚠️  Reference profile should have single day of data, found ${dataArray.length} days. Using first day only.`,
    );
  }

  console.log(`📊 Found ${dataArray.length} day(s) of data in file`);

  const itemsToProcess = referenceType ? [dataArray[0]] : dataArray;

  for (const data of itemsToProcess) {
    const dateToUse = referenceType ? null : data.date;
    const displayDate = referenceType
      ? 'Reference Profile'
      : data.date.toISOString().split('T')[0];

    console.log(`\n📅 Processing: ${displayDate}`);
    console.log(
      `   Measurements: ${data.measurements.length} types, ${data.measurements[0]?.values.length || 0} values each`,
    );

    const validation = await parser.validate(data);
    if (!validation.isValid) {
      console.error('❌ Validation errors:');
      validation.errors.forEach((err) => console.error(`  - ${err.message}`));
      throw new Error('Data validation failed');
    }

    if (validation.warnings.length > 0) {
      console.warn('⚠️  Validation warnings:');
      validation.warnings.forEach((warn) => console.warn(`  - ${warn.message}`));
    }

    const consumptionData = await consumptionModel.create({
      market: marketId,
      fspUserId: data.fspUserId,
      date: dateToUse,
      profileType: profileType,
      measurements: data.measurements,
      validFrom: referenceType ? validFrom : undefined,
      validTo: null,
      ...data.metadata,
    });

    console.log(`✅ Loaded ${profileType}: ${consumptionData._id}`);

    // Hourly aggregation (sum of 4 values per hour)
    const hourlyMeasurements: any[] = [];
    for (const measurement of data.measurements) {
      if (measurement.periodInMinutes === 15 && measurement.values.length === 96) {
        hourlyMeasurements.push({
          periodInMinutes: 60,
          unit: 'Wh',
          type: measurement.type,
          values: aggregateToHourlyFrom15min(measurement.values),
        });
      }
    }

    if (hourlyMeasurements.length > 0) {
      consumptionData.measurements.push(...hourlyMeasurements);
      await consumptionData.save();
      console.log(`   ✅ Added ${hourlyMeasurements.length} hourly aggregations`);
    }

    // Actual flexibility only for ACTUAL profiles
    if (!referenceType) {
      try {
        await calculateActualFlexibility(
          consumptionModel,
          flexibilityModel,
          marketId,
          fspUserId,
          data.date,
        );
      } catch (flexError) {
        console.warn(
          `⚠️  Could not calculate flexibility: ${(flexError as Error).message}`,
        );
      }
    }
  }

  console.log(`\n🎉 Successfully imported ${itemsToProcess.length} profile(s)`);
}

/**
 * Seed desde todos los CSV en el directorio del Pilot Portugués
 */
async function seedAllPortugueseData(
  parser: PortugueseCsvDataParser,
  consumptionModel: Model<ConsumptionData>,
  flexibilityModel: Model<FlexibilityData>,
  marketId?: string,
) {
  const baseDir = path.join(process.cwd(), 'test-data', 'flexibility');
  const testDataDir = marketId
    ? path.join(baseDir, marketId)
    : path.join(baseDir, 'PT');

  console.log(`📂 Scanning Portuguese pilot data directory: ${testDataDir}\n`);

  try {
    await fs.access(testDataDir);
  } catch {
    throw new Error(
      `Directory not found: ${testDataDir}.\n` +
      `Create it and add CSV files, or use: --market=<subfolder>`,
    );
  }

  const files = await findCsvFiles(testDataDir);

  if (files.length === 0) {
    throw new Error(`No CSV files found in ${testDataDir}`);
  }

  console.log(`Found ${files.length} CSV files:\n`);

  for (const file of files) {
    const relativePath = path.relative(testDataDir, file);
    const filename = path.basename(file, '.csv');
    const detectedMarketId = marketId || 'PT';

    let profileType: ProfileType;
    let fspUserId: string;

    if (filename.endsWith('_STD') || filename.endsWith('_standard')) {
      profileType = ProfileType.REFERENCE_STANDARD;
      fspUserId = filename.replace(/_STD$/, '').replace(/_standard$/, '');
    } else if (filename.endsWith('_MIN') || filename.endsWith('_min')) {
      profileType = ProfileType.REFERENCE_MIN;
      fspUserId = filename.replace(/_MIN$/, '').replace(/_min$/, '');
    } else if (filename.endsWith('_MAX') || filename.endsWith('_max')) {
      profileType = ProfileType.REFERENCE_MAX;
      fspUserId = filename.replace(/_MAX$/, '').replace(/_max$/, '');
    } else {
      profileType = ProfileType.ACTUAL;
      fspUserId = filename;
    }

    if (!fspUserId) {
      console.warn(`⚠️  Skipping ${relativePath}: cannot determine FSP ID`);
      continue;
    }

    const isReference = profileType !== ProfileType.ACTUAL;

    console.log(`\n📄 Processing: ${relativePath}`);
    console.log(`  Market: ${detectedMarketId}, FSP: ${fspUserId}, Type: ${profileType}`);

    try {
      const dataArray = await parser.parseMultipleDays(file, {
        marketId: detectedMarketId,
        fspUserId,
      });

      if (isReference && dataArray.length > 1) {
        console.warn(
          `  ⚠️  Using first day only for reference profile (found ${dataArray.length} days)`,
        );
      }

      console.log(`  📊 Found ${dataArray.length} day(s) in file`);

      const itemsToProcess = isReference ? [dataArray[0]] : dataArray;

      for (const data of itemsToProcess) {
        const dateToUse = isReference ? null : data.date;
        const dateStr = isReference ? 'Reference' : data.date.toISOString().split('T')[0];

        console.log(`  📅 Importing ${dateStr}...`);

        const consumptionData = await consumptionModel.create({
          market: detectedMarketId,
          fspUserId: fspUserId,
          date: dateToUse,
          profileType: profileType,
          measurements: data.measurements,
          validFrom: isReference ? new Date() : undefined,
          validTo: null,
          ...data.metadata,
        });

        console.log(`     ✅ Created: ${consumptionData._id}`);

        const hourlyMeasurements: any[] = [];
        for (const measurement of data.measurements) {
          if (measurement.periodInMinutes === 15 && measurement.values.length === 96) {
            hourlyMeasurements.push({
              periodInMinutes: 60,
              unit: 'Wh',
              type: measurement.type,
              values: aggregateToHourlyFrom15min(measurement.values),
            });
          }
        }

        if (hourlyMeasurements.length > 0) {
          consumptionData.measurements.push(...hourlyMeasurements);
          await consumptionData.save();
          console.log(`     ✅ Added hourly aggregation`);
        }

        if (!isReference) {
          try {
            await calculateActualFlexibility(
              consumptionModel,
              flexibilityModel,
              detectedMarketId,
              fspUserId,
              data.date,
            );
          } catch (flexError) {
            // Skip silently if standard profile not available yet
          }
        }
      }
    } catch (error) {
      console.error(`  ❌ Error: ${(error as Error).message}`);
    }
  }
}

/**
 * Calcula la flexibilidad efectiva (ACTUAL) comparando consumo real vs perfil STANDARD.
 * Ambos perfiles del Pilot Portugués están a 15 min → no se necesita downsampling.
 */
async function calculateActualFlexibility(
  consumptionModel: Model<ConsumptionData>,
  flexibilityModel: Model<FlexibilityData>,
  marketId: string,
  fspUserId: string,
  date: Date,
) {
  const actualConsumption = await consumptionModel.findOne({
    market: marketId,
    fspUserId,
    date,
    profileType: ProfileType.ACTUAL,
  });

  if (!actualConsumption) {
    throw new Error('Actual consumption not found');
  }

  const standardProfile = await consumptionModel.findOne({
    market: marketId,
    fspUserId,
    profileType: ProfileType.REFERENCE_STANDARD,
    date: null,
    validTo: null,
  });

  if (!standardProfile) {
    throw new Error('Standard profile not found');
  }

  // Use pre-stored 60-min values (added by the seed loop just before this call).
  // This matches settlement.service.ts: max(0, sum(std) - sum(actual)) per hour,
  // instead of sum(max(0, std - actual)) per 15-min slot, which gives a different
  // (larger) result when within-hour slot deviations have mixed signs.
  const actual60 = actualConsumption.measurements.find(
    (m) => m.type === MeasurementType.CONSUMPTION && m.periodInMinutes === 60,
  )?.values;

  const standard60 = standardProfile.measurements.find(
    (m) => m.type === MeasurementType.CONSUMPTION && m.periodInMinutes === 60,
  )?.values;

  if (!actual60 || actual60.length !== 24) {
    throw new Error('Missing 60-min consumption measurements in actual profile');
  }

  if (!standard60 || standard60.length !== 24) {
    throw new Error('Missing 60-min consumption measurements in standard profile');
  }

  // Hourly flexibility — identical approach to settlement.service.ts
  const downward60 = standard60.map((s, i) => Math.max(0, s - actual60[i]));
  const upward60 = actual60.map((a, i) => Math.max(0, a - standard60[i]));

  // 15-min granularity for visualization only (not used by settlement)
  const actual15 = actualConsumption.measurements.find(
    (m) => m.type === MeasurementType.CONSUMPTION && m.periodInMinutes === 15,
  )?.values ?? [];
  const standard15 = standardProfile.measurements.find(
    (m) => m.type === MeasurementType.CONSUMPTION && m.periodInMinutes === 15,
  )?.values ?? [];
  const downward15 = actual15.map((a, i) => Math.max(0, (standard15[i] ?? 0) - a));
  const upward15 = actual15.map((a, i) => Math.max(0, a - (standard15[i] ?? 0)));

  const totalDownwardWh = downward60.reduce((sum, val) => sum + val, 0);
  const totalUpwardWh = upward60.reduce((sum, val) => sum + val, 0);
  const peakFlexibilityHour = findPeakFlexibilityHour(downward60, upward60);

  await flexibilityModel.create({
    market: marketId,
    fspUserId,
    date,
    flexibilityType: FlexibilityType.ACTUAL,
    measurements: [
      {
        periodInMinutes: 15,
        unit: 'W',
        type: MeasurementType.FLEXIBILITY_DOWNWARD,
        values: downward15,
      },
      {
        periodInMinutes: 15,
        unit: 'W',
        type: MeasurementType.FLEXIBILITY_UPWARD,
        values: upward15,
      },
      {
        periodInMinutes: 60,
        unit: 'Wh',
        type: MeasurementType.FLEXIBILITY_DOWNWARD,
        values: downward60,
      },
      {
        periodInMinutes: 60,
        unit: 'Wh',
        type: MeasurementType.FLEXIBILITY_UPWARD,
        values: upward60,
      },
    ],
    summary: {
      totalDownwardWh,
      totalUpwardWh,
      complianceStatus: 'OK',
      peakFlexibilityHour,
    },
    calculatedAt: new Date(),
  });

  console.log(`  ✅ Calculated actual flexibility (15-min Portuguese Pilot)`);
}

/**
 * Agrega de 15 min a 60 min sumando 4 valores por hora.
 * Para datos del Pilot Portugués (96 valores/día → 24 valores/día).
 */
function aggregateToHourlyFrom15min(quarterlyValues: number[]): number[] {
  const hourlyValues: number[] = [];
  for (let h = 0; h < 24; h++) {
    const sum = quarterlyValues[h * 4] + quarterlyValues[h * 4 + 1] +
                quarterlyValues[h * 4 + 2] + quarterlyValues[h * 4 + 3];
    hourlyValues.push(sum);
  }
  return hourlyValues;
}

function findPeakFlexibilityHour(downward: number[], upward: number[]): number {
  let maxHour = 0;
  let maxFlex = 0;
  for (let h = 0; h < 24; h++) {
    const totalFlex = downward[h] + upward[h];
    if (totalFlex > maxFlex) {
      maxFlex = totalFlex;
      maxHour = h;
    }
  }
  return maxHour;
}

async function findCsvFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findCsvFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.csv')) {
      files.push(fullPath);
    }
  }

  return files;
}

function getArg(args: string[], name: string): string | undefined {
  const arg = args.find((a) => a.startsWith(`${name}=`));
  return arg ? arg.split('=')[1] : undefined;
}

bootstrap();
