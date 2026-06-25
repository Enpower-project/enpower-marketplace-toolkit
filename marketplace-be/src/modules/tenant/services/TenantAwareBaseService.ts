import { Injectable, Logger } from '@nestjs/common';
import { Model, Document, FilterQuery, UpdateQuery } from 'mongoose';
import { TenantContextService } from './tenant-context.service';
import { ITenantFiltered } from '../schemas/tenant-filtered-entity';

// Tipo che combina ITenantFiltered con Document
export type TenantDocument = ITenantFiltered & Document;

@Injectable()
export abstract class TenantAwareBaseService<T extends TenantDocument> {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly model: Model<T>,
    protected readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Applica automaticamente il filtro del tenant
   */
  private async applyTenantFilter(filter: any = {}): Promise<any> {
    const marketId = await this.tenantContext.getCurrentMarket();
    return {
      ...filter,
      market: marketId,
    };
  }

  /**
   * Applica il tenant ai dati
   */
  private async applyTenantToData(data: any): Promise<any> {
    const marketId = await this.tenantContext.getCurrentMarket();
    return {
      ...data,
      market: marketId,
    };
  }

  /**
   * Find con filtro automatico del tenant
   */
  async find(filter?: any, options?: any): Promise<T[]> {
    try {
      const filteredQuery = await this.applyTenantFilter(filter);
      this.logger.debug(`Finding documents for market: ${this.tenantContext.getCurrentMarket()}`);
      
      // Versione semplice senza chain di metodi
      const query = this.model.find(filteredQuery);
      
      // Applica le opzioni se presenti
      if (options?.select) query.select(options.select);
      if (options?.sort) query.sort(options.sort);
      if (options?.limit) query.limit(options.limit);
      if (options?.skip) query.skip(options.skip);
      if (options?.populate) query.populate(options.populate);
      
      return await query.exec();
    } catch (error) {
      this.logger.error(`Error finding documents: ${error.message}`);
      throw error;
    }
  }

  /**
   * FindOne con filtro automatico del tenant
   */
  async findOne(filter: any, options?: any): Promise<T | null> {
    try {
      const filteredQuery = await this.applyTenantFilter(filter);
      this.logger.debug(`Finding document for market: ${this.tenantContext.getCurrentMarket()}`);
      
      const query = this.model.findOne(filteredQuery);
      
      if (options?.select) query.select(options.select);
      if (options?.populate) query.populate(options.populate);
      
      return await query.exec();
    } catch (error) {
      this.logger.error(`Error finding document: ${error.message}`);
      throw error;
    }
  }

  /**
   * FindById con filtro automatico del tenant
   */
  async findById(id: string, options?: any): Promise<T | null> {
    return this.findOne({ _id: id }, options);
  }

  /**
   * Create con tenant automatico
   */
  async create(entityData: any): Promise<T> {
    try {
      const entityWithTenant = await this.applyTenantToData(entityData);
      
      this.logger.debug(`Creating document for market: ${this.tenantContext.getCurrentMarket()}`);
      const document = new this.model(entityWithTenant);
      return await document.save();
    } catch (error) {
      this.logger.error(`Error creating document: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update con verifica del tenant
   */
  async update(id: string, updateData: any): Promise<T | null> {
    try {
      // Prima verifica che il documento esista nel tenant corrente
      const existingDoc = await this.findById(id);
      if (!existingDoc) {
        throw new Error(`Document with id ${id} not found in current market`);
      }

      // Applica il tenant ai dati di update (per sicurezza)
      const updateWithTenant = await this.applyTenantToData(updateData);
      
      const updatedDoc = await this.model.findByIdAndUpdate(
        id,
        updateWithTenant,
        { new: true, runValidators: true }
      ).exec();

      this.logger.debug(`Updated document ${id} for market: ${this.tenantContext.getCurrentMarket()}`);
      return updatedDoc;
    } catch (error) {
      this.logger.error(`Error updating document ${id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete con verifica del tenant
   */
  async delete(id: string): Promise<T | null> {
    try {
      // Prima verifica che il documento esista nel tenant corrente
      const existingDoc = await this.findById(id);
      if (!existingDoc) {
        throw new Error(`Document with id ${id} not found in current market`);
      }

      const deletedDoc = await this.model.findByIdAndDelete(id).exec();
      this.logger.debug(`Deleted document ${id} for market: ${this.tenantContext.getCurrentMarket()}`);
      return deletedDoc;
    } catch (error) {
      this.logger.error(`Error deleting document ${id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Count con filtro del tenant
   */
  async count(filter?: any): Promise<number> {
    try {
      const filteredQuery = await this.applyTenantFilter(filter);
      return await this.model.countDocuments(filteredQuery).exec();
    } catch (error) {
      this.logger.error(`Error counting documents: ${error.message}`);
      throw error;
    }
  }

  /**
   * Metodo per accesso diretto al model
   */
  protected getModel(): Model<T> {
    return this.model;
  }

  /**
   * Crea un filtro per il tenant corrente
   */
  protected async createTenantFilter(): Promise<{ market: Promise<string> }> {
    return await { market: this.tenantContext.getCurrentMarket() };
  }
}