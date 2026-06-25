// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract DisputeResolution is AccessControl {
    bytes32 public constant ARBITRATOR_ROLE = keccak256("ARBITRATOR_ROLE");
    
    enum DisputeStatus { OPEN, UNDER_REVIEW, RESOLVED, REJECTED }
    enum DisputeType { MEASUREMENT, SETTLEMENT, PAYMENT, OTHER }
    
    struct Dispute {
        uint256 disputeId;
        uint256 sessionId;
        uint256 offerId;
        address initiator;
        DisputeType disputeType;
        string description;
        string evidenceHash;
        DisputeStatus status;
        uint256 createdAt;
        uint256 resolvedAt;
        string resolution;
    }
    
    mapping(uint256 => Dispute) public disputes;
    uint256 public disputeCount;
    
    uint256 public constant CHALLENGE_PERIOD = 7 days;
    
    event DisputeOpened(
        uint256 indexed disputeId,
        address indexed initiator,
        uint256 sessionId,
        uint256 offerId
    );
    event DisputeUnderReview(uint256 indexed disputeId, address indexed arbitrator);
    event DisputeResolved(uint256 indexed disputeId, string resolution);
    event DisputeRejected(uint256 indexed disputeId, string reason);
    event EvidenceSubmitted(uint256 indexed disputeId, string evidenceHash);
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ARBITRATOR_ROLE, msg.sender);
    }
    
    function openDispute(
        uint256 _sessionId,
        uint256 _offerId,
        DisputeType _disputeType,
        string memory _description,
        string memory _evidenceHash
    ) external returns (uint256) {
        disputeCount++;
        
        disputes[disputeCount] = Dispute({
            disputeId: disputeCount,
            sessionId: _sessionId,
            offerId: _offerId,
            initiator: msg.sender,
            disputeType: _disputeType,
            description: _description,
            evidenceHash: _evidenceHash,
            status: DisputeStatus.OPEN,
            createdAt: block.timestamp,
            resolvedAt: 0,
            resolution: ""
        });
        
        emit DisputeOpened(disputeCount, msg.sender, _sessionId, _offerId);
        return disputeCount;
    }
    
    function submitEvidence(uint256 _disputeId, string memory _evidenceHash) external {
        require(
            disputes[_disputeId].initiator == msg.sender,
            "Only initiator can submit evidence"
        );
        require(disputes[_disputeId].status == DisputeStatus.OPEN, "Dispute not open");
        
        disputes[_disputeId].evidenceHash = _evidenceHash;
        emit EvidenceSubmitted(_disputeId, _evidenceHash);
    }
    
    function startReview(uint256 _disputeId) external onlyRole(ARBITRATOR_ROLE) {
        require(disputes[_disputeId].status == DisputeStatus.OPEN, "Dispute not open");
        disputes[_disputeId].status = DisputeStatus.UNDER_REVIEW;
        emit DisputeUnderReview(_disputeId, msg.sender);
    }
    
    function resolveDispute(uint256 _disputeId, string memory _resolution)
        external
        onlyRole(ARBITRATOR_ROLE)
    {
        require(
            disputes[_disputeId].status == DisputeStatus.UNDER_REVIEW,
            "Not under review"
        );
        
        disputes[_disputeId].status = DisputeStatus.RESOLVED;
        disputes[_disputeId].resolution = _resolution;
        disputes[_disputeId].resolvedAt = block.timestamp;
        
        emit DisputeResolved(_disputeId, _resolution);
    }
    
    function rejectDispute(uint256 _disputeId, string memory _reason)
        external
        onlyRole(ARBITRATOR_ROLE)
    {
        require(
            disputes[_disputeId].status == DisputeStatus.UNDER_REVIEW,
            "Not under review"
        );
        
        disputes[_disputeId].status = DisputeStatus.REJECTED;
        disputes[_disputeId].resolution = _reason;
        disputes[_disputeId].resolvedAt = block.timestamp;
        
        emit DisputeRejected(_disputeId, _reason);
    }
    
    function getDispute(uint256 _disputeId) external view returns (Dispute memory) {
        return disputes[_disputeId];
    }
    
    function isWithinChallengePeriod(uint256 _settlementTimestamp)
        external
        view
        returns (bool)
    {
        return block.timestamp <= _settlementTimestamp + CHALLENGE_PERIOD;
    }
}