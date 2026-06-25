// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITreasury {
    // Collateral and fee management
    function depositCollateralAndFeeForOffer(
        uint256 sessionId,
        uint256 offerId,
        address fsp,
        uint256 collateralAmount,
        uint256 feeAmount
    ) external;

    // FRP payment
    function depositPaymentForSession(uint256 sessionId, uint256 amount) external;

    function refundCollateralForCancelledOffer(uint256 sessionId, uint256 offerId) external;

    // Settlement processing
    function processSettlementPayment(
        uint256 sessionId,
        uint256 offerId,
        address fsp,
        address frp,
        address fmoLmo,
        uint256 payment,
        uint256 platformFee,
        uint256 penaltyAmount,
        uint256 offerCollateralAmount
    ) external;

    // View functions
    function getBalance(address account) external view returns (uint256);
    function getAvailableBalance(address account) external view returns (uint256);
    function getCollateralDeposited(address account) external view returns (uint256);
    function getCollateralLocked(address account) external view returns (uint256);

    // Events
    event CollateralAndFeeDeposited(
        uint256 indexed sessionId,
        uint256 indexed offerId,
        address indexed fsp,
        uint256 collateralAmount,
        uint256 feeAmount
    );
    event SettlementPaymentProcessed(
        uint256 indexed sessionId,
        uint256 indexed offerId,
        address indexed fsp,
        uint256 payment,
        uint256 platformFee,
        uint256 penalty
    );
    event FRPPaymentDeposited(
        uint256 indexed sessionId,
        address indexed frp,
        uint256 amount
    );
}
