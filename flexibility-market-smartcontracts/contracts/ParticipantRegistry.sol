// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract ParticipantRegistry is AccessControl {
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    
    enum ParticipantType {
        NONE,
        MARKETPLACE_ADMIN,      // Platform Administrator - maintains blockchain infrastructure
        FMO_LMO,                // Flexibility Market Operator / Local Market Operator - neutral market coordinator
        FRP,                    // Flexibility Requesting Party (DSO, TSO, or BRP requesting flexibility)
        FSP                     // Flexibility Service Provider - aggregates and provides flexibility to market
    }
    
    enum QualificationStatus { PENDING, QUALIFIED, SUSPENDED, REVOKED }
    
    struct Participant {
        address participantAddress;
        ParticipantType pType;
        QualificationStatus status;
        string credentialsReference; // Hash o referencia de documentos KYC/credenciales
        string region; // Restricción geográfica
        uint256 registrationDate;
        // uint256 collateralRequired;
        bool isActive;
    }
    
    mapping(address => Participant) public participants;
    address[] public participantList;
    
    // Mapping para búsqueda rápida por región
    mapping(string => address[]) public participantsByRegion;
    
    event ParticipantRegistered(address indexed participant, ParticipantType pType, string region);
    event ParticipantQualified(address indexed participant);
    event ParticipantSuspended(address indexed participant, string reason);
    event ParticipantRevoked(address indexed participant, string reason);
    event CredentialsUpdated(address indexed participant, string newCredentialsHash);
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(REGISTRAR_ROLE, msg.sender);
    }
    
    function registerParticipant(
        address _participantAddress,
        ParticipantType _pType,
        string memory _credentialsReference,
        string memory _region
        // uint256 _collateralRequired
    ) external onlyRole(REGISTRAR_ROLE) {
        require(_pType != ParticipantType.NONE, "Invalid participant type");
        require(participants[_participantAddress].pType == ParticipantType.NONE, "Already registered");
        
        participants[_participantAddress] = Participant({
            participantAddress: _participantAddress,
            pType: _pType,
            status: QualificationStatus.PENDING,
            credentialsReference: _credentialsReference,
            region: _region,
            registrationDate: block.timestamp,
            // collateralRequired: _collateralRequired,
            isActive: true
        });
        
        participantList.push(_participantAddress);
        participantsByRegion[_region].push(_participantAddress);
        
        emit ParticipantRegistered(_participantAddress, _pType, _region);
    }
    
    function qualifyParticipant(address _participant) external onlyRole(REGISTRAR_ROLE) {
        require(participants[_participant].pType != ParticipantType.NONE, "Not registered");
        require(participants[_participant].status == QualificationStatus.PENDING, "Not in pending status");
        
        participants[_participant].status = QualificationStatus.QUALIFIED;
        emit ParticipantQualified(_participant);
    }
    
    function suspendParticipant(address _participant, string memory _reason) 
        external 
        onlyRole(REGISTRAR_ROLE) 
    {
        require(participants[_participant].pType != ParticipantType.NONE, "Not registered");
        participants[_participant].status = QualificationStatus.SUSPENDED;
        emit ParticipantSuspended(_participant, _reason);
    }
    
    function revokeParticipant(address _participant, string memory _reason) 
        external 
        onlyRole(REGISTRAR_ROLE) 
    {
        require(participants[_participant].pType != ParticipantType.NONE, "Not registered");
        participants[_participant].status = QualificationStatus.REVOKED;
        participants[_participant].isActive = false;
        emit ParticipantRevoked(_participant, _reason);
    }
    
    function updateCredentials(address _participant, string memory _newCredentialsReference) 
        external 
        onlyRole(REGISTRAR_ROLE) 
    {
        require(participants[_participant].pType != ParticipantType.NONE, "Not registered");
        participants[_participant].credentialsReference = _newCredentialsReference;
        emit CredentialsUpdated(_participant, _newCredentialsReference);
    }
    
    function isQualified(address _participant) external view returns (bool) {
        return participants[_participant].status == QualificationStatus.QUALIFIED 
            && participants[_participant].isActive;
    }
    
    function getParticipant(address _participant) external view returns (Participant memory) {
        return participants[_participant];
    }
    function getParticipantType(address _participant) external view returns (ParticipantType) {
        return participants[_participant].pType;
    }
    
    function getParticipantsByRegion(string memory _region) external view returns (address[] memory) {
        return participantsByRegion[_region];
    }
    
    function getAllParticipants() external view returns (address[] memory) {
        return participantList;
    }

    /**
     * @notice Check if an address has a specific role and is qualified
     * @param _address Address to check
     * @param _type Role type to verify
     * @return bool True if participant has the role and is qualified
     */
    function hasRole(address _address, ParticipantType _type) external view returns (bool) {
        Participant memory p = participants[_address];
        return p.pType == _type && p.status == QualificationStatus.QUALIFIED;
    }
}
