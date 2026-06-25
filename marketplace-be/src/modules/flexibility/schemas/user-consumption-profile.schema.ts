import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { TenantFilteredSchema } from '../../tenant/schemas/tenant-filtered.schema';

/**
 * Schema per UserConsumptionProfile
 * Associa un FSP ai suoi profili di riferimento (standard, min, max)
 * Estende TenantFilteredSchema per avere automaticamente il campo 'market'
 */
@Schema({ timestamps: true, collection: 'user_consumption_profiles' })
export class UserConsumptionProfile extends TenantFilteredSchema {
  @Prop({ required: true, index: true })
  fspUserId: string;

  @Prop({ required: true })
  standardProfileId: string; // ID del ConsumptionData con profileType=REFERENCE_STANDARD

  @Prop({ required: true })
  minProfileId: string; // ID del ConsumptionData con profileType=REFERENCE_MIN

  @Prop({ required: true })
  maxProfileId: string; // ID del ConsumptionData con profileType=REFERENCE_MAX

  @Prop({ required: true, type: Date, index: true })
  validFrom: Date;

  @Prop({ type: Date })
  validTo?: Date;
}

export const UserConsumptionProfileSchema = SchemaFactory.createForClass(
  UserConsumptionProfile,
);

// Indici compound per query efficienti
UserConsumptionProfileSchema.index({
  market: 1,
  fspUserId: 1,
  validFrom: 1,
  validTo: 1,
});

// Indice per trovare profili attualmente validi
UserConsumptionProfileSchema.index({
  market: 1,
  fspUserId: 1,
  validTo: 1,
});
