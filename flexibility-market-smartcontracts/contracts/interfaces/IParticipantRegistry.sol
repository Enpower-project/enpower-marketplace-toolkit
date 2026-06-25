// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IParticipantRegistry {
    enum ParticipantType {
        NONE,
        MARKETPLACE_ADMIN,
        FMO_LMO,
        FRP,
        FSP
    }

    enum QualificationStatus {
        PENDING,
        QUALIFIED,
        SUSPENDED,
        REVOKED
    }

    struct Participant {
        address participantAddress;
        ParticipantType pType;
        QualificationStatus status;
        string name;
        string region;
        uint256 registeredAt;
        uint256 qualifiedAt;
    }

    function getParticipant(address _address) external view returns (Participant memory);
    function isQualified(address _address) external view returns (bool);
    function getParticipantType(address _address) external view returns (ParticipantType);
    function hasRole(address _address, ParticipantType _type) external view returns (bool);
}
