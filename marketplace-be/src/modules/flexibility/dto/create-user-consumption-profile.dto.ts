import { IsString, IsMongoId } from 'class-validator';

export class CreateUserConsumptionProfileDto {
  @IsString()
  fspUserId: string;

  @IsMongoId()
  standardProfileId: string;

  @IsMongoId()
  minProfileId: string;

  @IsMongoId()
  maxProfileId: string;
}
