import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AuthService } from '../modules/auth/auth.service';
import { Logger } from '@nestjs/common';

/**
 * Migration script to update existing users to use the new status enum system
 * Run this script once after deploying the new user status system
 */
async function migrateUsersToStatusEnum() {
  const logger = new Logger('UserStatusMigration');
  
  try {
    logger.log('Starting user status migration...');
    
    // Create NestJS application context
    const app = await NestFactory.createApplicationContext(AppModule);
    const authService = app.get(AuthService);
    
    // Run the migration
    const result = await authService.migrateUsersToStatusEnum();
    
    logger.log(`Migration completed successfully!`);
    logger.log(`Total users migrated: ${result.migrated}`);
    
    if (result.errors.length > 0) {
      logger.warn(`Errors during migration:`);
      result.errors.forEach(error => logger.warn(error));
    }
    
    await app.close();
    
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateUsersToStatusEnum();
