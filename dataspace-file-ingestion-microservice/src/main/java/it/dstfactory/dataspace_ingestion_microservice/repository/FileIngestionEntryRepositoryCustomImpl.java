package it.dstfactory.dataspace_ingestion_microservice.repository;

import it.dstfactory.dataspace_ingestion_microservice.entities.FileIngestionEntry;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

@Repository
public class FileIngestionEntryRepositoryCustomImpl implements FileIngestionEntryRepositoryCustom {

    @PersistenceContext
    private EntityManager entityManager;

    private static final Set<String> ALLOWED_SORT_FIELDS = Set.of(
            "entry_id", "offering_name", "original_filename", "entry_creation_timestamp"
    );

    @Override
    public Page<FileIngestionEntry> findByFiltersWithSort(
            String originalFileName, String status,
            LocalDateTime entryCreationTimestampFrom, LocalDateTime entryCreationTimestampTo,
            String sortField, String sortDirection,
            Pageable pageable) {

        String safeField = (sortField != null && ALLOWED_SORT_FIELDS.contains(sortField))
                ? sortField
                : "entry_creation_timestamp";
        String safeDir = "asc".equalsIgnoreCase(sortDirection) ? "ASC" : "DESC";

        String whereClause = """
                FROM file_ingestion_entry fie
                WHERE (CAST(:originalFileName AS TEXT) IS NULL OR LOWER(fie.original_filename) LIKE LOWER('%' || CAST(:originalFileName AS TEXT) || '%'))
                AND (CAST(:status AS VARCHAR) IS NULL OR fie.status = CAST(:status AS VARCHAR))
                AND (CAST(:from AS TIMESTAMP) IS NULL OR fie.entry_creation_timestamp >= CAST(:from AS TIMESTAMP))
                AND (CAST(:to AS TIMESTAMP) IS NULL OR fie.entry_creation_timestamp <= CAST(:to AS TIMESTAMP))
                """;

        Query dataQuery = entityManager.createNativeQuery(
                "SELECT * " + whereClause + "ORDER BY fie." + safeField + " " + safeDir,
                FileIngestionEntry.class
        );

        Query countQuery = entityManager.createNativeQuery(
                "SELECT COUNT(*) " + whereClause
        );

        for (Query q : new Query[]{dataQuery, countQuery}) {
            q.setParameter("originalFileName", originalFileName);
            q.setParameter("status", status);
            q.setParameter("from", entryCreationTimestampFrom);
            q.setParameter("to", entryCreationTimestampTo);
        }

        dataQuery.setFirstResult((int) pageable.getOffset());
        dataQuery.setMaxResults(pageable.getPageSize());

        @SuppressWarnings("unchecked")
        List<FileIngestionEntry> results = dataQuery.getResultList();
        long total = ((Number) countQuery.getSingleResult()).longValue();

        return new PageImpl<>(results, pageable, total);
    }
}
