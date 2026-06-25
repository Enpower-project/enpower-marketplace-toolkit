import { NestFactory } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Module } from '@nestjs/common';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { CsvDataParser } from '../modules/flexibility/utils/parsers/csv-data.parser';
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
 * Modulo minimo per seed - solo MongoDB e i Model, senza autenticazione
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
  providers: [CsvDataParser],
})
class SeedModule {}

/**
 * Script per popolare il database con dati di test di flessibilità
 * Versione 2: usa direttamente i Model Mongoose senza servizi/autenticazione
 *
 * Usage:
 *   # Load ACTUAL profiles (with specific dates)
 *   npm run seed:flexibility:v2 -- --market=IT --fsp=fsp_001 --file=test-data/consumption.csv
 *
 *   # Load REFERENCE profiles (date=null, validFrom set)
 *   npm run seed:flexibility:v2 -- --market=IT --fsp=fsp_001 --file=test-data/standard.csv --reference=STANDARD
 *   npm run seed:flexibility:v2 -- --market=IT --fsp=fsp_001 --file=test-data/min.csv --reference=MIN
 *   npm run seed:flexibility:v2 -- --market=IT --fsp=fsp_001 --file=test-data/max.csv --reference=MAX --valid-from=2025-01-01
 *
 *   # Load all files from test-data/flexibility/ (auto-detects profile type from filename)
 *   npm run seed:flexibility:v2 -- --all
 *
 *   Filename conventions for --all mode:
 *     fsp_001.csv          → ACTUAL profile
 *     fsp_001_standard.csv → REFERENCE_STANDARD
 *     fsp_001_min.csv      → REFERENCE_MIN
 *     fsp_001_max.csv      → REFERENCE_MAX
 */
async function bootstrap() {
  console.log('🌱 Starting Flexibility Data Seed Script (v2 - Direct Model)...\n');

  const app = await NestFactory.createApplicationContext(SeedModule, {
    logger: ['error', 'warn'],
  });

  const parser = app.get(CsvDataParser);
  const consumptionModel = app.get<Model<ConsumptionData>>(
    getModelToken(ConsumptionData.name),
  );
  const flexibilityModel = app.get<Model<FlexibilityData>>(
    getModelToken(FlexibilityData.name),
  );

  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const mode = args.find((arg) => arg === '--all') ? 'all' : 'single';

    if (mode === 'all') {
      await seedAllTestData(parser, consumptionModel, flexibilityModel);
    } else {
      await seedSingleFile(parser, consumptionModel, flexibilityModel, args);
    }

    console.log('\n✅ Seed script completed successfully!');
  } catch (error) {
    console.error('\n❌ Seed script failed:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

/**
 * Seed da un singolo file CSV
 */
async function seedSingleFile(
  parser: CsvDataParser,
  consumptionModel: Model<ConsumptionData>,
  flexibilityModel: Model<FlexibilityData>,
  args: string[],
) {
  // Parse args
  const marketId = getArg(args, '--market');
  const fspUserId = getArg(args, '--fsp');
  const filePath = getArg(args, '--file');
  const referenceType = getArg(args, '--reference'); // STANDARD | MIN | MAX | undefined
  const validFromStr = getArg(args, '--valid-from'); // Optional ISO date string

  if (!marketId || !fspUserId || !filePath) {
    throw new Error(
      'Missing required arguments. Usage: --market=<id> --fsp=<id> --file=<path>',
    );
  }

  // Determine profile type
  let profileType: ProfileType;
  let validFrom: Date | undefined;

  if (referenceType) {
    // Reference profile
    if (!['STANDARD', 'MIN', 'MAX'].includes(referenceType.toUpperCase())) {
      throw new Error('--reference must be STANDARD, MIN, or MAX');
    }
    const refTypeKey = `REFERENCE_${referenceType.toUpperCase()}` as keyof typeof ProfileType;
    profileType = ProfileType[refTypeKey];
    validFrom = validFromStr ? new Date(validFromStr) : new Date();

    console.log(`📋 Loading REFERENCE profile (${referenceType.toUpperCase()})`);
  } else {
    // Actual profile
    profileType = ProfileType.ACTUAL;
    console.log(`📊 Loading ACTUAL profile`);
  }

  console.log(`📁 File: ${filePath}`);
  console.log(`🏪 Market: ${marketId}`);
  console.log(`👤 FSP User: ${fspUserId}\n`);

  // Parse file (supports multi-day for ACTUAL, single day for REFERENCE)
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

  // Process each day (only first for reference profiles)
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

    // Validate
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

    // Create ConsumptionData
    const consumptionData = await consumptionModel.create({
      market: marketId,
      fspUserId: data.fspUserId,
      date: dateToUse,
      profileType: profileType,
      measurements: data.measurements,
      validFrom: referenceType ? validFrom : undefined,
      validTo: null, // Always null for new profiles
      ...data.metadata,
    });

    console.log(`✅ Loaded ${profileType}: ${consumptionData._id}`);

    // ADD HOURLY AGGREGATION (for ALL profile types)
    const hourlyMeasurements: any[] = [];
    for (const measurement of data.measurements) {
      if (measurement.periodInMinutes === 15 && measurement.values.length === 96) {
        hourlyMeasurements.push({
          periodInMinutes: 60,
          unit: 'Wh',
          type: measurement.type,
          values: aggregateToHourly(measurement.values),
        });
      }
    }

    if (hourlyMeasurements.length > 0) {
      consumptionData.measurements.push(...hourlyMeasurements);
      await consumptionData.save();
      console.log(`   ✅ Added ${hourlyMeasurements.length} hourly aggregations`);
    }

    // Calculate flexibility ONLY for ACTUAL profiles
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
 * Seed da tutti i file nella directory test-data/
 */
async function seedAllTestData(
  parser: CsvDataParser,
  consumptionModel: Model<ConsumptionData>,
  flexibilityModel: Model<FlexibilityData>,
) {
  const testDataDir = path.join(process.cwd(), 'test-data', 'flexibility');

  console.log(`📂 Scanning test data directory: ${testDataDir}\n`);

  try {
    await fs.access(testDataDir);
  } catch {
    throw new Error(
      `Test data directory not found: ${testDataDir}. Create it and add CSV files.`,
    );
  }

  const files = await findCsvFiles(testDataDir);

  if (files.length === 0) {
    throw new Error(`No CSV files found in ${testDataDir}`);
  }

  console.log(`Found ${files.length} CSV files:\n`);

  for (const file of files) {
    const relativePath = path.relative(testDataDir, file);
    const parts = relativePath.split(path.sep);

    if (parts.length < 2) {
      console.warn(`⚠️  Skipping ${file}: invalid path structure`);
      continue;
    }

    const marketId = parts[0];
    const filename = path.basename(parts[1], '.csv');

    // Auto-detect profile type from filename
    let profileType: ProfileType;
    let fspUserId: string;

    if (filename.endsWith('_standard') || filename === 'standard') {
      profileType = ProfileType.REFERENCE_STANDARD;
      fspUserId = filename.replace('_standard', '');
      if (fspUserId === 'standard' || fspUserId === '') {
        console.warn(
          `⚠️  Skipping ${file}: cannot determine FSP ID from filename`,
        );
        continue;
      }
    } else if (filename.endsWith('_min') || filename === 'min') {
      profileType = ProfileType.REFERENCE_MIN;
      fspUserId = filename.replace('_min', '');
      if (fspUserId === 'min' || fspUserId === '') {
        console.warn(
          `⚠️  Skipping ${file}: cannot determine FSP ID from filename`,
        );
        continue;
      }
    } else if (filename.endsWith('_max') || filename === 'max') {
      profileType = ProfileType.REFERENCE_MAX;
      fspUserId = filename.replace('_max', '');
      if (fspUserId === 'max' || fspUserId === '') {
        console.warn(
          `⚠️  Skipping ${file}: cannot determine FSP ID from filename`,
        );
        continue;
      }
    } else {
      // ACTUAL profile
      profileType = ProfileType.ACTUAL;
      fspUserId = filename;
    }

    const isReference = profileType !== ProfileType.ACTUAL;

    console.log(`\n📄 Processing: ${relativePath}`);
    console.log(`  Market: ${marketId}, FSP: ${fspUserId}, Type: ${profileType}`);

    try {
      const dataArray = await parser.parseMultipleDays(file, { marketId, fspUserId });

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
          market: marketId,
          fspUserId: fspUserId,
          date: dateToUse,
          profileType: profileType,
          measurements: data.measurements,
          validFrom: isReference ? new Date() : undefined,
          validTo: null,
          ...data.metadata,
        });

        console.log(`     ✅ Created: ${consumptionData._id}`);

        // Hourly aggregation
        const hourlyMeasurements: any[] = [];
        for (const measurement of data.measurements) {
          if (measurement.periodInMinutes === 15 && measurement.values.length === 96) {
            hourlyMeasurements.push({
              periodInMinutes: 60,
              unit: 'Wh',
              type: measurement.type,
              values: aggregateToHourly(measurement.values),
            });
          }
        }

        if (hourlyMeasurements.length > 0) {
          consumptionData.measurements.push(...hourlyMeasurements);
          await consumptionData.save();
          console.log(`     ✅ Added hourly aggregation`);
        }

        // Flexibility only for ACTUAL
        if (!isReference) {
          try {
            await calculateActualFlexibility(
              consumptionModel,
              flexibilityModel,
              marketId,
              fspUserId,
              data.date,
            );
          } catch (flexError) {
            // Silently skip flexibility calculation if standard profile not found
          }
        }
      }
    } catch (error) {
      console.error(`  ❌ Error: ${(error as Error).message}`);
    }
  }
}

/**
 * Calcola flessibilità effettiva usando direttamente i Model
 */
async function calculateActualFlexibility(
  consumptionModel: Model<ConsumptionData>,
  flexibilityModel: Model<FlexibilityData>,
  marketId: string,
  fspUserId: string,
  date: Date,
) {
  // Recupera consumo effettivo
  const actualConsumption = await consumptionModel.findOne({
    market: marketId,
    fspUserId,
    date,
    profileType: ProfileType.ACTUAL,
  });

  if (!actualConsumption) {
    throw new Error('Actual consumption not found');
  }

  // Recupera profilo standard
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

  // Calcola summary
  const totalDownwardWh = downward60.reduce((sum, val) => sum + val, 0);
  const totalUpwardWh = upward60.reduce((sum, val) => sum + val, 0);
  const peakFlexibilityHour = findPeakFlexibilityHour(downward60, upward60);

  // Crea FlexibilityData
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

  console.log(`  ✅ Calculated actual flexibility`);
}

/**
 * Aggrega da 15min a 60min (somma)
 */
function aggregateToHourly(quarterlyValues: number[]): number[] {
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

/**
 * Trova ora con maggiore flessibilità
 */
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

/**
 * Trova ricorsivamente tutti i file CSV in una directory
 */
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

/**
 * Helper per estrarre argomento da command line
 */
function getArg(args: string[], name: string): string | undefined {
  const arg = args.find((a) => a.startsWith(`${name}=`));
  return arg ? arg.split('=')[1] : undefined;
}

// Run script
bootstrap();
