# ENPOWER Flexibility Guide

Reference guide for understanding how the ENPOWER system calculates, stores, and uses energy data.

---

## Table of Contents

1. [Key Concepts](#1-key-concepts)
2. [Data Types](#2-data-types)
3. [End-to-End Flow: From Raw Data to Flexibility](#3-end-to-end-flow-from-raw-data-to-flexibility)
4. [Theoretical vs Actual Flexibility](#4-theoretical-vs-actual-flexibility)
5. [Supported Pilots and Format Differences](#5-supported-pilots-and-format-differences)
6. [Ingestion Commands](#6-ingestion-commands)
7. [Where to Find Things in the Code](#7-where-to-find-things-in-the-code)

---

## 1. Key Concepts

**FSP (Flexibility Service Provider):** the consumption node (industry, building, installation) that can modify its electricity consumption in response to market signals.

**Flexibility:** the capacity of an FSP to consume **more or less than usual** at a given time interval. Measured in Watts (W) for power and Watt-hours (Wh) for hourly accumulated energy.

**Time slot:** the minimum measurement interval. Depends on the pilot:
- Irish Pilot: **15 minutes** → 96 slots per day
- Greek Pilot: **30 minutes** → 48 slots per day
- Portuguese Pilot: **15 minutes** → 96 slots per day

---

## 2. Data Types

### ConsumptionData (MongoDB collection)

Stores consumption profiles. Each document has a `profileType` field:

| profileType | Description | `date` |
|---|---|---|
| `ACTUAL` | Real consumption for a specific day | Day date |
| `REFERENCE_STANDARD` | Historical average consumption per slot | `null` |
| `REFERENCE_MIN` | Historical minimum consumption per slot | `null` |
| `REFERENCE_MAX` | Historical maximum consumption per slot | `null` |

Each document contains a `measurements` array, with entries for each granularity:

```json
{
  "periodInMinutes": 15,
  "unit": "W",
  "type": "net_load_without_flex",
  "values": [/* 96 numbers */]
},
{
  "periodInMinutes": 60,
  "unit": "Wh",
  "type": "net_load_without_flex",
  "values": [/* 24 numbers */]
}

OR

{
  "periodInMinutes": 30,
  "unit": "W",
  "type": "net_load_without_flex",
  "values": [/* 48 numbers */]
},
{
  "periodInMinutes": 60,
  "unit": "Wh",
  "type": "net_load_without_flex",
  "values": [/* 24 numbers */]
}

```

### FlexibilityData (MongoDB collection)

Stores calculated flexibility data. Each document has a `flexibilityType` field:

| flexibilityType | Description | `date` |
|---|---|---|
| `THEORETICAL` | Potential capacity based on historical data | `null` |
| `ACTUAL` | Flexibility actually provided on a specific day | Day date |

---

## 3. End-to-End Flow: From Raw Data to Flexibility

### Step 1 — Raw data (Excel/CSV from the pilot)

The source file contains real historical measurements (months or years of data):

```
timestamp              consumption [W]    net_load_without_flex [W]
2025-06-11 12:00:00    1800               1800
2025-06-12 12:00:00    900                900
2025-06-13 12:00:00    3200               3200
...  (N days of history)
```

### Step 2 — Generate reference profiles (STD / MIN / MAX)

The script `build_profiles_greek.py` (or `build_profiles.py` for the Irish Pilot) groups all days by **time slot**, ignoring the date. For each slot it computes three statistics:

```
All historical values at 12:00:
  [1800, 900, 3200, 1100, 2400, 500, ...]

  MIN = 500    ← the day with the lowest consumption at that hour
  STD = 1500   ← average consumption at that hour (across all days)
  MAX = 3200   ← the day with the highest consumption at that hour
```

Output: 3 CSV files of N rows each (48 for 30-min slots, 96 for 15-min slots).

### Step 3 — Load reference profiles into MongoDB

The seed script (`seed-greek-flexibility-data.ts` or `seed-flexibility-data-v2.ts`) loads the 3 profiles as `ConsumptionData` documents with `date: null`. These are **timeless** profiles: they do not represent a specific day, but the statistical behaviour of the FSP.

The seed script also automatically generates hourly aggregations (sum of slots per hour → values in Wh).

### Step 4 — Calculate Theoretical Flexibility

`FlexibilityDataService.calculateTheoreticalFlexibility()` reads the 3 reference profiles and, for each slot, computes:

```
DOWNWARD[slot] = STANDARD[slot] - MIN[slot]
UPWARD[slot]   = MAX[slot] - STANDARD[slot]
```

**Example for the 12:00 slot:**
```
DOWNWARD = 1500 - 500  = 1000 W  → can reduce up to 1000 W below normal
UPWARD   = 3200 - 1500 = 1700 W  → can increase up to 1700 W above normal
```

The result is saved as a `FlexibilityData` document with `flexibilityType: THEORETICAL`.

---

## 4. Theoretical vs Actual Flexibility

```
                    STANDARD (historical average)
                             │
          ┌──────────────────┴──────────────────┐
          │                                      │
         MIN                                    MAX
  (historical minimum)                  (historical maximum)
          │                                      │
          └──────────────────┬───────────────────┘
                             │
                 ┌───────────┴───────────┐
                 │                       │
            DOWNWARD                  UPWARD
          = STD - MIN               = MAX - STD
       "capacity to go down"    "capacity to go up"
                 │                       │
                 └───────────┬───────────┘
                             │
                FlexibilityData THEORETICAL
              (no date — timeless profile)
```

**Theoretical flexibility** answers: *"How much flexibility could this FSP offer in each slot, based on its history?"*

**Actual flexibility** answers: *"How much flexibility did this FSP actually provide on a specific day?"*

```
ACTUAL_DOWNWARD[slot] = max(0, STANDARD[slot] - REAL[slot])
  → consumed less than normal: provided downward flex

ACTUAL_UPWARD[slot] = max(0, REAL[slot] - STANDARD[slot])
  → consumed more than normal: provided upward flex
```

In each slot flexibility can only go in **one direction** (either down or up, never both simultaneously).

---

## 5. Supported Pilots and Format Differences

| Feature | Irish Pilot | Greek Pilot | Portuguese Pilot |
|---|---|---|---|
| Source format | Excel (`.xlsx`) | Excel (`.xlsx`) | Excel (`.xlsx`) |
| Interval | 15 min (96 slots/day) | 30 min (48 slots/day) | 15 min (96 slots/day) |
| Columns | timestamp, consumption, storage_dispatch, pv_production, net_load_with_flex, net_load_without_flex | timestamp, consumption, pv_production, net_load_without_flex | timestamp, consumption, injection |
| Battery/storage | Yes (`storage_dispatch`) | No | No |
| `injection [W]` column | No | No | Yes — solar PV injected into the grid → `PV_PRODUCTION` |
| Profile script | `build_profiles.py` | `build_profiles_greek.py` | `build_profiles_portuguese.py` |
| STD/MIN/MAX uses | `net_load_without_flex` (STD) and `net_load_with_flex` (MIN/MAX) | `net_load_without_flex` for all three (no battery) | `consumption [W]` for all three |
| Seed script | `seed-flexibility-data-v2.ts` | `seed-greek-flexibility-data.ts` | `seed-portuguese-flexibility-data.ts` |
| NestJS parser | `CsvDataParser` | `GreekCsvDataParser` | `PortugueseCsvDataParser` |
| Scheduler offering name | — | `DST_NTUA_final` | `PT Pilot Consumption Data` |
| Timestamp timezone | None | None | `+01:00` offset (stripped before processing) |

**Note on the Greek Pilot period mismatch:** if actual daily consumption arrives at 15-minute intervals but the STANDARD reference profile is stored at 30 minutes, the system automatically **downsamples** (averages pairs of 15-min values → 30-min values) before computing the deviation.

---

## 6. Ingestion Commands

### Prerequisites

The conversion and profile-generation scripts require Python 3 with `pandas` and `openpyxl`. Install them on the server once:

```bash
sudo apt install python3-pandas python3-openpyxl -y
```

> **Important:** The seed scripts must be run **inside the `backend` Docker container** using the compiled JS in `dist/`, not on the host. The MongoDB hostname `mongodb` only resolves within the Docker network. Steps 1–3 run on the host; steps 4–5 run inside the container.
>
> The `test-data/` directory is copied into the container image at build time (`/usr/src/app/test-data/`). If you add new CSV files after the last build, copy them manually with `docker cp` before running the seed commands.

### Irish Pilot

CSV files are stored in `marketplace-be/test-data/IE/`.

```bash
# 1. Convert Excel to CSV (run on host, from marketplace-be/test-data/IE/)
python3 -c "import pandas as pd; df=pd.read_excel('ESB_016_flex.xlsx'); df.to_csv('datos_historicos.csv', index=False)"

# 2. Generate STD/MIN/MAX profiles (run on host, from marketplace-be/)
python3 scripts/build_profiles.py test-data/IE/datos_historicos.csv

# 3. If files were added after the last build, copy them into the container (run from project root)
docker cp marketplace-be/test-data/IE/datos_historicos.csv backend:/usr/src/app/test-data/IE/
docker cp marketplace-be/test-data/IE/datos_historicos_STD.csv backend:/usr/src/app/test-data/IE/
docker cp marketplace-be/test-data/IE/datos_historicos_MIN.csv backend:/usr/src/app/test-data/IE/
docker cp marketplace-be/test-data/IE/datos_historicos_MAX.csv backend:/usr/src/app/test-data/IE/

# 4. Load reference profiles (run from project root, executes inside container)
docker compose exec -w /usr/src/app backend node dist/scripts/seed-flexibility-data-v2.js --market=<ID> --fsp=<ID> --file=test-data/IE/datos_historicos_STD.csv --reference=STD
docker compose exec -w /usr/src/app backend node dist/scripts/seed-flexibility-data-v2.js --market=<ID> --fsp=<ID> --file=test-data/IE/datos_historicos_MIN.csv --reference=MIN
docker compose exec -w /usr/src/app backend node dist/scripts/seed-flexibility-data-v2.js --market=<ID> --fsp=<ID> --file=test-data/IE/datos_historicos_MAX.csv --reference=MAX

# 5. Load ACTUAL data (all historical days in one go)
docker compose exec -w /usr/src/app backend node dist/scripts/seed-flexibility-data-v2.js --market=<ID> --fsp=<ID> --file=test-data/IE/datos_historicos.csv
```

### Greek Pilot

CSV files are stored in `marketplace-be/test-data/GR/`.

```bash
# 1. Convert Excel to CSV (run on host, from marketplace-be/)
python3 -c "import pandas as pd; df=pd.read_excel('test-data/GR/prod_consumption.xlsx'); df.to_csv('test-data/GR/prod_consumption.csv', index=False)"

# 2. Generate STD/MIN/MAX profiles (run on host, from marketplace-be/)
python3 scripts/build_profiles_greek.py test-data/GR/prod_consumption.csv

# 3. If files were added after the last build, copy them into the container (run from project root)
docker cp marketplace-be/test-data/GR/prod_consumption.csv backend:/usr/src/app/test-data/GR/
docker cp marketplace-be/test-data/GR/prod_consumption_STD.csv backend:/usr/src/app/test-data/GR/
docker cp marketplace-be/test-data/GR/prod_consumption_MIN.csv backend:/usr/src/app/test-data/GR/
docker cp marketplace-be/test-data/GR/prod_consumption_MAX.csv backend:/usr/src/app/test-data/GR/

# 4. Load reference profiles (run from project root, executes inside container)
docker compose exec -w /usr/src/app backend node dist/scripts/seed-greek-flexibility-data.js --market=<ID> --fsp=<ID> --file=test-data/GR/prod_consumption_STD.csv --reference=STD
docker compose exec -w /usr/src/app backend node dist/scripts/seed-greek-flexibility-data.js --market=<ID> --fsp=<ID> --file=test-data/GR/prod_consumption_MIN.csv --reference=MIN
docker compose exec -w /usr/src/app backend node dist/scripts/seed-greek-flexibility-data.js --market=<ID> --fsp=<ID> --file=test-data/GR/prod_consumption_MAX.csv --reference=MAX

# 5. Load ACTUAL data (all historical days in one go)
docker compose exec -w /usr/src/app backend node dist/scripts/seed-greek-flexibility-data.js --market=<ID> --fsp=<ID> --file=test-data/GR/prod_consumption.csv
```

### Portuguese Pilot

CSV files are stored in `marketplace-be/test-data/PT/`.

```bash
# 1. Convert Excel to CSV (run on host, from marketplace-be/)
python3 -c "import pandas as pd; df=pd.read_excel('test-data/PT/P3.xlsx'); df.to_csv('test-data/PT/P3.csv', index=False)"

# 2. Generate STD/MIN/MAX profiles (run on host, from marketplace-be/)
python3 scripts/build_profiles_portuguese.py test-data/PT/P3.csv

# 3. If files were added after the last build, copy them into the container (run from project root)
docker cp marketplace-be/test-data/PT/P3.csv backend:/usr/src/app/test-data/PT/
docker cp marketplace-be/test-data/PT/P3_STD.csv backend:/usr/src/app/test-data/PT/
docker cp marketplace-be/test-data/PT/P3_MIN.csv backend:/usr/src/app/test-data/PT/
docker cp marketplace-be/test-data/PT/P3_MAX.csv backend:/usr/src/app/test-data/PT/

# 4. Load reference profiles (run from project root, executes inside container)
docker compose exec -w /usr/src/app backend node dist/scripts/seed-portuguese-flexibility-data.js --market=<ID> --fsp=<ID> --file=test-data/PT/P3_STD.csv --reference=STD
docker compose exec -w /usr/src/app backend node dist/scripts/seed-portuguese-flexibility-data.js --market=<ID> --fsp=<ID> --file=test-data/PT/P3_MIN.csv --reference=MIN
docker compose exec -w /usr/src/app backend node dist/scripts/seed-portuguese-flexibility-data.js --market=<ID> --fsp=<ID> --file=test-data/PT/P3_MAX.csv --reference=MAX

# 5. Load ACTUAL data (all historical days in one go)
docker compose exec -w /usr/src/app backend node dist/scripts/seed-portuguese-flexibility-data.js --market=<ID> --fsp=<ID> --file=test-data/PT/P3.csv
```

> Steps 1–3 run on the host. Steps 4–5 run inside the `backend` container via `docker compose exec` (always from the project root).

---

## 7. Data Flow: Scheduler & Ingestion Microservice

The manual seed commands described in Section 6 are used for **initial setup**. After, the ingestion of daily consumption data is fully automated through a pipeline managed by two components: the **Scheduler** (a Spring Boot + Quartz service) and the **dataspace-file-ingestion-microservice** (a Spring Boot service that acts as the state machine for file processing).

### Components

**`Scheduler/`** — A Spring Boot service (port 8085) that executes dynamic Groovy scripts on a cron schedule via Quartz. It contains three tasks relevant to this pipeline.

**`dataspace-file-ingestion-microservice/`** — Tracks every file through its processing lifecycle using a `FileIngestionEntry` entity with statuses: `NEW → TRANSLATED → SYNCHRONIZED` (or `ERROR` at any stage). Also stores the `FspDataspaceMapping` table that links each dataspace `provider_id` to the corresponding `marketplaceFspId` and `marketplaceMarketId` in the marketplace backend.

### The Three Scheduler Tasks

#### 1. `SyncDataspaceEntries`

Detects new files in the ENPOWER Dataspace that have not yet been ingested.

- Authenticates against the ENPOWER platform API to obtain a JWT token.
- Fetches the list of available entries from the Dataspace (`GET /api/consume-data/list`).
- Fetches the list of already-ingested entries from the microservice (`GET /api/file-ingestion-entries/all`).
- For each entry whose `sourceFileId` is not yet known to the microservice:
  - Downloads the file content from the Dataspace (`GET /api/consume-data/by-id?id={entryId}`), which arrives base64-encoded.
  - Decodes it and sends it to the microservice (`POST /api/file-ingestion-entries/ingest`).
  - The microservice saves the binary to `/data/dfim/files/NEW/{entryId}/` and creates a `FileIngestionEntry` with status `NEW`.
- On download/ingest error, creates an error record (`POST /api/file-ingestion-entries/error-entry`).

#### 2. `XlsxTranslationJob`

Converts raw files to the CSV format required by the seed scripts.

- Scans `/data/dfim/files/NEW/` for entries containing XLSX files.
- For each file:
  1. Converts to CSV using pandas (`python3 -c "import pandas..."`).
  2. Generates the three reference profiles (STD, MIN, MAX) by running the pilot-specific script (`build_profiles.py`, `build_profiles_greek.py`, or `build_profiles_portuguese.py`).
  3. Saves all four CSV files to `/data/dfim/files/TRANSLATED/{entryId}/`.
  4. Updates the microservice entry status to `TRANSLATED` (`POST /api/file-ingestion-entries/{entryId}/status`).

Output files per entry:
```
/data/dfim/files/TRANSLATED/{entryId}/
├── {basename}.csv       ← full historical data
├── {basename}_STD.csv   ← standard reference profile
├── {basename}_MIN.csv   ← minimum reference profile
└── {basename}_MAX.csv   ← maximum reference profile
```

#### 3. `MarketplaceIngestionTask`

Ingests the translated CSV files into the marketplace backend database.

- Fetches all entries with status `TRANSLATED` that also have a valid FSP mapping (`GET /api/file-ingestion-entries/translated-for-marketplace`). Entries without a mapping in `FspDataspaceMapping` are skipped with a warning.
- For each eligible entry, runs the seed script four times using the `marketplaceFspId` and `marketplaceMarketId` from the FSP mapping:
  ```bash
  npx ts-node ... seed-flexibility-data-v2.ts --market={marketId} --fsp={fspId} --file={basename}.csv
  npx ts-node ... seed-flexibility-data-v2.ts --market={marketId} --fsp={fspId} --file={basename}_STD.csv --reference=STD
  npx ts-node ... seed-flexibility-data-v2.ts --market={marketId} --fsp={fspId} --file={basename}_MIN.csv --reference=MIN
  npx ts-node ... seed-flexibility-data-v2.ts --market={marketId} --fsp={fspId} --file={basename}_MAX.csv --reference=MAX
  ```
- On success: marks the entry as `SYNCHRONIZED` and moves the folder to `/data/dfim/files/SYNCHRONIZED/{entryId}/`.
- On error: marks the entry as `ERROR`.

### Full Pipeline Overview

```
ENPOWER Dataspace
  (files available via /api/consume-data/list)
         │
         ▼
 ① SyncDataspaceEntries
  Downloads new files, decodes base64
  → POST /api/file-ingestion-entries/ingest
  → FileIngestionEntry status: NEW
  → File saved to /data/dfim/files/NEW/{entryId}/
         │
         ▼
 ② XlsxTranslationJob
  Converts to CSV, runs build_profiles.py
  → POST /api/file-ingestion-entries/{entryId}/status (TRANSLATED)
  → Files saved to /data/dfim/files/TRANSLATED/{entryId}/
         │
         ▼
  [FspDataspaceMapping must exist for provider_id]
         │
         ▼
 ③ MarketplaceIngestionTask
  Runs seed script × 4 (base, STD, MIN, MAX)
  → POST /api/file-ingestion-entries/{entryId}/synchronize
  → FileIngestionEntry status: SYNCHRONIZED
  → Files moved to /data/dfim/files/SYNCHRONIZED/{entryId}/
         │
         ▼
  MongoDB (marketplace-be)
  ConsumptionData (ACTUAL + REFERENCE_STANDARD/MIN/MAX)
  FlexibilityData (THEORETICAL, calculated at seed time)
```

Every status transition is recorded in the `status_history_item` table with a timestamp, the actor (`changedBy`) and the source task name (`changeSource`), providing a full audit trail.
