import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { I18nValidationPipe, I18nValidationExceptionFilter } from 'nestjs-i18n';

import * as dotenv from 'dotenv';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle("Enpower API Documentation")
    .setDescription("API Documentation")
    .setVersion("1.0.2")
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
        name: 'Authorization',
      },
      'bearer',
    )
    .addOAuth2(
      {
        type: 'oauth2',
        flows: {
          authorizationCode: {
            authorizationUrl:
              'https://auth.enpower.comsensus.eu/realms/enpower-marketplace/protocol/openid-connect/auth',
            tokenUrl:
              'https://auth.enpower.comsensus.eu/realms/enpower-marketplace/protocol/openid-connect/token',
            scopes: {
              openid: 'OpenID',
            },
          },
        },
      },
      'keycloak', // nombre del scheme
    ).build()

  const document = SwaggerModule.createDocument(app, config);
  if (process.env.NODE_ENV !== 'production') {
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        oauth2RedirectUrl: 'http://192.168.4.135:3000/docs/oauth2-redirect.html',
        initOAuth: {
          clientId: 'swagger',
          usePkceWithAuthorizationCodeGrant: true,
        },
      },
    });
  }

  app.enableCors();

  // Configure global validation pipe with i18n support
  app.useGlobalPipes(
    new I18nValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
    }),
  );

  // Add the I18n exception filter to handle validation errors
  app.useGlobalFilters(new I18nValidationExceptionFilter());

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
