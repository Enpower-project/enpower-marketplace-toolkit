package it.dstfactory.dataspace_ingestion_microservice.dto;

import it.dstfactory.dataspace_ingestion_microservice.entities.EntryStatus;
import lombok.Data;

@Data
public class UpdateStatusRequest {

    private EntryStatus newStatus;
    private String message;
    private String changedBy;
    private String source;
    private String translatedFilePath;
}
