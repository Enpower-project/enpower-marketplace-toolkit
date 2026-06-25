import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';

interface UploadedFile {
  fieldname: string;
  originalname: string;
  path: string;
  size: number;
  mimetype: string;
}

import {
  ConsumptionData,
  ConsumptionDataDocument,
} from '../flexibility/schemas/consumption-data.schema';
import {
  FlexibilityData,
  FlexibilityDataDocument,
} from '../flexibility/schemas/flexibility-data.schema';
import { ProfileType, FlexibilityType, MeasurementType } from '../flexibility/schemas/interfaces';
import { CsvDataParser } from '../flexibility/utils/parsers/csv-data.parser';
import { GreekCsvDataParser } from '../flexibility/utils/parsers/csv-greek-data.parser';
import { PortugueseCsvDataParser } from '../flexibility/utils/parsers/csv-portuguese-data.parser';
import { generateProfiles, aggregateToHourly, PilotType } from '../flexibility/utils/profile-generator.util';
import { ParsedFlexibilityData } from '../flexibility/utils/interfaces/data-parser.interface';

type SeedTask = { file: string; reference?: 'STANDARD' | 'MIN' | 'MAX' };

@Injectable()
export class SeedFlexibilityService {
  private readonly logger = new Logger(SeedFlexibilityService.name);

  // ⚠️ WHITELIST: ficheros fijos (evita path traversal / ejecución arbitraria)
  private readonly tasks: SeedTask[] = [
    { file: 'test-data/IR/datos_historicos_STD.csv', reference: 'STANDARD' },
    { file: 'test-data/IR/datos_historicos_MIN.csv', reference: 'MIN' },
    { file: 'test-data/IR/datos_historicos_MAX.csv', reference: 'MAX' },
    { file: 'test-data/IR/datos_historicos.csv' },
  ];

  constructor(
    @InjectModel(ConsumptionData.name)
    private readonly consumptionModel: Model<ConsumptionDataDocument>,
    @InjectModel(FlexibilityData.name)
    private readonly flexibilityModel: Model<FlexibilityDataDocument>,
    private readonly irishParser: CsvDataParser,
    private readonly greekParser: GreekCsvDataParser,
    private readonly portugueseParser: PortugueseCsvDataParser,
  ) {}

  /**
   * Run all seed tasks sequentially for the given market and FSP (legacy whitelist-based flow).
   */
  async runSeed(market: string, fsp: string) {
    const results: Array<{
      task: SeedTask;
      exitCode: number;
      stdout: string;
      stderr: string;
    }> = [];

    for (const task of this.tasks) {
      this.logger.log(`task: ${task.reference} seeding`);
      const { exitCode, stdout, stderr } = await this.execTsNode({
        market,
        fsp,
        file: task.file,
        reference: task.reference,
      });

      results.push({ task, exitCode, stdout, stderr });

      if (exitCode !== 0) {
        throw new InternalServerErrorException({
          message: 'Seed command failed',
          task,
          exitCode,
          stdout,
          stderr,
        });
      }
    }

    return { ok: true, results };
  }

  /**
   * Full upload pipeline:
   * 1. Detect file format (xlsx → csv conversion)
   * 2. Auto-detect pilot type from column headers
   * 3. Parse all historical days
   * 4. Generate STD/MIN/MAX profiles in-process
   * 5. Clean existing data for this FSP/market
   * 6. Seed reference profiles + ACTUAL data
   * 7. Calculate theoretical flexibility
   */
  async processUpload(
    file: UploadedFile,
    market: string,
    fspId: string,
  ): Promise<{ pilotType: PilotType; days: number; message: string }> {
    let csvPath = file.path;
    let tempCsvPath: string | null = null;

    try {
      // Step 1: convert xlsx → csv if needed
      if (file.originalname.toLowerCase().endsWith('.xlsx')) {
        tempCsvPath = path.join(os.tmpdir(), `enpower_upload_${Date.now()}.csv`);
        await this.convertXlsxToCsv(file.path, tempCsvPath);
        csvPath = tempCsvPath;
      }

      // Step 2: detect pilot type from headers
      const pilotType = await this.detectPilotType(csvPath);
      this.logger.log(`Detected pilot type: ${pilotType} for FSP ${fspId}`);

      // Step 3: parse all days
      const parser = pilotType === 'irish'
        ? this.irishParser
        : pilotType === 'portuguese'
          ? this.portugueseParser
          : this.greekParser;
      const parsedDays = await parser.parseMultipleDays(csvPath, {
        marketId: market,
        fspUserId: fspId,
      });

      if (parsedDays.length < 2) {
        throw new BadRequestException(
          `File must contain at least 2 days of data. Found: ${parsedDays.length}`,
        );
      }

      this.logger.log(`Parsed ${parsedDays.length} days of data`);

      // Step 4: generate reference profiles
      const profiles = generateProfiles(parsedDays, pilotType);

      // Step 5: clean existing data
      await this.consumptionModel.deleteMany({ market, fspUserId: fspId });
      await this.flexibilityModel.deleteMany({ market, fspUserId: fspId });
      this.logger.log(`Cleared existing data for FSP ${fspId} in market ${market}`);

      // Step 6a: seed reference profiles
      await this.seedReferenceProfile(market, fspId, ProfileType.REFERENCE_STANDARD, profiles.stdMeasurements, profiles.period);
      await this.seedReferenceProfile(market, fspId, ProfileType.REFERENCE_MIN, profiles.minMeasurements, profiles.period);
      await this.seedReferenceProfile(market, fspId, ProfileType.REFERENCE_MAX, profiles.maxMeasurements, profiles.period);

      // Step 6b: seed actual daily data
      for (const day of parsedDays) {
        await this.seedActualDay(market, fspId, day, profiles.period);
      }

      // Step 7: calculate theoretical flexibility
      await this.calculateTheoreticalFlexibility(market, fspId, profiles);

      return {
        pilotType,
        days: parsedDays.length,
        message: `Successfully processed ${parsedDays.length} days of ${pilotType} pilot data`,
      };
    } finally {
      // Cleanup temp files
      try {
        await fsPromises.unlink(file.path);
      } catch { /* ignore */ }
      if (tempCsvPath) {
        try {
          await fsPromises.unlink(tempCsvPath);
        } catch { /* ignore */ }
      }
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async convertXlsxToCsv(xlsxPath: string, csvPath: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx') as { readFile: (p: string) => any; utils: { sheet_to_csv: (s: any) => string }; SheetNames?: string[] };
    const workbook = XLSX.readFile(xlsxPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const csvContent = XLSX.utils.sheet_to_csv(sheet);
    await fsPromises.writeFile(csvPath, csvContent, 'utf-8');
  }

  private async detectPilotType(csvPath: string): Promise<PilotType> {
    const content = await fsPromises.readFile(csvPath, 'utf-8');
    const firstLine = content.split('\n')[0].toLowerCase();
    // Irish pilot has net_load_with_flex and/or storage_dispatch columns
    if (firstLine.includes('net_load_with_flex') || firstLine.includes('storage_dispatch')) {
      return 'irish';
    }
    // Portuguese pilot has injection column (solar energy injected into the grid)
    if (firstLine.includes('injection')) {
      return 'portuguese';
    }
    // Default: Greek pilot (net_load_without_flex, pv_production, no storage/injection)
    return 'greek';
  }

  private async seedReferenceProfile(
    market: string,
    fsp: string,
    profileType: ProfileType,
    measurements: any[],
    period: number,
  ): Promise<void> {
    const allMeasurements = [...measurements];

    // Add hourly aggregations (W → Wh)
    for (const m of measurements) {
      if (m.periodInMinutes === period && m.periodInMinutes < 60) {
        allMeasurements.push({
          periodInMinutes: 60,
          unit: 'Wh',
          type: m.type,
          values: aggregateToHourly(m.values, period),
        });
      }
    }

    await this.consumptionModel.create({
      market,
      fspUserId: fsp,
      date: null,
      profileType,
      measurements: allMeasurements,
      validFrom: new Date(),
      validTo: null,
    });

    this.logger.log(`Seeded ${profileType} for FSP ${fsp}`);
  }

  private async seedActualDay(
    market: string,
    fsp: string,
    day: ParsedFlexibilityData,
    period: number,
  ): Promise<void> {
    const allMeasurements = [...day.measurements];

    // Add hourly aggregations
    for (const m of day.measurements) {
      if (m.periodInMinutes === period && m.periodInMinutes < 60) {
        allMeasurements.push({
          periodInMinutes: 60,
          unit: 'Wh',
          type: m.type,
          values: aggregateToHourly(m.values, period),
        });
      }
    }

    await this.consumptionModel.create({
      market,
      fspUserId: fsp,
      date: day.date,
      profileType: ProfileType.ACTUAL,
      measurements: allMeasurements,
    });
  }

  private async calculateTheoreticalFlexibility(
    market: string,
    fsp: string,
    profiles: ReturnType<typeof generateProfiles>,
  ): Promise<void> {
    const { stdMeasurements, minMeasurements, maxMeasurements, period } = profiles;

    const getValues = (measurements: any[], type: string): number[] | null =>
      measurements.find((m) => m.type === type && m.periodInMinutes === period)?.values ?? null;

    // Use CONSUMPTION for theoretical flexibility (matches FlexibilityDataService behaviour)
    const stdVals = getValues(stdMeasurements, MeasurementType.CONSUMPTION);
    const minVals = getValues(minMeasurements, MeasurementType.CONSUMPTION);
    const maxVals = getValues(maxMeasurements, MeasurementType.CONSUMPTION);

    if (!stdVals || !minVals || !maxVals) {
      this.logger.warn(`Cannot calculate theoretical flexibility: missing CONSUMPTION measurements`);
      return;
    }

    const downward = stdVals.map((s, i) => Math.max(0, s - minVals[i]));
    const upward = maxVals.map((m, i) => Math.max(0, m - stdVals[i]));
    const downward60 = aggregateToHourly(downward, period);
    const upward60 = aggregateToHourly(upward, period);

    // Remove any pre-existing theoretical record
    await this.flexibilityModel.deleteMany({
      market,
      fspUserId: fsp,
      flexibilityType: FlexibilityType.THEORETICAL,
    });

    await this.flexibilityModel.create({
      market,
      fspUserId: fsp,
      date: null,
      flexibilityType: FlexibilityType.THEORETICAL,
      measurements: [
        { periodInMinutes: period, unit: 'W', type: MeasurementType.FLEXIBILITY_DOWNWARD, values: downward },
        { periodInMinutes: period, unit: 'W', type: MeasurementType.FLEXIBILITY_UPWARD, values: upward },
        { periodInMinutes: 60, unit: 'Wh', type: MeasurementType.FLEXIBILITY_DOWNWARD, values: downward60 },
        { periodInMinutes: 60, unit: 'Wh', type: MeasurementType.FLEXIBILITY_UPWARD, values: upward60 },
      ],
      calculatedAt: new Date(),
    });

    this.logger.log(`Calculated theoretical flexibility for FSP ${fsp}`);
  }

  // ─── Legacy child-process execution (kept for runSeed) ────────────────────

  private execTsNode(input: { market: string; fsp: string; file: string; reference?: string }) {
    const nodeExe = process.execPath;
    const cwd = process.cwd();

    let args: string[];

    const compiledScript = path.resolve(cwd, 'dist', 'scripts', 'seed-flexibility-data-v2.js');
    const srcScript = path.resolve(cwd, 'src', 'scripts', 'seed-flexibility-data-v2.ts');

    if (fs.existsSync(compiledScript)) {
      args = [compiledScript];
    } else {
      const tsNodeBin = path.resolve(cwd, 'node_modules', 'ts-node', 'dist', 'bin.js');
      args = [tsNodeBin, '-r', 'tsconfig-paths/register', srcScript];
    }

    args.push(
      `--market=${input.market}`,
      `--fsp=${input.fsp}`,
      `--file=${input.file}`,
    );

    if (input.reference) {
      args.push(`--reference=${input.reference}`);
    }

    return this.spawnCollect(nodeExe, args, { cwd, env: process.env });
  }

  private spawnCollect(
    cmd: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        cwd: options.cwd,
        env: options.env,
        shell: false,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));

      child.on('close', (code) => {
        resolve({ exitCode: code ?? -1, stdout, stderr });
      });

      child.on('error', (err) => {
        resolve({ exitCode: -1, stdout, stderr: stderr + '\n' + String(err) });
      });
    });
  }
}
