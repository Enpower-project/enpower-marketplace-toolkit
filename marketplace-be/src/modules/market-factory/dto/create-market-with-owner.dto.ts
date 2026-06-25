import { IsEmail, IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateMarketWithOwnerRequestDto {
  @IsNotEmpty({ message: i18nValidationMessage('market.validation.nameRequired') })
  @IsString({ message: i18nValidationMessage('common.validation.invalid') })
  name: string;

  @IsNotEmpty({ message: i18nValidationMessage('market.validation.descriptionRequired') })
  @IsString({ message: i18nValidationMessage('common.validation.invalid') })
  description: string;

  @IsNotEmpty({ message: i18nValidationMessage('market.validation.ownerEmailRequired') })
  @IsEmail({}, { message: i18nValidationMessage('market.validation.ownerEmailInvalid') })
  ownerEmail: string;

  @IsNotEmpty({ message: i18nValidationMessage('common.validation.required') })
  @IsString({ message: i18nValidationMessage('common.validation.invalid') })
  ownerFirstName: string;

  @IsNotEmpty({ message: i18nValidationMessage('common.validation.required') })
  @IsString({ message: i18nValidationMessage('common.validation.invalid') })
  ownerLastName: string;

  /* @IsNotEmpty({ message: i18nValidationMessage('common.validation.required') })
  @IsString({ message: i18nValidationMessage('common.validation.invalid') })
  dsoAddress: string; */

  @IsOptional()
  @IsString({ message: i18nValidationMessage('common.validation.invalid') })
  region?: string;
}