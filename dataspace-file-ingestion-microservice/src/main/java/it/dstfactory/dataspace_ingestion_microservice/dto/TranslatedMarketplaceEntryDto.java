package it.dstfactory.dataspace_ingestion_microservice.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class TranslatedMarketplaceEntryDto {

    @JsonProperty("entry_id")
    private String entryId;

    @JsonProperty("original_filename")
    private String originalFilename;

    @JsonProperty("marketplace_fsp_id")
    private String marketplaceFspId;

    @JsonProperty("marketplace_market_id")
    private String marketplaceMarketId;

    @JsonProperty("offering_name")
    private String offeringName;
}