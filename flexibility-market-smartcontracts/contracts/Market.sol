// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./MarketSession.sol";
import "./interfaces/IMarket.sol";
import "./interfaces/IParticipantRegistry.sol";

contract Market is Ownable, IMarket {
    string public communityId;
    string public region;
    address public factory;
    bool public isActive;

    IParticipantRegistry public participantRegistry;
    
    struct SessionInfo {
        address sessionAddress;
        uint256 deliveryDay; // timestamp del día de entrega
        uint256 createdAt;
        IMarket.SessionStatus status;
    }
        
    mapping(uint256 => SessionInfo) public sessions;
    uint256 public sessionCount;
    
    event SessionCreated(
        uint256 indexed sessionId,
        address indexed sessionAddress,
        uint256 deliveryDay,
        address indexed admin
    );
    event SessionStatusChanged(uint256 indexed sessionId, IMarket.SessionStatus newStatus);
    event MarketDeactivated();
    event MarketReactivated();
    
    modifier onlyActive() {
        require(isActive, "Market is not active");
        _;
    }
    
    modifier onlyFactory() {
        require(msg.sender == factory, "Only factory can call");
        _;
    }
    
    constructor(
        address _owner,
        string memory _communityId,
        string memory _region,
        address _factory
    ) Ownable(_owner) {
        communityId = _communityId;
        region = _region;
        factory = _factory;
        isActive = true;
    }
    
    /**
     * @notice Create a new market session with flexibility requests atomically
     * @param _deliveryDay Timestamp of the delivery day
     * @param _treasury Treasury contract address
     * @param _fmoLmo FMO/LMO address for this session (neutral market operator)
     * @param _frp FRP address that requested flexibility
     * @param _requests Array of flexibility requests for the day (hourly slots 0-23)
     */
    function createSession(
        uint256 _deliveryDay,
        address _treasury,
        address _fmoLmo,
        address _frp,
        MarketSession.FlexibilityRequestInput[] memory _requests
    ) external onlyOwner onlyActive returns (uint256) {
        require(_deliveryDay > block.timestamp, "Delivery day must be in the future");
        require(_deliveryDay > block.timestamp + 1 days, "Must create at least D-1");
        require(_fmoLmo != address(0), "Invalid FMO/LMO address");
        require(_frp != address(0), "Invalid FRP address");

        // Validate participants are qualified if registry is set
        if (address(participantRegistry) != address(0)) {
            require(
                participantRegistry.hasRole(_fmoLmo, IParticipantRegistry.ParticipantType.FMO_LMO),
                "FMO/LMO not qualified"
            );
            require(
                participantRegistry.hasRole(_frp, IParticipantRegistry.ParticipantType.FRP),
                "FRP not qualified"
            );
        }

        sessionCount++;

        MarketSession newSession = new MarketSession(
            sessionCount,
            _deliveryDay,
            address(this),
            _treasury,
            msg.sender,      // admin
            _fmoLmo,         // FMO/LMO - neutral market operator
            _frp,            // FRP
            _requests        // Flexibility requests array
        );

        sessions[sessionCount] = SessionInfo({
            sessionAddress: address(newSession),
            deliveryDay: _deliveryDay,
            createdAt: block.timestamp,
            status: IMarket.SessionStatus.CREATED
        });
        
        emit SessionCreated(sessionCount, address(newSession), _deliveryDay, msg.sender);
        return sessionCount;
    }
    
    function updateSessionStatus(uint256 _sessionId, IMarket.SessionStatus _newStatus) external override {
        require(msg.sender == sessions[_sessionId].sessionAddress, "Only session can update");
        sessions[_sessionId].status = _newStatus;
        emit SessionStatusChanged(_sessionId, _newStatus);
    }
    
    function deactivate() external onlyFactory {
        isActive = false;
        emit MarketDeactivated();
    }
    
    function reactivate() external onlyFactory {
        isActive = true;
        emit MarketReactivated();
    }
    
    function getSession(uint256 _sessionId) external view returns (SessionInfo memory) {
        return sessions[_sessionId];
    }

    /**
     * @notice Set the participant registry
     * @param _registry Address of ParticipantRegistry contract
     */
    function setParticipantRegistry(address _registry) external onlyOwner {
        require(_registry != address(0), "Invalid registry address");
        participantRegistry = IParticipantRegistry(_registry);
    }
}
