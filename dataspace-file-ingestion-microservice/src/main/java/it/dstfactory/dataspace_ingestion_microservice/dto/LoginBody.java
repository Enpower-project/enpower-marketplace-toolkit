package it.dstfactory.dataspace_ingestion_microservice.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class LoginBody {
    String username;
    String password;
}
