import { EntryStatus } from "./entry-status";
import { FileIngestionEntry } from "./file-ingestion-entry.interface";

export interface StatusHistoryItem{
    historyItemId: string;
    fileIngestionEntry: FileIngestionEntry;
    previousStatus: EntryStatus;
    newStatus: EntryStatus;
    timestamp: string;
    statusMessage?: string;
    changedBy?: string;
    changedSource?: string;
}