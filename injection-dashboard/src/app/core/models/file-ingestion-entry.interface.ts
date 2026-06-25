import { EntryStatus } from "./entry-status";

export interface FileIngestionEntry {
  entryId: string;
  status: EntryStatus;
  originalFileName?: string;
  translatedFileName?: string;
  statusMessage?: string;
  fileFormatType?: string;
  offeringName?: string;
  changedBy?: string;
  mimeType?: string;
  localArchivePath?: string;
  translatedFilePath?: string;
  fileSize?: number;
  fileHash?: number;
  sourceFileId?: string;
  source?: string;
  entryCreationTimestamp?: string;
  translationTimestamp?: string;
  synchronizationTimestamp?: string;
  updatedAt?: string;
  _links?: {
    self: { href: string };
    [key: string]: { href: string };
  };
}