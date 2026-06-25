package it.dstfactory.dataspace_ingestion_microservice.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class ConsumeData {
    @JsonProperty("provider_company_id")
    private String providerCompanyId;

    @JsonProperty("data_catalog_service_code")
    private String dataCatalogServiceCode;

    @JsonProperty("data_description")
    private String dataDescription;

    @JsonProperty("data_catalog_category_name")
    private String dataCatalogCategoryName;

    @JsonProperty("offering_title")
    private String offeringTitle;

    @JsonProperty("file_name")
    private String fileName;

    @JsonProperty("provider_username")
    private String providerUsername;

    @JsonProperty("provider_company_name")
    private String providerCompanyName;

    @JsonProperty("data_title")
    private String dataTitle;

    @JsonProperty("data_catalog_category_id")
    private String dataCatalogCategoryId;

    @JsonProperty("data_catalog_business_object_id")
    private String dataCatalogBusinessObjectId;

    @JsonProperty("created_on")
    private String createdOn;

    @JsonProperty("data_catalog_service_id")
    private String dataCatalogServiceId;

    @JsonProperty("data_catalog_business_object_code")
    private String dataCatalogBusinessObjectCode;

    @JsonProperty("provider_id")
    private String providerId;

    private String id;

    @JsonProperty("data_catalog_category_code")
    private String dataCatalogCategoryCode;

    @JsonProperty("cf_type")
    private String cfType;
}