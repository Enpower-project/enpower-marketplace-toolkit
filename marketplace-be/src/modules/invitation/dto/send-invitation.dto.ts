import { IsEmail, IsEnum, IsMongoId, IsNotEmpty, IsString } from 'class-validator';
import { UserRole } from '../../../schemas/User.schema';

export class SendInvitationDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsEnum(UserRole, {
    message: 'Role must be either FRP or FSP'
  })
  @IsNotEmpty()
  role: UserRole;

  @IsMongoId()
  @IsNotEmpty()
  marketId: string;
}
