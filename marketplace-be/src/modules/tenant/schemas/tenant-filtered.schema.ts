import { Prop, Schema } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ITenantFiltered } from './tenant-filtered-entity';

@Schema()
export abstract class TenantFilteredSchema extends Document implements ITenantFiltered {
  @Prop({ required: true, index: true })
  market: string;
}