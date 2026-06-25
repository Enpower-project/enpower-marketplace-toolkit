import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { FlexibilityDataService } from '../modules/flexibility/services/flexibility-data.service';
import { ConsumptionDataService } from '../modules/flexibility/services/consumption-data.service';
import { TenantContextService } from '../modules/tenant/services/tenant-context.service';
import { UserService } from '../modules/user/user.service';
import { UserRole } from '../schemas/User.schema';

/**
 * Script per calcolare la flessibilità THEORETICAL per tutti gli FSP
 * che hanno profili di riferimento completi (STANDARD, MIN, MAX)
 *
 * Usage:
 *   npm run script:calculate-theoretical -- --market=<marketId>
 *   npm run script:calculate-theoretical -- --market=<marketId> --fsp=<fspUserId>
 */
async function main() {
  console.log('🚀 Starting THEORETICAL Flexibility Calculation Script\n');

  // 1. Bootstrap NestJS application
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  // 2. Get services
  const flexibilityService = app.get(FlexibilityDataService);
  const consumptionService = app.get(ConsumptionDataService);
  const tenantContext = app.get(TenantContextService);
  const userService = app.get(UserService);

  // 3. Parse command line arguments
  const args = process.argv.slice(2);
  const marketId = args
    .find((arg) => arg.startsWith('--market='))
    ?.split('=')[1];
  const fspUserIdArg = args
    .find((arg) => arg.startsWith('--fsp='))
    ?.split('=')[1];

  if (!marketId) {
    console.error('❌ Market ID is required. Usage: --market=<marketId>');
    await app.close();
    return;
  }

  console.log(`📊 Processing Market: ${marketId}\n`);

  let totalSuccess = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  // 4. Process FSPs in the tenant context
  await tenantContext.run({ marketId }, async () => {
    // Get all FSP users
    let fspsToProcess: Array<{ _id: string; email: string }> = [];

    if (fspUserIdArg) {
      // Process single FSP
      const user = await userService.findById(fspUserIdArg);
      if (!user) {
        console.error(`❌ FSP ${fspUserIdArg} not found`);
        await app.close();
        return;
      }
      fspsToProcess = [{ _id: (user as any)._id.toString(), email: user.email }];
    } else {
      // Get all FSPs with role FSP
      const users = await userService.getAllUsers();
      fspsToProcess = users
        .filter((u) => u.role === UserRole.FSP)
        .map((u) => ({ _id: (u as any)._id.toString(), email: u.email }));
    }

    console.log(`📋 FSPs found: ${fspsToProcess.length}\n`);

    // Process each FSP
    for (const fsp of fspsToProcess) {
      const fspUserId = fsp._id;
      console.log(`🔍 Processing FSP: ${fsp.email} (${fspUserId})`);

      try {
        // Check if FSP has all reference profiles
        const profiles =
          await consumptionService.getReferenceProfiles(fspUserId);

        if (!profiles.standard || !profiles.min || !profiles.max) {
          const missing: string[] = [];
          if (!profiles.standard) missing.push('STANDARD');
          if (!profiles.min) missing.push('MIN');
          if (!profiles.max) missing.push('MAX');

          console.log(
            `  ⏭️  SKIP: Missing profiles (${missing.join(', ')})`,
          );
          totalSkipped++;
          continue;
        }

        // Check if THEORETICAL already exists
        const existing =
          await flexibilityService.getTheoreticalFlexibility(fspUserId);

        if (existing) {
          console.log(
            `  ⏭️  SKIP: THEORETICAL already exists (${existing._id})`,
          );
          totalSkipped++;
          continue;
        }

        // Calculate THEORETICAL flexibility
        const theoretical =
          await flexibilityService.calculateTheoreticalFlexibility(
            fspUserId,
          );

        console.log(
          `  ✅ SUCCESS: THEORETICAL calculated (${theoretical._id})`,
        );
        totalSuccess++;
      } catch (error) {
        console.error(`  ❌ FAILED: ${error.message}`);
        totalFailed++;
      }
    }
  });

  // 5. Final summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 FINAL SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Success: ${totalSuccess}`);
  console.log(`❌ Failed:  ${totalFailed}`);
  console.log(`⏭️  Skipped: ${totalSkipped}`);
  console.log(`📈 Total:   ${totalSuccess + totalFailed + totalSkipped}\n`);

  await app.close();
  console.log('✨ Script completed\n');
}

main().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
