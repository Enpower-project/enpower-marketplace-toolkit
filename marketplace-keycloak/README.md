##### Table of Contents
[1. Overview](#1-overview)<br>
[2. Quick Start](#2-quick-start)<br>
[3. Realm Configuration](#3-realm-configuration)<br>
&nbsp;&nbsp;&nbsp;[3.1 General Settings](#31-general-settings)<br>
&nbsp;&nbsp;&nbsp;[3.2 Realm Roles](#32-realm-roles)<br>
[4. Clients](#4-clients)<br>
&nbsp;&nbsp;&nbsp;[4.1 backend](#41-backend)<br>
&nbsp;&nbsp;&nbsp;[4.2 frontend](#42-frontend)<br>
&nbsp;&nbsp;&nbsp;[4.3 swagger](#43-swagger)<br>
&nbsp;&nbsp;&nbsp;[4.4 admin-cli](#44-admin-cli)<br>
[5. Pre-Created Users](#5-pre-created-users)<br>
[6. Custom Claims and Protocol Mappers](#6-custom-claims-and-protocol-mappers)<br>

---

# 1. Overview

<p align="justify">
This folder provides a pre-configured Keycloak 25.0.2 instance for the ENPOWER Marketplace. Keycloak is included in the root Docker Compose stack of the marketplace repository and automatically imports the <code>enpower-marketplace</code> realm on first launch. The realm is fully compatible with the backend (<code>marketplace-be</code>) and frontend (<code>marketplace-fe</code>) implementations out of the box — minimal manual realm configuration is required.
</p>

<p align="justify">
The realm defines the four marketplace roles, four clients (backend, frontend, swagger, admin-cli), one initial user with admin role, a custom JWT claim for multi-market context propagation, and the necessary service account permissions for the backend to manage Keycloak users via the Admin API.
</p>

> [!CAUTION]
> **Local development and evaluation only — not safe for production use.**
>
> This repository setup with Keycloak is intentionally insecure for convenience and ease of use 
> during local development and for demonstration purposes.
> It contains hardcoded or preconfigured credentials, passwords, client secrets, and other sensitive
> values in plain-text `.env` files and in Keycloak's exported realm file.
>
> Do **not** use this configuration in production, staging, CI/CD, shared test environments,
> customer-facing deployments, or any environment reachable from the internet.
>
> Before deploying Keycloak outside local development, create a separate production-grade configuration
> with properly managed secrets, hardened settings, TLS, secure admin credentials, and environment-specific
> security review.

<br>

---

# 2. Quick Start

Keycloak is included in the root docker compose of the marketplace repository. Start the full stack from the repository root:

```bash
docker compose up -d
```

Once running, the Keycloak instance is available at:

| Interface | URL |
|---|---|
| Authentication endpoint | `http://SERVER_IP:8088` |
| Admin Console | `http://SERVER_IP:8088/admin` |

Admin Console credentials (Keycloak master realm): defined by `KEYCLOAK_ADMIN` and `KEYCLOAK_ADMIN_PASSWORD` in `marketplace-keycloak/.env`.

> **Note:** Within the Docker network, services communicate with Keycloak at `http://keycloak:8080`. The `http://SERVER_IP:8088` address is for access from outside the Docker network (e.g. your browser or the host machine).

<br>

### Required: add your server's redirect URI

<p align="justify">
Keycloak's <code>/*</code> wildcard only matches relative paths — it does <strong>not</strong> match absolute URLs such as <code>http://SERVER_IP:4200/</code>. Before logging in to the marketplace for the first time, add your server's frontend URL to the <code>frontend</code> client:
</p>

1. Open **`http://SERVER_IP:8088/admin`** and log in with the credentials from `marketplace-keycloak/.env`
2. Select realm **enpower-marketplace** (top-left dropdown)
3. Navigate to **Clients → frontend → Settings**
4. Under **Valid redirect URIs**, add `http://SERVER_IP:4200/*`
5. Under **Web origins**, add `http://SERVER_IP:4200`
6. Click **Save**

> The `backend` and `swagger` clients use `/*` and do not require this step.

<br>

---

# 3. Realm Configuration

## 3.1 General Settings

| Setting | Value |
|---|---|
| Realm name | `enpower-marketplace` |
| Display name | `ENPOWER` |
| Keycloak version | 25.0.2 |
| Default signature algorithm | RS256 |


## 3.2 Realm Roles

Four custom realm roles are defined, mapping directly to the marketplace participant types:

| Role | Description |
|---|---|
| `MARKETPLACE_ADMIN` | Platform-level administrator — creates markets and manages all users |
| `FMO_LMO` | Flexibility Market Operator / Local Market Operator — publishes and manages MarketSessions |
| `FRP` | Flexibility Requesting Party — defines flexibility needs and triggers settlement |
| `FSP` | Flexibility Service Provider — submits offers and delivers flexibility |

Every user also receives the `default-roles-enpower-marketplace` composite role, which grants the standard `offline_access` and `uma_authorization` realm roles and the `manage-account` / `view-profile` account client roles.

<br>

---

# 4. Clients

## 4.1 backend

<p align="justify">
Confidential client used by the NestJS backend (<code>marketplace-be</code>) to validate incoming JWTs and to operate as a resource server with authorization services enabled.
</p>

| Property | Value |
|---|---|
| Client ID | `backend` |
| Type | Confidential (client-secret) |
| Client secret | Retrieved from Admin Console: **Clients → backend → Credentials → Client secret** |
| Redirect URIs | `/*` (no deployment-specific configuration needed) |
| Web origins | `/*` |
| Flows enabled | Standard flow, Direct access grants, Service accounts |
| Authorization services | Enabled (ENFORCING policy) |
| Full scope allowed | Yes |



## 4.2 frontend

<p align="justify">
Public client used by the Angular frontend (<code>marketplace-fe</code>). Public clients do not use a client secret; the user's browser authenticates directly against Keycloak using the standard authorization code flow.
</p>

| Property | Value |
|---|---|
| Client ID | `frontend` |
| Type | Public (no client secret) |
| Redirect URIs | `/*`, `http://SERVER_IP:4200/*` *(added manually after first start — see Quick Start)* |
| Web origins | `/*`, `http://SERVER_IP:4200` *(added manually after first start — see Quick Start)* |
| Flows enabled | Standard flow, Direct access grants |
| Full scope allowed | Yes |


## 4.3 swagger

<p align="justify">
Confidential client used exclusively by the Swagger UI at <code>http://SERVER_IP:3000/docs</code> to authenticate API users via the PKCE authorization code flow. This client uses authorization services and a service account.
</p>

| Property | Value |
|---|---|
| Client ID | `swagger` |
| Type | Confidential (client-secret) |
| Client secret | Retrieved from Admin Console: **Clients → swagger → Credentials → Client secret** |
| Redirect URIs | `/*` (no deployment-specific configuration needed) |
| Web origins | `/*` |
| Flows enabled | Standard flow, Direct access grants, Service accounts |
| Authorization services | Enabled |

The client secret must be set as the Swagger client secret in the backend Keycloak configuration.

## 4.4 admin-cli

<p align="justify">
Confidential client with a service account used by the backend to call the Keycloak Admin REST API. This is required for user management operations — creating users, updating the <code>current_market</code> attribute, and managing role assignments — that the platform performs programmatically.
</p>

| Property | Value |
|---|---|
| Client ID | `admin-cli` |
| Type | Confidential (client-secret) |
| Client secret | Retrieved from Admin Console: **Clients → admin-cli → Credentials → Client secret** |
| Flows enabled | Direct access grants, Service accounts |

**Service account permissions** (granted on `realm-management`):

| Role | Purpose |
|---|---|
| `view-users` | Read user data |
| `query-users` | Search and filter users |
| `manage-users` | Create, update, and delete users |
| `manage-realm` | Update realm settings |
| `view-realm` | Read realm configuration |

The client secret must be set as `KEYCLOAK_ADMIN_CLIENT_SECRET` in `marketplace-be/.env.docker`.

<br>

---

# 5. Pre-Created Users

The realm import creates one user for testing and initial platform operation. 

| Username | Email | Role | Notes | Password |
|---|---|---|---|
| `market_admin` | `market_admin@enpower.com` | `MARKETPLACE_ADMIN` | Main administrator — use this account for the first login after deployment | **Asdf1234!** |


> To reset a user's password: **Admin Console → Users → [user] → Credentials → Reset password**.


<br>

---

# 6. Custom Claims and Protocol Mappers

## market-context-mapper (frontend client)

<p align="justify">
The most significant customisation in this realm is the <code>market-context-mapper</code>, configured on the <code>frontend</code> client. It maps the <code>current_market</code> user attribute to a JWT claim of the same name, making it available in the access token, ID token, and userinfo endpoint.
</p>

| Mapper property | Value |
|---|---|
| Name | `market-context-mapper` |
| Type | User Attribute mapper |
| User attribute | `current_market` |
| JWT claim name | `current_market` |
| Included in | Access token, ID token, userinfo |

<p align="justify">
The backend's <strong>TenantContextInterceptor</strong> reads this claim on every incoming request to scope database queries and blockchain calls to the user's active market — without the client needing to pass a market ID on every call. When a user switches their active market via the <code>/api/market/switch</code> endpoint, the backend updates this attribute in Keycloak via the Admin API, and the frontend is instructed to refresh its JWT to pick up the new value.
</p>

**User profile attribute definition:** `current_market` is declared in the realm's declarative user profile with:
- `view` permission: none (invisible to users in the account console)
- `edit` permission: admin only

This ensures the attribute can only be modified by the backend through the Admin API, not by the user themselves.

<br>

---

