package it.dstfactory.dataspace_ingestion_microservice.entities;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "fsp_dataspace_mapping")
@Getter
@Setter
@NoArgsConstructor
public class FspDataspaceMapping {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "provider_id", nullable = false)
    private String providerId;

    @Column(name = "marketplace_fsp_id")
    private String marketplaceFspId;

    @Column(name = "marketplace_market_id")
    private String marketplaceMarketId;

    /**
     * Filename prefix used to disambiguate which FSP a file belongs to when
     * multiple FSPs share the same Dataspace provider_id (e.g. "P3_" matches
     * "P3_20260528.csv"). Null/blank when the provider_id maps to a single FSP.
     */
    @Column(name = "file_pattern")
    private String filePattern;
}
