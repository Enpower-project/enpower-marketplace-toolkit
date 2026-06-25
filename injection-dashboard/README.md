##### Table of Contents
[1. Overview](#1-overview)<br>
[2. Technology Stack](#2-technology-stack)<br>
[3. User Interface](#3-user-interface)<br>
&nbsp;&nbsp;&nbsp;[3.1 Home — Pipeline Statistics Dashboard](#31-home--pipeline-statistics-dashboard)<br>
&nbsp;&nbsp;&nbsp;[3.2 Archive — File Registry](#32-archive--file-registry)<br>
&nbsp;&nbsp;&nbsp;[3.3 Archive Details — Entry Inspection and Manual Controls](#33-archive-details--entry-inspection-and-manual-controls)<br>
[4. Integration with Other Components](#4-integration-with-other-components)<br>
[5. Configuration](#5-configuration)<br>
[6. Development Setup](#6-development-setup)<br>
[7. Related Components](#7-related-components)<br>

---

# 1. Overview

<p align="justify">
The Ingestion Dashboard is a browser-based monitoring and management interface for the Dataspace File Ingestion Microservice (DFIM). It provides operators with a real-time view of the ingestion pipeline state, a searchable registry of all ingested files and their current status, and the ability to inspect the complete audit trail of status transitions for any entry. It also exposes manual controls for correcting entries that are stuck in a stage or in an ERROR state — allowing operators to update the status, download the original or translated file, and delete entries — without requiring direct database access.
</p>

<p align="justify">
The application is built with Angular 20 (standalone component architecture) and Angular Material. It communicates exclusively with the DFIM REST API via an injected service layer. There is no authentication layer — access is restricted at the network level.
</p>

<br>

---

# 2. Technology Stack

| Component | Technology | Version |
|---|---|---|
| Framework | Angular | ^20.3.0 |
| Language | TypeScript | ~5.9.2 |
| Node.js (build + runtime) | Node.js | 22 (alpine) |

**Docker:** two-stage build — `node:22-alpine` compiles the Angular bundle with `ng build --configuration production`; the runtime stage copies the static files into an **NGINX 1.27 alpine** image serving on port **80**. When deployed behind an NGINX reverse proxy that handles DNS-based routing, all services are reachable on port 80. For deployments without a reverse proxy, Docker Compose maps port 80 to **4201** on the host, so the dashboard is accessible directly at `http://SERVER_IP:4201`.

<br>

---

# 3. User Interface

<p align="justify">
The application uses a shell layout (DashboardComponent) with a persistent sidebar navigation that links to the two main views: Home and Archives. A global refresh mechanism (RefreshService) propagates data reload events across all components reactively using Angular signals.
</p>

## 3.1 Home — Pipeline Statistics Dashboard

<p align="justify">
The home view provides an at-a-glance overview of the entire ingestion pipeline. Four stat cards display the total entry count and per-status counts (NEW, TRANSLATED, SYNCHRONIZED, ERROR). An <strong>Attention Required</strong> panel highlights the oldest entry in NEW status and the oldest entry in TRANSLATED status — entries that may be stuck waiting for the next Scheduler task run. A <strong>Recent Activity</strong> panel shows the most recent entry per status. An <strong>Offering Performance</strong> table lists all data offerings with their total ingestion count and number of errors, sorted by volume.
</p>

{SCREENSHOT: Home dashboard showing four stat cards (total, NEW, TRANSLATED, SYNCHRONIZED, ERROR counts), the Attention Required panel with oldest stalled entries, Recent Activity list, and the Offering Performance table.}

## 3.2 Archive — File Registry

<p align="justify">
The archive view is the primary operational interface. It displays all DFIM entries in a paginated, sortable table with the following columns: entry ID, offering name, original filename, creation timestamp, status badge, and an actions column. Operators can filter the table by filename (text search), status (NEW / TRANSLATED / SYNCHRONIZED / ERROR / all), and creation date range. Sorting is available on all columns. The view can be pre-filtered by navigating to it with a <code>?status=ERROR</code> query parameter — used by the Home view's stat cards to deep-link directly to error entries. Clicking any row navigates to the entry detail view.
</p>

{SCREENSHOT: Archive view showing the filterable entry table with status badges in different colours (NEW, TRANSLATED, SYNCHRONIZED, ERROR), the filter bar with status selector and date range picker, and the pagination controls.}

## 3.3 Archive Details — Entry Inspection and Manual Controls

<p align="justify">
The detail view shows the complete metadata of a single entry: offering name, original filename, provider ID, file hash, MIME type, file size, timestamps (creation, translation, synchronisation), current status, and status message. Below the metadata, a chronologically ordered status history timeline shows every transition the entry has undergone, including the source (e.g., <em>SyncDataspaceEntries</em>, <em>XlsxTranslationJob</em>, <em>scheduler</em>), the actor, and the timestamp.
</p>

<p align="justify">
The header section exposes four manual action buttons: <strong>Download original</strong> (retrieves the raw XLSX file stored in the DFIM), <strong>Download translated</strong> (retrieves the processed CSV file), <strong>Change status</strong> (opens a dialog that allows the operator to set any valid status and provide a message — used to retry a failed entry or mark it as resolved), and <strong>Delete</strong> (opens a confirmation dialog before permanently removing the entry).
</p>

{SCREENSHOT: Archive details view showing entry metadata panel, status badge, the four action buttons (download original, download translated, change status, delete), and the chronological status history timeline below.}

<br>

---

# 4. Integration with Other Components

<p align="justify">
The dashboard communicates exclusively with the DFIM (<code>dataspace-file-ingestion-microservice</code>) via its REST API. The service layer is split between two endpoint groups: Spring Data REST's HATEOAS endpoints (used for paginated listing, filtering, and fetching individual entries and their status history) and the custom controller's <code>/api/file-ingestion-entries/</code> prefix (used for file downloads and manual status updates). The base URL is configured via the <code>environment.apiUrl</code> variable and points to the DFIM on port 8080 (mapped to 8082 in Docker Compose).
</p>

<p align="justify">
The dashboard does not communicate with the marketplace backend, the Scheduler, or the Energy Data Space middleware. It is a read-write interface exclusively over the DFIM data layer.
</p>


<br>

---

# 5. Configuration

<p align="justify">
Configuration is managed via Angular environment files. The only configurable variable is the DFIM API base URL. Edit <code>src/environments/environment.ts</code> (production) or <code>src/environments/environment.development.ts</code> (development) before building.
</p>

| Variable | Description | Value |
|---|---|---|
| `apiUrl` | Base URL of the DFIM REST API, as accessible from the user's browser | `http://SERVER_IP:8082` |

<p align="justify">
The environment value is baked into the Angular bundle at build time. Before running <code>docker compose up -d</code> for the first time, edit <code>src/environments/environment.ts</code> to set the correct server IP. After any change, rebuild the image with <code>docker compose build ingestion-dashboard</code>.
</p>

<br>

---

# 6. Development Setup

<p align="justify">
The application is deployed as part of the Docker Compose stack. Run the following from the repository root:
</p>

```bash
# Start the full stack
docker compose up -d

# Or start only the ingestion dashboard and its dependency
docker compose up -d ingestion-microservice ingestion-dashboard

# Available at: http://SERVER_IP:4201
```

<p align="justify">
The Docker image is built from source at startup. If changes are made to the source code or environment files, rebuild the image before restarting:
</p>

```bash
docker compose build ingestion-dashboard
docker compose up -d ingestion-dashboard
```

<br>

---

# 7. Related Components

| Component | Path | Description |
|---|---|---|
| Ingestion Microservice (DFIM) | [`../dataspace-file-ingestion-microservice/`](../dataspace-file-ingestion-microservice/) | The REST API this dashboard monitors and controls |
| Scheduler (external) | — | Drives the pipeline that this dashboard monitors; its task logs are visible indirectly through entry status history. Not included in this repository. |
