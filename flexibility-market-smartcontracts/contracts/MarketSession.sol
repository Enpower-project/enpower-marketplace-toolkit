// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/IFlexibilityNFT.sol";
import "./interfaces/IMarket.sol";
import "./interfaces/IParticipantRegistry.sol";

/**
 * @title MarketSession
 * @notice Manages a single market session with FIFO automatic matching
 * @dev Simplified design: Fixed price requests published on-chain, automatic FIFO matching
 * @dev NFT lifecycle: FSP owns initially → transferred to FRP at settlement (FMO/LMO recorded as program manager)
 * @dev FRP pays after settlement based on delivered flexibility
 * @dev Roles aligned with Section_3_Complete_Proposed_Integration.md:
 *      - FMO/LMO: Neutral market operator managing sessions and acting as Oracle
 *      - FSP: Flexibility Service Provider submitting offers
 *      - FRP: Flexibility Requesting Party paying for delivered flexibility
 */
contract MarketSession is AccessControl {
    bytes32 public constant FSP = keccak256("FSP");
    bytes32 public constant FMO_LMO = keccak256("FMO_LMO");
    bytes32 public constant ORACLE = keccak256("ORACLE");

    uint256 public sessionId;
    uint256 public deliveryDay;
    address public marketAddress;
    address public treasury;
    address public fmoLmoAddress; // FMO/LMO managing this market session
    address public frpAddress; // FRP that requested flexibility

    IParticipantRegistry public participantRegistry;

    // Platform fee: 2% (200 basis points)
    uint256 public constant PLATFORM_FEE_BPS = 200;
    // Collateral requirement: 5% (500 basis points)
    uint256 public constant COLLATERAL_BPS = 500;

    enum SessionStatus {
        CREATED,
        OFFERS_OPEN,
        IN_DELIVERY,
        SETTLEMENT_PENDING,
        SETTLED,
        CANCELLED
    }

    SessionStatus public status;

    enum FlexibilityType {
        UPWARD, // Increase consumption / Decrease production
        DOWNWARD // Decrease consumption / Increase production
    }

    struct FlexibilityRequest {
        uint8 hourSlot; // Hour of day (0-23)
        uint256 quantity; // Total kWh requested for this hour
        uint256 quantityFilled; // kWh already filled by offers
        uint256 price; // Fixed price per kWh
        FlexibilityType flexType; // Type of flexibility required
        bool active;
        bool completed;
    }

    mapping(uint8 => FlexibilityRequest) public flexibilityRequests;
    uint8 public activeRequestCount; // Count of active requests

    // Input struct for creating flexibility requests
    struct FlexibilityRequestInput {
        uint8 hourSlot;
        uint256 quantity;
        uint256 price;
        FlexibilityType flexType;
    }

    struct Offer {
        uint256 offerId;
        uint8 hourSlot; // Hour slot of the flexibility request (0-23)
        address fsp; // Flexibility Service Provider that created the offer
        uint256 quantity; // Accepted quantity in kWh (may be partial)
        uint256 price; // Price per kWh
        uint256 timestamp;
        OfferStatus status;
        uint256 nftTokenId;
        uint256 collateralAmount; // 5% of offer value
        uint256 feeAmount; // 2% of offer value (platform fee)
        bool nftTransferredToBuyer; // Track if NFT was transferred to FRP
    }

    enum OfferStatus {
        ACCEPTED, // Auto-accepted when created
        DELIVERED,
        VALIDATED,
        SETTLED
    }

    // Usar una estructura temporal para reducir variables en el stack
    struct OfferCalculation {
        uint256 offerValue;
        uint256 requiredCollateral;
        uint256 feeAmount;
        uint256 nftTokenId;
    }

    mapping(uint256 => Offer) public offers;
    uint256 public offerCount;

    bytes32 public measurementDataHash;
    bytes32 public settlementHash;

    struct SettlementData {
        uint256 deliveredQuantity;
        uint256 penalty;
        uint256 payment; // deliveredQuantity * price / 1e18 (FRP pays, FSP receives)
        uint256 platformFee; // pre-paid fee from offer creation (2% of committed value)
        bytes32 meterReadingsHash;
        bool validated;
        bool executed;
    }

    mapping(uint256 => SettlementData) public settlements;

    IFlexibilityNFT public nftContract;

    uint256 public totalPlatformFees; // Accumulated platform fees for this session

    // Events
    event FlexibilityRequestPublished(
        uint8 indexed hourSlot,
        uint256 quantity,
        uint256 price,
        FlexibilityType flexType
    );

    event SessionCancelled(
        uint256 indexed sessionId,
        uint256 timestamp,
        string reason,
        uint256 refundedOffers
    );

    event FlexibilityRequestCompleted(
        uint8 indexed hourSlot,
        uint256 totalQuantityFilled
    );

    event OfferCreated(
        uint256 indexed offerId,
        address indexed fsp,
        uint8 hourSlot,
        uint256 quantity,
        uint256 collateralAmount,
        uint256 nftTokenId
    );

    event OfferAutoAccepted(
        uint256 indexed offerId,
        uint8 indexed hourSlot,
        uint256 acceptedQuantity
    );

    event OfferStatusUpdated(uint256 indexed offerId, OfferStatus newStatus);

    event MeasurementDataSubmitted(
        bytes32 indexed measurementHash,
        uint256 timestamp
    );

    event SettlementCalculated(
        uint256 indexed offerId,
        uint256 deliveredQuantity,
        uint256 penalty,
        uint256 payment,
        uint256 platformFee
    );

    event SettlementExecuted(
        uint256 indexed offerId,
        address indexed fsp,
        uint256 payment
    );

    event NFTTransferredToBuyer(
        uint256 indexed nftTokenId,
        address indexed buyer,
        uint256 deliveredQuantity,
        uint256 timestamp
    );

    event NFTFinalized(uint256 indexed nftTokenId, uint256 indexed offerId);

    modifier inStatus(SessionStatus _status) {
        require(status == _status, "Invalid session status");
        _;
    }

    modifier onlyQualifiedFSP() {
        require(
            participantRegistry.hasRole(
                msg.sender,
                IParticipantRegistry.ParticipantType.FSP
            ),
            "Caller is not a qualified FSP"
        );
        require(
            participantRegistry.isQualified(msg.sender),
            "FSP is not qualified"
        );
        _;
    }

    modifier onlyQualifiedFMOLMO() {
        require(
            participantRegistry.hasRole(
                msg.sender,
                IParticipantRegistry.ParticipantType.FMO_LMO
            ),
            "Caller is not a qualified FMO/LMO"
        );
        require(
            participantRegistry.isQualified(msg.sender),
            "FMO/LMO is not qualified"
        );
        _;
    }

    constructor(
        uint256 _sessionId,
        uint256 _deliveryDay,
        address _marketAddress,
        address _treasury,
        address _admin,
        address _fmoLmo,
        address _frp,
        FlexibilityRequestInput[] memory _requests
    ) {
        sessionId = _sessionId;
        deliveryDay = _deliveryDay;
        marketAddress = _marketAddress;
        treasury = _treasury;
        fmoLmoAddress = _fmoLmo;
        frpAddress = _frp;
        status = SessionStatus.CREATED;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(FMO_LMO, _fmoLmo);
        _grantRole(ORACLE, _fmoLmo);

        // Process and validate flexibility requests
        for (uint256 i = 0; i < _requests.length; i++) {
            FlexibilityRequestInput memory input = _requests[i];

            // Validate hourSlot is 0-23
            require(input.hourSlot <= 23, "Invalid hour slot: must be 0-23");

            // Validate no duplicate hourSlots
            require(
                !flexibilityRequests[input.hourSlot].active,
                "Duplicate hour slot"
            );

            // Validate quantity and price
            require(input.quantity > 0, "Quantity must be greater than 0");
            require(input.price > 0, "Price must be greater than 0");

            // Create flexibility request
            flexibilityRequests[input.hourSlot] = FlexibilityRequest({
                hourSlot: input.hourSlot,
                quantity: input.quantity,
                quantityFilled: 0,
                price: input.price,
                flexType: input.flexType,
                active: true,
                completed: false
            });

            activeRequestCount++;

            emit FlexibilityRequestPublished(
                input.hourSlot,
                input.quantity,
                input.price,
                input.flexType
            );
        }
    }

    function setNFTContract(
        address _nftContract
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        nftContract = IFlexibilityNFT(_nftContract);
    }

    function setParticipantRegistry(
        address _registry
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_registry != address(0), "Invalid registry address");
        participantRegistry = IParticipantRegistry(_registry);
    }

    function openOffers()
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        inStatus(SessionStatus.CREATED)
    {
        // require(
        //     block.timestamp < deliveryDay - 1 days,
        //     "Too close to delivery"
        // );
        require(activeRequestCount > 0, "No flexibility requests in session");
        status = SessionStatus.OFFERS_OPEN;
        IMarket(marketAddress).updateSessionStatus(
            sessionId,
            IMarket.SessionStatus.OFFERS_OPEN
        );

        // FALTA AÑADIR EVENTO PARA AVISAR AL EXTERIOR DE QUE SE HA ABIERTO EL PERIODO DE OFFERS
    }

    /**
     * @notice FSP creates offer and auto-accept (FIFO matching)
     * @dev Offer is automatically accepted until request is filled
     * @dev NFT is minted and REMAINS WITH FSP until settlement
     * @dev Last offer may be partial to complete the request
     * @dev Collateral is deposited and locked automatically in this transaction
     * @dev Only FSPs (Flexibility Service Providers) can create offers
     * @param _hourSlot Hour slot (0-23) of the flexibility request to fulfill
     * @param _quantity Quantity offered in kWh
     */
    // function createOffer(
    //     uint8 _hourSlot,
    //     uint256 _quantity
    // )
    //     external
    //     onlyRole(FSP)
    //     onlyQualifiedFSP
    //     inStatus(SessionStatus.OFFERS_OPEN)
    //     returns (uint256)
    // {
    //     require(_hourSlot <= 23, "Invalid hour slot");
    //     FlexibilityRequest storage request = flexibilityRequests[_hourSlot];

    //     require(request.active, "Request not active");
    //     require(!request.completed, "Request already filled");
    //     require(_quantity > 0, "Quantity must be greater than 0");

    //     uint256 remainingQuantity = request.quantity - request.quantityFilled;
    //     require(remainingQuantity > 0, "Request fully filled");

    //     // Auto-accept quantity (may be partial if it's the last offer)
    //     uint256 acceptedQuantity = _quantity > remainingQuantity
    //         ? remainingQuantity
    //         : _quantity;

    //     // Calculate offer value, required collateral (5%) and fee (2%)
    //     // Both quantity and price are in wei (10^18), so divide by 1e18 to get actual token amount
    //     uint256 offerValue = (acceptedQuantity * request.price) / 1e18;
    //     uint256 requiredCollateral = (offerValue * COLLATERAL_BPS) / 10000;
    //     uint256 feeAmount = (offerValue * PLATFORM_FEE_BPS) / 10000;

    //     offerCount++;

    //     // Deposit and lock collateral + fee in a single transaction
    //     // FSP must have approved Treasury to spend (collateral + fee) tokens
    //     ITreasury(treasury).depositCollateralAndFeeForOffer(
    //         sessionId,
    //         offerCount,
    //         msg.sender,
    //         requiredCollateral,
    //         feeAmount
    //     );

    //     // Mint NFT to FSP (FSP owns it initially)
    //     uint256 nftTokenId = nftContract.mint(
    //         msg.sender,
    //         sessionId,
    //         offerCount,
    //         _hourSlot,
    //         acceptedQuantity,
    //         request.price,
    //         block.timestamp,
    //         requiredCollateral
    //     );

    //     // Create offer (already ACCEPTED)
    //     offers[offerCount] = Offer({
    //         offerId: offerCount,
    //         hourSlot: _hourSlot,
    //         fsp: msg.sender,
    //         quantity: acceptedQuantity,
    //         price: request.price,
    //         timestamp: block.timestamp,
    //         status: OfferStatus.ACCEPTED,
    //         nftTokenId: nftTokenId,
    //         collateralAmount: requiredCollateral,
    //         feeAmount: feeAmount,
    //         nftTransferredToBuyer: false
    //     });

       

    //     // Update flexibility request
    //     request.quantityFilled += acceptedQuantity;

    //     // If request is completed, mark it and emit event
    //     if (request.quantityFilled >= request.quantity) {
    //         request.completed = true;
    //         request.active = false;
    //         emit FlexibilityRequestCompleted(_hourSlot, request.quantityFilled);
    //     }

    //     // Update NFT with matching data (FMO/LMO recorded as program manager)
    //     nftContract.updateAfterMatching(
    //         nftTokenId,
    //         fmoLmoAddress,
    //         acceptedQuantity,
    //         block.timestamp
    //     );

    //     emit OfferCreated(
    //         offerCount,
    //         msg.sender,
    //         _hourSlot,
    //         acceptedQuantity,
    //         requiredCollateral,
    //         nftTokenId
    //     );
    //     emit OfferAutoAccepted(offerCount, _hourSlot, acceptedQuantity);

    //     return offerCount;
    // }

    function createOffer(
        uint8 _hourSlot,
        uint256 _quantity
    )
        external
        onlyRole(FSP)
        onlyQualifiedFSP
        inStatus(SessionStatus.OFFERS_OPEN)
        returns (uint256)
    {
        require(_hourSlot <= 23, "Invalid hour slot");
        FlexibilityRequest storage request = flexibilityRequests[_hourSlot];

        require(request.active, "Request not active");
        require(!request.completed, "Request already filled");
        require(_quantity > 0, "Quantity must be greater than 0");

        uint256 remainingQuantity = request.quantity - request.quantityFilled;
        require(remainingQuantity > 0, "Request fully filled");

        // Auto-accept quantity (may be partial if it's the last offer)
        uint256 acceptedQuantity = _quantity > remainingQuantity
            ? remainingQuantity
            : _quantity;
        
        OfferCalculation memory calc;
        
        // Calculate offer value, required collateral (5%) and fee (2%)
        calc.offerValue = (acceptedQuantity * request.price) / 1e18;
        calc.requiredCollateral = (calc.offerValue * COLLATERAL_BPS) / 10000;
        calc.feeAmount = (calc.offerValue * PLATFORM_FEE_BPS) / 10000;

        offerCount++;

        // Deposit and lock collateral + fee in a single transaction
        ITreasury(treasury).depositCollateralAndFeeForOffer(
            sessionId,
            offerCount,
            msg.sender,
            calc.requiredCollateral,
            calc.feeAmount
        );

        // Mint NFT to FSP
        calc.nftTokenId = nftContract.mint(
            msg.sender,
            sessionId,
            address(this),  // sessionContract: unique per session
            offerCount,
            _hourSlot,
            acceptedQuantity,
            request.price,
            block.timestamp,
            calc.requiredCollateral
        );

        // Create offer
        offers[offerCount] = Offer({
            offerId: offerCount,
            hourSlot: _hourSlot,
            fsp: msg.sender,
            quantity: acceptedQuantity,
            price: request.price,
            timestamp: block.timestamp,
            status: OfferStatus.ACCEPTED,
            nftTokenId: calc.nftTokenId,
            collateralAmount: calc.requiredCollateral,
            feeAmount: calc.feeAmount,
            nftTransferredToBuyer: false
        });

        // Update flexibility request
        request.quantityFilled += acceptedQuantity;

        // If request is completed, mark it and emit event
        if (request.quantityFilled >= request.quantity) {
            request.completed = true;
            request.active = false;
            emit FlexibilityRequestCompleted(_hourSlot, request.quantityFilled);
        }

        // Update NFT with matching data
        nftContract.updateAfterMatching(
            calc.nftTokenId,
            fmoLmoAddress,
            acceptedQuantity,
            block.timestamp
        );

        emit OfferCreated(
            offerCount,
            msg.sender,
            _hourSlot,
            acceptedQuantity,
            calc.requiredCollateral,
            calc.nftTokenId
        );
        emit OfferAutoAccepted(offerCount, _hourSlot, acceptedQuantity);

        return offerCount;
    }


    /**
     * @notice Close offers phase and move to delivery
     * @dev Called by FMO/LMO when ready to start delivery phase
     */
    function closeOffers()
        external
        onlyRole(FMO_LMO)
        onlyQualifiedFMOLMO
        inStatus(SessionStatus.OFFERS_OPEN)
    {
        // require(block.timestamp >= deliveryDay - 1 days, "Too early to close");
        status = SessionStatus.IN_DELIVERY;
        IMarket(marketAddress).updateSessionStatus(
            sessionId,
            IMarket.SessionStatus.IN_DELIVERY
        );
    }

    function submitMeasurementData(
        bytes32 _measurementHash
    ) external onlyRole(ORACLE) inStatus(SessionStatus.IN_DELIVERY) {
        // require(
        //     block.timestamp >= deliveryDay + 1 days,
        //     "Delivery not complete"
        // );
        measurementDataHash = _measurementHash;
        emit MeasurementDataSubmitted(_measurementHash, block.timestamp);
        status = SessionStatus.SETTLEMENT_PENDING;
        IMarket(marketAddress).updateSessionStatus(
            sessionId,
            IMarket.SessionStatus.SETTLEMENT_PENDING
        );
    }

    /**
     * @notice Submit settlement for an offer
     * @dev Validates settlement data and calculates payments
     */
    function submitSettlement(
        uint256 _offerId,
        uint256 _deliveredQuantity,
        uint256 _penaltyAmount,
        bytes32 _meterReadingsHash
    ) external onlyRole(ORACLE) inStatus(SessionStatus.SETTLEMENT_PENDING) {
        require(_offerId > 0 && _offerId <= offerCount, "Invalid offer ID");
        require(
            offers[_offerId].status == OfferStatus.ACCEPTED,
            "Invalid offer status"
        );

        Offer storage offer = offers[_offerId];

        // Calculate payment based on delivered quantity
        // Both quantity and price are in wei (10^18), so divide by 1e18 to get actual token amount
        uint256 payment = (_deliveredQuantity * offer.price) / 1e18;

        // Platform fee was pre-paid by FSP at offer creation (2% of committed value)
        uint256 platformFee = offer.feeAmount;

        settlements[_offerId] = SettlementData({
            deliveredQuantity: _deliveredQuantity,
            penalty: _penaltyAmount,
            payment: payment,
            platformFee: platformFee,
            meterReadingsHash: _meterReadingsHash,
            validated: true,
            executed: false
        });

        totalPlatformFees += platformFee;

        offers[_offerId].status = OfferStatus.VALIDATED;

        emit SettlementCalculated(
            _offerId,
            _deliveredQuantity,
            _penaltyAmount,
            payment,
            platformFee
        );
        emit OfferStatusUpdated(_offerId, OfferStatus.VALIDATED);
    }

    /**
     * @notice Execute settlement and finalize NFT
     * @dev Processes payment from FRP, pays FSP, handles collateral, transfers NFT from FSP to FRP
     * @dev FRP must have deposited funds in Treasury before calling this
     * @dev NFT is transferred from FSP (original owner) to FRP (final owner)
     */
    function executeSettlement(
        uint256 _offerId
    ) external onlyRole(ORACLE) inStatus(SessionStatus.SETTLEMENT_PENDING) {
        require(settlements[_offerId].validated, "Settlement not validated");
        require(!settlements[_offerId].executed, "Already executed");
        require(
            offers[_offerId].status == OfferStatus.VALIDATED,
            "Offer not validated"
        );

        Offer storage offer = offers[_offerId];
        SettlementData storage settlement = settlements[_offerId];

        // Process payment through Treasury
        // FRP pays payment → FSP receives full payment
        // Fee from FSP escrow → FMO/LMO
        // Collateral penalty → FRP
        ITreasury(treasury).processSettlementPayment(
            sessionId,
            _offerId,
            offer.fsp,
            frpAddress,
            fmoLmoAddress,
            settlement.payment,
            settlement.platformFee,
            settlement.penalty,
            offer.collateralAmount
        );

        // Update NFT with final settlement data
        nftContract.updateAfterSettlement(
            offer.nftTokenId,
            settlement.deliveredQuantity,
            block.timestamp,
            settlement.meterReadingsHash,
            frpAddress,
            settlement.payment
        );

        // Transfer NFT from FSP to FRP (final owner)
        // NFT metadata already contains FMO/LMO as program manager
        nftContract.safeTransferFrom(
            offer.fsp, // FROM: FSP (original owner)
            frpAddress, // TO: FRP (final buyer)
            offer.nftTokenId,
            1,
            ""
        );

        // Make NFT soulbound (prevent further transfers)
        nftContract.finalizeNFT(offer.nftTokenId);

        offer.status = OfferStatus.SETTLED;
        offer.nftTransferredToBuyer = true;
        settlement.executed = true;

        emit SettlementExecuted(_offerId, offer.fsp, settlement.payment);
        emit NFTTransferredToBuyer(
            offer.nftTokenId,
            frpAddress,
            settlement.deliveredQuantity,
            block.timestamp
        );
        emit NFTFinalized(offer.nftTokenId, _offerId);
    }

    function finalizeSession()
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        inStatus(SessionStatus.SETTLEMENT_PENDING)
    {
        // Verify all offers are settled
        for (uint256 i = 1; i <= offerCount; i++) {
            require(
                offers[i].status == OfferStatus.SETTLED,
                "Not all offers settled"
            );
        }

        status = SessionStatus.SETTLED;
        IMarket(marketAddress).updateSessionStatus(
            sessionId,
            IMarket.SessionStatus.SETTLED
        );
    }

    // View functions
    function getOffer(uint256 _offerId) external view returns (Offer memory) {
        return offers[_offerId];
    }

    function getFlexibilityRequest(
        uint8 _hourSlot
    ) external view returns (FlexibilityRequest memory) {
        require(_hourSlot <= 23, "Invalid hour slot");
        return flexibilityRequests[_hourSlot];
    }

    function getSettlement(
        uint256 _offerId
    ) external view returns (SettlementData memory) {
        return settlements[_offerId];
    }

    function getTotalPlatformFees() external view returns (uint256) {
        return totalPlatformFees;
    }

    function getRemainingQuantity(
        uint8 _hourSlot
    ) external view returns (uint256) {
        require(_hourSlot <= 23, "Invalid hour slot");
        FlexibilityRequest memory request = flexibilityRequests[_hourSlot];
        if (request.completed || !request.active) {
            return 0;
        }
        return request.quantity - request.quantityFilled;
    }

    /**
     * @notice Auto-cancel session if offers are still open and we're within 2 hours of deliveryDay
     * @dev Refunds collateral for all offers created in this session
     * @dev Can be called by FMO/LMO (or ORACLE) as the neutral operator
     */
    function cancelIfOffersStillOpenTwoHoursBefore()
        external
        onlyRole(FMO_LMO)
        onlyQualifiedFMOLMO
        inStatus(SessionStatus.OFFERS_OPEN)
    {
        // require(
        //     block.timestamp >= deliveryDay - 2 hours,
        //     "Too early to cancel"
        // );

        // Move to CANCELLED first (prevents reentrancy patterns / double calls)
        status = SessionStatus.CANCELLED;

        // Update status in Market registry (if your IMarket supports it)
        // If IMarket doesn't have CANCELLED, you can omit or map to another status.
        IMarket(marketAddress).updateSessionStatus(
            sessionId,
            IMarket.SessionStatus.CANCELLED
        );

        uint256 refunded = 0;

        // Refund collateral for each offer (offers are indexed 1..offerCount)
        for (uint256 i = 1; i <= offerCount; i++) {
            // If you want to be extra-safe, skip offers with no collateral (shouldn't happen)
            if (offers[i].collateralAmount == 0) {
                continue;
            }

            // Refund collateral on Treasury side (idempotency handled there via released flag)
            ITreasury(treasury).refundCollateralForCancelledOffer(sessionId, i);
            refunded++;
        }

        emit SessionCancelled(
            sessionId,
            block.timestamp,
            "Auto-cancel: offers still open within 2 hours of deliveryDay",
            refunded
        );
    }
}
