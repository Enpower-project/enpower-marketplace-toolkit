package it.dstfactory.dataspace_ingestion_microservice.repository;

import it.dstfactory.dataspace_ingestion_microservice.entities.EntryStatus;
import it.dstfactory.dataspace_ingestion_microservice.entities.FileIngestionEntry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;
import org.springframework.data.rest.core.annotation.RestResource;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@RepositoryRestResource(path = "file-ingestion-entries", collectionResourceRel = "file-ingestion-entries")
public interface FileIngestionEntryRepository extends JpaRepository<FileIngestionEntry, String>, FileIngestionEntryRepositoryCustom {
    List<FileIngestionEntry> findByStatus(EntryStatus status);
    boolean existsByOfferingId(String offeringId);
    Optional<FileIngestionEntry> findBySourceFileId(String sourceFileId);
}
