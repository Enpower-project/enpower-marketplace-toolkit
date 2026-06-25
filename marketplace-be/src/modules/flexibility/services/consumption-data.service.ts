import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TenantAwareBaseService } from '../../tenant/services/TenantAwareBaseService';
import { TenantContextService } from '../../tenant/services/tenant-context.service';
import { ConsumptionData, ConsumptionDataDocument, Measurement } from '../schemas/consumption-data.schema';
import { ProfileType, MeasurementType } from '../schemas/interfaces';
import {
  InvalidProfileTypeException,
  InvalidMeasurementCountException,
  ProfileTypeNotReplaceableException,
} from '../exceptions/flexibility.exception';
import { UserService } from 'src/modules/user/user.service';
import { HourlyOffer, HourlyOfferDocument, OfferStatus } from 'src/schemas/HourlyOffer.schema';
import { Session, SessionDocument, SessionStatus } from 'src/schemas/Session.schema';
import { User, UserDocument } from 'src/schemas/User.schema';

@Injectable()
export class ConsumptionDataService extends TenantAwareBaseService<ConsumptionDataDocument> {

  constructor(
    @InjectModel(ConsumptionData.name) model: Model<ConsumptionDataDocument>,
    @InjectModel(HourlyOffer.name) private hourlyOfferModel: Model<HourlyOfferDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    tenantContext: TenantContextService,
    private readonly userService: UserService
  ) {
    super(model, tenantContext);
  }

  /**
   * Recupera dati di consumo effettivi per FSP e data specifica
   * (market filtrato automaticamente da TenantAwareBaseService)
   */
  async getActualConsumption(
    fspUserId: string,
    date: Date,
  ): Promise<ConsumptionDataDocument | null> {
    return this.findOne({
      fspUserId,
      date,
      profileType: ProfileType.ACTUAL,
    });
  }

  /**
   * Recupera dati di consumo effettivi per FSP, data e market specifico
   * (senza dipendere dal TenantContext)
   */
  async getActualConsumptionByMarket(
    fspUserId: string,
    date: Date,
    marketId: string,
  ): Promise<ConsumptionDataDocument | null> {
    return this.getModel().findOne({
      fspUserId,
      date,
      profileType: ProfileType.ACTUAL,
      market: marketId,
    }).exec();
  }

  async getMyActualConsumption(date: Date): Promise<ConsumptionDataDocument | null> {
    const userKeycloakId = this.tenantContext.getCurrentUserId() ?? "";
    const userId = (await this.userService.getUserByKeycloakId(userKeycloakId)).id
    if (!userId) {
      throw new Error('User context is required');
    }
    return this.getActualConsumption(userId, date);
  }

  /**
   * Recupera profilo di riferimento attualmente valido
   */
  async getReferenceProfile(
    fspUserId: string,
    profileType: ProfileType,
  ): Promise<ConsumptionDataDocument | null> {
    if (profileType === ProfileType.ACTUAL) {
      throw new InvalidProfileTypeException(
        profileType,
        'getReferenceProfile',
      );
    }

    return this.findOne({
      fspUserId,
      profileType,
      // date: null,
      // validTo: null, // Profilo attualmente valido
    });
  }

  /**
   * Recupera profilo di riferimento per market specifico
   * (senza dipendere dal TenantContext)
   */
  async getReferenceProfileByMarket(
    fspUserId: string,
    profileType: ProfileType,
    marketId: string,
  ): Promise<ConsumptionDataDocument | null> {
    if (profileType === ProfileType.ACTUAL) {
      throw new InvalidProfileTypeException(
        profileType,
        'getReferenceProfileByMarket',
      );
    }

    return this.getModel().findOne({
      fspUserId,
      profileType,
      market: marketId,
    }).exec();
  }

  /**
   * Recupera tutti e 3 i profili di riferimento (standard, min, max)
   */
  async getReferenceProfiles(fspUserId: string): Promise<{
    standard: ConsumptionDataDocument | null;
    min: ConsumptionDataDocument | null;
    max: ConsumptionDataDocument | null;
  }> {
    const [standard, min, max] = await Promise.all([
      this.getReferenceProfile(fspUserId, ProfileType.REFERENCE_STANDARD),
      this.getReferenceProfile(fspUserId, ProfileType.REFERENCE_MIN),
      this.getReferenceProfile(fspUserId, ProfileType.REFERENCE_MAX),
    ]);

    return { standard, min, max };
  }

  async getMyReferenceProfiles(): Promise<{
    standard: ConsumptionDataDocument | null;
    min: ConsumptionDataDocument | null;
    max: ConsumptionDataDocument | null;
  }> {
    const userKeycloakId = this.tenantContext.getCurrentUserId() ?? "";
    const userId = (await this.userService.getUserByKeycloakId(userKeycloakId)).id
    if (!userId) {
      throw new Error('User context is required');
    }
    return this.getReferenceProfiles(userId);
  }

  /**
   * Verifica che un FSP abbia tutti i profili di riferimento configurati
   */
  async hasCompleteReferenceProfiles(fspUserId: string): Promise<boolean> {
    const profiles = await this.getReferenceProfiles(fspUserId);
    return !!(profiles.standard && profiles.min && profiles.max);
  }

  /**
   * Recupera un measurement specifico da ConsumptionData
   */
  getMeasurement(
    consumptionData: ConsumptionDataDocument,
    type: MeasurementType | string,
    periodInMinutes: number,
  ): number[] | null {
    const measurement = consumptionData.measurements.find(
      (m) => m.type === type && m.periodInMinutes === periodInMinutes,
    );
    return measurement?.values || null;
  }

  /**
   * Verifica che un measurement abbia il numero corretto di valori.
   * Supporta periodi: 15 min (96 valori), 30 min (48 valori), 60 min (24 valori).
   */
  validateMeasurementValues(periodInMinutes: number, values: number[]): void {
    const expectedMap: Record<number, number> = { 15: 96, 30: 48, 60: 24 };
    const expectedLength = expectedMap[periodInMinutes];
    if (expectedLength === undefined) {
      throw new InvalidMeasurementCountException(periodInMinutes, -1, values.length);
    }
    if (values.length !== expectedLength) {
      throw new InvalidMeasurementCountException(periodInMinutes, expectedLength, values.length);
    }
  }

  /**
   * Detecta el periodo nativo (en minutos) de un perfil de consumo buscando
   * el measurement de CONSUMPTION con la granularidad más fina disponible.
   * Devuelve 15, 30 o 60.
   */
  detectPeriod(consumptionData: ConsumptionDataDocument): number {
    const candidates = [15, 30, 60];
    for (const period of candidates) {
      const found = consumptionData.measurements.find(
        (m) => m.periodInMinutes === period && m.type === MeasurementType.CONSUMPTION,
      );
      if (found) return period;
    }
    // Fallback: usar el periodo del primer measurement disponible
    return consumptionData.measurements[0]?.periodInMinutes ?? 15;
  }

  /**
   * Ricampiona da 15 min a 30 min calcolando la media di ogni coppia di valori.
   * Usato quando il consumo reale arriva a 15 min ma il profilo di riferimento
   * è memorizzato a 30 min (Pilot Greco).
   */
  downsampleTo30min(quarterlyValues: number[]): number[] {
    const result: number[] = [];
    for (let i = 0; i < 48; i++) {
      result.push((quarterlyValues[i * 2] + quarterlyValues[i * 2 + 1]) / 2);
    }
    return result;
  }

  /**
   * Aggrega dati da qualsiasi periodo sub-orario a 60 min (somma per energia).
   * Supporta 15 min (4 valori/ora) e 30 min (2 valori/ora).
   */
  aggregateToHourlyFromPeriod(values: number[], periodInMinutes: number): number[] {
    const slotsPerHour = 60 / periodInMinutes;
    const hourlyValues: number[] = [];
    for (let h = 0; h < 24; h++) {
      let sum = 0;
      for (let s = 0; s < slotsPerHour; s++) {
        sum += values[h * slotsPerHour + s] ?? 0;
      }
      hourlyValues.push(sum);
    }
    return hourlyValues;
  }

  /**
   * Aggrega dati da 15min a 60min (somma per energia).
   * @deprecated Usa aggregateToHourlyFromPeriod(values, 15) per supportare più periodi.
   */
  aggregateToHourly(quarterlyValues: number[]): number[] {
    return this.aggregateToHourlyFromPeriod(quarterlyValues, 15);
  }

  /**
   * Recupera consumo effettivo per range di date
   */
  async getActualConsumptionRange(
    fspUserId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ConsumptionDataDocument[]> {
    return this.find({
      fspUserId,
      profileType: ProfileType.ACTUAL,
      date: { $gte: startDate, $lte: endDate },
    });
  }

  /**
   * Invalida profilo di riferimento corrente e ne crea uno nuovo
   */
  async replaceReferenceProfile(
    fspUserId: string,
    profileType: ProfileType,
    newProfileData: Partial<ConsumptionData>,
  ): Promise<ConsumptionDataDocument> {
    if (profileType === ProfileType.ACTUAL) {
      throw new ProfileTypeNotReplaceableException(profileType);
    }

    // Invalida il profilo corrente
    const currentProfile = await this.getReferenceProfile(
      fspUserId,
      profileType,
    );
    if (currentProfile) {
      currentProfile.validTo = new Date();
      await currentProfile.save();
      this.logger.debug(
        `Invalidated profile ${currentProfile._id} for user ${fspUserId}`,
      );
    }

    // Crea nuovo profilo
    const newProfile = await this.create({
      fspUserId,
      profileType,
      date: null,
      validFrom: new Date(),
      validTo: null,
      ...newProfileData,
    });

    this.logger.debug(
      `Created new ${profileType} profile ${newProfile._id} for user ${fspUserId}`,
    );
    return newProfile;
  }

  async getOfferedConsumption(fspUserId: string, date: Date): Promise<Partial<ConsumptionData>> {
    const stdProfile = await this.findOne({
      fspUserId,
      profileType: ProfileType.REFERENCE_STANDARD,
      date: null,
      validTo: null, // Profilo attualmente valido
    });

    const session = await this.sessionModel.findOne({
      market: new Types.ObjectId(await this.tenantContext.getCurrentMarket()),
      sessionDate: date,
      // status: SessionStatus.IN_DELIVERY
      // status: SessionStatus.ACTIVE
    }).exec();
    // Usa oggetti plain invece di istanze delle classi schema
    const hourlyMeasurement: Measurement = {
      type: MeasurementType.CONSUMPTION,
      periodInMinutes: 60,
      unit: 'Wh',
      values: new Array(24).fill(0),
    };

    const measurement15min: Measurement = {
      type: MeasurementType.CONSUMPTION,
      periodInMinutes: 15,
      unit: 'W',
      values: new Array(96).fill(0),
    };

    // Copia i valori dal profilo standard
    for (const stdConsumption of stdProfile?.measurements || []) {
      if (stdConsumption.periodInMinutes === 60 && stdConsumption.type === MeasurementType.CONSUMPTION) {
        hourlyMeasurement.values = [...stdConsumption.values];
      }
      if (stdConsumption.periodInMinutes === 15 && stdConsumption.type === MeasurementType.CONSUMPTION) {
        measurement15min.values = [...stdConsumption.values];
      }
    }

    // Recupera le offerte accettate
    const hourlyOffers = await this.hourlyOfferModel.find({
      fsp: new Types.ObjectId(fspUserId),
      status: OfferStatus.ACCEPTED,
      session: session?._id
    }).exec();



    // Applica le offerte al profilo
    for (const offer of hourlyOffers) {
      hourlyMeasurement.values[offer.hour - 1] = hourlyMeasurement.values[offer.hour - 1] + offer.powerMw * 1000;
      const startIndex = (offer.hour - 1) * 4;
      measurement15min.values[startIndex] = measurement15min.values[startIndex] + (offer.powerMw * 1000) / 4;
      measurement15min.values[startIndex + 1] = measurement15min.values[startIndex + 1] + (offer.powerMw * 1000) / 4;
      measurement15min.values[startIndex + 2] = measurement15min.values[startIndex + 2] + (offer.powerMw * 1000) / 4;
      measurement15min.values[startIndex + 3] = measurement15min.values[startIndex + 3] + (offer.powerMw * 1000) / 4;
    }

    // Costruisci l'oggetto di ritorno come plain object
    const offeredConsumptionProfile: Partial<ConsumptionData> = {
      fspUserId,
      date,
      profileType: ProfileType.ACTUAL,
      measurements: [measurement15min, hourlyMeasurement],
    };

    return offeredConsumptionProfile;
  }

  /*ToDo create a nethod tho get the offered comsumption profile by userId and date on the selected 
    marcket (see tenantContext.getCurrentMarket()) with the period passed as parameter (15min or 60min)
    the method should return the consumption profile with the offers applied in csv using a template 
    for the csv provided as configuration. the method call the getOfferedConsumption method to get the
    consumption profile with the offers applied and then format the data in csv using the template.
  */
  async getOfferedConsumptionCsv(spUserId: string, date: Date, period : number): Promise<string> {
    if(period !==15 && period !==60){
      throw new Error('Invalid period. Only 15 or 60 minutes are allowed.');
    }
    const offeredConsumption = await this.getOfferedConsumption(spUserId, date);
    //ToDo format the offeredConsumption in csv using a template provided as configuration
    //For now just return a string representation of the offeredConsumption
    //implemnet RFC7807 for energy consumption csv format
    
    let csv = 'timestamp,consumption [W],storage_dispatch [W],pv_production [W],net_load_with_flex [W],net_load_without_flex [W]\n';
    const measurement = offeredConsumption.measurements?.find(m => m.periodInMinutes === period && m.type === MeasurementType.CONSUMPTION);
    if (measurement) {
      const dateStr = date.toISOString().split('T')[0];
      if (period === 60) {
        for (let hour = 0; hour < 24; hour++) {
          const displayHour = (hour + 1) % 24;
          const timestamp = `${dateStr}T${displayHour.toString().padStart(2, '0')}:00:00`;
          csv += `${timestamp},${measurement.values[hour]},0,0,${measurement.values[hour]},${measurement.values[hour]}\n`;
        }
      } else if (period === 15) {
        for (let quarter = 0; quarter < 96; quarter++) {
          const hour = Math.floor(quarter / 4);
          const minute = (quarter % 4) * 15;
          const displayHour = (hour + 1) % 24;
          const displayMinute = minute;
          const timestamp = `${dateStr}T${displayHour.toString().padStart(2, '0')}:${displayMinute.toString().padStart(2, '0')}:00`;
          csv += `${timestamp},${measurement.values[quarter]},0,0,${measurement.values[quarter]},${measurement.values[quarter]}\n`;
        }
      }
    }
    return csv;
  }
}
