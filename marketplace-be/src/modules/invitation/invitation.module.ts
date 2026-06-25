import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';
import { Invitation, InvitationSchema } from '../../schemas/Invitation.schema';
import { User, UsersSchema } from '../../schemas/User.schema';
import { Market, MarketSchema } from '../../schemas/Market.schema';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invitation.name, schema: InvitationSchema },
      { name: User.name, schema: UsersSchema },
      { name: Market.name, schema: MarketSchema }
    ]),
    forwardRef(() => AuthModule),
    EmailModule,
  ],
  controllers: [InvitationController],
  providers: [InvitationService],
  exports: [InvitationService]
})
export class InvitationModule {}
