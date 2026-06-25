export type FlexibilityType = 'THEORETICAL' | 'ACTUAL';
export type MeasurementType = 'flexibility_upward' | 'flexibility_downward';
export type Unit = 'W' | 'Wh';

export interface Measurement {
  periodInMinutes: 15 | 60;
  unit: Unit;
  type: MeasurementType;
  values: number[];
}

export interface FlexibilityDataDto {
  _id: string;
  market: string;
  fspUserId: string;
  date: string | null;
  flexibilityType: FlexibilityType;
  measurements: Measurement[];
  calculatedAt: string;
  createdAt: string;
  updatedAt: string;
}
