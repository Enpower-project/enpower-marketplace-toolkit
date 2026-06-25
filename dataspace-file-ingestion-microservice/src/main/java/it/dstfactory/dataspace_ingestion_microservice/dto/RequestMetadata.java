package it.dstfactory.dataspace_ingestion_microservice.dto;

import lombok.Data;

@Data
public class RequestMetadata {
    private String changedBy;
    private String source;
}
