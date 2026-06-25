import {
  IsString,
  IsEnum,
  IsArray,
  IsOptional,
  IsDateString,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProfileType } from '../schemas/interfaces';
import { MeasurementDto } from './measurement.dto';

export class CreateConsumptionDataDto {
  @IsString()
  fspUserId: string;

  @IsOptional()
  @IsDateString()
  date?: string | null; // ISO string, null per profili di riferimento

  @IsEnum(ProfileType)
  profileType: ProfileType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MeasurementDto)
  @ArrayMinSize(1, { message: 'At least one measurement is required' })
  measurements: MeasurementDto[];

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;
}
