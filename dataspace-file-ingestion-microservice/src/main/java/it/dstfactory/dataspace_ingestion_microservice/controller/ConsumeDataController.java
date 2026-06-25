package it.dstfactory.dataspace_ingestion_microservice.controller;

import it.dstfactory.dataspace_ingestion_microservice.dto.ConsumeData;
import it.dstfactory.dataspace_ingestion_microservice.service.ConsumeDataService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/consume-data")
@RequiredArgsConstructor
@Slf4j
public class ConsumeDataController {
    private final ConsumeDataService consumeDataService;


    @GetMapping("/list")
    public ResponseEntity<List<ConsumeData>> getAllConsumeData(
            @RequestParam(required = false) String username) {
        List<ConsumeData> data = consumeDataService.getAllConsumeData(username);
        return ResponseEntity.ok(data);
    }

    @GetMapping("/by-id")
    public ResponseEntity<String> getById(@RequestParam String id, @RequestParam(required = false) String username) {
        String data = consumeDataService.getConsumeDataById(id,username);
        return ResponseEntity.ok(data);
    }

}
