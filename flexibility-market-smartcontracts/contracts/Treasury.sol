// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./FlexibilityToken.sol";

/**
 * @title Treasury
 * @notice Manages collateral and fee deposits from FSPs and settlement payments
 * @dev FSPs deposit 5% collateral + 2% fee when creating offers
 * @dev Fee is held in escrow until settlement execution, then transferred to FMO/LMO
 * @dev On cancellation, both collateral and fee are refunded to FSP
 */
contract Treasury is AccessControl, ReentrancyGuard {
    bytes32 public constant TREASURY_MANAGER = keccak256("TREASURY_MANAGER");
    bytes32 public constant SESSION_CONTRACT = keccak256("SESSION_CONTRACT");
    bytes32 public constant FRP_ROLE = keccak256("FRP_ROLE");

    FlexibilityToken public flexToken;
    address public platformAdmin;

    // Balances por participante
    mapping(address => uint256) public balances;

    // Collateral management for FSPs
    mapping(address => uint256) public collateralDeposited;
    mapping(address => uint256) public collateralLocked;

    // Fee management for FSPs (2% held in escrow until settlement)
    mapping(address => uint256) public feeDeposited;
    mapping(address => uint256) public feeLocked;

    // Tracking collateral and fee per offer
    struct OfferCollateral {
        address sessionContract;  // MarketSession contract address (unique per session)
        uint256 sessionId;
        uint256 offerId;
        address fsp;
        uint256 collateralAmount;
        uint256 feeAmount;
        bool released;
    }

    mapping(bytes32 => OfferCollateral) public offerCollaterals;

    // Events
    event Deposit(address indexed from, uint256 amount);
    event Withdrawal(address indexed to, uint256 amount);
    event CollateralRefundedOnCancellation(
        uint256 indexed sessionId,
        uint256 indexed offerId,
        address indexed fsp,
        uint256 amount
    );

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

    event PlatformFeeCollected(uint256 indexed sessionId, address indexed fmoLmo, uint256 amount);
    event PenaltyApplied(address indexed fsp, uint256 amount, string reason);

    event FRPPaymentDeposited(
        uint256 indexed sessionId,
        address indexed frp,
        uint256 amount
    );

    constructor(address _flexToken, address _platformAdmin) {
        flexToken = FlexibilityToken(_flexToken);
        platformAdmin = _platformAdmin;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(TREASURY_MANAGER, msg.sender);
    }

    /**
     * @notice Refund collateral and fee when a session is cancelled before settlement
     * @dev Called by MarketSession when cancelling the session
     */
    function refundCollateralForCancelledOffer(
        uint256 sessionId,
        uint256 offerId
    ) external onlyRole(SESSION_CONTRACT) nonReentrant {
        // Include msg.sender (MarketSession address) to prevent collisions across markets
        bytes32 offerKey = keccak256(abi.encodePacked(msg.sender, sessionId, offerId));
        OfferCollateral storage offerCollat = offerCollaterals[offerKey];

        require(offerCollat.collateralAmount > 0 || offerCollat.feeAmount > 0, "Offer not found");
        require(!offerCollat.released, "Already released");

        address fsp = offerCollat.fsp;
        uint256 collateralAmount = offerCollat.collateralAmount;
        uint256 feeAmount = offerCollat.feeAmount;
        uint256 totalRefund = collateralAmount + feeAmount;

        // Unlock and refund collateral
        require(collateralLocked[fsp] >= collateralAmount, "Locked collateral underflow");
        collateralLocked[fsp] -= collateralAmount;
        require(collateralDeposited[fsp] >= collateralAmount, "Deposited collateral underflow");
        collateralDeposited[fsp] -= collateralAmount;

        // Unlock and refund fee
        require(feeLocked[fsp] >= feeAmount, "Locked fee underflow");
        feeLocked[fsp] -= feeAmount;
        require(feeDeposited[fsp] >= feeAmount, "Deposited fee underflow");
        feeDeposited[fsp] -= feeAmount;

        // Deduct from balance and transfer back
        require(balances[fsp] >= totalRefund, "Balance underflow");
        balances[fsp] -= totalRefund;

        offerCollat.released = true;

        require(flexToken.transfer(fsp, totalRefund), "Transfer failed");

        emit CollateralRefundedOnCancellation(sessionId, offerId, fsp, totalRefund);
    }

    /**
     * @notice Deposit FLEX tokens to Treasury
     * @dev Used by any participant to add funds to their balance
     */
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(
            flexToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );

        balances[msg.sender] += amount;
        emit Deposit(msg.sender, amount);
    }

    /**
     * @notice Withdraw FLEX tokens from Treasury
     * @dev Cannot withdraw collateral or fee that is locked
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(balances[msg.sender] >= amount, "Insufficient balance");

        uint256 totalLocked = collateralLocked[msg.sender] + feeLocked[msg.sender];
        require(
            balances[msg.sender] - amount >= totalLocked,
            "Cannot withdraw: funds locked as collateral or fee"
        );

        balances[msg.sender] -= amount;
        require(flexToken.transfer(msg.sender, amount), "Transfer failed");

        emit Withdrawal(msg.sender, amount);
    }

    /**
     * @notice Deposit and lock collateral + fee in a single transaction
     * @dev Called by MarketSession when FSP creates an offer
     * @dev FSP deposits 5% collateral + 2% fee of the offer value
     */
    function depositCollateralAndFeeForOffer(
        uint256 sessionId,
        uint256 offerId,
        address fsp,
        uint256 collateralAmount,
        uint256 feeAmount
    ) external onlyRole(SESSION_CONTRACT) nonReentrant {
        uint256 totalDeposit = collateralAmount + feeAmount;
        require(totalDeposit > 0, "Amount must be greater than 0");

        // Include msg.sender (MarketSession address) to prevent collisions across markets
        bytes32 offerKey = keccak256(abi.encodePacked(msg.sender, sessionId, offerId));
        require(!offerCollaterals[offerKey].released, "Offer already exists");

        // Transfer tokens from FSP to Treasury
        require(
            flexToken.transferFrom(fsp, address(this), totalDeposit),
            "Transfer failed"
        );

        // Collateral: deposit and lock
        collateralDeposited[fsp] += collateralAmount;
        balances[fsp] += collateralAmount;
        collateralLocked[fsp] += collateralAmount;

        // Fee: deposit and lock in escrow
        feeDeposited[fsp] += feeAmount;
        balances[fsp] += feeAmount;
        feeLocked[fsp] += feeAmount;

        // Create offer record
        offerCollaterals[offerKey] = OfferCollateral({
            sessionContract: msg.sender,
            sessionId: sessionId,
            offerId: offerId,
            fsp: fsp,
            collateralAmount: collateralAmount,
            feeAmount: feeAmount,
            released: false
        });

        emit CollateralAndFeeDeposited(sessionId, offerId, fsp, collateralAmount, feeAmount);
    }

    /**
     * @notice FRP deposits payment for settled session
     * @dev Called by FRP after Oracle validates settlement
     */
    function depositPaymentForSession(
        uint256 sessionId,
        uint256 amount
    ) external onlyRole(FRP_ROLE) nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(
            flexToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );

        balances[msg.sender] += amount;
        emit FRPPaymentDeposited(sessionId, msg.sender, amount);
    }

    /**
     * @notice Process settlement payment for an offer
     * @dev Called by MarketSession during executeSettlement
     * @dev Flow: FRP pays payment → FSP, Fee from FSP escrow → FMO/LMO, Collateral penalty → FRP
     */
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
    ) external onlyRole(SESSION_CONTRACT) nonReentrant {
        // Include msg.sender (MarketSession address) to prevent collisions across markets
        bytes32 offerKey = keccak256(abi.encodePacked(msg.sender, sessionId, offerId));
        OfferCollateral storage offerCollat = offerCollaterals[offerKey];

        require(!offerCollat.released, "Settlement already processed");

        // 1. FRP pays → FSP receives the full payment for delivered flexibility
        require(
            balances[frp] >= payment,
            "FRP has not deposited sufficient funds"
        );
        balances[frp] -= payment;
        balances[fsp] += payment;

        // 2. Fee from FSP escrow → FMO/LMO
        require(balances[fsp] >= platformFee, "FSP fee balance error");
        balances[fsp] -= platformFee;
        feeLocked[fsp] -= platformFee;
        feeDeposited[fsp] -= platformFee;
        balances[fmoLmo] += platformFee;
        emit PlatformFeeCollected(sessionId, fmoLmo, platformFee);

        // 3. Penalty: collateral from FSP → FRP as compensation
        if (penaltyAmount > 0) {
            require(
                offerCollateralAmount >= penaltyAmount,
                "Penalty exceeds collateral"
            );
            balances[fsp] -= penaltyAmount;
            balances[frp] += penaltyAmount;

            emit PenaltyApplied(fsp, penaltyAmount, "Underperformance penalty");
        }

        // 4. Release collateral accounting
        uint256 remainingCollateral = offerCollateralAmount - penaltyAmount;
        collateralLocked[fsp] -= offerCollateralAmount;
        collateralDeposited[fsp] -= offerCollateralAmount;

        offerCollat.released = true;

        // 5. Auto-transfer FLEX tokens to participants' wallets
        // FSP receives: payment for delivered flexibility + remaining collateral
        uint256 fspPayout = payment + remainingCollateral;
        if (fspPayout > 0) {
            balances[fsp] -= fspPayout;
            require(flexToken.transfer(fsp, fspPayout), "FSP payout transfer failed");
        }

        // FMO/LMO receives: platform fee (2%)
        if (platformFee > 0) {
            balances[fmoLmo] -= platformFee;
            require(flexToken.transfer(fmoLmo, platformFee), "FMO/LMO fee transfer failed");
        }

        // FRP receives: penalty compensation from FSP collateral
        if (penaltyAmount > 0) {
            balances[frp] -= penaltyAmount;
            require(flexToken.transfer(frp, penaltyAmount), "FRP penalty transfer failed");
        }

        emit SettlementPaymentProcessed(
            sessionId,
            offerId,
            fsp,
            payment,
            platformFee,
            penaltyAmount
        );
    }

    /**
     * @notice Get available balance (excluding locked collateral and fee)
     */
    function getAvailableBalance(
        address account
    ) external view returns (uint256) {
        uint256 balance = balances[account];
        uint256 totalLocked = collateralLocked[account] + feeLocked[account];
        return balance > totalLocked ? balance - totalLocked : 0;
    }

    /**
     * @notice Get total collateral deposited by an account
     */
    function getCollateralDeposited(
        address account
    ) external view returns (uint256) {
        return collateralDeposited[account];
    }

    /**
     * @notice Get locked collateral for an account
     */
    function getCollateralLocked(
        address account
    ) external view returns (uint256) {
        return collateralLocked[account];
    }

    /**
     * @notice Get balance of an account
     */
    function getBalance(address account) external view returns (uint256) {
        return balances[account];
    }

    /**
     * @notice Get fee deposited by an account
     */
    function getFeeDeposited(address account) external view returns (uint256) {
        return feeDeposited[account];
    }

    /**
     * @notice Get locked fee for an account
     */
    function getFeeLocked(address account) external view returns (uint256) {
        return feeLocked[account];
    }

    /**
     * @notice Get collateral info for a specific offer
     * @param sessionContract Address of the MarketSession contract
     * @param sessionId Session ID within that contract
     * @param offerId Offer ID within that session
     */
    function getOfferCollateral(
        address sessionContract,
        uint256 sessionId,
        uint256 offerId
    ) external view returns (OfferCollateral memory) {
        bytes32 offerKey = keccak256(abi.encodePacked(sessionContract, sessionId, offerId));
        return offerCollaterals[offerKey];
    }

    /**
     * @notice Update platform admin address
     */
    function updatePlatformAdmin(
        address newAdmin
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newAdmin != address(0), "Invalid address");
        platformAdmin = newAdmin;
    }
}
