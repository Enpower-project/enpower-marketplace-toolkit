// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IFlexibilityNFT
 * @notice Interface for FlexibilityNFT with complete lifecycle support
 */
interface IFlexibilityNFT {
    
    enum NFTStatus {
        SUBMITTED,
        ACCEPTED,
        REJECTED,
        DELIVERED,
        FINALIZED
    }
    
    struct NFTMetadata {
        // Phase 1: Creation
        uint256 tokenId;
        uint256 sessionId;
        address sessionContract;  // MarketSession contract address (unique per session)
        uint256 offerId;
        uint8 hourSlot;  // Hour slot (0-23) of the flexibility request
        address fsp;  // Flexibility Service Provider (initial owner)
        uint256 offeredQuantity;
        uint256 price;  // Price per kWh
        uint256 creationTimestamp;
        uint256 collateralAmount;
        // Phase 2: Matching
        address fmoLmo;  // FMO/LMO - neutral market operator managing the program
        uint256 acceptedQuantity;
        uint256 matchingTimestamp;
        // Phase 3: Settlement
        uint256 deliveredQuantity;
        uint256 settlementTimestamp;
        bytes32 meterReadingsHash;
        address finalBuyer;  // FRP address (final owner after settlement)
        uint256 actualPayment;
        // Status
        NFTStatus status;
        bool isSoulbound;
        string metadataURI;
    }

    // Minting
    function mint(
        address _fsp,
        uint256 _sessionId,
        address _sessionContract,
        uint256 _offerId,
        uint8 _hourSlot,  // Hour slot (0-23) of the flexibility request
        uint256 _quantity,
        uint256 _price,
        uint256 _timestamp,
        uint256 _collateralAmount
    ) external returns (uint256);

    // Lifecycle updates
    function updateAfterMatching(
        uint256 _tokenId,
        address _fmoLmo,
        uint256 _acceptedQuantity,
        uint256 _matchingTimestamp
    ) external;
    
    function updateAfterSettlement(
        uint256 _tokenId,
        uint256 _deliveredQuantity,
        uint256 _settlementTimestamp,
        bytes32 _meterReadingsHash,
        address _finalBuyer,
        uint256 _actualPayment
    ) external;
    
    function finalizeNFT(uint256 _tokenId) external;
    
    // Status management
    function updateStatus(uint256 _tokenId, NFTStatus _newStatus) external;
    
    function updateMetadataURI(uint256 _tokenId, string memory _metadataURI) external;
    
    // Transfer
    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external;
    
    // View functions
    function getIsSoulbound(uint256 _tokenId) external view returns (bool);
    
    function uri(uint256 _tokenId) external view returns (string memory);
    
    // Events
    event NFTMinted(
        uint256 indexed tokenId,
        address indexed fsp,
        uint256 sessionId,
        uint256 offerId,
        uint256 quantity,
        uint256 collateralAmount
    );

    event NFTStatusUpdated(uint256 indexed tokenId, NFTStatus newStatus);

    event NFTMetadataUpdated(uint256 indexed tokenId, string metadataURI);

    event NFTTransferredToFmoLmo(
        uint256 indexed tokenId,
        address indexed fmoLmo,
        uint256 timestamp
    );
    
    event NFTTransferredToBuyer(
        uint256 indexed tokenId,
        address indexed buyer,
        uint256 deliveredQuantity,
        uint256 timestamp
    );
    
    event NFTFinalized(uint256 indexed tokenId, uint256 offerId);
    
    event SoulboundStatusChanged(uint256 indexed tokenId, bool isSoulbound);
}
