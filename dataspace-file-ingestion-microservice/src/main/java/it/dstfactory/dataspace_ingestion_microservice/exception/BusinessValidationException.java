package it.dstfactory.dataspace_ingestion_microservice.exception;

public class BusinessValidationException extends RuntimeException{
    public BusinessValidationException(String message) {
        super(message);
    }
}
