// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./Market.sol";
import "./ParticipantRegistry.sol";

contract MarketFactory is AccessControl {
    bytes32 public constant MARKETPLACE_ADMIN = keccak256("MARKETPLACE_ADMIN");

    // Reference to ParticipantRegistry for role validation
    ParticipantRegistry public participantRegistry;

    struct MarketInfo {
        address marketAddress;
        string communityId;
        string region;
        address owner;
        bool isActive;
        uint256 createdAt;
    }

    mapping(uint256 => MarketInfo) public markets;
    uint256 public marketCount;

    event MarketCreated(uint256 indexed marketId, address indexed marketAddress, address indexed owner);
    event MarketDeactivated(uint256 indexed marketId);
    event MarketReactivated(uint256 indexed marketId);

    constructor(address _participantRegistryAddress) {
        require(_participantRegistryAddress != address(0), "Invalid ParticipantRegistry address");
        participantRegistry = ParticipantRegistry(_participantRegistryAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MARKETPLACE_ADMIN, msg.sender);
    }

    /**
     * @dev Modifier to check if caller is either MARKETPLACE_ADMIN or qualified FMO_LMO participant
     */
    modifier onlyFMOorAdmin() {
        bool isAdmin = hasRole(MARKETPLACE_ADMIN, msg.sender);
        bool isFMO = participantRegistry.isQualified(msg.sender) &&
                     participantRegistry.getParticipantType(msg.sender) == ParticipantRegistry.ParticipantType.FMO_LMO;

        require(isAdmin || isFMO, "MarketFactory: caller must be MARKETPLACE_ADMIN or qualified FMO_LMO");
        _;
    }
    
    function createMarket(
        string memory _communityId,
        string memory _region,
        address _owner
    ) external onlyFMOorAdmin returns (uint256) {
        marketCount++;
        
        Market newMarket = new Market(_owner, _communityId, _region, address(this));
        
        markets[marketCount] = MarketInfo({
            marketAddress: address(newMarket),
            communityId: _communityId,
            region: _region,
            owner: _owner,
            isActive: true,
            createdAt: block.timestamp
        });
        
        emit MarketCreated(marketCount, address(newMarket), _owner);
        return marketCount;
    }
    
    function deactivateMarket(uint256 _marketId) external onlyRole(MARKETPLACE_ADMIN) {
        require(markets[_marketId].isActive, "Market already inactive");
        
        Market market = Market(markets[_marketId].marketAddress);
        market.deactivate();
        
        markets[_marketId].isActive = false;
        emit MarketDeactivated(_marketId);
    }
    
    function reactivateMarket(uint256 _marketId) external onlyRole(MARKETPLACE_ADMIN) {
        require(!markets[_marketId].isActive, "Market already active");
        
        Market market = Market(markets[_marketId].marketAddress);
        market.reactivate();
        
        markets[_marketId].isActive = true;
        emit MarketReactivated(_marketId);
    }
    
    function getMarket(uint256 _marketId) external view returns (MarketInfo memory) {
        return markets[_marketId];
    }
}