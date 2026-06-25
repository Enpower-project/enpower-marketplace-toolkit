import { IsMongoId } from 'class-validator';

export class SeedFlexibilityDto {
  @IsMongoId()
  market!: string;

  @IsMongoId()
  fsp!: string;
}