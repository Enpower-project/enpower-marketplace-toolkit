import { IsOptional, IsString, IsDateString, IsEnum } from 'class-validator';
import { ProfileType } from '../schemas/interfaces';

export class QueryConsumptionDto {
  @IsOptional()
  @IsString()
  fspUserId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(ProfileType)
  profileType?: ProfileType;
}
