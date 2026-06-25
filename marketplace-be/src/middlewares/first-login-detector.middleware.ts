import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/User.schema';
import { UserStatus } from '../enums/user-status.enum';

/**
 * Middleware that detects the first login of a user
 * and marks firstLoginCompleted and profileCompleted as true
 * The User schema pre-save hook will handle syncing all other fields
 */
@Injectable()
export class FirstLoginDetectorMiddleware implements NestMiddleware {
  private readonly logger = new Logger(FirstLoginDetectorMiddleware.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      // Only process if there is an authenticated user in the request
      if (req['user'] && req['user'].sub) {
        const keycloakId = req['user'].sub;
        
        // Find the user in the database
        const user = await this.userModel.findOne({ keycloakId });
        
        if (user) {
          // Check if user is in PENDING_WALLET_CREATION status and hasn't completed first login
          if (user.status === UserStatus.PENDING_WALLET_CREATION && !user.firstLoginCompleted) {
            this.logger.log(`🔍 First login detected for user: ${user.username} (${user.email})`);
            this.logger.log(`📊 Current status: ${user.status}`);
            
            // Mark first login and profile as completed
            // The schema pre-save hook will handle syncing other fields
            user.firstLoginCompleted = true;
            user.profileCompleted = true;
            
            // Save the changes - pre-save hook will sync all fields
            await user.save();
            
            this.logger.log(`✅ First login marked as completed`);
            this.logger.log(`📝 Fields updated: firstLoginCompleted=${user.firstLoginCompleted}, profileCompleted=${user.profileCompleted}`);
          }
        }
      }
    } catch (error) {
      // Don't block the request if there's an error detecting first login
      // Just log the error for debugging
      this.logger.error(`Error detecting first login: ${error.message}`, error.stack);
    }
    
    next();
  }
}
