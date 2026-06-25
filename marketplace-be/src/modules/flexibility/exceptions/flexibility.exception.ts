import { HttpStatus } from '@nestjs/common';
import { BusinessException } from '../../../exceptions/business.exception';
import { ErrorCode } from '../../../enums/error-code.enum';

/**
 * Exception per dati di consumo non trovati
 */
export class ConsumptionDataNotFoundException extends BusinessException {
  constructor(fspUserId: string, date?: Date) {
    const dateStr = date ? ` on ${date.toISOString().split('T')[0]}` : '';
    super(
      ErrorCode.CONSUMPTION_DATA_NOT_FOUND,
      'ConsumptionData',
      'fspUserId',
      fspUserId,
      `Consumption data not found for FSP user ${fspUserId}${dateStr}`,
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * Exception per profilo di riferimento non trovato
 */
export class ReferenceProfileNotFoundException extends BusinessException {
  constructor(fspUserId: string, profileType: string) {
    super(
      ErrorCode.REFERENCE_PROFILE_NOT_FOUND,
      'ConsumptionData',
      'profileType',
      profileType,
      `Reference profile '${profileType}' not found for FSP user ${fspUserId}`,
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * Exception per profili di riferimento incompleti
 */
export class ReferenceProfilesIncompleteException extends BusinessException {
  constructor(fspUserId: string, missingProfiles?: string[]) {
    const missing = missingProfiles?.join(', ') || 'one or more profiles';
    super(
      ErrorCode.REFERENCE_PROFILES_INCOMPLETE,
      'UserConsumptionProfile',
      'fspUserId',
      fspUserId,
      `Incomplete reference profiles for FSP user ${fspUserId}. Missing: ${missing}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/**
 * Exception per dati di flessibilità non trovati
 */
export class FlexibilityDataNotFoundException extends BusinessException {
  constructor(fspUserId: string, date?: Date) {
    const dateStr = date ? ` on ${date.toISOString().split('T')[0]}` : '';
    super(
      ErrorCode.FLEXIBILITY_DATA_NOT_FOUND,
      'FlexibilityData',
      'fspUserId',
      fspUserId,
      `Flexibility data not found for FSP user ${fspUserId}${dateStr}`,
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * Exception per profilo di consumo utente non trovato
 */
export class UserConsumptionProfileNotFoundException extends BusinessException {
  constructor(fspUserId: string) {
    super(
      ErrorCode.USER_CONSUMPTION_PROFILE_NOT_FOUND,
      'UserConsumptionProfile',
      'fspUserId',
      fspUserId,
      `User consumption profile not found for FSP user ${fspUserId}`,
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * Exception per tipo di profilo non valido
 */
export class InvalidProfileTypeException extends BusinessException {
  constructor(profileType: string, operation: string) {
    super(
      ErrorCode.INVALID_PROFILE_TYPE,
      'ConsumptionData',
      'profileType',
      profileType,
      `Invalid profile type '${profileType}' for operation '${operation}'`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * Exception per conteggio misurazioni non valido
 */
export class InvalidMeasurementCountException extends BusinessException {
  constructor(
    periodInMinutes: number,
    expected: number,
    actual: number,
    measurementType?: string,
  ) {
    const typeStr = measurementType ? ` for ${measurementType}` : '';
    super(
      ErrorCode.INVALID_MEASUREMENT_COUNT,
      'Measurement',
      'values',
      actual,
      `Expected ${expected} values for ${periodInMinutes}min period${typeStr}, got ${actual}`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * Exception per misurazione mancante
 */
export class MissingMeasurementException extends BusinessException {
  constructor(
    measurementType: string,
    periodInMinutes: number,
    context?: string,
  ) {
    const contextStr = context ? ` in ${context}` : '';
    super(
      ErrorCode.MISSING_MEASUREMENT,
      'Measurement',
      'type',
      measurementType,
      `Missing measurement '${measurementType}' for ${periodInMinutes}min period${contextStr}`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * Exception per valori di flessibilità non validi
 */
export class InvalidFlexibilityValuesException extends BusinessException {
  constructor(flexibilityType: string, details: string) {
    super(
      ErrorCode.INVALID_FLEXIBILITY_VALUES,
      'FlexibilityData',
      'measurements',
      flexibilityType,
      `Invalid ${flexibilityType} flexibility values: ${details}. Check that min <= standard <= max in reference profiles.`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * Exception per tipo di profilo non sostituibile
 */
export class ProfileTypeNotReplaceableException extends BusinessException {
  constructor(profileType: string) {
    super(
      ErrorCode.PROFILE_TYPE_NOT_REPLACEABLE,
      'ConsumptionData',
      'profileType',
      profileType,
      `Cannot replace profile of type '${profileType}'. Only reference profiles can be replaced.`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * Exception per violazione dei vincoli tra profili di riferimento
 */
export class ReferenceProfileConstraintViolationException extends BusinessException {
  constructor(violation: string, details?: string) {
    super(
      ErrorCode.REFERENCE_PROFILE_CONSTRAINT_VIOLATION,
      'ConsumptionData',
      'measurements',
      violation,
      `Reference profile constraint violation: ${violation}. ${details || ''}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
