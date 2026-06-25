export interface UpdateStatusRequest {
  newStatus: string;
  message?: string;
  changedBy?: string;
  source?: string;
}