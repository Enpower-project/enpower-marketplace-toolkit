package it.dstfactory.dataspace_ingestion_microservice.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class DataspaceIngestRequest {

    @JsonProperty("id")
    private String id;

    @JsonProperty("source_file_id")
    private String sourceFileId;

    @JsonProperty("provider_id")
    private String provider_id;

    @JsonProperty("offering_title")
    private String offeringTitle;

    @JsonProperty("file_name")
    private String fileName;

    @JsonProperty("created_on")
    private String createdOn;

    @JsonProperty("filedata")
    private String filedata;

}