import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TenantAwareBaseService } from '../../tenant/services/TenantAwareBaseService';
import { TenantContextService } from '../../tenant/services/tenant-context.service';
import { UserConsumptionProfile } from '../schemas/user-consumption-profile.schema';

@Injectable()
export class UserConsumptionProfileService extends TenantAwareBaseService<UserConsumptionProfile> {
  constructor(
    @InjectModel(UserConsumptionProfile.name)
    model: Model<UserConsumptionProfile>,
    tenantContext: TenantContextService,
  ) {
    super(model, tenantContext);
  }

  /**
   * Recupera il profilo di consumo attualmente valido per un FSP
   */
  async getCurrentProfile(
    fspUserId: string,
  ): Promise<UserConsumptionProfile | null> {
    return this.findOne({
      fspUserId,
      validTo: null, // Profilo attualmente valido
    });
  }

  /**
   * Verifica che un FSP abbia un profilo configurato
   */
  async hasProfile(fspUserId: string): Promise<boolean> {
    const profile = await this.getCurrentProfile(fspUserId);
    return !!profile;
  }

  /**
   * Crea o aggiorna il profilo di consumo per un FSP
   * Se esiste un profilo corrente, lo invalida e ne crea uno nuovo
   */
  async createOrUpdateProfile(
    fspUserId: string,
    profileData: {
      standardProfileId: string;
      minProfileId: string;
      maxProfileId: string;
    },
  ): Promise<UserConsumptionProfile> {
    // Invalida profilo corrente se esiste
    const currentProfile = await this.getCurrentProfile(fspUserId);
    if (currentProfile) {
      currentProfile.validTo = new Date();
      await currentProfile.save();
      this.logger.debug(
        `Invalidated current profile ${currentProfile._id} for user ${fspUserId}`,
      );
    }

    // Crea nuovo profilo
    const newProfile = await this.create({
      fspUserId,
      ...profileData,
      validFrom: new Date(),
      validTo: null,
    });

    this.logger.debug(
      `Created new profile ${newProfile._id} for user ${fspUserId}`,
    );
    return newProfile;
  }

  /**
   * Recupera lo storico dei profili di un FSP
   */
  async getProfileHistory(fspUserId: string): Promise<UserConsumptionProfile[]> {
    return this.find(
      { fspUserId },
      { sort: { validFrom: -1 } }, // Ordine decrescente per data
    );
  }

  /**
   * Recupera profilo valido a una data specifica
   */
  async getProfileAtDate(
    fspUserId: string,
    date: Date,
  ): Promise<UserConsumptionProfile | null> {
    return this.findOne({
      fspUserId,
      validFrom: { $lte: date },
      $or: [{ validTo: null }, { validTo: { $gte: date } }],
    });
  }
}
