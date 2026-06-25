import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CalculateActualFlexibilityBatchDto {
  @IsNotEmpty()
  @IsDateString()
  date: string;
}

export class CalculateActualFlexibilitySingleDto {
  @IsNotEmpty()
  @IsString()
  fspUserId: string;

  @IsNotEmpty()
  @IsDateString()
  date: string;
}

export class FlexibilityCalculationResultDto {
  fspUserId: string;
  fspName: string;
  date: Date;
  success: boolean;
  error?: string;
  flexibilityDataId?: string;
}

export class BatchCalculationSummaryDto {
  totalFsps: number;
  successful: number;
  failed: number;
  results: FlexibilityCalculationResultDto[];
}
