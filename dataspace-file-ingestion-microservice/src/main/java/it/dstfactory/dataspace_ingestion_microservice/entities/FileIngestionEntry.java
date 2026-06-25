package it.dstfactory.dataspace_ingestion_microservice.entities;

import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.validator.constraints.UUID;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "file_ingestion_entry")
@Getter
@Setter
@NoArgsConstructor
@EntityListeners(AuditingEntityListener.class)
public class FileIngestionEntry {

    @Id
    @UuidGenerator
    @Column(name = "entry_id", nullable = false, updatable = false)
    private String entryId;

    @Column(name="provider_id", nullable = false)
    private String provider_id;

    @Column(name = "offering_id")
    private String offeringId;

    @Column(name = "offering_name")
    private String offeringName;

    @Column(name = "source_file_id")
    private String sourceFileId;

    @Column(name = "original_filename")
    private String originalFileName;

    @Column(name = "file_hash")
    private String fileHash;

    @Column(name = "file_format_type")
    private String fileFormatType;

    @Column(name = "mime_type")
    private String mimeType;

    @Column(name = "file_size")
    private Long fileSize;

    @Column(name = "dataspace_file_creation_date")
    private LocalDateTime dataspaceFileCreationDate;

    @Column(name = "local_archive_path")
    private String localArchivePath;

    @Column(name = "translated_file_path")
    private String translatedFilePath;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private EntryStatus status;

    @Column(name = "status_message", columnDefinition = "TEXT")
    private String statusMessage;

    @CreatedDate
    @Column(name = "entry_creation_timestamp", nullable = false, updatable = false)
    private LocalDateTime entryCreationTimestamp;

    @Column(name = "translation_timestamp")
    private LocalDateTime translationTimestamp;

    @Column(name = "synchronization_timestamp")
    private LocalDateTime synchronizationTimestamp;

    @JsonManagedReference
    @OneToMany(mappedBy = "fileIngestionEntry", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<StatusHistoryItem> statusHistoryItems = new ArrayList<>();
}
