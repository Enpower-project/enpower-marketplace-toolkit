import { ParsedFlexibilityData } from './interfaces/data-parser.interface';
import { MeasurementType } from '../schemas/interfaces';
import { MeasurementDto } from '../dto/measurement.dto';

export type PilotType = 'irish' | 'greek' | 'portuguese';

export interface GeneratedProfiles {
  stdMeasurements: MeasurementDto[];
  minMeasurements: MeasurementDto[];
  maxMeasurements: MeasurementDto[];
  period: number;
}

/**
 * Generates STD/MIN/MAX reference profile measurements from historical daily data.
 * TypeScript port of build_profiles.py (Irish) and build_profiles_greek.py (Greek).
 *
 * Irish:  STD uses net_load_without_flex, MIN/MAX use net_load_with_flex for the
 *         primary flexibility column. All other columns use mean/min/max respectively.
 * Greek:  All three profiles use net_load_without_flex as primary column.
 *
 * Returns one MeasurementDto[] per profile type, covering all measurement types
 * present in the input data (required for calculateTheoreticalFlexibility to find
 * the CONSUMPTION measurement it expects).
 */
export function generateProfiles(
  parsedDays: ParsedFlexibilityData[],
  pilotType: PilotType,
): GeneratedProfiles {
  const period = pilotType === 'greek' ? 30 : 15;
  const numSlots = pilotType === 'greek' ? 48 : 96;

  // Collect all measurement types present in the data
  const measurementTypes = new Set<string>();
  for (const day of parsedDays) {
    for (const m of day.measurements) {
      if (m.periodInMinutes === period) {
        measurementTypes.add(m.type as string);
      }
    }
  }

  // For each measurement type, accumulate per-slot values across all days
  const slotsByType: Record<string, number[][]> = {};
  for (const type of measurementTypes) {
    slotsByType[type] = Array.from({ length: numSlots }, () => []);
  }

  for (const day of parsedDays) {
    for (const m of day.measurements) {
      if (m.periodInMinutes !== period) continue;
      const slots = slotsByType[m.type as string];
      if (!slots) continue;
      m.values.forEach((v, i) => {
        if (i < numSlots) slots[i].push(v);
      });
    }
  }

  const mean = (vals: number[]) =>
    vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

  // Irish: STD uses net_load_without_flex, MIN/MAX use net_load_with_flex
  // Greek: all three use net_load_without_flex
  // Portuguese: all three use consumption (no net_load columns)
  const stdPrimaryType = pilotType === 'portuguese'
    ? (MeasurementType.CONSUMPTION as string)
    : (MeasurementType.NET_LOAD_WITHOUT_FLEX as string);
  const minMaxPrimaryType = pilotType === 'irish'
    ? (MeasurementType.NET_LOAD_WITH_FLEX as string)
    : pilotType === 'portuguese'
      ? (MeasurementType.CONSUMPTION as string)
      : (MeasurementType.NET_LOAD_WITHOUT_FLEX as string);

  function buildMeasurements(
    statFn: Record<string, (slots: number[][]) => number[]>,
  ): MeasurementDto[] {
    const result: MeasurementDto[] = [];
    for (const type of measurementTypes) {
      const slots = slotsByType[type];
      const fn = statFn[type] ?? ((s: number[][]) => s.map(mean));
      result.push({
        periodInMinutes: period,
        unit: 'W',
        type: type as MeasurementType,
        values: fn(slots),
      });
    }
    return result;
  }

  const stdMeasurements = buildMeasurements({
    [stdPrimaryType]: (slots) => slots.map(mean),
    // All other types use mean for STD
  });

  const minMeasurements = buildMeasurements({
    [minMaxPrimaryType]: (slots) =>
      slots.map((vals) => (vals.length ? Math.min(...vals) : 0)),
    // All other types use min
    ...Object.fromEntries(
      [...measurementTypes]
        .filter((t) => t !== minMaxPrimaryType)
        .map((t) => [t, (slots: number[][]) => slots.map((vals) => (vals.length ? Math.min(...vals) : 0))]),
    ),
  });

  const maxMeasurements = buildMeasurements({
    [minMaxPrimaryType]: (slots) =>
      slots.map((vals) => (vals.length ? Math.max(...vals) : 0)),
    // All other types use max
    ...Object.fromEntries(
      [...measurementTypes]
        .filter((t) => t !== minMaxPrimaryType)
        .map((t) => [t, (slots: number[][]) => slots.map((vals) => (vals.length ? Math.max(...vals) : 0))]),
    ),
  });

  return { stdMeasurements, minMeasurements, maxMeasurements, period };
}

/** Aggregates sub-hourly values to hourly by summing (W → Wh). */
export function aggregateToHourly(values: number[], periodInMinutes: number): number[] {
  const slotsPerHour = 60 / periodInMinutes;
  const hourly: number[] = [];
  for (let h = 0; h < 24; h++) {
    let sum = 0;
    for (let s = 0; s < slotsPerHour; s++) {
      sum += values[h * slotsPerHour + s] ?? 0;
    }
    hourly.push(sum);
  }
  return hourly;
}
