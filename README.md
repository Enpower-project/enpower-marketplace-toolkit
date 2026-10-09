##### Table of Contents
[1. Project Overview](#1-project-overview)<br>
[2. Architecture](#2-architecture)<br>
&nbsp;&nbsp;&nbsp;[2.1 High-Level Architecture](#21-high-level-architecture)<br>
&nbsp;&nbsp;&nbsp;[2.2 Technology Stack](#22-technology-stack)<br>
[3. Repository Structure](#3-repository-structure)<br>
[4. Deployment](#4-deployment)<br>
&nbsp;&nbsp;&nbsp;[4.1 Quick Start](#41-quick-start)<br>
&nbsp;&nbsp;&nbsp;[4.2 Deployment on a Linux Server](#42-deployment-on-a-linux-server)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[4.2.1 Prerequisites](#421-prerequisites)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[4.2.2 Clone and Initial Configuration](#422-clone-and-initial-configuration)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[4.2.3 Phase 1 — Start Keycloak and Retrieve Client Secrets](#423-phase-1--start-keycloak-and-retrieve-client-secrets)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[4.2.4 Configure the Backend Environment](#424-configure-the-backend-environment)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[4.2.5 Configure the Frontend Environment](#425-configure-the-frontend-environment)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[4.2.6 Configure the Ingestion Dashboard Environment](#426-configure-the-ingestion-dashboard-environment)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[4.2.7 Phase 2 — Start All Remaining Services](#427-phase-2--start-all-remaining-services)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[4.2.8 Post-Deployment: Frontend Contract Addresses](#428-post-deployment-frontend-contract-addresses)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[4.2.9 Verify](#429-verify)<br>
[5. Related ENPOWER Repositories](#5-related-enpower-repositories)<br>

---

# 1. Project Overview

[![Horizon Europe](https://img.shields.io/badge/Funded%20by-Horizon%20Europe-blue)](https://cordis.europa.eu/project/id/101096354)


<p align="justify">
The ENPOWER project brings together a European consortium spanning research institutions, energy operators, technology companies, and citizen energy communities with the aim of enabling a consumer-centric energy system. This repository contains the <strong>ENPOWER Marketplace</strong> — the central technical contribution of DST to the project, an open-source, blockchain-enabled platform for peer-to-peer (P2P) trading of energy flexibility within energy communities.
</p>

<p align="justify">
Energy communities generate distributed energy resources — solar panels, battery storage, EV chargers, heat pumps — that can provide valuable flexibility services to the electricity grid. However, small prosumers currently lack the tools, infrastructure, and market access to participate in flexibility markets on equal terms with large operators. The ENPOWER Marketplace addresses this gap by providing a tokenised marketplace where flexibility needs and offers are matched, verified, and settled through smart contracts. Value transfer and collateral management are handled by the <strong>FlexibilityToken</strong> (ERC-20), while every accepted commitment is represented as a <strong>FlexibilityNFT</strong> (ERC-1155) that becomes soulbound upon settlement — creating an immutable on-chain certificate of service delivery. An Energy Data Space integration layer ensures sovereign, interoperable, and policy-controlled sharing of metered energy data between heterogeneous pilot systems.
The platform supports a multi-tenant, multi-market architecture: a single deployment can host independent energy community markets, each with its own participant registry and MarketSession schedule.
</p>

<br>

### Terminology

The following role abbreviations are used throughout this documentation and within the platform:

| Term | Full Name | Description |
|---|---|---|
| **MARKETPLACE_ADMIN** | Marketplace Administrator | Platform-level administration across all markets and tenants, creates energy community markets |
| **FRP** | Flexibility Requesting Party | Plans and approves flexibility needs with per-slot quantity and pricing; deposits payment before settlement execution |
| **FMO / LMO** | Flexibility Market Operator / Local Market Operator | Publishes MarketSessions on-chain, and manages MarketSession lifecycle |
| **FSP** | Flexibility Service Provider | Submits offers to provide flexibility; deposits collateral and a platform fees when creating offers |

<br>

---

# 2. Architecture

## 2.1 High-Level Architecture

<p align="justify">
The platform follows a layered architecture fully containerised via Docker Compose. The <strong>Presentation Layer</strong> is an Angular 19+ frontend providing role-aware dashboards, market exploration views, an offer submission and final settlement wizards. The <strong>Application Layer</strong> is a NestJS backend exposing RESTful APIs (documented via Swagger) and WebSocket channels for real-time events, handling MarketSession orchestration, offer validation, and blockchain transaction execution via Ethers.js. The <strong>Data Layer</strong> uses MongoDB for off-chain persistence with a write-through strategy: every critical on-chain operation is captured and persisted to MongoDB at the moment it is performed, maintaining an up-to-date replica without requiring blockchain polling or event-listening.
</p>

<p align="justify">
The <strong>Blockchain Layer</strong> consists of Solidity smart contracts deployed on an Ethereum-compatible test network, implementing a factory pattern with a five-stage session lifecycle plus a terminal cancelled state, a dual-token architecture (ERC-20 FlexibilityToken and ERC-1155 FlexibilityNFT), and OpenZeppelin AccessControl for role-based permission enforcement. The <strong>IAM Layer</strong> uses Keycloak for centralised identity management (SSO, OAuth 2.0, OpenID Connect). The <strong>Data Space Integration Layer</strong> uses a TRUE Connector for sovereign data exchange between pilot sites, with the ENCOM ontology and SEMAPTIC data model providing semantic interoperability.
</p>

![Figure 1 — High-level architecture of the ENPOWER Marketplace Toolkit](./images/architecture_enpower.png)

*Figure 1 — High-level architecture of the ENPOWER Marketplace Toolkit.*

<br>

## 2.2 Technology Stack

| Component | Technology |
|---|---|
| Frontend | Angular 19+, TypeScript, Ethers.js |
| Backend | NestJS 11, TypeScript, Node.js, Ethers.js |
| Database | MongoDB 4.4 |
| Blockchain / DLT | Solidity 0.8.20, Hardhat 2, OpenZeppelin |
| IAM | Keycloak, OAuth 2.0, OpenID Connect |
| Data Space Connector | OneNet / TRUE Connector |
| Semantic Layer | ENCOM Ontology (Protégé, SAREF, QUDT), SEMAPTIC data model |
| Deployment | Docker, Docker Compose, NGINX |

<br>


---

# 3. Repository Structure

<p align="justify">
This monorepo contains the complete ENPOWER Marketplace Toolkit. The core of the marketplace is composed of three integrated sub-projects, supported by complementary services that handle Energy Data Space integration and automated data pipeline orchestration.
</p>

### Core Components

| Directory | Description | README |
|---|---|---|
| `marketplace-be/` | Backend API — Market creation, MarketSession orchestration, blockchain synchronisation via write-through strategy, user and role management, wallet integration, RESTful API with Swagger documentation | [README](./marketplace-be/README.md) |
| `marketplace-fe/` | Frontend UI — role-aware dashboards, market sessions and offer submission wizard, FlexibilityNFT certificate views, role-aware transaction history views | [README](./marketplace-fe/README.md) |
| `flexibility-market-smartcontracts/` | On-chain smart contracts — factory pattern, five-stage MarketSession lifecycle with a terminal cancelled state, dual-token architecture, settlement with penalty enforcement | [README](./flexibility-market-smartcontracts/README.md) |

### Complementary Components (Energy Data Space Integration)

| Directory | Description | README |
|---|---|---|
| `dataspace-file-ingestion-microservice/` | Dataspace File Ingestion Microservice (DFIM) — automated ingestion, translation, and import of energy data from the Energy Data Space into the Marketplace | [README](./dataspace-file-ingestion-microservice/README.md) |
| `injection-dashboard/` | Monitoring UI for the ingestion pipeline — file registry, error tracking, manual state management | [README](./injection-dashboard/README.md) |

> **Note on the Data Space integration:** in production, the ingestion pipeline is triggered by an **external scheduler**, a separate orchestration tool that runs three Groovy tasks on cron schedules. **The scheduler is not part of this project: it is neither in this repository nor in the release, and each operator provides their own.** The three task scripts are reproduced in [`dataspace-file-ingestion-microservice/README.md`](./dataspace-file-ingestion-microservice/README.md) only as a reference for operators connecting the pipeline to a scheduler. Without one, the same steps are run manually with the commands in [`FLEXIBILITY_GUIDE.md`](./FLEXIBILITY_GUIDE.md), Section 6.

<br>

---

# 4. Deployment

## 4.1 Quick Start

<p align="justify">
To run a local demonstration of the ENPOWER Marketplace Toolkit, follow the deployment instructions in section 4.2. The deployment is split into two phases: Keycloak is started first so that its client secrets can be retrieved and configured into the backend before starting the remaining services.
</p>

<br>

## 4.2 Deployment on a Linux Server

<p align="justify">
The entire platform is containerised and orchestrated via Docker Compose. No software beyond Docker, Docker Compose, and Git needs to be installed on the server.
</p>

### 4.2.1 Prerequisites

The hardware and operating system prerequisites are:

- A 2-core processor (4-core recommended)
- 8 GB RAM memory
- 50 GB of disk space or more

> The platform runs several Docker containers simultaneously (2 Java services, 2 Node.js runtimes, 2 databases, Keycloak, Hardhat, MailHog), which justifies the memory requirements.

The software prerequisites include:

- Docker and docker-compose
- Git (any version, to clone the repository)

<br>

### 4.2.2 Clone and Initial Configuration

```bash
git clone https://github.com/Enpower-project/enpower-marketplace-toolkit.git
cd enpower-marketplace-toolkit
cp .env.example .env
cp marketplace-be/.env.example marketplace-be/.env.docker
```

**Root `.env`** — one value to set per deployment:

| Variable | Description | Example |
|---|---|---|
| `SERVER_URL` | Public URL of this server. Used only for links in system emails (password reset, invitations). | `http://SERVER_IP:4200` |

> **Set this before the first start.** If `SERVER_URL` is left at its example value, the platform runs normally but every link in system emails points to `SERVER_IP`, so invitations and password resets cannot be completed.

> **Changing server?** Edit only `.env` and set the new `SERVER_URL`. The frontend uses relative paths (`/api`, `/blockchain/`) that nginx routes internally — no other file needs to change. On a running deployment, apply the change with `docker compose up -d backend`, which recreates the backend with the new value.


### 4.2.3 Phase 1 — Start Keycloak and Retrieve Client Secrets

<p align="justify">
The backend requires valid Keycloak client secrets to start. Since these secrets are generated by Keycloak on first launch, Keycloak must be started and configured before the remaining services.
</p>

**Start Keycloak and its database:**

```bash
docker compose up -d keycloak-db keycloak
```

<p align="justify">
Wait until Keycloak is fully running. On the first start, it will import the <code>enpower-marketplace</code> realm automatically. This may take a minute. You can monitor progress with:
</p>

```bash
docker compose logs -f keycloak
```

Once running, the Keycloak instance is available at:

| Interface | URL |
|---|---|
| Authentication endpoint | `http://SERVER_IP:8088` |
| Admin Console | `http://SERVER_IP:8088/admin` |

Admin Console credentials (Keycloak master realm): defined by `KEYCLOAK_ADMIN` and `KEYCLOAK_ADMIN_PASSWORD` in `marketplace-keycloak/.env`.

<p align="justify">
The imported <code>enpower-marketplace</code> realm includes all required clients (<code>backend</code>, <code>frontend</code>, <code>swagger</code>, <code>admin-cli</code>) and roles. One user is created by default:
</p>

| Username | Role | Purpose | Password |
|---|---|---|---|
| `market_admin` | `MARKETPLACE_ADMIN` | Platform administrator — creates markets and manages users | **Asdf1234!** |

**Add your server's redirect URI to the `frontend` client:**

1. Open `http://SERVER_IP:8088/admin` and log in with the credentials from `marketplace-keycloak/.env`
2. Select realm **enpower-marketplace** → **Clients → frontend → Settings**
3. Add `http://SERVER_IP:4200/*` to **Valid redirect URIs** and `http://SERVER_IP:4200` to **Web origins** → **Save**

**Retrieve the client secrets:**

1. In the Admin Console, navigate to **Clients → backend → Credentials** and copy the **Client secret**
2. Navigate to **Clients → admin-cli → Credentials** and copy the **Client secret**

See the <a href="./marketplace-keycloak/README.md">marketplace-keycloak README</a> for full details on the realm configuration.

<br>

### 4.2.4 Configure the Backend Environment

<p align="justify">
With the Keycloak client secrets retrieved in the previous step, edit <code>marketplace-be/.env.docker</code> and set all required variables. Contract addresses are populated automatically by Docker Compose on startup and must be left empty for the initial deployment.
</p>

| Variable | Description | **NEED REPLACE OR MODIFICATION** | Example Value |
|---|---|---|---|
| **Blockchain** | | | |
| `ADMIN_PK` | Private key of the admin account used to sign smart contract transactions. Use one of the accounts provided by the Hardhat node. | **YES** | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| `RPC_PROVIDER_URL` | JSON-RPC endpoint of the Ethereum node. Within Docker Compose, use the internal service name. | **NO** | `http://hardhat:8545` |
| **MongoDB** | | | |
| `MONGO_URI` | MongoDB connection string. Use the Docker service name within Docker Compose. | **NO** | `mongodb://root:password@mongodb:27017/enpower?authSource=admin` |
| **Keycloak** | | | |
| `KEYCLOAK_AUTH_SERVER_URL` | Base URL of the Keycloak instance. Pre-configured for Docker Compose internal networking. | **YES** | `http://SERVER_IP:8088` |
| `KEYCLOAK_REALM` | Keycloak realm name. | **NO** | `enpower-marketplace` |
| `KEYCLOAK_CLIENT_ID` | Keycloak client ID for the backend service. | **NO** | `backend` |
| `KEYCLOAK_CLIENT_SECRET` | Backend client secret retrieved from the Admin Console in section 4.2.3. | **YES** | `your-backend-client-secret` |
| `KEYCLOAK_ISSUER` | Full token issuer URL. Pre-configured for Docker Compose internal networking. | **YES** | `http://SERVER_IP:8088/realms/enpower-marketplace` |
| `KEYCLOAK_ADMIN_CLIENT_ID` | Admin client ID for user management operations. | **NO** | `admin-cli` |
| `KEYCLOAK_ADMIN_CLIENT_SECRET` | Admin client secret retrieved from the Admin Console in section 4.2.3. | **YES** | `your-admin-client-secret` |
| **Frontend URL** | | | |
| `FRONTEND_URL` | URL of the frontend, used for email links. Set automatically from `SERVER_URL` in the root `.env` — do not set manually here. | **NO** | _(set via root `.env`)_ |
| **Email (SMTP)** | | | |
| `SMTP_HOST` | SMTP server hostname. MailHog is included in Docker Compose as the SMTP relay. | **NO** | `mailhog` |
| `SMTP_PORT` | SMTP port. MailHog listens on port 1025. | **NO** | `1025` |
| `SMTP_SECURE` | Use TLS for SMTP. Set to `false` for MailHog. | **NO** | `false` |
| `SMTP_AUTH` | Enable SMTP authentication. Set to `false` for MailHog. | **NO** | `false` |
| `SMTP_USER` | SMTP username. Leave empty for MailHog. | **NO** | _(empty)_ |
| `SMTP_PASSWORD` | SMTP password. Leave empty for MailHog. | **NO** | _(empty)_ |
| `SMTP_FROM_EMAIL` | Sender email address for outgoing messages. | **NO** | `noreply@your-domain.com` |
| `SMTP_FROM_NAME` | Display name for outgoing messages. | **NO** | `Enpower Marketplace` |
| **File Uploads** | | | |
| `MAX_FILE_SIZE` | Maximum allowed upload size in bytes. | **NO** | `10485760` (10 MB) |
| `UPLOAD_PATH` | Directory for temporary file uploads. | **NO** | `./uploads` |
| **Logging** | | | |
| `LOG_LEVEL` | Logging verbosity (`debug`, `info`, `warn`, `error`). | **NO** | `debug` |
| `LOG_FILE_PATH` | Path to the application log file. | **NO** | `./logs/app.log` |
| **Smart Contract Addresses** | | | |
| `FLEXIBILITY_TOKEN_ADDRESS` | Deployed FlexibilityToken address. Auto-populated by Docker Compose on startup. | **NO** | _(leave empty)_ |
| `PARTICIPANT_REGISTRY_ADDRESS` | Deployed ParticipantRegistry address. Auto-populated by Docker Compose on startup. | **NO** | _(leave empty)_ |
| `TREASURY_ADDRESS` | Deployed Treasury address. Auto-populated by Docker Compose on startup. | **NO** | _(leave empty)_ |
| `FLEXIBILITY_NFT_ADDRESS` | Deployed FlexibilityNFT address. Auto-populated by Docker Compose on startup. | **NO** | _(leave empty)_ |
| `MARKET_FACTORY_ADDRESS` | Deployed MarketFactory address. Auto-populated by Docker Compose on startup. | **NO** | _(leave empty)_ |

<br>

### 4.2.5 Configure the Frontend Environment

<p align="justify">
Before building the frontend, edit <code>marketplace-fe/src/environments/environment.prod.ts</code> and set the <code>keycloakUrl</code> variable to point to your Keycloak instance. The default value points to an external deployment and must be replaced with the local Docker Compose address:
</p>

```typescript
keycloakUrl: 'http://SERVER_IP:8088',
```

<p align="justify">
The remaining variables (<code>apiUrl</code>, <code>apiGatewayUrl</code>, <code>rpcProviderUrl</code>) use relative paths that are routed internally by nginx and do not need to be changed. The <code>contracts</code> block is updated after the first deployment (see section 4.2.8).
</p>

<br>

### 4.2.6 Configure the Ingestion Dashboard Environment

<p align="justify">
Before building, edit <code>injection-dashboard/src/environments/environment.ts</code> and set the <code>apiUrl</code> variable to point to the Ingestion Microservice (DFIM) on the deployment server:
</p>

```typescript
apiUrl: 'http://SERVER_IP:8082'
```

<p align="justify">
This value is baked into the Angular bundle at build time. It must match the public IP or hostname of the server where the Docker Compose stack is running, since the user's browser calls this URL directly.
</p>

<br>

### 4.2.7 Phase 2 — Start All Remaining Services

<p align="justify">
Once the backend environment is fully configured, start the rest of the platform:
</p>

```bash
docker compose up -d --build
```

<p align="justify">
This command builds and starts all remaining services. Keycloak (already running from Phase 1) is left untouched. Services start in dependency order via Docker Compose healthchecks:
</p>

```
postgres     → creates databases and Quartz tables on first start
mongodb      → starts
mailhog      → starts
hardhat      → installs npm dependencies, compiles and deploys contracts
               → becomes "healthy" once deployment is complete
backend      → starts ONLY when hardhat is healthy
               → reads contract addresses from the shared volume
               → starts NestJS with the real deployed addresses
frontend     → starts (nginx proxies /api → backend, /blockchain → hardhat)
ingestion    → starts when postgres is healthy
```

<p align="justify">
The first start on a clean server may take several minutes while Hardhat downloads npm dependencies and compiles the contracts. Subsequent starts are faster because the npm dependency volume is cached.
</p>

<br>

### 4.2.8 Post-Deployment: Frontend Contract Addresses

<p align="justify">
After the first successful startup, the deployed contract addresses are printed in the Hardhat container log and written to the shared volume. Retrieve them and compare against the values in <code>marketplace-fe/src/environments/environment.prod.ts</code>:
</p>

```bash
docker compose logs hardhat
```

<p align="justify">
If the addresses already match, no action is needed. If any address differs, update <code>environment.prod.ts</code> with the correct values, then rebuild and restart the frontend:
</p>

# After updating environment.prod.ts:
```bash
docker compose build frontend
docker compose up -d frontend
```

<br>

### 4.2.9 Verify

<p align="justify">
Once all containers are running, services are accessible at the following addresses. Replace <code>SERVER_IP</code> with the actual IP address or domain name of the Linux server.
</p>

| Service | URL | Description |
|---|---|---|
| Keycloak | `http://SERVER_IP:8088` | Authentication server |
| Keycloak Admin Console | `http://SERVER_IP:8088/admin` | Keycloak administration |
| Marketplace Frontend | `http://SERVER_IP:4200` | Main marketplace UI |
| Backend API | `http://SERVER_IP:3000` | NestJS REST API |
| Swagger Documentation | `http://SERVER_IP:3000/docs` | Interactive OpenAPI documentation |
| Hardhat Node | `http://SERVER_IP:8545` | Ethereum development node (JSON-RPC) |
| MongoDB | `SERVER_IP:27018` | MongoDB (accessible to local tooling) |
| MailHog UI | `http://SERVER_IP:8025` | SMTP development server and email inspector |
| Ingestion Microservice | `http://SERVER_IP:8082` | Dataspace File Ingestion Microservice API |
| Ingestion Microservice Docs | `http://SERVER_IP:8082/swagger-ui.html` | Ingestion API Swagger UI |
| Ingestion Dashboard | `http://SERVER_IP:4201` | Monitoring UI for the ingestion pipeline |

<p align="justify">
Open the Marketplace Frontend at <code>http://SERVER_IP:4200</code> and log in with the <code>market_admin</code> account created in the Keycloak realm (section 4.2.3). This account holds the <code>MARKETPLACE_ADMIN</code> role and can be used to create the first energy community market and invite FMO/LMO users.
</p>


<br>

---

# 5. Related ENPOWER WP4 Components

<p align="justify">
The Marketplace Toolkit integrates with several components developed by other ENPOWER consortium partners. These are maintained in separate repositories:
</p>


| Component | Partner | Description | Link |
|---|---|---|---|
| ENPOWER Middleware / OneNet / TRUE Connector | European Dynamics | Energy Data Space management — data offering catalogue, subscription management, and access policies. Energy Data Space connector enabling sovereign, policy-compliant data exchange between pilot sites; includes Docker deployment configuration | [Repository](https://github.com/Enpower-project/Enpower-Data-Space-Connector-Deployment-and-Configuration-Guide) |
| SEMAPTIC Builder / ENCOM Ontology | INESC TEC | Web tool for creating semantic maps that ensure interoperability across heterogeneous pilot systems / Energy Community Ontology (based on SAREF, QUDT, W3C Time) providing the shared vocabulary for semantic interoperability | [Documentation](https://semanticweb.inesctec.pt/ontologies/encom/index.html) |
| Protection Framework | COMSENSUS | IAM framework providing ReBAC-based access control (Keycloak + SpiceDB + Envoy Proxy) | Not accessible for security reasons |

---

# 6. Reproducibility

## 6.1 Archived version

The version of the toolkit described in the accompanying manuscript is
published as release **v1.0.2**, permanently pinned to commit `<SHA>`:

| | |
|---|---|
| Release | https://github.com/Enpower-project/enpower-marketplace-toolkit/releases/tag/v1.0.2 |
| Immutable source tree | https://github.com/Enpower-project/enpower-marketplace-toolkit/tree/`<SHA>` |
| Source archive | `enpower-marketplace-toolkit-1.0.2.tar.gz` (attached to the release) |
| SHA-256 | `<CHECKSUM>` |

The commit-pinned URL above is a content-addressed reference: unlike a branch
or tag, it cannot be reassigned to different content. The `v1.0.2` tag is
additionally protected against modification and deletion by repository
rulesets. Readers verifying the archive can confirm its integrity with:

```bash
sha256sum enpower-marketplace-toolkit-1.0.2.tar.gz
```

To obtain exactly this version:

```bash
git clone https://github.com/Enpower-project/enpower-marketplace-toolkit.git
cd enpower-marketplace-toolkit
git checkout v1.0.2
```

The earlier release v1.0.1 remains available at its protected tag.

## 6.2 Scope of the automated deployment

The `docker-compose.yml` configuration provided with this release deploys the
complete Marketplace stack — eleven containerised services comprising the
NestJS backend, Angular frontend, a local Ethereum node with the full contract suite deployed automatically, MongoDB, PostgreSQL, Keycloak IAM, the Data Space file ingestion microservice, its monitoring dashboard and an SMTP relay.

This allows an independent reader to reproduce the complete flexibility market workflow described in the manuscript: energy
community market creation, participant registration, MarketSession publication, flexibility offer submission, matching, settlement with penalty enforcement, and issuance of soulbound FlexibilityNFT certificates.

A demonstration dataset is bundled under `marketplace-be/test-data/demo/`, comprising the source spreadsheet, a time series at 15-minute resolution, and the corresponding `_STD` / `_MIN` / `_MAX` daily reference profiles. The ingestion and flexibility computation pipeline can therefore be exercised without access to live pilot systems; the commands are documented in `FLEXIBILITY_GUIDE.md`, Section 6. Ingestion scripts for the Greek and Portuguese data formats are also included, but no pilot datasets are distributed with this repository: pilot data is held by the respective pilot operators.

**Two manual configuration steps are required**, both documented step by step in Section 4.2: retrieval of the Keycloak client secrets, which are generated by Keycloak on its first launch and therefore cannot be pre-provisioned, and the corresponding configuration of the backend environment file. This is why the deployment is split into two phases.

### Temporal guards and full-cycle simulation

A production market session spans three days: offers open before D-1 and close at
D-1, flexibility is delivered through D, and metered data becomes available after
D+1. The `MarketSession` contract contains four guards that would enforce that
schedule on-chain, and **they are deliberately disabled in this release**:

| Operation | Guard that is disabled |
|---|---|
| `openOffers()` | `block.timestamp < deliveryDay - 1 days` |
| `closeOffers()` | `block.timestamp >= deliveryDay - 1 days` |
| `submitMeasurementData()` | `block.timestamp >= deliveryDay + 1 days` |
| `cancelIfOffersStillOpenTwoHoursBefore()` | `block.timestamp >= deliveryDay - 2 hours` |

The reason is reproducibility. Two of these guards make a fast cycle impossible:
`closeOffers()` cannot run until D-1, and `submitMeasurementData()` cannot run
until after D+1. With them active, exercising one complete market lifecycle —
market creation through offer submission, delivery, settlement and certificate
issuance — would take three days of wall-clock time, and neither this deployment
nor its automated test suite could be run in a single session. Disabling them
allows a reader to reproduce the full workflow in minutes.

What the contract still enforces is **ordering**: the state machine rejects any
operation attempted out of sequence, as the test suite under
`flexibility-market-smartcontracts/test/` asserts. What it does not enforce is
**timing**. The delivery schedule is orchestrated by the application layer
instead.

The four guards are retained in the contract source at their enforcement points,
so a production deployment can restore them without redesign. Any deployment
operating a real market should do so.

### Data protection

The bundled dataset is **not authentic measurement data**. Its values were modified and its timestamps shifted to a recent period so that MarketSessions could be simulated on it, and it is provided solely to exercise the ingestion and settlement pipeline. It does not represent the actual consumption of any installation, individual or household, and is not attributed to any pilot site.

It carries no identifiers of any kind: no customer, account, meter or device identifier, no name, address, postcode or geographic coordinates, and no metadata linking the series to a natural person or to specific premises. It consists solely of a timestamp and five numeric channels — consumption, storage dispatch, PV production, and net load with and without flexibility — at 15-minute resolution for a single unnamed installation.

## 6.3 Components outside the reproducible scope

The following are **not** included in the deployment automation and are not
required to reproduce the results reported in the manuscript:

| Component | Reason | Effect on reproduction |
|---|---|---|
| TRUE Connector (Energy Data Space) | Maintained by another consortium partner; requires credentialed access to pilot infrastructure | Live data exchange with external pilot systems cannot be reproduced. The ingestion microservice is instead exercised on the bundled demonstration dataset. |
| External scheduler | A separate orchestration tool, not part of this project, that runs the pipeline's Groovy tasks on cron schedules | The ingestion pipeline is triggered manually via documented commands (see `FLEXIBILITY_GUIDE.md`, Section 6) instead of on a schedule. |
| Protection Framework (ReBAC) | Not publicly released for security reasons | Access control is enforced by the included Keycloak realm; the additional ReBAC layer is not exercised. |

The reproducible scope of this release therefore covers the ENPOWER Marketplace Toolkit and its ingestion microservice operating on the bundled demonstration dataset — that is, the entirety of the software contribution described in this manuscript.

## 6.4 Measuring a deployment

The performance figures reported in the manuscript are produced by the scripts in
[`benchmark/`](./benchmark/README.md), which instrument the deployment procedure of
Section 4.2 step by step. They report on-chain cost per lifecycle operation,
deployment time, per-container CPU and memory at rest and under load, and API
latency, each as a Markdown table, so the measurements can be repeated on any host
from a clean clone.

The on-chain cost model needs no deployment at all:

```bash
cd flexibility-market-smartcontracts
npm ci
MARKETS=3 SESSIONS=2 FSPS=5 npm run benchmark
```

Gas figures transfer between EVM-compatible networks; timing, memory and latency
are properties of the host they were measured on and should be reported with it.

## 6.5 Running the smart-contract tests

The smart contracts are covered by 92 automated tests: session lifecycle
transitions and the rejection of forbidden ones, collateral and settlement
accounting, role-based access control, soulbound certificates, and the session
reported in the manuscript's Section 3, whose figures are asserted exactly. They
run from a clean clone (Node.js 20 or later) and need no running stack:

```bash
cd flexibility-market-smartcontracts
npm ci
npm test            # runs the 92 tests
npm run coverage    # coverage report, written to coverage/index.html
```

The continuous integration workflow (`.github/workflows/ci.yml`) runs the same
suite and its coverage report on every push.

