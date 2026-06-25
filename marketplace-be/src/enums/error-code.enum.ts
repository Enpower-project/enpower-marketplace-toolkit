export enum ErrorCode {
  // 400 - Bad Request
  INVALID_DATA = 'error.data.invalid',
  REQUIRED_FIELD = 'error.field.required',
  INVALID_FORMAT = 'error.format.invalid',
  VALIDATION_FAILED = 'error.validation.failed',
  MALFORMED_REQUEST = 'error.request.malformed',

  // 401 - Unauthorized
  UNAUTHORIZED = 'error.unauthorized',
  TOKEN_EXPIRED = 'error.token.expired',
  TOKEN_INVALID = 'error.token.invalid',
  CREDENTIALS_INVALID = 'error.credentials.invalid',
  AUTHENTICATION_REQUIRED = 'error.authentication.required',

  // 403 - Forbidden
  FORBIDDEN = 'error.forbidden',
  INSUFFICIENT_PERMISSIONS = 'error.permissions.insufficient',
  ACCESS_DENIED = 'error.access.denied',
  RESOURCE_FORBIDDEN = 'error.resource.forbidden',

  // 404 - Not Found
  NOT_FOUND = 'error.not_found',
  RESOURCE_NOT_FOUND = 'error.resource.not_found',
  ENDPOINT_NOT_FOUND = 'error.endpoint.not_found',
  USER_NOT_FOUND = 'error.user.not_found',
  MARKET_NOT_FOUND = 'error.market.not_found',

  // 405 - Method Not Allowed
  METHOD_NOT_ALLOWED = 'error.method.not_allowed',

  // 406 - Not Acceptable
  NOT_ACCEPTABLE = 'error.not_acceptable',

  // 408 - Request Timeout
  REQUEST_TIMEOUT = 'error.request.timeout',

  // 409 - Conflict
  ALREADY_EXISTS = 'error.already_exists',
  RESOURCE_CONFLICT = 'error.resource.conflict',
  CONCURRENT_MODIFICATION = 'error.concurrent.modification',
  DUPLICATE_ENTRY = 'error.duplicate.entry',

  // 410 - Gone
  RESOURCE_GONE = 'error.resource.gone',

  // 412 - Precondition Failed
  PRECONDITION_FAILED = 'error.precondition.failed',

  // 413 - Payload Too Large
  PAYLOAD_TOO_LARGE = 'error.payload.too_large',

  // 415 - Unsupported Media Type
  UNSUPPORTED_MEDIA_TYPE = 'error.media_type.unsupported',

  // 422 - Unprocessable Entity
  UNPROCESSABLE_ENTITY = 'error.unprocessable_entity',
  BUSINESS_RULE_VIOLATION = 'error.business_rule.violation',

  // 429 - Too Many Requests
  TOO_MANY_REQUESTS = 'error.rate_limit.exceeded',

  // 500 - Internal Server Error
  INTERNAL_ERROR = 'error.internal',
  DATABASE_ERROR = 'error.database',
  CONFIGURATION_ERROR = 'error.configuration',

  // 502 - Bad Gateway
  BAD_GATEWAY = 'error.bad_gateway',
  UPSTREAM_ERROR = 'error.upstream',

  // 503 - Service Unavailable
  SERVICE_UNAVAILABLE = 'error.service.unavailable',
  MAINTENANCE_MODE = 'error.maintenance.mode',

  // 504 - Gateway Timeout
  GATEWAY_TIMEOUT = 'error.gateway.timeout',

  // Business specific errors
  INSUFFICIENT_BALANCE = 'error.insufficient_balance',
  MARKET_NOT_ACTIVE = 'error.market.not_active',
  SESSION_CLOSED = 'error.session.closed',
  TRANSACTION_FAILED = 'error.transaction.failed',
  CONTRACT_ERROR = 'error.contract.execution',
  WALLET_ERROR = 'error.wallet.invalid',

  // Flexibility module specific errors
  CONSUMPTION_DATA_NOT_FOUND = 'error.flexibility.consumption_data.not_found',
  FLEXIBILITY_DATA_NOT_FOUND = 'error.flexibility.flexibility_data.not_found',
  REFERENCE_PROFILE_NOT_FOUND = 'error.flexibility.reference_profile.not_found',
  REFERENCE_PROFILES_INCOMPLETE = 'error.flexibility.reference_profiles.incomplete',
  USER_CONSUMPTION_PROFILE_NOT_FOUND = 'error.flexibility.user_consumption_profile.not_found',
  INVALID_PROFILE_TYPE = 'error.flexibility.profile_type.invalid',
  INVALID_MEASUREMENT_VALUES = 'error.flexibility.measurement_values.invalid',
  INVALID_MEASUREMENT_COUNT = 'error.flexibility.measurement_count.invalid',
  MISSING_MEASUREMENT = 'error.flexibility.measurement.missing',
  INVALID_FLEXIBILITY_VALUES = 'error.flexibility.flexibility_values.invalid',
  PROFILE_TYPE_NOT_REPLACEABLE = 'error.flexibility.profile_type.not_replaceable',
  REFERENCE_PROFILE_CONSTRAINT_VIOLATION = 'error.flexibility.reference_profile.constraint_violation'
}