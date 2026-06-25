import {
  IsNumber,
  IsString,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsIn,
  IsEnum,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MeasurementType } from '../schemas/interfaces';

export class MeasurementDto {
  @IsNumber()
  @IsIn([15, 60], { message: 'periodInMinutes must be 15 or 60' })
  periodInMinutes: number;

  @IsString()
  @IsIn(['W', 'Wh'], { message: 'unit must be W or Wh' })
  unit: string;

  @IsString()
  type: MeasurementType | string; // Enum o string custom

  @IsArray()
  @Type(() => Number)
  @ArrayMinSize(24, { message: 'values must have at least 24 elements (hourly)' })
  @ArrayMaxSize(96, { message: 'values must have at most 96 elements (15min)' })
  values: number[];
}
