package it.dstfactory.dataspace_ingestion_microservice.repository;

import it.dstfactory.dataspace_ingestion_microservice.entities.FileIngestionEntry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import java.time.LocalDateTime;

public interface FileIngestionEntryRepositoryCustom {
    Page<FileIngestionEntry> findByFiltersWithSort(
            String originalFileName,
            String status,
            LocalDateTime entryCreationTimestampFrom,
            LocalDateTime entryCreationTimestampTo,
            String sortField,
            String sortDirection,
            Pageable pageable
    );
}
