package it.dstfactory.dataspace_ingestion_microservice.controller;

import it.dstfactory.dataspace_ingestion_microservice.dto.DataspaceIngestRequest;
import it.dstfactory.dataspace_ingestion_microservice.dto.ErrorEntryRequest;
import it.dstfactory.dataspace_ingestion_microservice.dto.TranslatedMarketplaceEntryDto;
import it.dstfactory.dataspace_ingestion_microservice.dto.RequestMetadata;
import it.dstfactory.dataspace_ingestion_microservice.dto.UpdateStatusRequest;
import it.dstfactory.dataspace_ingestion_microservice.entities.EntryStatus;
import it.dstfactory.dataspace_ingestion_microservice.entities.FileIngestionEntry;
import it.dstfactory.dataspace_ingestion_microservice.entities.StatusHistoryItem;
import it.dstfactory.dataspace_ingestion_microservice.service.FileIngestionEntryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/file-ingestion-entries")
@RequiredArgsConstructor
@Slf4j
public class FileIngestionEntryController {
    private final FileIngestionEntryService fileIngestionEntryService;

//    @PostMapping
//    public ResponseEntity<FileIngestionEntry> createFileIngestionEntry (
//            @RequestBody FileIngestionEntry fileIngestionEntry
//    ){
//
//        log.debug("REST request to create FileIngestionEntry: {}", fileIngestionEntry.getEntryId());
//
//        FileIngestionEntry created = fileIngestionEntryService.createFileIngestionEntry(fileIngestionEntry);
//
//        return ResponseEntity.status(HttpStatus.CREATED).body(created);
//    }
//
//    @GetMapping("/{entryId}")
//    public ResponseEntity<FileIngestionEntry> getFileIngestionEntryById(
//            @PathVariable String entryId
//    ){
//        log.debug("REST Getting request with Id : {}", entryId);
//
//        FileIngestionEntry entry = fileIngestionEntryService.findById(entryId);
//
//        return ResponseEntity.ok(entry);
//    }

//    @GetMapping()
//    public ResponseEntity<List<FileIngestionEntry>> getFileIngestionEntriesByStatus(
//            @RequestParam EntryStatus status
//    ){
//        log.debug("REST Getting request with Status : {}", status);
//
//        List<FileIngestionEntry> entries = fileIngestionEntryService.findByStatus(status);
//
//        return ResponseEntity.ok(entries);
//    }
//
//    @DeleteMapping("/{entryId}")
//    public ResponseEntity<Void> deleteFileIngestionEntry (
//            @PathVariable String entryId
//    ){
//
//        log.debug("REST Deleting request with Id : {}", entryId);
//
//        fileIngestionEntryService.deleteFileIngestionEntry(entryId);
//
//        return ResponseEntity.noContent().build();
//    }



    @PostMapping("/ingest")
    public ResponseEntity<FileIngestionEntry> ingestFromDataspace(
            @RequestBody DataspaceIngestRequest request) {

        log.debug("REST ingest request for offeringId={}", request.getId());

        FileIngestionEntry created = fileIngestionEntryService.ingestFromDataspace(request);

        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping("/{entryId}/download/translated")
    public ResponseEntity<Resource> downloadTranslatedFile(@PathVariable String entryId) {
        try {
            Resource resource = fileIngestionEntryService.getTranslatedFile(entryId);

            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType("text/csv"))
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"" + resource.getFilename() + "\"")
                    .body(resource);

        } catch (IOException e) {
            log.error("downloadTranslatedFile: failed for entryId={}", entryId, e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/{entryId}/download/original")
    public ResponseEntity<Resource> downloadOriginalFile(@PathVariable String entryId) {
        try {
            Resource resource = fileIngestionEntryService.getOriginalFile(entryId);

            String contentType = Files.probeContentType(Paths.get(resource.getURI()));
            if (contentType == null) contentType = "application/octet-stream";

            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(contentType))
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"" + resource.getFilename() + "\"")
                    .body(resource);

        } catch (IOException e) {
            log.error("downloadOriginalFile: failed for entryId={}", entryId, e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @RequestMapping(value = "/{entryId}/status",
            method = {org.springframework.web.bind.annotation.RequestMethod.PATCH,
                      org.springframework.web.bind.annotation.RequestMethod.POST})
    public ResponseEntity<FileIngestionEntry> updateStatus(
            @PathVariable String entryId,
            @RequestBody UpdateStatusRequest request) {

        FileIngestionEntry updated = fileIngestionEntryService.updateStatus(
                entryId,
                request.getNewStatus(),
                request.getMessage(),
                request.getChangedBy(),
                request.getSource(),
                request.getTranslatedFilePath()
        );

        return ResponseEntity.ok(updated);
    }

    @GetMapping("/all")
    public ResponseEntity<List<FileIngestionEntry>> getAllEntries() {
        return ResponseEntity.ok(fileIngestionEntryService.getAllFileIngestionEntries());
    }

    @GetMapping("/by-source-file/{sourceFileId}")
    public ResponseEntity<FileIngestionEntry> getBySourceFileId(@PathVariable String sourceFileId) {
        log.debug("REST get entry by sourceFileId={}", sourceFileId);
        return fileIngestionEntryService.findBySourceFileId(sourceFileId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/error-entry")
    public ResponseEntity<FileIngestionEntry> createErrorEntry(@RequestBody ErrorEntryRequest request) {
        log.debug("REST create error entry for sourceFileId={}", request.getSourceFileId());
        FileIngestionEntry created = fileIngestionEntryService.createErrorEntry(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping("/translated-for-marketplace")
    public ResponseEntity<List<TranslatedMarketplaceEntryDto>> getTranslatedForMarketplace() {
        log.debug("REST get translated entries for marketplace");
        return ResponseEntity.ok(fileIngestionEntryService.findTranslatedForMarketplace());
    }

    @PostMapping(value = "/{entryId}/translated-file", consumes = "multipart/form-data")
    public ResponseEntity<FileIngestionEntry> saveTranslatedFile (
            @PathVariable String entryId,
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) RequestMetadata metadata
            ){

            FileIngestionEntry updated = fileIngestionEntryService.saveTranslatedFile(
                    entryId,
                    file,
                    metadata.getChangedBy(),
                    metadata.getSource()
            );

            return ResponseEntity.ok(updated);
        }

    @PostMapping("/{entryId}/synchronize")
    public ResponseEntity<FileIngestionEntry> markAsSynchronized(
            @PathVariable String entryId,
            @RequestBody UpdateStatusRequest request
    ) {
        FileIngestionEntry updated = fileIngestionEntryService.markAsSynchronized(
                entryId,
                request.getMessage() != null ? request.getMessage() : "Entry synchronized successfully",
                request.getChangedBy() != null ? request.getChangedBy() : "SYSTEM",
                request.getSource() != null ? request.getSource() : "API"
        );
        return ResponseEntity.ok(updated);
    }

    @PostMapping("/{entryId}/error")
    public ResponseEntity<FileIngestionEntry> recordError(
            @PathVariable String entryId,
            @RequestBody UpdateStatusRequest request
    ) {
        FileIngestionEntry updated = fileIngestionEntryService.recordError(
                entryId,
                request.getMessage(),
                request.getChangedBy() != null ? request.getChangedBy() : "SYSTEM",
                request.getSource() != null ? request.getSource() : "API"
        );
        return ResponseEntity.ok(updated);
    }

    // StatusHistoryItem section

    @GetMapping("/{entryId}/status-history")
    public ResponseEntity<List<StatusHistoryItem>> getStatusHistory(
            @PathVariable String entryId) {

        log.debug("REST get status history for entryId={}", entryId);

        return ResponseEntity.ok(fileIngestionEntryService.getStatusHistoryByEntryId(entryId));
    }
}
