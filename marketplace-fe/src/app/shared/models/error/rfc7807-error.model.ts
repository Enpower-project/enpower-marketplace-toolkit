export interface ProblemDetail {
  entity: string;
  property: string;
  errorCode: string;
  message: string;
  invalidValue?: any;
}

export interface AppErrorEvent {
  timestamp: Date;
  status: number;
  title: string;
  detail?: string;
  errors?: ProblemDetail[];
}

export interface RFC7807ErrorResponse {
  title: string;
  status: number;
  detail?: string;
  errors?: ProblemDetail[];
}