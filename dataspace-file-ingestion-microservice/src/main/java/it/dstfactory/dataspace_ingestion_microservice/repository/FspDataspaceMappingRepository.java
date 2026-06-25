package it.dstfactory.dataspace_ingestion_microservice.repository;

import it.dstfactory.dataspace_ingestion_microservice.entities.FspDataspaceMapping;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FspDataspaceMappingRepository extends JpaRepository<FspDataspaceMapping, String> {

    List<FspDataspaceMapping> findByProviderId(String providerId);
}