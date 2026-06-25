// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title FlexibilityNFT
 * @notice NFT contract for flexibility offers with complete lifecycle tracking
 * @dev Implements ERC1155 with lifecycle: FSP (initial owner) → FRP (final owner after settlement)
 * @dev FMO/LMO is recorded in metadata as program manager but does NOT own the NFT
 * @dev Roles aligned with Section_3_Complete_Proposed_Integration.md
 */
contract FlexibilityNFT is ERC1155, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");

    enum NFTStatus {
        SUBMITTED,
        ACCEPTED,
        REJECTED,
        DELIVERED,
        FINALIZED
    }

    struct NFTMetadata {
        uint256 tokenId;
        uint256 sessionId;
        address sessionContract;           // MarketSession contract address (unique per session)
        uint256 offerId;
        uint8 hourSlot;                    // Hour slot (0-23) of the flexibility request
        address fsp;                       // Flexibility Service Provider (initial owner)
        uint256 offeredQuantity;
        uint256 price;                     // Price per kWh
        uint256 creationTimestamp;
        uint256 collateralAmount;         // 5% collateral deposited
        address fmoLmo;                    // FMO/LMO - neutral market operator managing the program
        uint256 acceptedQuantity;
        uint256 matchingTimestamp;
        uint256 deliveredQuantity;
        uint256 settlementTimestamp;
        bytes32 meterReadingsHash;
        address finalBuyer;                // FRP address (final owner after settlement)
        uint256 actualPayment;
        NFTStatus status;
        string metadataURI;
    }

    // PRIVATE mapping to avoid auto-generated getter causing stack too deep
    mapping(uint256 => NFTMetadata) private _nftMetadata;
    mapping(uint256 => bool) public isSoulbound;
    uint256 public tokenIdCounter;

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
    event NFTFinalized(uint256 indexed tokenId, uint256 offerId);
    event SoulboundStatusChanged(uint256 indexed tokenId, bool isSoulbound);

    constructor() ERC1155("") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(UPDATER_ROLE, msg.sender);
    }

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
    ) external onlyRole(MINTER_ROLE) returns (uint256) {
        tokenIdCounter++;
        uint256 newTokenId = tokenIdCounter;
        _mint(_fsp, newTokenId, 1, "");

        NFTMetadata storage m = _nftMetadata[newTokenId];
        m.tokenId = newTokenId;
        m.sessionId = _sessionId;
        m.sessionContract = _sessionContract;
        m.offerId = _offerId;
        m.hourSlot = _hourSlot;
        m.fsp = _fsp;
        m.offeredQuantity = _quantity;
        m.price = _price;
        m.creationTimestamp = _timestamp;
        m.collateralAmount = _collateralAmount;
        m.status = NFTStatus.SUBMITTED;

        emit NFTMinted(newTokenId, _fsp, _sessionId, _offerId, _quantity, _collateralAmount);
        return newTokenId;
    }

    function updateAfterMatching(
        uint256 _tokenId,
        address _fmoLmo,
        uint256 _acceptedQuantity,
        uint256 _matchingTimestamp
    ) external onlyRole(UPDATER_ROLE) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        require(!isSoulbound[_tokenId], "Token is soulbound");

        NFTMetadata storage m = _nftMetadata[_tokenId];
        m.fmoLmo = _fmoLmo;
        m.acceptedQuantity = _acceptedQuantity;
        m.matchingTimestamp = _matchingTimestamp;
        m.status = NFTStatus.ACCEPTED;

        emit NFTStatusUpdated(_tokenId, NFTStatus.ACCEPTED);
    }

    function updateAfterSettlement(
        uint256 _tokenId,
        uint256 _deliveredQuantity,
        uint256 _settlementTimestamp,
        bytes32 _meterReadingsHash,
        address _finalBuyer,
        uint256 _actualPayment
    ) external onlyRole(UPDATER_ROLE) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        require(!isSoulbound[_tokenId], "Token is soulbound");
        
        NFTMetadata storage m = _nftMetadata[_tokenId];
        m.deliveredQuantity = _deliveredQuantity;
        m.settlementTimestamp = _settlementTimestamp;
        m.meterReadingsHash = _meterReadingsHash;
        m.finalBuyer = _finalBuyer;
        m.actualPayment = _actualPayment;
        m.status = NFTStatus.DELIVERED;
        
        emit NFTStatusUpdated(_tokenId, NFTStatus.DELIVERED);
    }

    function finalizeNFT(uint256 _tokenId) external onlyRole(UPDATER_ROLE) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        require(!isSoulbound[_tokenId], "Already soulbound");
        
        NFTMetadata storage metadata = _nftMetadata[_tokenId];
        metadata.status = NFTStatus.FINALIZED;
        isSoulbound[_tokenId] = true;
        
        emit NFTFinalized(_tokenId, metadata.offerId);
        emit SoulboundStatusChanged(_tokenId, true);
    }

    function updateStatus(uint256 _tokenId, NFTStatus _newStatus) external onlyRole(UPDATER_ROLE) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        _nftMetadata[_tokenId].status = _newStatus;
        emit NFTStatusUpdated(_tokenId, _newStatus);
    }

    function updateMetadataURI(uint256 _tokenId, string memory _metadataURI) external onlyRole(UPDATER_ROLE) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        _nftMetadata[_tokenId].metadataURI = _metadataURI;
        emit NFTMetadataUpdated(_tokenId, _metadataURI);
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public virtual override {
        require(!isSoulbound[id], "Token is soulbound and cannot be transferred");
        super.safeTransferFrom(from, to, id, amount, data);
    }

    function uri(uint256 _tokenId) public view override returns (string memory) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].metadataURI;
    }

    // Simple individual getters
    function getTokenId(uint256 _tokenId) external view returns (uint256) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].tokenId;
    }
    
    function getSessionId(uint256 _tokenId) external view returns (uint256) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].sessionId;
    }

    function getSessionContract(uint256 _tokenId) external view returns (address) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].sessionContract;
    }
    
    function getOfferId(uint256 _tokenId) external view returns (uint256) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].offerId;
    }
    
    function getHourSlot(uint256 _tokenId) external view returns (uint8) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].hourSlot;
    }
    
    function getFsp(uint256 _tokenId) external view returns (address) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].fsp;
    }
    
    function getOfferedQuantity(uint256 _tokenId) external view returns (uint256) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].offeredQuantity;
    }
    
    function getPrice(uint256 _tokenId) external view returns (uint256) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].price;
    }
    
    function getCreationTimestamp(uint256 _tokenId) external view returns (uint256) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].creationTimestamp;
    }
    
    function getCollateralAmount(uint256 _tokenId) external view returns (uint256) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].collateralAmount;
    }
    
    function getFmoLmo(uint256 _tokenId) external view returns (address) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].fmoLmo;
    }
    
    function getAcceptedQuantity(uint256 _tokenId) external view returns (uint256) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].acceptedQuantity;
    }
    
    function getMatchingTimestamp(uint256 _tokenId) external view returns (uint256) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].matchingTimestamp;
    }
    
    function getDeliveredQuantity(uint256 _tokenId) external view returns (uint256) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].deliveredQuantity;
    }
    
    function getSettlementTimestamp(uint256 _tokenId) external view returns (uint256) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].settlementTimestamp;
    }
    
    function getMeterReadingsHash(uint256 _tokenId) external view returns (bytes32) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].meterReadingsHash;
    }
    
    function getFinalBuyer(uint256 _tokenId) external view returns (address) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].finalBuyer;
    }
    
    function getActualPayment(uint256 _tokenId) external view returns (uint256) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].actualPayment;
    }
    
    function getStatus(uint256 _tokenId) external view returns (NFTStatus) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].status;
    }
    
    function getMetadataURI(uint256 _tokenId) external view returns (string memory) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId].metadataURI;
    }
    
    function getIsSoulbound(uint256 _tokenId) external view returns (bool) {
        require(_tokenId <= tokenIdCounter, "Token does not exist");
        return isSoulbound[_tokenId];
    }

    /**
     * @notice Get full metadata for a single NFT
     */
    function getNFTMetadata(uint256 _tokenId) external view returns (NFTMetadata memory) {
        require(_tokenId > 0 && _tokenId <= tokenIdCounter, "Token does not exist");
        return _nftMetadata[_tokenId];
    }

    /**
     * @notice Get all NFTs created in this contract
     */
    function getAllNFTs() external view returns (NFTMetadata[] memory) {
        uint256 total = tokenIdCounter;
        NFTMetadata[] memory result = new NFTMetadata[](total);
        for (uint256 i = 1; i <= total; i++) {
            result[i - 1] = _nftMetadata[i];
        }
        return result;
    }

    /**
     * @notice Get all NFTs belonging to a specific session contract
     * @param _sessionContract Address of the MarketSession contract (unique per session)
     */
    function getNFTsBySessionContract(address _sessionContract) external view returns (NFTMetadata[] memory) {
        uint256 total = tokenIdCounter;

        // First pass: count matches
        uint256 count = 0;
        for (uint256 i = 1; i <= total; i++) {
            if (_nftMetadata[i].sessionContract == _sessionContract) {
                count++;
            }
        }

        // Second pass: populate array
        NFTMetadata[] memory result = new NFTMetadata[](count);
        uint256 idx = 0;
        for (uint256 i = 1; i <= total; i++) {
            if (_nftMetadata[i].sessionContract == _sessionContract) {
                result[idx] = _nftMetadata[i];
                idx++;
            }
        }
        return result;
    }

    /**
     * @notice Get all NFTs owned by a specific address
     */
    function getNFTsByOwner(address _owner) external view returns (NFTMetadata[] memory) {
        uint256 total = tokenIdCounter;

        // First pass: count matches
        uint256 count = 0;
        for (uint256 i = 1; i <= total; i++) {
            if (balanceOf(_owner, i) > 0) {
                count++;
            }
        }

        // Second pass: populate array
        NFTMetadata[] memory result = new NFTMetadata[](count);
        uint256 idx = 0;
        for (uint256 i = 1; i <= total; i++) {
            if (balanceOf(_owner, i) > 0) {
                result[idx] = _nftMetadata[i];
                idx++;
            }
        }
        return result;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
