import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE, APP_INTERCEPTOR } from '@nestjs/core';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { CustomValidationPipe } from './pipes/validation.pipe';
import { TenantContextInterceptor } from './interceptors/tenant-context.interceptor';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { BlockchainService } from './modules/blockchain/blockchain.service';
import { MongooseModule } from '@nestjs/mongoose';
import { MarketFactoryModule } from './modules/market-factory/market-factory.module';
import { AuthGuard, KeycloakConnectModule, ResourceGuard, RoleGuard } from 'nest-keycloak-connect';
import { AuthModule } from './modules/auth/auth.module';
import { FlexibilityTokenModule } from './modules/flexibility-token/flexibility-token.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { DebugAuthMiddleware } from './middlewares/debug.auth';
import { LanguageMiddleware } from './middlewares/language.middleware';
import { FirstLoginDetectorMiddleware } from './middlewares/first-login-detector.middleware';
import { WalletModule } from './modules/wallet/wallet.module';
import { UserModule } from './modules/user/user.module';
import { I18nModule, AcceptLanguageResolver, HeaderResolver, QueryResolver } from 'nestjs-i18n';
import * as path from 'path';
import { EmailService } from './modules/email/email.service';
import { EmailModule } from './modules/email/email.module';
import { SessionModule } from './modules/session/session.module';
import { HourlyOfferModule } from './modules/hourly-offer/hourly-offer.module';
import { InvitationModule } from './modules/invitation/invitation.module';
import { TxHashCaptureInterceptor } from './interceptors/txhash-capture.interceptor';
import { TransactionHistoryService } from './modules/transaction-history/transaction-history.service';
import { TransactionHistoryModule } from './modules/transaction-history/transaction-history.module';
import { User, UsersSchema } from './schemas/User.schema';
import { FlexibilityModule } from './modules/flexibility/flexibility.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SettlementModule } from './modules/settlement/settlement.module';
import { SeedFlexibilityModule } from './modules/seed-flexibility/seed-flexibilidy.module';
import { SwaggerModule } from '@nestjs/swagger';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        path: path.join(__dirname, '/i18n/'),
        watch: process.env.NODE_ENV === 'development',
      },
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        { use: HeaderResolver, options: ['language'] },
        AcceptLanguageResolver,
      ],
    }),
    KeycloakConnectModule.register({
      authServerUrl: process.env.KEYCLOAK_AUTH_SERVER_URL!,
      realm: process.env.KEYCLOAK_REALM!,
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      secret: process.env.KEYCLOAK_CLIENT_SECRET!,
      useNestLogger: true,
    }),
    // Import User schema for FirstLoginDetectorMiddleware
    MongooseModule.forFeature([
      { name: User.name, schema: UsersSchema }
    ]),
    FlexibilityTokenModule,
    MongooseModule.forRoot(process.env.MONGO_URI!),
    MarketFactoryModule,
    AuthModule,
    TransactionHistoryModule,
    WalletModule,
    UserModule,
    TenantModule,
    EmailModule,
    SessionModule,
    HourlyOfferModule,
    InvitationModule,
    FlexibilityModule,
    SettlementModule,
    SeedFlexibilityModule,
    SwaggerModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    BlockchainService,
    FirstLoginDetectorMiddleware,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ResourceGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TxHashCaptureInterceptor,
    },
    {
      provide: APP_PIPE,
      useClass: CustomValidationPipe,
    },

  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LanguageMiddleware)
      .forRoutes('*')
      .apply(DebugAuthMiddleware)
      .forRoutes('*')
      .apply(FirstLoginDetectorMiddleware)
      .forRoutes('*');
  }
}