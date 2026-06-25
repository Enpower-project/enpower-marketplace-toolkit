import { IsNotEmpty, IsString, MinLength, Matches, IsOptional } from 'class-validator';

export class AcceptInvitationDto {
  @IsString()
  @IsOptional()
  @MinLength(3)
  username?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;
}
