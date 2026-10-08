# ENPOWER Marketplace — User Guide

##### Table of Contents
[1. Introduction](#1-introduction)<br>
[2. Getting Started](#2-getting-started)<br>
&nbsp;&nbsp;&nbsp;[2.1 Accessing the Platform](#21-accessing-the-platform)<br>
&nbsp;&nbsp;&nbsp;[2.2 First Login](#22-first-login)<br>
&nbsp;&nbsp;&nbsp;[2.3 Accepting an Invitation](#23-accepting-an-invitation)<br>
&nbsp;&nbsp;&nbsp;[2.4 Creating Your Wallet](#24-creating-your-wallet)<br>
[3. Platform Roles](#3-platform-roles)<br>
[4. Marketplace Administrator (MARKETPLACE_ADMIN)](#4-marketplace-administrator-marketplace_admin)<br>
&nbsp;&nbsp;&nbsp;[4.1 Dashboard Overview](#41-dashboard-overview)<br>
&nbsp;&nbsp;&nbsp;[4.2 Creating a New Energy Community Market](#42-creating-a-new-energy-community-market)<br>
&nbsp;&nbsp;&nbsp;[4.3 Managing Markets](#43-managing-markets)<br>
&nbsp;&nbsp;&nbsp;[4.4 Inviting Users to Markets](#44-inviting-users-to-markets)<br>
[5. Market Operator (FMO/LMO)](#5-market-operator-fmolmo)<br>
&nbsp;&nbsp;&nbsp;[5.1 Dashboard Overview](#51-dashboard-overview)<br>
&nbsp;&nbsp;&nbsp;[5.2 Accepting a Market Invitation](#52-accepting-a-market-invitation)<br>
&nbsp;&nbsp;&nbsp;[5.3 Creating Your Market Wallet](#53-creating-your-market-wallet)<br>
&nbsp;&nbsp;&nbsp;[5.4 Activating the Market On-Chain](#54-activating-the-market-on-chain)<br>
&nbsp;&nbsp;&nbsp;[5.5 Inviting Participants (FRP and FSP)](#55-inviting-participants-frp-and-fsp)<br>
&nbsp;&nbsp;&nbsp;[5.6 Publishing a MarketSession](#56-publishing-a-marketsession)<br>
&nbsp;&nbsp;&nbsp;[5.7 Managing the MarketSession Lifecycle](#57-managing-the-marketsession-lifecycle)<br>
&nbsp;&nbsp;&nbsp;[5.8 Settlement Execution](#58-settlement-execution)<br>
&nbsp;&nbsp;&nbsp;[5.9 Energy Data: Historical Seeder and Daily Consumption](#59-energy-data-historical-seeder-and-daily-consumption)<br>
[6. Flexibility Requesting Party (FRP)](#6-flexibility-requesting-party-frp)<br>
&nbsp;&nbsp;&nbsp;[6.1 Dashboard Overview](#61-dashboard-overview)<br>
&nbsp;&nbsp;&nbsp;[6.2 Creating a MarketSession](#62-creating-a-marketsession)<br>
&nbsp;&nbsp;&nbsp;[6.3 Defining Flexibility Requests (Per-Hour Slots)](#63-defining-flexibility-requests-per-hour-slots)<br>
&nbsp;&nbsp;&nbsp;[6.4 Approving a Session for Publication](#64-approving-a-session-for-publication)<br>
&nbsp;&nbsp;&nbsp;[6.5 Depositing Payment for Settlement](#65-depositing-payment-for-settlement)<br>
&nbsp;&nbsp;&nbsp;[6.6 Viewing Settlement Results](#66-viewing-settlement-results)<br>
[7. Flexibility Service Provider (FSP)](#7-flexibility-service-provider-fsp)<br>
&nbsp;&nbsp;&nbsp;[7.1 Dashboard Overview](#71-dashboard-overview)<br>
&nbsp;&nbsp;&nbsp;[7.2 Browsing Open Sessions](#72-browsing-open-sessions)<br>
&nbsp;&nbsp;&nbsp;[7.3 Creating a Draft Offer](#73-creating-a-draft-offer)<br>
&nbsp;&nbsp;&nbsp;[7.4 Publishing an Offer On-Chain](#74-publishing-an-offer-on-chain)<br>
&nbsp;&nbsp;&nbsp;[7.5 Understanding Collateral and Fees](#75-understanding-collateral-and-fees)<br>
&nbsp;&nbsp;&nbsp;[7.6 Viewing Settlement Results and NFT Certificates](#76-viewing-settlement-results-and-nft-certificates)<br>
[8. Wallet and Transaction History](#8-wallet-and-transaction-history)<br>
&nbsp;&nbsp;&nbsp;[8.1 Wallet Dashboard](#81-wallet-dashboard)<br>
&nbsp;&nbsp;&nbsp;[8.2 Transaction History](#82-transaction-history)<br>
[9. FlexibilityNFT Certificates](#9-flexibilitynft-certificates)<br>
[10. Multi-Market Support](#10-multi-market-support)<br>
[11. Frequently Asked Questions (FAQ)](#11-frequently-asked-questions-faq)<br>

---

# 1. Introduction

The ENPOWER Marketplace is a blockchain-enabled platform for peer-to-peer (P2P) trading of energy flexibility within energy communities. It allows prosumers (or aggregated prosumers) — participants who both produce and consume energy — to trade flexibility services (e.g., adjusting solar panel output, battery storage discharge, EV charging schedules) through a tokenised marketplace.

This guide explains how to use the platform from the perspective of each user role. Whether you are a platform administrator setting up energy community markets, a market operator managing trading sessions, or a prosumer submitting flexibility offers, this guide covers the full workflow step by step.

**Key concepts:**

- **FlexibilityToken (FLEX):** The digital token used for all payments, collateral deposits, and fee transactions on the platform. Think of it as the currency of the marketplace.
- **FlexibilityNFT:** A digital certificate that represents a flexibility commitment. Once the commitment is fulfilled and settled, the NFT becomes permanent (soulbound) — serving as an immutable proof of service delivery.
- **MarketSession:** A trading session tied to a specific delivery day. It goes through a defined lifecycle: creation, offer collection, delivery, and settlement.
- **PIN:** A 6-digit personal identification number that protects your blockchain wallet. You will need it every time the platform executes a transaction on the blockchain on your behalf.

<br>

---

# 2. Getting Started

## 2.1 Accessing the Platform

Open your web browser and navigate to the Marketplace URL provided by your administrator (e.g., `http://SERVER_IP:4200`). You will see the public landing page with a **Acces Platform** button.

## 2.2 First Login

1. Click **Acces Platform** on the landing page.
2. You will be redirected to the Keycloak authentication screen.
3. Enter the **username** and **password**.
   - If you are the first administrator, use the default credentials: username `market_admin`, password `Asdf1234!`.
   - If you were invited as FMO, use the generated password for the first login, anf then, you will be able to change your password. 
   - If you received an invitation email as FSP or FRP, use the credentials you created during registration.
4. After successful authentication, you will be redirected to your role-specific **Dashboard** at `/home`.

## 2.3 Accepting an Invitation

If you have been invited to join a market by an FMO/LMO, FRP or FSP:

1. Open the **invitation link** sent to your email.
2. You will be taken to the invitation acceptance page (`/accept-invitation/:token`).
3. Review the invitation details (market name, your assigned role).
4. **Register a new account** by filling in your profile information and choosing a password.
5. Once registered, log in with your new credentials. You will be redirected to your Dashboard.

## 2.4 Creating Your Wallet

The platform uses a **custodial wallet system** — you do not need MetaMask or any external wallet application. Your blockchain wallet is created and managed within the platform.

1. On your first login (or when prompted), the platform will guide you through the **wallet creation flow**.
2. A random **6-digit PIN** will be created for your wallet. This PIN encrypts your wallet and is required every time a blockchain transaction is executed on your behalf.
3. **Keep your PIN safe.** The platform does not store your PIN, and it cannot be recovered.
4. Once the wallet is created, you will receive a confirmation email with your wallet details.

> **Important:** Your PIN is the key to authorising any on-chain action (publishing sessions, submitting offers, executing settlements). Without it, no blockchain transaction can proceed.

<br>

---

# 3. Platform Roles

The ENPOWER Marketplace has four roles, each with distinct responsibilities:

| Role | Full Name | What You Do |
|---|---|---|
| **MARKETPLACE_ADMIN** | Marketplace Administrator | Create and manage energy community markets across the entire platform. Invite FMO/LMO users to manage those markets. Can invite FRP an FSP users to created markets. |
| **FMO/LMO** | Flexibility Market Operator / Local Market Operator | Manage your energy community market: accept the market, activate it on-chain, invite participants, publish MarketSessions, manage the session lifecycle, and execute settlements. |
| **FRP** | Flexibility Requesting Party | Creates new market sessions and defines the flexibility needs for each session: specify how much energy flexibility needs per hour and at what price. Approve sessions for publication and deposit payment for final settlement. |
| **FSP** | Flexibility Service Provider | Submit offers to provide flexibility in response to FRP requests. Lock collateral when publishing offers. Deliver the committed flexibility and receive payment after settlement. |

Your role determines which Dashboard and actions are available to you. The platform automatically shows you only the features relevant to your role.

<br>

---

# 4. Marketplace Administrator (MARKETPLACE_ADMIN)

## 4.1 Dashboard Overview

After login, the MARKETPLACE_ADMIN sees a **platform-level overview** with aggregate statistics:
- Total number of markets
- Active markets
- Pending markets (awaiting FMO/LMO acceptance)
- Total users and per-role counts (FMO/LMO, FRP, FSP)

From the Dashboard, you can navigate to the **Markets Management** section.

## 4.2 Creating a New Energy Community Market

1. From the Dashboard, navigate to **Markets Management** (`/markets-management`).
2. Click **Create Market** (`/markets-management/create`).
3. Fill in the market details:
   - **Market name** and description
   - **Region** or community identifier
   - **FMO/LMO owner:** Provide the email address of the person who will manage this market. This person will receive an invitation email to accept the market.
4. Click **Create**. The market is created in `PENDING` state, awaiting the FMO/LMO's acceptance.

## 4.3 Managing Markets

In the **Markets Management** view, you can see all markets across the platform regardless of their state. Available actions:
- **Edit** a market's metadata
- **Deactivate** a market (the market and its sessions will be suspended)
- **Reactivate** a previously deactivated market
- **View details** of any market, including its participants and sessions

## 4.4 Inviting Users to Markets

The MARKETPLACE_ADMIN can invite users to any market on the platform:
1. Navigate to the market's detail view.
2. Click **Invite User**.
3. Enter the email address and select the role to assign (FRP or FSP).
4. The invited user will receive an email with a registration link.

<br>

---

# 5. Market Operator (FMO/LMO)

## 5.1 Dashboard Overview

The FMO/LMO Dashboard shows:
- **Your markets** and their current state (pending, accepted, active)
- **Active MarketSessions** with their on-chain status
- Action buttons for market and session management

## 5.2 Accepting a Market Invitation

When a MARKETPLACE_ADMIN creates a market and designates you as the owner:
1. You will receive an **invitation email**.
2. If you are a new user, follow the registration link to create your account.
3. Log in and navigate to your Dashboard.
4. You will see the pending market with an **Accept** or **Reject** option.
5. Click **Accept** to take ownership of the market. The market state transitions to `CREATED_OFFLINE_ACCEPTED`.

## 5.3 Creating Your Market Wallet

Before activating the market on-chain, you need a **market wallet**:
1. If you do not already have a wallet, the platform will prompt you to create one.
2. A random **6-digit PIN** will be created for your wallet and you will use it for every on-chain action.
3. Note: FMO/LMO wallets are bound to the **market** (not to your personal identity). Your signing identity represents the market on the blockchain.

## 5.4 Activating the Market On-Chain

Activation deploys the market as a smart contract on the blockchain. This is a one-time operation:

1. From your Dashboard or the market detail view, click **Activate Market**.
2. Enter your **6-digit PIN** in the PIN dialog.
3. The platform will:
   - Register you in the on-chain ParticipantRegistry
   - Mint initial FlexibilityTokens (FLEX)
   - Deploy the Market smart contract via MarketFactory
4. Once complete, the market transitions to `ACTIVE_ONCHAIN` and is ready for trading sessions.

## 5.5 Inviting Participants (FRP and FSP)

To populate your market with traders:
1. Open your market's detail view.
2. Click **Invite User**.
3. Enter the invitee's email address and select their role:
   - **FRP** — the party that will request flexibility (typically the energy community manager or DSO). There can be only one FRP user by market.
   - **FSP** — prosumers (or aggregated prosumers) who will offer flexibility services
4. The invited user receives an email with a link to register and join your market.
5. After registration and wallet creation, participants can start interacting with MarketSessions.

## 5.6 Publishing a MarketSession

After the FRP has created and approved a MarketSession (see [Section 6](#6-flexibility-requesting-party-frp)):

1. Navigate to the **Sessions** section.
2. You will see sessions in `APPROVED` state, ready for publication.
3. Click **Publish** on the session you want to deploy on-chain.
4. Enter your **PIN** in the dialog.
5. The platform deploys the MarketSession smart contract. The session state changes to `CREATED` (on-chain).

## 5.7 Managing the MarketSession Lifecycle

As FMO/LMO, you control the lifecycle of each MarketSession through the following steps:

> **A note on state names.** The platform tracks a session in two places: the
> application database, whose names the interface displays, and the MarketSession
> contract, whose names appear in block explorers and in the contract source. They
> do not use the same vocabulary. Where the two differ, both are given below.

| Step | Action | PIN Required | Result |
|---|---|---|---|
| 1 | **Open Offers** | Yes | Session moves to `ACTIVE` in the platform, `OFFERS_OPEN` on-chain. FSPs can now submit offers. |
| 2 | **Close Offers** | Yes | Session moves to `OFFERS_CLOSED` in the platform; on-chain the contract moves directly to `IN_DELIVERY`. No more offers accepted and the matched commitments are locked. The FlexibilityNFT certificates were already minted when each offer was published; they are transferred to the FRP and become non-transferable at settlement. |
| 3 | *(Automatic)* | No | The platform moves the session to `IN_DELIVERY` when the delivery window begins. The contract is already in that state from step 2. |
| 4 | *(Automatic)* | No | Measurement data is submitted on-chain by the oracle once the delivery window closes, which moves both the platform and the contract to `SETTLEMENT_PENDING`. |
| 5 | **Execute Settlement** | Yes | See [Section 5.8](#58-settlement-execution). |
| 6 | **Finalize Session** | Yes | Session moves to `SETTLED`. All offers must be settled before finalisation. |

**Cancellation:** If offers are still open close to the delivery window, you can cancel the session. This refunds all FSP collateral automatically.

**NOTE:** In order to be able to complete the entire workflow without having to wait several days, the time restrictions remain disabled in this model. 

## 5.8 Settlement Execution

Settlement is a multi-step process that you manage after the delivery day:

1. **Calculate all settlements:** Click **Calculate all** on the session. This action calculates the difference between actual consumption data and the standard profile of each user that participates in the session and calculates payment, penalty (if any), and fees.
2. **Submit Measurement Data:** Once IoT metering data is available (from the Energy Data Space), click **Submit Measurement Data**. Enter your PIN to record the measurement hash on-chain.
3. **Submit Settlement per Offer:** For each offer in the session, click **Submit Settlement**. The platform records on the blockchain the metered delivery against the committed quantity, payment amount, penalty (if any), and fees.
4. **Request FRP Payment:** Click **Request Payment** on the session. This sends an email notification to the FRP with the total amount required.
5. **Execute Settlement per Offer:** Click **Execute Settlement** for each offer. This:
   - Distributes FlexibilityTokens: payment from FRP to FSP, fee to FMO/LMO, penalty deductions (if under-delivery occurred)
   - Makes the FlexibilityNFT **soulbound** — permanently recording the service delivery on-chain
6. **Finalize Session:** Once all offers are settled, click **Finalize Session** to close the session permanently.

## 5.9 Energy Data: Historical Seeder and Daily Consumption

The platform requires energy consumption data for each FSP in order to calculate reference profiles used during settlement verification. There are two mechanisms for populating this data: the **Historical Data Seeder** (manual upload) and the **Energy Data Space integration** (automated daily ingestion).

### 5.9.1 Historical Data Seeder (Manual Upload)

The FMO/LMO can upload historical energy data for each FSP directly from the Dashboard:

1. From the FMO/LMO Dashboard, locate the **Quick Actions** section.
2. Click **Market Users**. A dropdown will open listing all users registered in your market.
3. For each **FSP** user, an **Actions** column is available. Click the upload button to select a file from your local machine.
4. The uploaded file is used as **historical energy data** to populate the database for that specific FSP.
5. Once processed, the platform calculates three reference profiles for the FSP:
   - **Reference_Standard** — the baseline consumption/production profile
   - **Reference_MIN** — the minimum expected profile
   - **Reference_MAX** — the maximum expected profile

These reference profiles are essential for evaluating the flexibility delivered by the FSP during settlement, as they establish the expected baseline against which actual delivery is measured.

### 5.9.2 Daily Consumption Data (Energy Data Space Integration)

For ongoing daily consumption data, the platform relies on the **Energy Data Space integration** through the Dataspace File Ingestion Microservice (DFIM) and an external Scheduler service:

1. **Install and configure** the Energy Data Space infrastructure (TRUE Connector).
2. **Create an account** in the Energy Data Space.
3. **Subscribe** to the appropriate data offering corresponding to the metering data of your energy community.
4. Once subscribed, the Scheduler service automatically retrieves measurement data on a cron schedule, and the DFIM translates and imports it into the Marketplace database.

> **Note:** The Scheduler is an **external tool, not part of this project**: it is not included in the repository or in the release, and a production deployment must provide its own. Full Data Space integration likewise requires infrastructure outside the project (step 1). Without them, use the Historical Data Seeder (section 5.9.1) to upload energy data for each FSP manually. In a production deployment with a scheduler and a configured Energy Data Space, daily consumption data flows automatically without manual intervention.

<br>

---

# 6. Flexibility Requesting Party (FRP)

## 6.1 Dashboard Overview

The FRP Dashboard shows:
- **Active MarketSessions** for your assigned market
- **Wallet balance** — your current FlexibilityToken (FLEX) and ETH balance
- **Treasury balance** — funds currently held in escrow
- **Pending payment requests** — if the FMO/LMO has requested a payment deposit, a modal will appear automatically on login listing the sessions that require funding

## 6.2 Creating a MarketSession

You are responsible for defining the flexibility needs:

1. Navigate to the **Market Sessions Draft** section.
2. Click **Create Session**.
3. Select the **delivery date** (the day when flexibility will be provided).
4. For each hour of the delivery day, specify your flexibility requirements:
   -  For each time slot (hour), enter:
      - **Quantity (MW):** How much flexibility you need for that hour.
      - **Price per unit:** The price you are willing to pay per unit of flexibility.
      - **Flexibility Type:** The direction of the commitment (Upward for increase consume and Downward to decrease consume).
5. Finalising the proccess, the session is created in `DRAFT` status.
6. You can edit the slots as many times as needed while the session is in `DRAFT` status.

## 6.3 Approving a Session for Publication

Once you are satisfied with the flexibility requests:

1. Click **Approve** on the session.
2. The session transitions from `DRAFT` to `APPROVED`.
3. The FMO/LMO can now publish it on-chain.

> **Note:** You can revert an approved session back to `DRAFT` if you need to make changes, as long as the FMO/LMO has not yet published it.

## 6.4 Depositing Payment for Settlement

After the delivery day, when the FMO/LMO requests payment:

1. You will receive an email notification and see a **pending payment modal** on your Dashboard.
2. The modal shows the exact total amount of FlexibilityTokens required to fund all settlements for the session.
3. Click **Deposit Payment**.
4. Enter your **PIN** to authorise the deposit into the Treasury contract.
5. Once deposited, the FMO/LMO can proceed with settlement execution.

## 6.5 Viewing Settlement Results

After the FMO/LMO executes settlement:

1. Navigate to the **Settlements** section.
2. Select a settled session to view the results.
3. For each offer, you can see:
   - Committed quantity vs. metered delivery
   - Delivery ratio
   - Payment amount
   - Penalty deductions (if the FSP under-delivered)
4. Each settled offer links to its **FlexibilityNFT certificate**, which serves as your proof of flexibility service delivery.

<br>

---

# 7. Flexibility Service Provider (FSP)

## 7.1 Dashboard Overview

The FSP Dashboard shows:
- **Your markets** — the energy communities you belong to
- **Sessions open for offers** — MarketSessions currently accepting flexibility offers
- **Wallet balance** — your FlexibilityToken (FLEX) and ETH balance
- A quick navigation link to the **Offer Submission Wizard**

On your first login, if you do not yet have a wallet, the platform will guide you through the wallet creation flow (see [Section 2.4](#24-creating-your-wallet)).

## 7.2 Browsing Open Sessions

1. From the Dashboard or from the 'Market Session Active' side bar section, view sessions that are currently in `ACTIVE` status (`OFFERS_OPEN` on-chain).
2. Click on a session to see the details:
   - Delivery date
   - Per-hour flexibility requests (quantity and price for each time slot)

## 7.3 Creating a Draft Offer

1. Navigate to the **Offer Submission Wizard** for the selected session.
2. The wizard shows the session's hourly flexibility requests alongside any offers you have already created.
3. For a specific hour slot, click **Create Offer**.
4. In the create-offer modal, enter the **energy quantity** you can provide for that slot.
5. Click **Save**. The offer is saved as a `DRAFT` (off-chain only — no tokens are locked yet).
6. You can create drafts for multiple hour slots and review them before committing.

## 7.4 Publishing an Offer On-Chain

When you are satisfied with a draft offer:

1. Click **Publish** on the draft offer.
2. A **PIN dialog** appears. Enter your 6-digit PIN.
3. The platform executes three transactions on your behalf:
   - An **ERC-20 approval** covering the collateral (5% of the offer value) and the platform fee (2%)
   - An **ERC-1155 operator approval**, so the session contract can transfer your certificate to the FRP at settlement
   - The **offer submission** itself, which registers the offer in the MarketSession contract, locks the collateral and the fee, and **mints your FlexibilityNFT certificate**
4. The offer status changes to `PUBLISHED`.
5. Offers are **auto-matched** in order of arrival (FIFO — First In, First Out) until each hour slot is filled. If your offer fills the last available spot, it may be **partially matched**.

> **Important:** Once published, your collateral and fee are locked. They will be returned only if the session is cancelled or during settlement.

## 7.5 Understanding Collateral and Fees

When you publish an offer, the platform locks tokens as a guarantee of your commitment:

| Concept | Percentage | Description |
|---|---|---|
| **Collateral** | 5% of offer value | Returned after successful delivery. If you under-deliver, a portion is deducted as a penalty. |
| **Platform Fee** | 2% of offer value | Paid to the FMO/LMO as a market operation fee. |

**What happens at settlement:**
- **Full delivery:** You receive the agreed payment from the FRP, and your collateral is returned in full.
- **Partial delivery:** You receive a proportional payment. A penalty is deducted from your collateral based on the shortfall. The remaining collateral is returned.
- **Session cancellation:** Your full collateral and fee are refunded automatically.

## 7.6 Viewing Settlement Results and NFT Certificates

After settlement is executed:

1. Navigate to the **Settlements** section.
2. You will see only **your own settlements**.
3. For each settled offer, view:
   - Committed vs. delivered quantity
   - Delivery ratio
   - Payment received
   - Penalty applied (if any)
4. Each settled offer links to its **FlexibilityNFT certificate** — click through to see the full provenance record (see [Section 9](#9-flexibilitynft-certificates)).

<br>

---

# 8. Wallet and Transaction History

## 8.1 Wallet Dashboard

All users with a wallet can access the **Balance** from the navigation menu. It displays:
- **ETH balance:** Your Ether balance (used for gas fees, managed transparently by the platform).
- **FLEX balance:** Your FlexibilityToken balance — the tokens available for trading, collateral, and payments.

Balances are read directly from the blockchain in real time, so that, **sometimes the page needs to be recharged to be aligned with the blockchain**.**

## 8.2 Transaction History

The Transaction History view lists all blockchain transactions associated with your wallet:
- **Transaction hash:** Unique identifier for each transaction
- **Transaction Log:** The nature of the transaction (offer publication, settlement, Deposit FLEX tokens, etc.)
- **Timestamp:** When the transaction was executed
- **From and To:** The originating user and the recipient of the transaction
- **Gas Used:** The amount of ETH the transaction has cost
- **Status:** Whether the transaction was confirmed on-chain

**Role-specific views:**
- **FMO/LMO users** see a market-scoped transaction history covering all sessions of their market.
- **MARKETPLACE_ADMINs** can access the platform-wide transaction log across all markets.
- **FRP and FSP users** see only their own transactions.

<br>

---

# 9. FlexibilityNFT Certificates

Every matched and settled offer generates a **FlexibilityNFT** — a digital certificate on the blockchain that proves a flexibility service was committed and delivered.

**The NFT lifecycle:**
1. **Minted** — Created when an FSP's offer is accepted during offer matching. Held by the FSP.
2. **Updated after matching** — Records the accepted quantity and the FMO/LMO address.
3. **Updated after settlement validation** — Records the metered delivery, measurement hash, and delivery outcome.
4. **Finalised (Soulbound)** — After settlement execution, the NFT is transferred from FSP to FRP and made **soulbound** — it can never be transferred again. This makes it a permanent, tamper-proof record.

**Viewing a certificate:**
1. Navigate to the **Settlements** section.
2. Select a settled session.
3. Each completed offer shows a link to its NFT certificate.
4. The certificate detail view (`/nft-certificates/:tokenId`) shows:
   - **Token ID** on the blockchain
   - **Session reference** (which MarketSession it belongs to)
   - **Committed quantity** and **delivered quantity**
   - **Delivery ratio**
   - **Settlement amounts** (payment, penalty, fee)
   - **Participant addresses** (FSP and FMO/LMO wallets)
   - **Blockchain provenance** — transaction hashes for the mint and settlement operations

<br>

---

# 10. Multi-Market Support

The ENPOWER Marketplace supports multiple independent energy community markets on a single deployment. If you are a member of more than one market:

1. Your active market is shown in the interface.
2. To **switch markets**, use the **market selection modal** available from the navigation menu.
3. When you switch, the platform refreshes your authentication token to reflect the new market context.
4. All data displayed (sessions, offers, settlements) is automatically scoped to your currently active market.

> **Note:** Switching markets does not affect your wallet. Your wallet identity remains the same across all markets.

<br>

---

# 11. Frequently Asked Questions (FAQ)

**Q: I forgot my PIN. How can I recover it?**<br>
The platform does not store your PIN and cannot recover it. Contact your market administrator (FMO/LMO) or the MARKETPLACE_ADMIN for assistance.

**Q: Do I need MetaMask or any external wallet?**<br>
No. The platform uses a custodial wallet system. Your wallet is created and managed entirely within the platform. All blockchain transactions are signed on the server using your PIN.

**Q: What happens if I don't deliver the full amount of flexibility I committed?**<br>
If you (as FSP) deliver less than the committed quantity, a penalty is deducted from your 5% collateral proportional to the shortfall. You will still receive payment for the portion you did deliver.

**Q: Can I cancel a published offer?**<br>
Once published, an individual offer cannot be cancelled by the FSP. However, if the FMO/LMO cancels the entire session (e.g., due to insufficient offers), all locked collateral and fees are refunded automatically.

**Q: When do I receive payment as an FSP?**<br>
Payment is distributed during the settlement execution phase (Day D+1 or later), after the FRP has deposited the required payment and the FMO/LMO has executed the settlement for your offer.

**Q: How do I know the settlement is fair?**<br>
Settlement is verified on-chain against IoT metering data. The FlexibilityNFT certificate records the exact committed and delivered quantities, the measurement hash, and all payment calculations — all immutably stored on the blockchain.

**Q: Can I participate in multiple markets simultaneously?**<br>
Yes. If you are invited to multiple markets, you can switch between them using the market selection modal. Your wallet works across all markets.

**Q: What is the FlexibilityToken (FLEX)?**<br>
FLEX is the ERC-20 token used as the medium of exchange on the platform. It is used for payments (FRP to FSP), collateral deposits, platform fees, and Treasury operations. FLEX tokens are minted by the platform when markets are activated.

**Q: What does "soulbound" mean for the NFT?**<br>
Once a FlexibilityNFT is settled and finalised, it becomes soulbound — meaning it is permanently attached to the holder's wallet and cannot be transferred or sold. This ensures it serves as an authentic, non-falsifiable proof of flexibility service delivery.
