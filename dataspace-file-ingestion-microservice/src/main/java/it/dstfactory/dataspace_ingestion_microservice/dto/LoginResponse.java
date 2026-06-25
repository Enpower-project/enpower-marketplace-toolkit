package it.dstfactory.dataspace_ingestion_microservice.dto;

import lombok.Data;

@Data
public class LoginResponse {
        String accessToken;
        DataspaceLoginUser user;
}
