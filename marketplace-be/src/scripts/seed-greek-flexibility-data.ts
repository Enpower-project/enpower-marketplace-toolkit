import { NestFactory } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Module } from '@nestjs/common';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { GreekCsvDataParser } from '../modules/flexibility/utils/parsers/csv-greek-data.parser';
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
  providers: [GreekCsvDataParser],
})
class SeedGreekModule {}

/**
 * Script para poblar la base de datos con datos del Pilot Griego.
 *
 * Diferencias respecto al Irish Pilot:
 *   - CSV directo (sin conversión desde Excel)
 *   - Intervalos de 30 minutos (48 valores/día en vez de 96)
 *   - 4 columnas: timestamp, consumption [W], pv_production [W], net_load_without_flex [W]
 *   - Sin storage_dispatch ni net_load_with_flex
 *   - Perfiles de referencia STD/MIN/MAX generados con build_profiles_greek.py
 *
 * Usage:
 *   # Cargar perfil ACTUAL (datos reales con fecha)
 *   npm run seed:greek -- --market=GR --fsp=fsp_gr_001 --file=test-data/flexibility/GR/greek_pilot_data.csv
 *
 *   # Cargar perfil de REFERENCIA STANDARD (generado por build_profiles_greek.py)
 *   npm run seed:greek -- --market=GR --fsp=fsp_gr_001 --file=test-data/flexibility/GR/greek_pilot_data_STD.csv --reference=STANDARD
 *
 *   # Cargar perfil de REFERENCIA MIN
 *   npm run seed:greek -- --market=GR --fsp=fsp_gr_001 --file=test-data/flexibility/GR/greek_pilot_data_MIN.csv --reference=MIN
 *
 *   # Cargar perfil de REFERENCIA MAX
 *   npm run seed:greek -- --market=GR --fsp=fsp_gr_001 --file=test-data/flexibility/GR/greek_pilot_data_MAX.csv --reference=MAX
 *
 *   # Cargar todos los archivos de test-data/flexibility/GR/ automáticamente
 *   npm run seed:greek -- --all --market=GR
 *
 *   Convenciones de nombre de archivo para el modo --all:
 *     fsp_gr_001.csv          → perfil ACTUAL
 *     fsp_gr_001_STD.csv      → REFERENCE_STANDARD
 *     fsp_gr_001_MIN.csv      → REFERENCE_MIN
 *     fsp_gr_001_MAX.csv      → REFERENCE_MAX
 */
async function bootstrap() {
  console.log('🌱 Starting Greek Pilot Flexibility Data Seed Script...\n');
  console.log('   Format: 30-min intervals | 4 columns | No storage/battery\n');

  const app = await NestFactory.createApplicationContext(SeedGreekModule, {
    logger: ['error', 'warn'],
  });

  const parser = app.get(GreekCsvDataParser);
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
      await seedAllGreekData(parser, consumptionModel, flexibilityModel, marketId);
    } else {
      await seedSingleFile(parser, consumptionModel, flexibilityModel, args);
    }

    console.log('\n✅ Greek Pilot seed script completed successfully!');
  } catch (error) {
    console.error('\n❌ Seed script failed:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

/**
 * Seed desde un único archivo CSV griego
 */
async function seedSingleFile(
  parser: GreekCsvDataParser,
  consumptionModel: Model<ConsumptionData>,
  flexibilityModel: Model<FlexibilityData>,
  args: string[],
) {
  const marketId = getArg(args, '--market');
  const fspUserId = getArg(args, '--fsp');
  const filePath = getArg(args, '--file');
  const referenceType = getArg(args, '--reference'); // STANDARD | MIN | MAX | undefined
  const validFromStr = getArg(args, '--valid-from');

  if (!marketId || !fspUserId || !filePath) {
    throw new Error(
      'Missing required arguments. Usage: --market=<id> --fsp=<id> --file=<path>',
    );
  }

  let profileType: ProfileType;
  let validFrom: Date | undefined;

  if (referenceType) {
    // Acepta tanto STD como STANDARD (igual que el Irish Pilot)
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
  console.log(`⏱️  Interval: 30 min (48 values/day)\n`);

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

    // Eliminar documento previo para evitar duplicados en re-ejecuciones
    await consumptionModel.deleteMany({
      market: marketId,
      fspUserId: data.fspUserId,
      date: dateToUse,
      profileType: profileType,
    });

    // Crear ConsumptionData
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

    // Agregar agregación horaria (para todos los tipos de perfil)
    const hourlyMeasurements: any[] = [];
    for (const measurement of data.measurements) {
      if (measurement.periodInMinutes === 30 && measurement.values.length === 48) {
        hourlyMeasurements.push({
          periodInMinutes: 60,
          unit: 'Wh',
          type: measurement.type,
          values: aggregateToHourlyFrom30min(measurement.values),
        });
      } else if (measurement.periodInMinutes === 15 && measurement.values.length === 96) {
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

    // Calcular flexibilidad solo para perfiles ACTUAL
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
 * Seed desde todos los CSV en el directorio del Pilot Griego
 */
async function seedAllGreekData(
  parser: GreekCsvDataParser,
  consumptionModel: Model<ConsumptionData>,
  flexibilityModel: Model<FlexibilityData>,
  marketId?: string,
) {
  // Si se proporciona --market, busca en la subcarpeta del mercado; si no, en "GR"
  const baseDir = path.join(process.cwd(), 'test-data', 'flexibility');
  const testDataDir = marketId
    ? path.join(baseDir, marketId)
    : path.join(baseDir, 'GR');

  console.log(`📂 Scanning Greek pilot data directory: ${testDataDir}\n`);

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
    const detectedMarketId = marketId || 'GR';

    // Auto-detecta tipo de perfil desde nombre de archivo
    // Convenciones: fsp_gr_001_STD.csv, fsp_gr_001_MIN.csv, fsp_gr_001_MAX.csv, fsp_gr_001.csv
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

        await consumptionModel.deleteMany({
          market: detectedMarketId,
          fspUserId: fspUserId,
          date: dateToUse,
          profileType: profileType,
        });

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

        // Agregación horaria
        const hourlyMeasurements: any[] = [];
        for (const measurement of data.measurements) {
          if (measurement.periodInMinutes === 30 && measurement.values.length === 48) {
            hourlyMeasurements.push({
              periodInMinutes: 60,
              unit: 'Wh',
              type: measurement.type,
              values: aggregateToHourlyFrom30min(measurement.values),
            });
          } else if (measurement.periodInMinutes === 15 && measurement.values.length === 96) {
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

        // Flexibilidad solo para ACTUAL
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
            // Skip silently si no hay perfil estándar disponible aún
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
 * Usa valores 60-min pre-almacenados, igual que settlement.service.ts, para garantizar
 * que FlexibilityData.ACTUAL y deliveredQuantity del settlement coincidan exactamente.
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

  const preferredTypes = [MeasurementType.NET_LOAD_WITHOUT_FLEX, MeasurementType.CONSUMPTION];

  // Returns the 60-min aggregated values, matching settlement.service.ts exactly.
  const getHourly = (doc: typeof actualConsumption): number[] | null => {
    for (const t of preferredTypes) {
      const m60 = doc.measurements.find(
        (m) => m.type === t && m.periodInMinutes === 60 && m.values?.length === 24,
      );
      if (m60) return m60.values;
    }
    for (const t of preferredTypes) {
      const m15 = doc.measurements.find(
        (m) => m.type === t && m.periodInMinutes === 15 && m.values?.length === 96,
      );
      if (m15) return aggregateToHourlyFrom15min(m15.values);
      const m30 = doc.measurements.find(
        (m) => m.type === t && m.periodInMinutes === 30 && m.values?.length === 48,
      );
      if (m30) return aggregateToHourlyFrom30min(m30.values);
    }
    return null;
  };

  // Computes sub-hourly flexibility at the finest available resolution.
  // If actual is 15-min and std is 30-min, the std is upsampled to 15-min by
  // repeating each value twice (constant power assumption within each 30-min slot).
  const getSubHourlyFlexibility = (): { downward: number[]; upward: number[]; period: number } | null => {
    // Find actual at finest available sub-hourly period
    let actualValues: number[] | null = null;
    let actualPeriod = 0;
    outer: for (const t of preferredTypes) {
      for (const [p, len] of [[15, 96], [30, 48]] as [number, number][]) {
        const m = actualConsumption.measurements.find(
          (m) => m.type === t && m.periodInMinutes === p && m.values?.length === len,
        );
        if (m) { actualValues = m.values; actualPeriod = p; break outer; }
      }
    }
    if (!actualValues) return null;

    // Find std at the same period, or upsample from 30-min if actual is 15-min
    let stdValues: number[] | null = null;
    for (const t of preferredTypes) {
      const mExact = standardProfile.measurements.find(
        (m) => m.type === t && m.periodInMinutes === actualPeriod && m.values?.length === (60 / actualPeriod) * 24,
      );
      if (mExact) { stdValues = mExact.values; break; }
      if (actualPeriod === 15) {
        const m30 = standardProfile.measurements.find(
          (m) => m.type === t && m.periodInMinutes === 30 && m.values?.length === 48,
        );
        if (m30) {
          stdValues = [];
          for (const v of m30.values) { stdValues.push(v, v); }
          break;
        }
      }
    }
    if (!stdValues) return null;

    return {
      downward: stdValues.map((s, i) => Math.max(0, s - actualValues![i])),
      upward: actualValues.map((a, i) => Math.max(0, a - stdValues![i])),
      period: actualPeriod,
    };
  };

  const std60 = getHourly(standardProfile);
  const actual60 = getHourly(actualConsumption);

  if (!std60 || !actual60) {
    throw new Error(
      `Missing 60-min consumption measurements. std=${!!std60}, actual=${!!actual60}`,
    );
  }

  // Compute deviation at hourly level — identical approach to settlement.service.ts
  const downward60 = std60.map((s, i) => Math.max(0, s - actual60[i]));
  const upward60 = actual60.map((a, i) => Math.max(0, a - std60[i]));

  const totalDownwardWh = downward60.reduce((sum, val) => sum + val, 0);
  const totalUpwardWh = upward60.reduce((sum, val) => sum + val, 0);
  const peakFlexibilityHour = findPeakFlexibilityHour(downward60, upward60);

  // Compute native-period flexibility for granular visualization (max(0) applied per slot).
  const subHourly = getSubHourlyFlexibility();
  const nativeMeasurements: any[] = [];
  if (subHourly) {
    nativeMeasurements.push(
      { periodInMinutes: subHourly.period, unit: 'W', type: MeasurementType.FLEXIBILITY_DOWNWARD, values: subHourly.downward },
      { periodInMinutes: subHourly.period, unit: 'W', type: MeasurementType.FLEXIBILITY_UPWARD, values: subHourly.upward },
    );
  }

  // Remove any pre-existing ACTUAL record for this FSP/date to avoid duplicates
  await flexibilityModel.deleteMany({ market: marketId, fspUserId, date, flexibilityType: FlexibilityType.ACTUAL });

  await flexibilityModel.create({
    market: marketId,
    fspUserId,
    date,
    flexibilityType: FlexibilityType.ACTUAL,
    measurements: [
      ...nativeMeasurements,
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

  console.log(`  ✅ Calculated actual flexibility (60-min, aligned with settlement)`);
}

/**
 * Agrega de 30 min a 60 min sumando 2 valores por hora.
 * Para datos del Pilot Griego (48 valores/día → 24 valores/día).
 */
function aggregateToHourlyFrom30min(halfHourlyValues: number[]): number[] {
  const hourlyValues: number[] = [];
  for (let h = 0; h < 24; h++) {
    const sum = halfHourlyValues[h * 2] + halfHourlyValues[h * 2 + 1];
    hourlyValues.push(sum);
  }
  return hourlyValues;
}

/**
 * Agrega de 15 min a 60 min sumando 4 valores por hora.
 * Para mediciones diarias reales del Pilot Griego (96 valores/día → 24 valores/día).
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

/**
 * Reduce de 15 min a 30 min promediando cada par de valores.
 * Convierte 96 valores (15-min) en 48 valores (30-min).
 */
function downsampleTo30min(quarterlyValues: number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < 48; i++) {
    result.push((quarterlyValues[i * 2] + quarterlyValues[i * 2 + 1]) / 2);
  }
  return result;
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
