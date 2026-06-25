import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CsvDataParser } from '../modules/flexibility/utils/parsers/csv-data.parser';
import { DataLoaderUtil } from '../modules/flexibility/utils/loaders/data-loader.util';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Script per popolare il database con dati di test di flessibilità
 *
 * Usage:
 *   npm run seed:flexibility -- --market=<marketId> --fsp=<fspUserId> --file=<csvPath>
 *   npm run seed:flexibility -- --all  (carica tutti i file in test-data/)
 */
async function bootstrap() {
  console.log('🌱 Starting Flexibility Data Seed Script...\n');

  const app = await NestFactory.createApplicationContext(AppModule);

  const parser = new CsvDataParser();
  const loader = app.get(DataLoaderUtil);

  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const mode = args.find((arg) => arg === '--all') ? 'all' : 'single';

    if (mode === 'all') {
      await seedAllTestData(parser, loader);
    } else {
      await seedSingleFile(parser, loader, args);
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
  loader: DataLoaderUtil,
  args: string[],
) {
  const marketId = getArg(args, '--market');
  const fspUserId = getArg(args, '--fsp');
  const filePath = getArg(args, '--file');

  if (!marketId || !fspUserId || !filePath) {
    throw new Error(
      'Missing required arguments. Usage: --market=<id> --fsp=<id> --file=<path>',
    );
  }

  console.log(`📁 Loading file: ${filePath}`);
  console.log(`🏪 Market: ${marketId}`);
  console.log(`👤 FSP User: ${fspUserId}\n`);

  // Parse file (supporta file con più giorni)
  const dataArray = await parser.parseMultipleDays(filePath, {
    marketId,
    fspUserId,
  });

  console.log(`📊 Found ${dataArray.length} day(s) of data in file`);

  // Processa ogni giorno
  for (const data of dataArray) {
    console.log(`\n📅 Processing date: ${data.date.toISOString().split('T')[0]}`);
    console.log(`   Measurements: ${data.measurements.length} types, ${data.measurements[0]?.values.length || 0} values each`);

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

    // Load into database
    const result = await loader.loadActualConsumption(data, {
      calculateFlexibility: true,
    });

    if (!result.success) {
      console.error('❌ Load errors:');
      result.errors.forEach((err) => console.error(`  - ${err}`));
      throw new Error('Failed to load data');
    }

    if (result.warnings.length > 0) {
      console.warn('⚠️  Load warnings:');
      result.warnings.forEach((warn) => console.warn(`  - ${warn}`));
    }

    console.log(`✅ Loaded consumption data: ${result.consumptionDataId}`);
  }

  console.log(`\n🎉 Successfully imported ${dataArray.length} day(s) of data`);
}

/**
 * Seed da tutti i file nella directory test-data/
 */
async function seedAllTestData(
  parser: CsvDataParser,
  loader: DataLoaderUtil,
) {
  const testDataDir = path.join(process.cwd(), 'test-data', 'flexibility');

  console.log(`📂 Scanning test data directory: ${testDataDir}\n`);

  // Verifica se esiste
  try {
    await fs.access(testDataDir);
  } catch {
    throw new Error(
      `Test data directory not found: ${testDataDir}. Create it and add CSV files.`,
    );
  }

  // Trova tutti i file CSV
  const files = await findCsvFiles(testDataDir);

  if (files.length === 0) {
    throw new Error(`No CSV files found in ${testDataDir}`);
  }

  console.log(`Found ${files.length} CSV files:\n`);

  // Per ogni file, estrai marketId e fspUserId dal nome o path
  // Convenzione: test-data/flexibility/<marketId>/<fspUserId>.csv
  for (const file of files) {
    const relativePath = path.relative(testDataDir, file);
    const parts = relativePath.split(path.sep);

    if (parts.length < 2) {
      console.warn(`⚠️  Skipping ${file}: invalid path structure`);
      continue;
    }

    const marketId = parts[0];
    const fspUserId = path.basename(parts[1], '.csv');

    console.log(`\n📄 Processing: ${relativePath}`);
    console.log(`  Market: ${marketId}, FSP: ${fspUserId}`);

    try {
      const dataArray = await parser.parseMultipleDays(file, { marketId, fspUserId });
      console.log(`  📊 Found ${dataArray.length} day(s) in file`);

      for (const data of dataArray) {
        const dateStr = data.date.toISOString().split('T')[0];
        console.log(`  📅 Importing ${dateStr}...`);

        const result = await loader.loadActualConsumption(data, {
          calculateFlexibility: true,
        });

        if (result.success) {
          console.log(`     ✅ Success: ${result.consumptionDataId}`);
        } else {
          console.error(`     ❌ Failed:`, result.errors.join(', '));
        }
      }
    } catch (error) {
      console.error(`  ❌ Error: ${(error as Error).message}`);
    }
  }
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
