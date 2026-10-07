##### Table of Contents
[1. Overview](#1-overview)<br>
[2. Technology Stack](#2-technology-stack)<br>
[3. Smart Contract Reference](#3-smart-contract-reference)<br>
&nbsp;&nbsp;&nbsp;[3.1 MarketFactory](#31-marketfactory)<br>
&nbsp;&nbsp;&nbsp;[3.2 Market](#32-market)<br>
&nbsp;&nbsp;&nbsp;[3.3 MarketSession](#33-marketsession)<br>
&nbsp;&nbsp;&nbsp;[3.4 FlexibilityToken](#34-flexibilitytoken)<br>
&nbsp;&nbsp;&nbsp;[3.5 FlexibilityNFT](#35-flexibilitynft)<br>
&nbsp;&nbsp;&nbsp;[3.6 ParticipantRegistry](#36-participantregistry)<br>
&nbsp;&nbsp;&nbsp;[3.7 Treasury](#37-treasury)<br>
[4. Integration with Other Components](#4-integration-with-other-components)<br>
[5. Environment Variables](#5-environment-variables)<br>
[6. Development Setup & Testing](#6-development-setup--testing)<br>
[7. Related Components](#7-related-components)<br>

---

# 1. Overview

<p align="justify">
The flexibility-market-smartcontracts sub-project contains seven Solidity 0.8.20 contracts implementing the on-chain logic of the ENPOWER Marketplace. Five are deployed once per platform (FlexibilityToken, ParticipantRegistry, Treasury, FlexibilityNFT, MarketFactory) and two are instantiated dynamically per energy community (Market, MarketSession). The architecture follows a factory pattern with a five-stage session lifecycle plus a terminal cancelled state: MarketFactory deploys Markets, each Market deploys MarketSessions, and each MarketSession governs one trading day from flexibility request publication, through FIFO offer matching and collateral locking, to two-step on-chain settlement.
</p>

<p align="justify">
The dual-token design serves two functions. FlexibilityToken (ERC-20, symbol FLEX) is the medium of exchange: FSPs lock 5% collateral + 2% fee at offer creation; Treasury distributes them at settlement. FlexibilityNFT (ERC-1155) represents each accepted offer as a token that tracks the full provenance of the commitment — creation, matching, delivery, settlement — and becomes soulbound upon settlement execution, serving as an immutable proof of service delivery transferred from FSP to FRP.
</p>

<br>

---

# 2. Technology Stack

| Component | Technology | Version |
|---|---|---|
| Smart contract language | Solidity | 0.8.20 |
| Development framework | Hardhat | ^2.22.0 |
| Standards and security | OpenZeppelin Contracts | ^5.4.0 |
| Blockchain client (scripts) | Ethers.js | ^6.13.0 |

Compiler: optimizer enabled, 200 runs. Networks: `hardhat` and `localhost` (chainId 31337), `remoteNode` (optional, requires `.env`).

<br>

---

# 3. Smart Contract Reference

<p align="justify">
The on-chain logic is structured around a factory pattern: MarketFactory is the genesis component that deploys and tracks individual Market instances, each representing an independent energy community trading venue. Markets manage participant registration, role hierarchies, and MarketSession lifecycles. Token economics are handled by two complementary contracts: FlexibilityToken (ERC-20) for fungible value transfer and collateral locking, and FlexibilityNFT (ERC-1155) for representing flexibility commitments that become soulbound settlement certificates upon successful delivery. All contracts apply OpenZeppelin's AccessControl for role-based permission enforcement, ensuring that only authorised participants can transition state machines, submit offers, or execute settlements.
</p>

| Contract | Purpose |
|---|---|
| MarketFactory | Genesis component — deploys and tracks Market instances |
| Market | Per-community trading venue — manages participants, sessions, and role hierarchies |
| MarketSession | Five-stage lifecycle governing each trading window, plus a terminal cancelled state |
| FlexibilityToken | Fungible value transfer, collateral locking, and fee collection |
| FlexibilityNFT | Flexibility commitments that become settlement certificates upon delivery |
| ParticipantRegistry | On-chain participant qualification and role management |
| Treasury | Fee distribution and collateral operations during settlement |

<br>

## 3.1 MarketFactory

<p align="justify">
Entry point for market creation. Validates that the caller is a MARKETPLACE_ADMIN, then deploys and registers a new Market contract. Deployed once; receives the ParticipantRegistry address at construction.
</p>


| Function | Access | Description |
|---|---|---|
| `createMarket(communityId, region, owner)` | MARKETPLACE_ADMIN | Deploys a new Market; returns market ID |
| `deactivateMarket(marketId)` | MARKETPLACE_ADMIN | Deactivates market and its contract |
| `reactivateMarket(marketId)` | MARKETPLACE_ADMIN | Reactivates market and its contract |
| `getMarket(marketId)` | view | Returns market address, owner, region, isActive |

<br>

## 3.2 Market

<p align="justify">
Represents a single energy community trading venue. Owned by the FMO/LMO. Validates that both FMO/LMO and FRP addresses are qualified before deploying a MarketSession. Maintains a registry of sessions and receives status callbacks from them.
</p>

**Inheritance:** Ownable (owner = FMO/LMO wallet), IMarket.

| Function | Access | Description |
|---|---|---|
| `createSession(deliveryDay, treasury, fmoLmo, frp, requests[])` | Owner (FMO/LMO) | Deploys a new MarketSession with per-hour flexibility requests |
| `updateSessionStatus(sessionId, newStatus)` | MarketSession only | Syncs session status in the parent registry on every state transition |
| `setParticipantRegistry(registry)` | Owner | Sets the ParticipantRegistry reference |
| `deactivate() / reactivate()` | Factory only | Activates or deactivates the market |
| `getSession(sessionId)` | view | Returns session address, deliveryDay, and current status |

<br>

## 3.3 MarketSession

<p align="justify">
The most complex contract. Governs a single trading day through six on-chain states. The FMO/LMO wallet receives three roles at construction: DEFAULT_ADMIN_ROLE, FMO_LMO, and ORACLE — meaning all state-machine transitions are signed with the FMO/LMO's PIN-encrypted custodial wallet. FSPs require both the FSP AccessControl role and a QUALIFIED status in the ParticipantRegistry to submit offers. Offers are auto-matched FIFO until each hour slot is filled; the last offer may be partially matched.
</p>


| Function | Role | Description |
|---|---|---|
| `openOffers()` | DEFAULT_ADMIN (FMO/LMO wallet) | CREATED → OFFERS_OPEN |
| `createOffer(hourSlot, quantity)` | FSP + qualified | Locks collateral + fee in Treasury; mints FlexibilityNFT to FSP; FIFO matching |
| `closeOffers()` | FMO_LMO + qualified | OFFERS_OPEN → OFFERS_CLOSED |
| `cancelIfOffersStillOpenTwoHoursBefore()` | FMO_LMO + qualified | OFFERS_OPEN → CANCELLED; refunds all FSP collateral via Treasury |
| `submitMeasurementData(hash)` | ORACLE | Records IoT measurement hash; IN_DELIVERY → SETTLEMENT_PENDING |
| `submitSettlement(offerId, deliveredQty, penalty, meterHash)` | ORACLE | Validates settlement; calculates payment and penalty; does not transfer tokens |
| `executeSettlement(offerId)` | ORACLE | Calls Treasury to distribute tokens; updates NFT; transfers NFT FSP→FRP; makes NFT soulbound |
| `finalizeSession()` | DEFAULT_ADMIN (FMO/LMO wallet) | SETTLEMENT_PENDING → SETTLED (all offers must be settled) |
| `setNFTContract(address)` | DEFAULT_ADMIN | Configures FlexibilityNFT reference |
| `setParticipantRegistry(address)` | DEFAULT_ADMIN | Configures ParticipantRegistry reference |

<br>

## 3.4 FlexibilityToken

ERC-20 token (name: "Flexibility Token", symbol: FLEX) with minting, burning, and pause capabilities. 1,000,000 FLEX minted to deployer at deployment; further minting requires MINTER_ROLE.

**Roles:** `MINTER_ROLE`

| Function | Access | Description |
|---|---|---|
| `mint(to, amount)` | MINTER_ROLE | Mints new FLEX tokens |


<br>

## 3.5 FlexibilityNFT

<p align="justify">
ERC-1155 token representing individual flexibility commitments. Each token is minted to the FSP at offer creation and accumulates metadata through three lifecycle updates: after matching (accepted quantity, FMO/LMO address), after settlement data validation (delivered quantity, meter hash), and after settlement execution (final buyer, actual payment). The overridden <code>safeTransferFrom</code> reverts if <code>isSoulbound[tokenId]</code> is true — set permanently by <code>finalizeNFT</code> during <code>executeSettlement</code>.
</p>

**Roles:** `MINTER_ROLE`, `UPDATER_ROLE` (granted to deployer; must also be granted to each MarketSession contract).

| Function | Access | Description |
|---|---|---|
| `mint(fsp, sessionId, sessionContract, offerId, hourSlot, quantity, price, timestamp, collateral)` | MINTER_ROLE | Mints token to FSP; records initial metadata |
| `updateAfterMatching(tokenId, fmoLmo, acceptedQty, timestamp)` | UPDATER_ROLE | Records matching data; status → ACCEPTED |
| `updateAfterSettlement(tokenId, deliveredQty, timestamp, meterHash, finalBuyer, payment)` | UPDATER_ROLE | Records settlement data; status → DELIVERED |
| `finalizeNFT(tokenId)` | UPDATER_ROLE | Sets `isSoulbound = true`; status → FINALIZED; blocks future transfers |
| `getNFTMetadata(tokenId)` | view | Returns full metadata struct |
| `getNFTsBySessionContract(sessionContract)` | view | Returns all tokens for a MarketSession |
| `getNFTsByOwner(owner)` | view | Returns all tokens currently held by an address |

<br>

## 3.6 ParticipantRegistry

<p align="justify">
On-chain identity and qualification layer. Every wallet that interacts with the marketplace must be registered (status: PENDING) and then qualified (status: QUALIFIED) before accessing role-protected functions. Participants are typed as MARKETPLACE_ADMIN (1), FMO_LMO (2), FRP (3), or FSP (4), and indexed by region.
</p>

**Roles:** `REGISTRAR_ROLE` (deployer) — required for all write operations.

| Function | Access | Description |
|---|---|---|
| `registerParticipant(address, type, credentials, region)` | REGISTRAR_ROLE | Registers participant with PENDING status |
| `qualifyParticipant(address)` | REGISTRAR_ROLE | Promotes to QUALIFIED |
| `suspendParticipant(address, reason)` | REGISTRAR_ROLE | Sets status to SUSPENDED |
| `revokeParticipant(address, reason)` | REGISTRAR_ROLE | Sets status to REVOKED and deactivates |
| `isQualified(address)` | view | Returns true if QUALIFIED and active |
| `hasRole(address, ParticipantType)` | view | Returns true if the address has the given type and is QUALIFIED |

<br>

## 3.7 Treasury

<p align="justify">
Custodial escrow for all FlexibilityToken flows. Uses internal balance mappings rather than immediate transfers — tokens move between internal balances during offer creation and settlement validation, and are auto-transferred to participant wallets at settlement execution via <code>processSettlementPayment</code>. Uses ReentrancyGuard on all state-modifying functions. The offer key is computed as <code>keccak256(sessionContract, sessionId, offerId)</code>, scoping records per MarketSession address to prevent cross-market collisions.
</p>

**Roles:** `SESSION_CONTRACT` (must be granted to each MarketSession), `FRP_ROLE` (must be granted to each FRP wallet), `TREASURY_MANAGER` (deployer).

| Function | Access | Description |
|---|---|---|
| `deposit(amount)` | Any | Transfers FLEX from caller to Treasury |
| `withdraw(amount)` | Any | Transfers FLEX back to caller; respects locked amounts |
| `depositCollateralAndFeeForOffer(sessionId, offerId, fsp, collateral, fee)` | SESSION_CONTRACT | Locks FSP's 5% collateral + 2% fee at offer creation |
| `depositPaymentForSession(sessionId, amount)` | FRP_ROLE | FRP deposits settlement payment before execution |
| `processSettlementPayment(sessionId, offerId, fsp, frp, fmoLmo, payment, fee, penalty, collateral)` | SESSION_CONTRACT | Distributes: FRP→FSP (payment), FSP→FMO/LMO (fee), FSP→FRP (penalty); auto-transfers FLEX to wallets |
| `refundCollateralForCancelledOffer(sessionId, offerId)` | SESSION_CONTRACT | Returns locked collateral + fee to FSP on cancellation |
| `getAvailableBalance(account)` | view | Balance minus locked collateral and fee |
| `getOfferCollateral(sessionContract, sessionId, offerId)` | view | Returns collateral record for a specific offer |

<br>

---

# 4. Integration with Other Components

<p align="justify">
The contracts form a directed dependency graph. MarketFactory references ParticipantRegistry (for qualification checks) and deploys Market contracts. Each Market references ParticipantRegistry and deploys MarketSession contracts. Each MarketSession references Treasury (collateral/fee/settlement flows), FlexibilityNFT (token lifecycle), and its parent Market (status callbacks). Treasury references FlexibilityToken for all ERC-20 transfers. This means that before a MarketSession can operate, the backend must grant it SESSION_CONTRACT role on Treasury and MINTER_ROLE + UPDATER_ROLE on FlexibilityNFT; each FRP wallet must be granted FRP_ROLE on Treasury; each FSP wallet must be granted FSP role on the relevant MarketSession.
</p>

<p align="justify">
The backend (marketplace-be) interacts via Ethers.js v6 using typed contract wrappers loaded from ABI JSON files. The deployment script (<code>scripts/deploy-complete-system.ts</code>) copies all ABIs to <code>marketplace-be/src/contracts/</code> and writes deployed addresses to <code>marketplace-be/.env</code>. In Docker Compose, this is automated: the Hardhat service writes a <code>.deployed</code> sentinel and a <code>contracts.env</code> file to a shared volume; the backend waits for this sentinel before starting. The backend admin wallet (<code>ADMIN_PK</code>) holds administrative roles only at infrastructure level (ParticipantRegistry REGISTRAR_ROLE, FlexibilityToken MINTER_ROLE, MarketFactory MARKETPLACE_ADMIN). All MarketSession state transitions (openOffers, closeOffers, submitMeasurementData, submitSettlement, executeSettlement, finalizeSession) are signed with the FMO/LMO's own PIN-encrypted custodial wallet, since Market.createSession() is onlyOwner and the Market owner is the FMO/LMO, making the FMO/LMO wallet the holder of DEFAULT_ADMIN_ROLE, FMO_LMO, and ORACLE on every MarketSession it creates.
</p>

<br>

---

# 5. Environment Variables

No `.env` file is required when using Docker Compose or the Hardhat in-process network.

| Variable | Description | Required |
|---|---|---|
| `HARDHAT_RPC_URL` | JSON-RPC URL for the local node (default: `http://127.0.0.1:8545`) | No |
| `REMOTE_RPC_URL` | JSON-RPC URL of the remote Ethereum node | `deploy:remoteNode` only |
| `DEPLOYER_PRIVATE_KEY` | Private key for the remote deploying account | `deploy:remoteNode` only |

<br>

---

# 6. Development Setup & Testing

The npm scripts are thin wrappers over Hardhat CLI commands — `npm run node` is equivalent to `npx hardhat node`, `npm run build` to `npx hardhat compile`, etc. Use whichever form you prefer; the npm scripts are the canonical interface for this project.

**Manual deployment (without Docker Compose):**

```bash
cd flexibility-market-smartcontracts
npm install
npm run build                # compile contracts (= npx hardhat compile)
npm run node                 # start Hardhat node on :8545 — keep running in a separate terminal
npm run deploy:localhost     # deploy core contracts + copy ABIs to backend + update backend .env
npm test                     # run full test suite
npm run deploy:remoteNode    # deploy to remote network (requires .env with REMOTE_RPC_URL + DEPLOYER_PRIVATE_KEY)
```

**Deployment order** (dependency-driven): FlexibilityToken → ParticipantRegistry → Treasury → FlexibilityNFT → MarketFactory. Market and MarketSession are not deployed by this script — they are created at runtime via the factory pattern.

**Via Docker Compose:** the Hardhat service does not use the npm scripts. It runs `bash ./scripts/start-and-deploy.sh` directly, which starts the node and runs the deployment in a single step. The backend service waits for the `.deployed` sentinel file written to the shared volume before starting.

<br>

---

# 7. Related Components

| Component | Path | Description |
|---|---|---|
| Marketplace Backend | [`../marketplace-be/`](../marketplace-be/) | Consumes ABIs from `src/contracts/`; holds admin and FMO/LMO wallets; orchestrates all on-chain calls |
| Marketplace Frontend | [`../marketplace-fe/`](../marketplace-fe/) | Reads contract state directly via Ethers.js; contract addresses configured in `src/environments/environment.ts` |
