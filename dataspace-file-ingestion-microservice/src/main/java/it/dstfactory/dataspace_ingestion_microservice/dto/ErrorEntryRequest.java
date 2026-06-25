package it.dstfactory.dataspace_ingestion_microservice.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class ErrorEntryRequest {

    @JsonProperty("source_file_id")
    private String sourceFileId;

    @JsonProperty("offering_name")
    private String offeringName;

    @JsonProperty("file_name")
    private String fileName;

    @JsonProperty("provider_id")
    private String providerId;

    @JsonProperty("error_message")
    private String errorMessage;
}