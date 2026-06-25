// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

interface IMarket {
     enum SessionStatus {
        CREATED,
        OFFERS_OPEN,
        IN_DELIVERY,
        SETTLEMENT_PENDING,
        SETTLED,
        CANCELLED
    }
    function updateSessionStatus(uint256 sessionId, SessionStatus status) external;

}