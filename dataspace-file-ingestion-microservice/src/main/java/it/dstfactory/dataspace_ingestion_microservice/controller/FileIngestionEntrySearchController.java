package it.dstfactory.dataspace_ingestion_microservice.controller;

import it.dstfactory.dataspace_ingestion_microservice.entities.FileIngestionEntry;
import it.dstfactory.dataspace_ingestion_microservice.repository.FileIngestionEntryRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.web.PagedResourcesAssembler;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.hateoas.EntityModel;
import org.springframework.hateoas.PagedModel;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/file-ingestion-entries/search")
public class FileIngestionEntrySearchController {

    private final FileIngestionEntryRepository repository;
    private final PagedResourcesAssembler<FileIngestionEntry> assembler;

    public FileIngestionEntrySearchController(
            FileIngestionEntryRepository repository,
            PagedResourcesAssembler<FileIngestionEntry> assembler) {
        this.repository = repository;
        this.assembler = assembler;
    }

    @GetMapping("/findByFilters")
    public ResponseEntity<PagedModel<EntityModel<FileIngestionEntry>>> findByFilters(
            @RequestParam(required = false) String originalFileName,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime entryCreationTimestampFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime entryCreationTimestampTo,
            @RequestParam(required = false) String sortField,
            @RequestParam(required = false) String sortDirection,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        Page<FileIngestionEntry> result = repository.findByFiltersWithSort(
                originalFileName, status,
                entryCreationTimestampFrom, entryCreationTimestampTo,
                sortField,   // null when not provided
                sortDirection,
                PageRequest.of(page, size)
        );

        return ResponseEntity.ok(assembler.toModel(result));
    }
}