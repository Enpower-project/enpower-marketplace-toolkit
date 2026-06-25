import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UsersSchema } from 'src/schemas/User.schema';
import { Market, MarketSchema } from 'src/schemas/Market.schema';
import { Session } from 'node:inspector/promises';
import { SessionSchema } from 'src/schemas/Session.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UsersSchema },
      { name: Market.name, schema: MarketSchema },
      { name: Session.name, schema: SessionSchema }
    ]),
  ],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
