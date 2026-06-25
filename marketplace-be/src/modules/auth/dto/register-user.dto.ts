import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { UserRole } from 'src/schemas/User.schema';

export class RegisterUserDto {
  @IsNotEmpty({ message: i18nValidationMessage('auth.validation.usernameRequired') })
  @IsString({ message: i18nValidationMessage('auth.validation.invalid') })
  @MinLength(3, { message: i18nValidationMessage('auth.validation.usernameMinLength') })
  username: string;

  @IsNotEmpty({ message: i18nValidationMessage('auth.validation.emailRequired') })
  @IsEmail({}, { message: i18nValidationMessage('auth.validation.emailInvalid') })
  email: string;

  @IsNotEmpty({ message: i18nValidationMessage('auth.validation.passwordRequired') })
  @MinLength(8, { message: i18nValidationMessage('auth.validation.passwordMinLength') })
  password: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('auth.validation.invalid') })
  firstName?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('auth.validation.invalid') })
  lastName?: string;

  @IsNotEmpty({ message: i18nValidationMessage('auth.validation.roleRequired') })
  role: UserRole;
}