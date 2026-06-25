package it.dstfactory.dataspace_ingestion_microservice.dto;

import lombok.Data;

import java.util.List;

@Data
public class ConsumeDataPageResponse {
    private List<ConsumeData> listContent;
    private int totalPages;
    private int currentPage;
    private int pageSize;
    private int totalRows;
}
