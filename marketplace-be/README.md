##### Table of Contents
[1. Overview](#1-overview)<br>
[2. Marketplace Lifecycle](#2-marketplace-lifecycle)<br>
[3. Design Decisions](#3-design-decisions)<br>
&nbsp;&nbsp;&nbsp;[3.1 PIN-Encrypted Custodial Wallets](#32-pin-encrypted-custodial-wallets)<br>
&nbsp;&nbsp;&nbsp;[3.2 Multi-Market JWT Context](#33-multi-market-jwt-context)<br>
[4. Technology Stack](#4-technology-stack)<br>
[5. API / Interface](#5-api--interface)<br>
&nbsp;&nbsp;&nbsp;[5.1 Market Creation and Activation](#51-market-creation-and-activation)<br>
&nbsp;&nbsp;&nbsp;[5.2 MarketSession Lifecycle](#52-marketsession-lifecycle)<br>
&nbsp;&nbsp;&nbsp;[5.3 Offer Creation and On-Chain Submission](#53-offer-creation-and-on-chain-submission)<br>
&nbsp;&nbsp;&nbsp;[5.4 Settlement Process](#54-settlement-process)<br>
[6. Integration with Other Components](#6-integration-with-other-components)<br>
[7. Environment Variables](#7-environment-variables)<br>
[8. Development Setup](#8-development-setup)<br>
[9. Related Components](#9-related-components)<br>

---

# 1. Overview

<p align="justify">
The marketplace-be sub-project is the NestJS backend that serves as the application layer of the ENPOWER Marketplace. It exposes a RESTful API — documented via Swagger at <strong>/docs</strong> — and orchestrates the complete lifecycle of a flexibility trading session: from market creation and participant onboarding, through offer submission and MarketSession state transitions, to on-chain settlement with automated penalty enforcement.
</p>

<p align="justify">
Identity and access management is delegated entirely to Keycloak via OpenID Connect. The JWT issued by Keycloak carries the user's role and active market assignment as custom claims, which the backend reads to enforce both coarse-grained route guards (via <strong>nest-keycloak-connect</strong>) and fine-grained business logic — for example, ensuring that only the FMO/LMO who owns a market can publish its MarketSessions. All blockchain interactions are executed via Ethers.js v6 using PIN-encrypted custodial wallets stored per user; every on-chain operation is simultaneously persisted to MongoDB via a write-through strategy, keeping the off-chain database in sync.
</p>

<p align="justify">
The module composition reflects the domain structure of the platform: Auth (registration and onboarding), MarketFactory (market CRUD and on-chain deployment), Session (MarketSession lifecycle), HourlyOffer (FSP offer creation and on-chain submission), Settlement (FRP payment flow, and fees analytics), Wallet (custodial wallet management and encryption services), Invitation (email-based participant onboarding), Tenant (multi-market context switching via JWT attribute injection into Keycloak), Flexibility (theoretical and actual flexibility data for settlement verification), and TransactionHistory (global blockchain transaction capture via interceptor).
</p>

<br>

---

# 2. Marketplace Lifecycle

<p align="justify">
Each flexibility trading cycle spans three days. The FRP prepares a MarketSession specifying the delivery day and the flexibility requirements for one or more time slots. Before <strong>Day D-1</strong>, if the MarketSession has been approved by the FRP, the FMO/LMO publishes the MarketSession on-chain. At the beginning of <strong>Day D-1</strong> the FMO/LMO opens the offers period. FSPs can then review the session and submit offers, locking FlexibilityToken collateral (5%) and a platform fee (2%) at submission time. Offer matching is performed automatically by entry order, and matched offers are represented as FlexibilityNFT tokens. On <strong>Day D</strong>, the FSP delivers the flexibility as committed; IoT metering data is ingested via the Energy Data Space integration layer and stored for verification. On <strong>Day D+1</strong> (or whenever this metering data is available), settlement is executed in two on-chain steps: <strong>submitSettlement</strong> validates the metered outcome against the committed quantities; then the FRP deposits the payment amount, and <strong>executeSettlement</strong> processes all token transfers, applies any penalty deductions for under-delivery, and makes the FlexibilityNFT soulbound — permanently recording the service delivery event on-chain. The MarketSession state machine enforces this lifecycle through six sequential phases:
</p>

```
CREATED → OFFERS_OPEN → OFFERS_CLOSED → IN_DELIVERY → SETTLEMENT_PENDING → SETTLED
```

<br>

---

# 3. Design Decisions

## 3.1 PIN-Encrypted Custodial Wallets

<p align="justify">
The platform targets energy community prosumers who are not expected to manage an external wallet (e.g., MetaMask) or handle raw private keys. The wallet module therefore implements a <strong>custodial wallet system</strong>: when a user registers, an Ethereum wallet is generated and its private key is encrypted with a 6-digit PIN known only to the user. The encrypted keystore is stored in MongoDB; the private key is never persisted in plaintext and is only decrypted in memory at the moment a transaction must be signed, using the PIN provided in the request body. Once the transaction is sent, the decrypted key is discarded.
</p>

<p align="justify">
Two binding modes exist: <strong>SELF</strong> wallets are tied to the user's identity (used by FSPs and FRPs, who each have their own on-chain address) and <strong>MARKET</strong> wallets are tied to a specific market (used by FMO/LMO users, whose signing identity represents the market rather than the individual). The distinction matters for on-chain role assignments: the ParticipantRegistry and MarketSession contracts grant roles to wallet addresses, not to Keycloak identities.
</p>

## 3.2 Multi-Market JWT Context

<p align="justify">
The platform is multi-tenant: a single deployment hosts multiple independent energy community markets, and a user may have access to more than one. The active market context must be available on every API request so that the <strong>TenantContextInterceptor</strong> can scope database queries and blockchain calls to the correct market — without requiring the client to pass a market ID on every call.
</p>

<p align="justify">
The chosen mechanism injects the active market as a custom 'current_market' attribute into the Keycloak user profile. When a user selects or switches their active market via the <code>/api/market/select</code> or <code>/api/market/switch</code> endpoints, the backend calls the Keycloak Admin API to update the attribute. The frontend is instructed to refresh its JWT; the renewed token carries the updated 'current_market' claim, which the <strong>TenantContextInterceptor</strong> reads on every subsequent request. This approach keeps market context in the authoritative identity layer without introducing a server-side session, preserving the stateless nature of the API.
</p>

<br>

---

# 4. Technology Stack

| Component | Technology | Version |
|---|---|---|
| Framework | NestJS | ^11.0.1 |
| Language | TypeScript | ^5.7.3 |
| Runtime | Node.js | 20 (alpine) |
| ODM / Database | Mongoose + MongoDB | ^8.15.0 |
| Blockchain client | Ethers.js | ^6.15.0 |
| Email | nodemailer | ^6.9.8 |
| Password hashing | bcrypt | ^6.0.0 |

<br>

---

# 5. API / Interface

<p align="justify">
The complete API reference — all endpoints, request/response schemas, authentication requirements, and interactive testing — is available via Swagger UI at <code>http://SERVER_IP:3000/docs</code>. The Swagger UI is pre-configured to use the PKCE authorisation code flow with the swagger Keycloak client of the enpower-marketplace realm, so no manual token handling is required to test authenticated endpoints.
</p>

<p align="justify">
The section below documents the key endpoints that represent the end-to-end flexibility trading workflow — from market creation through to on-chain settlement. All other endpoints are described in Swagger.
</p>

## 5.1 Market Creation and Activation

<p align="justify">
A market is first created off-chain by the MARKETPLACE_ADMIN, then accepted by its designated FMO/LMO owner, and finally deployed as a smart contract on-chain using the owner's PIN-unlocked wallet. This three-step flow ensures that the on-chain deployment is authorised by the market owner's own cryptographic identity.
</p>

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/market-factory/market-with-owner` | MARKETPLACE_ADMIN | Creates market record off-chain and provisions the FMO/LMO owner account |
| POST | `/market-factory/market-acceptation/:id` | FMO_LMO | FMO/LMO accepts the market invitation, transitioning state to `CREATED_OFFLINE_ACCEPTED` |
| POST | `/market-factory/request-activation-pin/:marketId` | FMO_LMO | Validates ownership and prompts for the wallet PIN before on-chain deployment |
| POST | `/market-factory/activate-market-with-pin/:marketId` | FMO_LMO | Registers the FMO/LMO in ParticipantRegistry, mints initial FlexibilityTokens, and deploys the Market contract via MarketFactory |

<p align="justify">The MARKETPLACE_ADMIN (all markets) and the FMO/LMO (own market only) can both invite new users at any time. New users can only participate in MarketSessions published on-chain after completing the onboarding process.</p>

## 5.2 MarketSession Lifecycle

<p align="justify">
A MarketSession progresses through eight backend statuses that map to the six on-chain phases of the state machine. The FRP creates the session off-chain and defines per-slot flexibility requests; the FMO/LMO then publishes the session on-chain. Two intermediate transitions — <code>OFFERS_CLOSED → IN_DELIVERY</code> and <code>IN_DELIVERY → SETTLEMENT_PENDING</code> — are performed automatically by scheduled cron jobs. Each transition that writes to the blockchain requires the caller's PIN to decrypt their wallet.
</p>

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/sessions` | FRP | Creates a MarketSession in `DRAFT` status with per-hour flexibility requests |
| POST | `/sessions/:id/approve` | FRP | Transitions the session from `DRAFT` to `APPROVED` |
| POST | `/sessions/:id/publish-with-pin` | FMO_LMO | Deploys the MarketSession smart contract on-chain — on-chain phase: `CREATED` |
| POST | `/sessions/:id/open-offers` | FMO_LMO | Opens the offer submission window — on-chain phase: `OFFERS_OPEN` |
| POST | `/sessions/:id/close-offers` | FMO_LMO | Closes the offer window; matched offers are locked and FlexibilityNFTs minted to accepted FSPs — session status: `OFFERS_CLOSED` |
| CRON | — | Scheduled | `autoTransitionClosedSessionsToInDelivery()` — automatically advances sessions from `OFFERS_CLOSED` to `IN_DELIVERY` once the delivery window begins |
| CRON | — | Scheduled | `autoTransitionInDeliverySessionsToSettlementPending()` — automatically advances sessions from `IN_DELIVERY` to `SETTLEMENT_PENDING` once the delivery window has closed and measurement data is available |
| POST | `/sessions/:id/return-tokens` | FMO_LMO | Returns FlexibilityToken collateral to FSPs when the session reaches `CANCELLED` status (terminal phase; reached when the session cannot proceed, e.g. insufficient matched offers) |

## 5.3 Offer Creation and On-Chain Submission

<p align="justify">
FSP offers follow a two-phase pattern: the offer is first created as an off-chain draft (allowing the FSP to review it before committing), then submitted to the blockchain with a separate call that requires the FSP's PIN. This design minimises the number of on-chain transactions and avoids gas costs for offers that are discarded before submission.
</p>

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/hourly-offers` | FSP | Creates a PENDING offer draft off-chain for a specific session and hour slot |
| POST | `/hourly-offers/:offerId/publish` | FSP | Locks FlexibilityToken collateral (5%) + platform fee (2%) on-chain and submits the offer to the MarketSession contract |

## 5.4 Settlement Process

<p align="justify">
Settlement is a two-step on-chain process executed on Day D+1. The FMO/LMO first requests the FRP to deposit payment into the Treasury, then submits IoT measurement data on-chain to advance the session to SETTLEMENT_PENDING. For each offer, <code>submitSettlement</code> validates the metered delivery against the commitment, and <code>executeSettlement</code> distributes tokens (payment to FSP, fee to FMO/LMO, penalty deductions if applicable) and makes the FlexibilityNFT soulbound.
</p>

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/settlements/session/:sessionAddress/request-frp-payment` | FMO_LMO | Creates a payment request and sends email notification to the FRP with the total amount required |
| POST | `/settlements/session/:sessionAddress/deposit-frp-payment` | FRP | FRP deposits FlexibilityTokens into the Treasury contract to fund all settlements for the session |
| POST | `/settlements/session/:sessionAddress/submit-measurement-data` | FMO_LMO | Submits the IoT measurement hash on-chain |
| GET | `/settlements/session/:sessionAddress/offer/:offerId/calculate` | Any | Preview of the settlement calculation for offers — delivery ratio, payment, penalty, and fee amounts — without writing to the blockchain |
| POST | `/settlements/session/:sessionAddress/offer/:offerId/submit` | FMO_LMO | Calls `submitSettlement` on the MarketSession contract; validates metered delivery against the committed quantity |
| POST | `/settlements/session/:sessionAddress/offer/:offerId/execute` | FMO_LMO | Calls `executeSettlement`; distributes FlexibilityTokens from the Treasury and makes the FlexibilityNFT soulbound |
| POST | `/settlements/session/:sessionAddress/finalize` | FMO_LMO | Transitions the session to `SETTLED` status on-chain once all offers are settled |

<br>

---

# 6. Integration with Other Components

<p align="justify">
<strong>Keycloak</strong>: The backend registers the <code>nest-keycloak-connect</code> adapter at startup, pointing to the configured realm and client. Every incoming request is validated against Keycloak's JWKS endpoint. Role guards (AuthGuard, RoleGuard, ResourceGuard) are applied globally.
</p>

<p align="justify">
<strong>MongoDB</strong>: The Mongoose ODM manages the following collections: users, markets, sessions, hourlyoffers, settlements, wallets, invitations, transactionhistories, flexibilitydata, consumptiondata, and frppaymentrequests. The write-through strategy is enforced by the TxHashCaptureInterceptor, which captures the blockchain transaction hash from every service method response and persists a transaction history record automatically.
</p>

<p align="justify">
<strong>Blockchain (Smart Contracts)</strong>: An Ethers.js provider connects to the configured JSON-RPC endpoint at startup. Contract ABI JSON files are loaded from <code>dist/contracts/</code>, which is populated either by the Docker Compose shared volume on startup (automatic deployment path) or by a manual copy from <code>flexibility-market-smartcontracts/</code>. Each contract has a dedicated service wrapper covering: MarketFactory, Market, MarketSession, FlexibilityToken, FlexibilityNFT, ParticipantRegistry and Treasury.
</p>

<p align="justify">
<strong>Frontend</strong>: The Angular frontend consumes all REST endpoints. Real-time MarketSession state updates are propagated to the frontend via WebSocket events emitted by the session module. CORS is enabled globally; the <code>FRONTEND_URL</code> environment variable must match the Angular application's origin.
</p>

<p align="justify">
<strong>Ingestion Microservice</strong>: The Dataspace File Ingestion Microservice (DFIM) calls the <code>/api/flexibility/consumption-data</code> endpoints to import translated energy metering files into MongoDB, where they are consumed by the actual flexibility calculation service during settlement.
</p>

<p align="justify">
<strong>Email (SMTP)</strong>: The email module uses Nodemailer for transactional emails: invitation links, wallet PIN notifications (sent immediately after wallet creation), and FRP payment request notifications. When running with Docker Compose, MailHog is used as the SMTP relay (port 1025, no authentication required).
</p>

<br>

---

# 7. Environment Variables

<p align="justify">
All environment variables are defined in <code>marketplace-be/.env.docker</code> (copied from <code>.env.example</code>). This file is injected into the container via the <code>env_file</code> directive in Docker Compose. Smart contract addresses are auto-populated by the Docker Compose startup sequence (written to the shared volume by the Hardhat service) and do not need to be set manually.
</p>

The `.env` configuration can be found in the root [README](../README.md).

<br>

---

# 8. Development Setup

### 8.1 Prerequisites

| Tool | Minimum version |
|---|---|
| Docker Engine | 24+ |
| Docker Compose | v2 |
| Git | Any |

### 8.2 Deployment via Docker Compose

```bash
# Start the full stack from the repository root
docker compose up -d

# Or start only the backend and its dependencies
docker compose up -d hardhat mongodb backend

# Access points
# REST API:   http://SERVER_IP:3000
# Swagger UI: http://SERVER_IP:3000/docs
```

<p align="justify">
If changes are made to the source code or environment files, rebuild the image before restarting:
</p>

```bash
docker compose build backend
docker compose up -d backend
```

<p align="justify">
The Dockerfile uses a two-stage build: the <strong>builder</strong> stage installs all dependencies and compiles TypeScript; the <strong>production</strong> stage copies only the compiled output and installs production dependencies only, producing a minimal runtime image based on node:20-alpine. The container exposes port <strong>3000</strong>.
</p>

<br>

---

# 9. Related Components

| Component | Path | Description |
|---|---|---|
| Marketplace Frontend | [`../marketplace-fe/`](../marketplace-fe/) | Angular frontend that consumes all REST endpoints and WebSocket events exposed by this backend |
| Smart Contracts | [`../flexibility-market-smartcontracts/`](../flexibility-market-smartcontracts/) | Solidity contracts whose ABIs and deployed addresses are loaded by this backend at startup |
| Ingestion Microservice | [`../dataspace-file-ingestion-microservice/`](../dataspace-file-ingestion-microservice/) | Imports translated energy metering files into the flexibility data collections consumed by settlement verification |
| Ingestion Dashboard | [`../injection-dashboard/`](../injection-dashboard/) | Monitoring UI for the ingestion pipeline; does not interact with the backend directly |
