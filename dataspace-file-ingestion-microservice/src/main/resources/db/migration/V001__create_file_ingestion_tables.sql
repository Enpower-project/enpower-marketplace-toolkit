
CREATE TABLE file_ingestion_entry (
    entry_id VARCHAR(255) PRIMARY KEY,
    provider_id VARCHAR(255),
    offering_id VARCHAR(255),
    offering_name VARCHAR(255),
    source_file_id VARCHAR(255),
    original_filename VARCHAR(500),
    file_hash VARCHAR(255),
    file_format_type VARCHAR(50),
    mime_type VARCHAR(100),
    file_size BIGINT,
    dataspace_file_creation_date TIMESTAMP,
    local_archive_path VARCHAR(1000),
    translated_file_path VARCHAR(1000),
    status VARCHAR(50) NOT NULL,
    status_message TEXT,
    entry_creation_timestamp TIMESTAMP NOT NULL,
    translation_timestamp TIMESTAMP,
    synchronization_timestamp TIMESTAMP
);

CREATE TABLE status_history_item (
    history_item_id VARCHAR(255) PRIMARY KEY,
    entry_id VARCHAR(255) NOT NULL,
    previous_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    status_message TEXT,
    changed_by VARCHAR(255),
    change_source VARCHAR(255),
    CONSTRAINT fk_entry FOREIGN KEY (entry_id)
        REFERENCES file_ingestion_entry(entry_id)
);

CREATE TABLE fsp_dataspace_mapping (
    id BIGSERIAL PRIMARY KEY,
    provider_id VARCHAR(255) NOT NULL,
    marketplace_fsp_id VARCHAR(255),
    marketplace_market_id VARCHAR(255),
    file_pattern VARCHAR(255)
);


CREATE INDEX idx_file_ingestion_entry_status ON file_ingestion_entry(status);
CREATE INDEX idx_file_ingestion_entry_offering ON file_ingestion_entry(offering_id);
CREATE INDEX idx_status_history_entry ON status_history_item(entry_id);
CREATE INDEX idx_fsp_dataspace_mapping_provider_id ON fsp_dataspace_mapping(provider_id);