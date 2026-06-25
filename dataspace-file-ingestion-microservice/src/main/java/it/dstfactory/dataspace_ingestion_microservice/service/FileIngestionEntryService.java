package it.dstfactory.dataspace_ingestion_microservice.service;

import it.dstfactory.dataspace_ingestion_microservice.dto.DataspaceIngestRequest;
import it.dstfactory.dataspace_ingestion_microservice.dto.ErrorEntryRequest;
import it.dstfactory.dataspace_ingestion_microservice.dto.TranslatedMarketplaceEntryDto;
import it.dstfactory.dataspace_ingestion_microservice.entities.EntryStatus;
import it.dstfactory.dataspace_ingestion_microservice.entities.FileIngestionEntry;
import it.dstfactory.dataspace_ingestion_microservice.entities.FspDataspaceMapping;
import it.dstfactory.dataspace_ingestion_microservice.entities.StatusHistoryItem;
import it.dstfactory.dataspace_ingestion_microservice.exception.BusinessValidationException;
import it.dstfactory.dataspace_ingestion_microservice.exception.EntityNotFoundException;
import it.dstfactory.dataspace_ingestion_microservice.repository.FileIngestionEntryRepository;
import it.dstfactory.dataspace_ingestion_microservice.repository.FspDataspaceMappingRepository;
import it.dstfactory.dataspace_ingestion_microservice.repository.StatusHistoryItemRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
@RequiredArgsConstructor
@Slf4j
public class FileIngestionEntryService {

    private final FileIngestionEntryRepository fileIngestionEntryRepository;
    private final StatusHistoryItemRepository statusHistoryItemRepository;
    private final FspDataspaceMappingRepository fspDataspaceMappingRepository;

    @Value("${app.storage.base-path:/data/dfim/files}")
    private String storagePath;

    private String newPath()          { return storagePath + "/NEW"; }
    private String translatedPath()   { return storagePath + "/TRANSLATED"; }
    private String synchronizedPath() { return storagePath + "/SYNCHRONIZED"; }

    public FileIngestionEntry createFileIngestionEntry (FileIngestionEntry fileIngestionEntry){
        log.debug("Creating FileIngestionEntry with id : {}", fileIngestionEntry.getEntryId());

        if (fileIngestionEntry.getStatus() == null) {
            fileIngestionEntry.setStatus(EntryStatus.NEW);
        }

        if (fileIngestionEntry.getEntryCreationTimestamp() == null) {
            fileIngestionEntry.setEntryCreationTimestamp(LocalDateTime.now());
        }

        FileIngestionEntry saved = fileIngestionEntryRepository.save(fileIngestionEntry);

        log.debug("Entity created with id : {}", saved.getEntryId());
        return saved;
    }

    @Transactional
    public List<FileIngestionEntry> getAllFileIngestionEntries(){
        return  fileIngestionEntryRepository.findAll();
    }

    @Transactional
    public FileIngestionEntry findById(String entryId){
        log.debug("Getting FileIngestionentry by id : {}", entryId);

        return fileIngestionEntryRepository.findById(entryId)
                .orElseThrow(() -> new EntityNotFoundException("FileIngestionEntry not found with Id " + entryId));
    }

    public Resource getTranslatedFile(String entryId) throws IOException {
        FileIngestionEntry entry = findById(entryId);

        if (entry.getStatus() != EntryStatus.TRANSLATED && entry.getStatus() != EntryStatus.SYNCHRONIZED) {
            throw new BusinessValidationException(
                    "No translated file available for entry in status: " + entry.getStatus());
        }

        String basePath = entry.getStatus() == EntryStatus.SYNCHRONIZED
                ? synchronizedPath()
                : translatedPath();

        Path folder = Paths.get(basePath, entryId);

        if (!Files.exists(folder)) {
            throw new EntityNotFoundException("Translated folder not found for entryId: " + entryId);
        }

        Path translatedFile = Files.list(folder)
                .filter(p -> {
                    String name = p.getFileName().toString();
                    return name.endsWith(".csv")
                            && !name.endsWith("_MAX.csv")
                            && !name.endsWith("_MIN.csv")
                            && !name.endsWith("_STD.csv");
                })
                .findFirst()
                .orElseThrow(() -> new EntityNotFoundException(
                        "Translated file not found in folder for entryId: " + entryId));

        Resource resource = new UrlResource(translatedFile.toUri());
        if (!resource.isReadable()) {
            throw new EntityNotFoundException("Translated file is not readable for entryId: " + entryId);
        }

        return resource;
    }

    public Resource getOriginalFile(String entryId) throws IOException {
        FileIngestionEntry entry = findById(entryId);

        if (entry.getLocalArchivePath() == null) {
            throw new EntityNotFoundException("No original file path stored for entryId: " + entryId);
        }

        Path filePath = Paths.get(entry.getLocalArchivePath());

        if (!Files.exists(filePath)) {
            throw new EntityNotFoundException("Original file not found on disk for entryId: " + entryId);
        }

        Resource resource = new UrlResource(filePath.toUri());
        if (!resource.isReadable()) {
            throw new EntityNotFoundException("Original file is not readable for entryId: " + entryId);
        }

        return resource;
    }

    public FileIngestionEntry markAsSynchronized(
            String entryId,
            String message,
            String changedBy,
            String source) {

        log.debug("markAsSynchronized: entryId={}", entryId);

        FileIngestionEntry entry = findById(entryId);

        if (entry.getStatus() != EntryStatus.TRANSLATED) {
            throw new BusinessValidationException(
                    "Cannot synchronize entry in status: " + entry.getStatus());
        }

        entry.setSynchronizationTimestamp(LocalDateTime.now());

        return updateStatus(entryId, EntryStatus.SYNCHRONIZED,
                message != null ? message : "Entry synchronized successfully",
                changedBy, source);
    }

    public FileIngestionEntry recordError(
            String entryId,
            String errorMessage,
            String changedBy,
            String source) {

        log.debug("recordError: entryId={}, message={}", entryId, errorMessage);

        return updateStatus(entryId, EntryStatus.ERROR, errorMessage, changedBy, source);
    }

    @Transactional
    public List<FileIngestionEntry> findByStatus(EntryStatus status){
        log.debug("Getting FileIngestionentry by status : {}", status);

        return fileIngestionEntryRepository.findByStatus(status);
    }

    public void deleteFileIngestionEntry(String entryId) {
        log.debug("deleteFileIngestionEntry: entryId={}", entryId);

        FileIngestionEntry entry = findById(entryId);

        try {
            if (entry.getLocalArchivePath() != null) {
                deleteFile(entry.getLocalArchivePath());
            }
            if (entry.getTranslatedFilePath() != null) {
                deleteFile(entry.getTranslatedFilePath());
            }
        } catch (IOException e) {
            log.warn("deleteFileIngestionEntry: failed to delete physical files for entryId={}",
                    entryId, e);
        }

        fileIngestionEntryRepository.deleteById(entryId);

        log.info("deleteFileIngestionEntry: deleted entryId={}", entryId);
    }

    public FileIngestionEntry updateStatus(
            String entryId,
            EntryStatus newStatus,
            String message,
            String changedBy,
            String source) {
        return updateStatus(entryId, newStatus, message, changedBy, source, null);
    }

    public FileIngestionEntry updateStatus(
            String entryId,
            EntryStatus newStatus,
            String message,
            String changedBy,
            String source,
            String translatedFilePath) {

        log.debug("updateStatus: entryId={}, newStatus={}", entryId, newStatus);

        FileIngestionEntry entry = findById(entryId);
        EntryStatus previousStatus = entry.getStatus();

        entry.setStatus(newStatus);
        entry.setStatusMessage(message);

        switch (newStatus) {
            case TRANSLATED -> {
                entry.setTranslationTimestamp(LocalDateTime.now());
                if (translatedFilePath != null) entry.setTranslatedFilePath(translatedFilePath);
            }
            case SYNCHRONIZED -> entry.setSynchronizationTimestamp(LocalDateTime.now());
            case ERROR -> {}
            default -> {}
        }

        StatusHistoryItem historyItem = new StatusHistoryItem();
        historyItem.setHistoryItemId(UUID.randomUUID().toString());
        historyItem.setFileIngestionEntry(entry);
        historyItem.setPreviousStatus(previousStatus);
        historyItem.setNewStatus(newStatus);
        historyItem.setStatusMessage(message);
        historyItem.setChangedBy(changedBy != null ? changedBy : "SYSTEM");
        historyItem.setChangeSource(source != null ? source : "API");
        historyItem.setTimestamp(LocalDateTime.now());

        statusHistoryItemRepository.save(historyItem);

        FileIngestionEntry updated = fileIngestionEntryRepository.save(entry);

        log.info("updateStatus: entryId={}, {} -> {}", entryId, previousStatus, newStatus);

        return updated;
    }

    public List<TranslatedMarketplaceEntryDto> findTranslatedForMarketplace() {
        log.debug("findTranslatedForMarketplace");
        List<FileIngestionEntry> entries = fileIngestionEntryRepository.findByStatus(EntryStatus.TRANSLATED);
        List<TranslatedMarketplaceEntryDto> result = new ArrayList<>();
        for (FileIngestionEntry entry : entries) {
            if (entry.getProvider_id() == null) continue;
            List<FspDataspaceMapping> mappings = fspDataspaceMappingRepository.findByProviderId(entry.getProvider_id());
            if (mappings.isEmpty()) {
                log.warn("findTranslatedForMarketplace: no FSP mapping for providerId={}", entry.getProvider_id());
                continue;
            }
            FspDataspaceMapping mapping = resolveMapping(mappings, entry.getOriginalFileName());
            if (mapping == null) {
                log.warn("findTranslatedForMarketplace: no FSP mapping matches filename={} for providerId={} ({} candidates)",
                        entry.getOriginalFileName(), entry.getProvider_id(), mappings.size());
                continue;
            }
            TranslatedMarketplaceEntryDto dto = new TranslatedMarketplaceEntryDto();
            dto.setEntryId(entry.getEntryId());
            dto.setOriginalFilename(entry.getOriginalFileName());
            dto.setMarketplaceFspId(mapping.getMarketplaceFspId());
            dto.setMarketplaceMarketId(mapping.getMarketplaceMarketId());
            dto.setOfferingName(entry.getOfferingName());
            result.add(dto);

        }

        return result;
    }

    /**
     * Picks the FSP mapping for a given file. A provider_id can be shared by several
     * FSPs (e.g. one Dataspace organization publishing data for multiple buildings in
     * the same market); in that case the mapping is disambiguated by matching the
     * mapping's filePattern against the start of the file's original filename
     * (e.g. filePattern "P3_" matches "P3_20260528.csv").
     */
    private FspDataspaceMapping resolveMapping(List<FspDataspaceMapping> mappings, String originalFilename) {
        if (mappings.size() == 1) {
            return mappings.get(0);
        }
        if (originalFilename == null) return null;
        for (FspDataspaceMapping mapping : mappings) {
            String pattern = mapping.getFilePattern();
            if (pattern != null && !pattern.isBlank()
                    && originalFilename.toUpperCase().startsWith(pattern.toUpperCase())) {
                return mapping;
            }
        }
        return null;
    }

    public FileIngestionEntry ingestFromDataspace(DataspaceIngestRequest request) {
        log.debug("ingestFromDataspace: offeringId={}", request.getId());

        if (fileIngestionEntryRepository.existsByOfferingId(request.getId())) {
            throw new BusinessValidationException("Entry with offeringId " + request.getId() + " already exists");
        }

        if (request.getFiledata() == null || !request.getFiledata().startsWith("data:")) {
            throw new BusinessValidationException("Invalid or missing filedata in request");
        }

        int semicolonIdx = request.getFiledata().indexOf(';');
        int commaIdx = request.getFiledata().indexOf(',');
        String mimeType = request.getFiledata().substring(5, semicolonIdx);
        byte[] fileBytes = Base64.getDecoder().decode(request.getFiledata().substring(commaIdx + 1));

        LocalDateTime createdOn = null;
        if (request.getCreatedOn() != null) {
            createdOn = OffsetDateTime.parse(request.getCreatedOn()).toLocalDateTime();
        }

        FileIngestionEntry entry = new FileIngestionEntry();
        entry.setSourceFileId(request.getSourceFileId());
        entry.setProvider_id(request.getProvider_id());
        entry.setOfferingName(request.getOfferingTitle());
        entry.setOriginalFileName(request.getFileName());
        entry.setMimeType(mimeType);
        entry.setFileSize((long) fileBytes.length);
        entry.setDataspaceFileCreationDate(createdOn);
        entry.setStatus(EntryStatus.NEW);
        entry.setEntryCreationTimestamp(LocalDateTime.now());

        FileIngestionEntry saved = fileIngestionEntryRepository.save(entry);

        try {
            Path directory = Paths.get(newPath(), saved.getEntryId());
            Files.createDirectories(directory);
            Path filePath = directory.resolve(/*"original_" +*/  request.getFileName());
            Files.write(filePath, fileBytes);
            saved.setLocalArchivePath(filePath.toString());
            saved = fileIngestionEntryRepository.save(saved);
        } catch (IOException e) {
            log.error("ingestFromDataspace: failed to save file for entryId={}", saved.getEntryId(), e);
            recordError(saved.getEntryId(), "Failed to save original file: " + e.getMessage(), "SYSTEM", "DATASPACE_SYNC");
            throw new BusinessValidationException("Failed to save original file: " + e.getMessage());
        }

        StatusHistoryItem historyItem = new StatusHistoryItem();
        historyItem.setHistoryItemId(UUID.randomUUID().toString());
        historyItem.setFileIngestionEntry(saved);
        historyItem.setPreviousStatus(null);
        historyItem.setNewStatus(EntryStatus.NEW);
        historyItem.setStatusMessage("Entry successfully downloaded from dataspace and registered");
        historyItem.setChangedBy("scheduler");
        historyItem.setChangeSource("SyncDataspaceEntries");
        historyItem.setTimestamp(LocalDateTime.now());
        statusHistoryItemRepository.save(historyItem);

        log.info("ingestFromDataspace: created entryId={} for offeringId={}", saved.getEntryId(), request.getId());
        return saved;
    }

    //File Managing section

    public FileIngestionEntry saveTranslatedFile(
            String entryId,
            MultipartFile translatedFile,
            String changedBy,
            String source) {

        log.debug("saveTranslatedFile: entryId={}, fileName={}",
                entryId, translatedFile.getOriginalFilename());

        FileIngestionEntry entry = findById(entryId);

        if (entry.getStatus() != EntryStatus.NEW) {
            throw new BusinessValidationException(
                    "Cannot submit translated file for entry in status: " + entry.getStatus());
        }

        try {
            String translatedPath = saveFile(entryId, translatedFile, "translated");
            entry.setTranslatedFilePath(translatedPath);
            entry.setTranslationTimestamp(LocalDateTime.now());

            return updateStatus(entryId, EntryStatus.TRANSLATED,
                    "Translated file submitted: " + translatedFile.getOriginalFilename(),
                    changedBy, source);

        } catch (IOException e) {
            log.error("saveTranslatedFile: failed to save file for entryId={}", entryId, e);

            recordError(entryId, "Failed to save translated file: " + e.getMessage(),
                    changedBy, source);

            throw new BusinessValidationException("Failed to save translated file");
        }
    }

    private String saveFile(String entryId, MultipartFile file, String type) throws IOException {
        Path directory = Paths.get(newPath(), entryId);
        Files.createDirectories(directory);

        String fileName = /*type + "_" +*/ file.getOriginalFilename();
        Path filePath = directory.resolve(fileName);

        Files.copy(file.getInputStream(), filePath, StandardCopyOption.REPLACE_EXISTING);

        log.debug("saveFile: saved file to {}", filePath);
        return filePath.toString();
    }

    private void deleteFile(String filePath) throws IOException {
        Path path = Paths.get(filePath);
        if (Files.exists(path)) {
            Files.delete(path);
            log.debug("deleteFile: deleted {}", filePath);
        }
    }

    public Optional<FileIngestionEntry> findBySourceFileId(String sourceFileId) {
        log.debug("findBySourceFileId: sourceFileId={}", sourceFileId);
        return fileIngestionEntryRepository.findBySourceFileId(sourceFileId);
    }

    public FileIngestionEntry createErrorEntry(ErrorEntryRequest request) {
        FileIngestionEntry entry = new FileIngestionEntry();
        entry.setSourceFileId(request.getSourceFileId());
        entry.setOfferingName(request.getOfferingName());
        entry.setOriginalFileName(request.getFileName());
        entry.setProvider_id(request.getProviderId() != null ? request.getProviderId() : "");
        entry.setStatus(EntryStatus.ERROR);
        entry.setStatusMessage(request.getErrorMessage());
        entry.setEntryCreationTimestamp(LocalDateTime.now());

        FileIngestionEntry saved = fileIngestionEntryRepository.save(entry);

        StatusHistoryItem historyItem = new StatusHistoryItem();
        historyItem.setHistoryItemId(UUID.randomUUID().toString());
        historyItem.setFileIngestionEntry(saved);
        historyItem.setPreviousStatus(null);
        historyItem.setNewStatus(EntryStatus.ERROR);
        historyItem.setStatusMessage(request.getErrorMessage());
        historyItem.setChangedBy("scheduler");
        historyItem.setChangeSource("SyncDataspaceEntries");
        historyItem.setTimestamp(LocalDateTime.now());
        statusHistoryItemRepository.save(historyItem);

        log.info("createErrorEntry: created entryId={} for sourceFileId={}", saved.getEntryId(), request.getSourceFileId());
        return saved;
    }

    // StatusHistoryItem section

    public List<StatusHistoryItem> getStatusHistoryByEntryId(String entryId) {
        log.debug("getStatusHistoryByEntryId: entryId={}", entryId);
        findById(entryId);
        return statusHistoryItemRepository.findByFileIngestionEntry_EntryId(entryId);
    }



}
