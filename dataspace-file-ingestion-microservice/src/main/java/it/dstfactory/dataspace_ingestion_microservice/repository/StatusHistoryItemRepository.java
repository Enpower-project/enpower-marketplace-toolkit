package it.dstfactory.dataspace_ingestion_microservice.repository;

import it.dstfactory.dataspace_ingestion_microservice.entities.StatusHistoryItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;

import java.util.List;

@RepositoryRestResource(path = "status-history-items", collectionResourceRel = "status-history-items")
public interface StatusHistoryItemRepository extends JpaRepository<StatusHistoryItem, String> {

    List<StatusHistoryItem> findByFileIngestionEntry_EntryId(String entryId);

}
