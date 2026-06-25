import { IsMongoId } from 'class-validator';

export class UploadFlexibilityDto {
  @IsMongoId()
  market!: string;

  @IsMongoId()
  fsp!: string;
}
