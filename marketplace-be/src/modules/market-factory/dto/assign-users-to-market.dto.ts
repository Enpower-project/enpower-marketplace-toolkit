import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class AssignUsersToMarketDto {
  @IsArray()
  @IsNotEmpty({ each: true })
  @IsString({ each: true })
  userIds: string[];
}
