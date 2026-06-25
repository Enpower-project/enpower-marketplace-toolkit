import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppModule } from '../app.module';
import { SettlementService } from '../modules/settlement/settlement.service';
import { SessionService } from '../modules/session/session.service';
import { HourlyOffer, HourlyOfferDocument, OfferStatus } from '../schemas/HourlyOffer.schema';
import { Session, SessionDocument } from '../schemas/Session.schema';

/**
 * Script para calcular settlements de todas las ofertas de una sesión
 *
 * Uso:
 * npx ts-node -r tsconfig-paths/register src/scripts/calculate-settlements.ts --session=<sessionAddress>
 */
async function bootstrap() {
  console.log('🧮 Calculando Settlements...\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const settlementService = app.get(SettlementService);
  const sessionModel = app.get<Model<SessionDocument>>(getModelToken(Session.name));
  const hourlyOfferModel = app.get<Model<HourlyOfferDocument>>(getModelToken(HourlyOffer.name));

  try {
    // Parse arguments
    const args = process.argv.slice(2);
    const sessionAddressArg = args.find(arg => arg.startsWith('--session='));

    if (!sessionAddressArg) {
      throw new Error('Missing --session=<sessionAddress> argument');
    }

    const sessionAddress = sessionAddressArg.split('=')[1];
    console.log(`📍 Session: ${sessionAddress}\n`);

    // Get session from MongoDB
    const session = await sessionModel.findOne({ contractAddress: sessionAddress }).exec();
    if (!session) {
      throw new Error(`Session not found: ${sessionAddress}`);
    }

    console.log(`📅 Date: ${session.sessionDate}`);
    console.log(`📊 Status: ${session.status}\n`);

    // Get all accepted offers for this session from MongoDB
    const offers = await hourlyOfferModel.find({
      session: session._id,
      status: OfferStatus.ACCEPTED,
      blockchainOfferId: { $exists: true, $ne: null }
    }).exec();

    console.log(`Found ${offers.length} accepted offer(s) with blockchain ID\n`);

    if (offers.length === 0) {
      console.log('⚠️  No accepted offers found in this session');
      return;
    }

    // Calculate settlement for each offer
    let successCount = 0;
    let errorCount = 0;

    for (const offer of offers) {
      const offerId = offer.blockchainOfferId;

      try {
        console.log(`\n🔍 Calculating settlement for Offer #${offerId} (Hour ${offer.hour})...`);
        const calculation = await settlementService.calculateSettlement(
          sessionAddress,
          offerId!
        );

        console.log(`   ✅ Success!`);
        console.log(`   - Delivered: ${calculation.deliveredQuantity} wei`);
        console.log(`   - Deviation: ${calculation.deviationPercentage.toFixed(2)}%`);
        console.log(`   - Payment: ${calculation.payment} wei`);

        successCount++;
      } catch (error: any) {
        console.error(`   ❌ Error: ${error.message}`);
        errorCount++;
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Settlements calculados: ${successCount}`);
    if (errorCount > 0) {
      console.log(`❌ Errores: ${errorCount}`);
    }
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('\n❌ Script failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();
