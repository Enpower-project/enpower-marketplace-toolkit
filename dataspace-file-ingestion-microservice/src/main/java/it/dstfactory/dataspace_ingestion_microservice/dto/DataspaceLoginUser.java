package it.dstfactory.dataspace_ingestion_microservice.dto;

import lombok.Data;

@Data
public class DataspaceLoginUser {
    String id;
    String username;
    String email;
}
