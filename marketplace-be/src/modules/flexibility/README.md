# Flexibility Module

Modulo per la gestione della flessibilità energetica: profili di consumo, dati effettivi e calcolo della flessibilità disponibile/fornita.

## Struttura

```
flexibility/
├── controllers/          # REST API endpoints
├── dto/                 # Data Transfer Objects con validation
├── schemas/             # Mongoose schemas e interfaces
├── services/            # Business logic (estendono TenantAwareBaseService)
├── utils/               # Utilities riutilizzabili
│   ├── interfaces/      # Interface per parser e data structures
│   ├── parsers/         # CSV parser (estensibile con Excel, JSON, ecc.)
│   ├── validators/      # Validazione dati
│   └── loaders/         # Caricamento dati nel DB
└── README.md
```

## Entità Principali

### 1. ConsumptionData
Dati di consumo effettivi o profili di riferimento (standard, min, max).

- **Granularità:** 15min (96 valori) e 60min (24 valori) - **automaticamente aggregati**
- **ProfileType:** ACTUAL, REFERENCE_STANDARD, REFERENCE_MIN, REFERENCE_MAX
- **Measurements:** Array flessibile di misurazioni (consumption, pv_production, storage_dispatch, ecc.)
- **Helper Methods:** `getMeasurement(type, period)`, `getMeasurementAt(type, period, hour)` con fallback automatico

### 2. FlexibilityData
Flessibilità teorica (da profili) o effettiva (giornaliera).

- **FlexibilityType:** THEORETICAL, ACTUAL
- **Granularità:** 15min (96 valori) e 60min (24 valori) - **automaticamente aggregati**
- **Downward:** Capacità di ridurre consumo (standard - min)
- **Upward:** Capacità di aumentare consumo (max - standard)
- **Helper Methods:** `getMeasurement(type, period)`, `getMeasurementAt(type, period, hour)` con fallback automatico
- **Validazione Vendita:** Il sistema verifica automaticamente che le HourlyOffer non superino la flessibilità disponibile

#### 📊 Differenza Fondamentale: THEORETICAL vs ACTUAL

**⚠️ IMPORTANTE**: La differenza tra flessibilità teorica ed effettiva **NON è nella struttura dello schema**, ma nel **significato dei valori** nei measurements.

##### THEORETICAL (Capacità Bidirezionale)
Rappresenta la **capacità disponibile** dell'FSP in ogni slot temporale. Per ogni ora:
- ✅ **Downward E Upward possono essere ENTRAMBI > 0 contemporaneamente**
- Downward = capacità di ridurre consumo (STANDARD → MIN)
- Upward = capacità di aumentare consumo (STANDARD → MAX)
- Indica le due "direzioni" di flessibilità disponibili

**Esempio pratico - Ora 9:00-10:00:**
```json
{
  "flexibilityType": "THEORETICAL",
  "date": null,
  "measurements": [
    {
      "type": "flexibility_downward",
      "periodInMinutes": 60,
      "values": [300, 400, 500, 450, 480, 520, 550, 600, 650, ...]
      //         ora0 ora1 ora2 ora3 ora4 ora5 ora6 ora7 ora8  ora9=650Wh
    },
    {
      "type": "flexibility_upward",
      "periodInMinutes": 60,
      "values": [200, 250, 300, 280, 320, 350, 380, 400, 420, ...]
      //         ora0 ora1 ora2 ora3 ora4 ora5 ora6 ora7 ora8  ora9=420Wh
    }
  ]
}
```
**Interpretazione Ora 9**: L'FSP può:
- Ridurre il consumo fino a 650 Wh (downward)
- **OPPURE** aumentare il consumo fino a 420 Wh (upward)
- **Entrambi i valori sono > 0** perché rappresentano capacità disponibili in direzioni diverse

##### ACTUAL (Scelta Unidirezionale)
Rappresenta la **flessibilità effettivamente fornita** dall'FSP. Per ogni ora:
- ✅ **Solo UNO dei due (downward O upward) è > 0** per ogni slot
- L'FSP ha fatto UNA scelta: o riduce o aumenta, non entrambe
- I valori rappresentano la deviazione effettiva dal profilo standard

**Esempio pratico - Ora 9:00-10:00:**
```json
{
  "flexibilityType": "ACTUAL",
  "date": "2025-12-20",
  "measurements": [
    {
      "type": "flexibility_downward",
      "periodInMinutes": 60,
      "values": [0, 0, 150, 0, 0, 0, 0, 0, 200, ...]
      //         ora0 ora1 ora2=150Wh ora3 ... ora8=200Wh  ora9=0
    },
    {
      "type": "flexibility_upward",
      "periodInMinutes": 60,
      "values": [50, 75, 0, 120, 0, 0, 0, 0, 0, ...]
      //         ora0 ora1 ora2=0 ora3 ... ora8=0  ora9=300Wh
    }
  ]
}
```
**Interpretazione Ora 9**: L'FSP ha scelto di aumentare il consumo di 300 Wh (upward), quindi downward=0

**Calcolo in `calculateActualFlexibility()`:**
```typescript
const deviation15 = actual15.map((a, i) => a - standard15[i]);

// Separa in base al segno della deviazione
const downward15 = deviation15.map((d) => (d < 0 ? Math.abs(d) : 0));  // Solo valori negativi
const upward15 = deviation15.map((d) => (d > 0 ? d : 0));              // Solo valori positivi
```

##### Confronto Visivo
```
THEORETICAL (Ora 9):          ACTUAL (Ora 9):
┌─────────────────────┐       ┌─────────────────────┐
│ Downward: 650 Wh   │       │ Downward: 0 Wh     │
│ Upward:   420 Wh   │       │ Upward:   300 Wh   │
└─────────────────────┘       └─────────────────────┘
  Capacità disponibile          Scelta effettuata
  (entrambi > 0)               (solo uno > 0)
```

##### Schema MongoDB
**Entrambi i tipi usano la stessa struttura**:
```typescript
{
  flexibilityType: 'THEORETICAL' | 'ACTUAL',
  date: Date | null,  // null per THEORETICAL, data specifica per ACTUAL
  measurements: [
    { type: 'flexibility_downward', values: [...] },
    { type: 'flexibility_upward', values: [...] }
  ]
}
```

### 3. UserConsumptionProfile
Associa un FSP ai suoi 3 profili di riferimento (standard, min, max).

## Seed Data - Popolare il Database

### Script v2 (Consigliato) - Con supporto Reference Profiles

#### Carica ACTUAL profiles (con date specifiche)

```bash
npm run seed:flexibility:v2 -- \
  --market=69428fd1599cf3f6d8d65033 \
  --fsp=fsp_test_001 \
  --file=./test-data/consumption.csv
```

#### Carica REFERENCE profiles (profili di riferimento)

```bash
# Profilo STANDARD
npm run seed:flexibility:v2 -- \
  --market=69428fd1599cf3f6d8d65033 \
  --fsp=fsp_test_001 \
  --file=./test-data/standard.csv \
  --reference=STANDARD

# Profilo MIN
npm run seed:flexibility:v2 -- \
  --market=69428fd1599cf3f6d8d65033 \
  --fsp=fsp_test_001 \
  --file=./test-data/min.csv \
  --reference=MIN

# Profilo MAX (con validFrom personalizzato)
npm run seed:flexibility:v2 -- \
  --market=69428fd1599cf3f6d8d65033 \
  --fsp=fsp_test_001 \
  --file=./test-data/max.csv \
  --reference=MAX \
  --valid-from=2025-01-01
```

#### Carica tutti i file (auto-detection del tipo)

```bash
npm run seed:flexibility:v2 -- --all
```

**Convenzione naming per --all:**

```
test-data/flexibility/
└── <marketId>/
    ├── <fspUserId>.csv              → ACTUAL profile
    ├── <fspUserId>_standard.csv     → REFERENCE_STANDARD
    ├── <fspUserId>_min.csv          → REFERENCE_MIN
    └── <fspUserId>_max.csv          → REFERENCE_MAX
```

**Features Script v2:**

- ✅ Supporto multi-giorno per CSV con più date
- ✅ Caricamento profili di riferimento (STANDARD, MIN, MAX)
- ✅ **Aggregazione automatica oraria (60min)** per TUTTI i tipi di profilo
- ✅ Parsing formato numeri europei (virgola come separatore decimale)
- ✅ Calcolo automatico flessibilità per profili ACTUAL

### Script build_profiles.py - Generazione Profili da Dati Storici

Questo script Python genera automaticamente i 3 profili di riferimento (STANDARD, MIN, MAX) a partire da un CSV contenente dati di consumo raccolti su più giorni.

#### Requisiti

- Python 3.x
- pandas (`pip install pandas`)

#### Esecuzione

```bash
python scripts/build_profiles.py <input_file.csv>
```

#### Formato CSV di Input

Il CSV deve contenere dati a granularità 15 minuti (96 slot/giorno) per uno o più giorni:

**Colonne richieste:**

| Colonna | Descrizione |
|---------|-------------|
| `timestamp` | Data e ora nel formato `YYYY-MM-DD HH:MM:SS` |
| `net_load_without_flex [W]` | Carico netto senza flessibilità (usato per STANDARD) |
| `net_load_with_flex [W]` | Carico netto con flessibilità (usato per MIN e MAX) |

**Esempio CSV di input:**

```csv
timestamp,consumption [W],pv_production [W],storage_dispatch [W],net_load_with_flex [W],net_load_without_flex [W]
2025-12-01 00:00:00,410.5,0.0,0.0,410.5,410.5
2025-12-01 00:15:00,385.2,0.0,0.0,320.0,385.2
2025-12-01 00:30:00,392.8,0.0,0.0,450.0,392.8
...
2025-12-07 23:45:00,425.0,0.0,0.0,380.0,425.0
```

**Note:**

- I valori numerici possono usare la virgola come separatore decimale (es. `305,0525`)
- Più giorni di dati = profili più rappresentativi
- Le altre colonne (consumption, pv_production, storage_dispatch) sono opzionali per questo script

#### Output Generato

Lo script genera 3 file CSV nella stessa directory del file di input:

| File Output | Profilo | Calcolo |
|-------------|---------|---------|
| `<nome>_STD.csv` | STANDARD | **Media** per slot orario di `net_load_without_flex` |
| `<nome>_MIN.csv` | MIN | **Minimo** per slot orario di `net_load_with_flex` |
| `<nome>_MAX.csv` | MAX | **Massimo** per slot orario di `net_load_with_flex` |

Ogni file contiene 96 righe (una per slot 15min) con il formato compatibile con `seed:flexibility:v2`.

#### Workflow Completo

```bash
# 1. Genera i 3 profili dal CSV con dati storici
python scripts/build_profiles.py ./test-data/flexibility/market1/fsp_001_historical.csv

# Output:
#   ✔ Creato ./test-data/flexibility/market1/fsp_001_historical_STD.csv (96 righe)
#   ✔ Creato ./test-data/flexibility/market1/fsp_001_historical_MIN.csv (96 righe)
#   ✔ Creato ./test-data/flexibility/market1/fsp_001_historical_MAX.csv (96 righe)

# 2. Carica i profili nel database
npm run seed:flexibility:v2 -- \
  --market=69428fd1599cf3f6d8d65033 \
  --fsp=fsp_001 \
  --file=./test-data/flexibility/market1/fsp_001_historical_STD.csv \
  --reference=STANDARD

npm run seed:flexibility:v2 -- \
  --market=69428fd1599cf3f6d8d65033 \
  --fsp=fsp_001 \
  --file=./test-data/flexibility/market1/fsp_001_historical_MIN.csv \
  --reference=MIN

npm run seed:flexibility:v2 -- \
  --market=69428fd1599cf3f6d8d65033 \
  --fsp=fsp_001 \
  --file=./test-data/flexibility/market1/fsp_001_historical_MAX.csv \
  --reference=MAX

# 3. Calcola la flessibilità teorica
curl -X POST http://localhost:3000/api/flexibility/flexibility-data/theoretical/fsp_001/calculate
```

### Script v1 (Legacy)

```bash
npm run seed:flexibility -- \
  --market=69428fd1599cf3f6d8d65033 \
  --fsp=fsp_test_001 \
  --file=./test-data/flexibility/market1/user1.csv
```

### Formato CSV

```csv
timestamp,consumption [W],pv_production [W],storage_dispatch [W],net_load_with_flex [W],net_load_without_flex [W]
2025-12-20 00:00:00,410.5,530.0,340.2,220.0,125.0
2025-12-20 00:15:00,850.0,360.0,-1475.0,1825.0,3295.0
...
```

**Note:**
- Header richiesto
- Colonna `timestamp` obbligatoria
- Altre colonne rilevate automaticamente
- Valori negativi consentiti per `storage_dispatch` e `net_load_*`

## Helper Methods per Accesso Dati

Sia `ConsumptionData` che `FlexibilityData` espongono metodi helper per accedere facilmente alle misurazioni:

### getMeasurement(type, periodInMinutes)

Recupera l'array completo di valori per un tipo di misurazione e granularità.

```typescript
// Esempio: ottenere consumo orario
const consumptionData = await consumptionDataService.findOne(...);
const hourlyConsumption = consumptionData.getMeasurement('consumption', 60);
// Restituisce: [val_ora_0, val_ora_1, ..., val_ora_23] o null

// Esempio: ottenere flessibilità upward a 15min
const flexibilityData = await flexibilityDataService.getTheoreticalFlexibility(fspUserId);
const quarterlyUpward = flexibilityData.getMeasurement('flexibility_upward', 15);
// Restituisce: [val_0, val_1, ..., val_95] o null
```

### getMeasurementAt(type, periodInMinutes, hour)

Recupera il valore per una specifica ora (0-23). Include **fallback automatico**:

- Se richiesto 60min ma non disponibile, calcola automaticamente da 15min
- Se richiesto 15min, somma i 4 quarti dell'ora

```typescript
// Esempio: ottenere consumo per ora 14 (granularità 60min)
const valueHour14 = consumptionData.getMeasurementAt('consumption', 60, 14);

// FALLBACK: se 60min non esiste, calcola da 15min automaticamente
// Somma valori 15min: [56] + [57] + [58] + [59]

// Esempio: validazione flessibilità in HourlyOfferService
const upwardFlex = theoreticalFlex.getMeasurementAt('flexibility_upward', 60, hour);
if (requestedPowerMw > upwardFlex / 1_000_000) {
  throw new Error('Flessibilità insufficiente');
}
```

## Validazione Vendita Flessibilità

Il sistema implementa un controllo automatico quando un FSP crea una `HourlyOffer`:

1. **Verifica profili di riferimento:** L'FSP deve avere configurato i profili STANDARD, MIN e MAX
2. **Recupera flessibilità teorica:** Calcola la capacità massima dell'FSP usando i profili di riferimento
3. **Valida potenza richiesta:** Verifica che `powerMw` ≤ `flexibilità_upward` disponibile per quell'ora

**Implementazione in HourlyOfferService:**

```typescript
private async validateFlexibilityAvailability(
  fspUserId: string,
  hour: number,
  requestedPowerMw: number,
): Promise<void> {
  // 1. Recupera flessibilità teorica
  const theoreticalFlex = await this.flexibilityDataService
    .getTheoreticalFlexibility(fspUserId);

  if (!theoreticalFlex) {
    throw new BadRequestException(
      'FSP must have reference profiles configured before creating offers.'
    );
  }

  // 2. Ottieni flessibilità upward per l'ora (60min)
  const upwardFlexibilityWh = theoreticalFlex.getMeasurementAt(
    MeasurementType.FLEXIBILITY_UPWARD,
    60,
    hour
  );

  // 3. Converti e valida (MW vs MWh)
  const availableFlexibilityMWh = upwardFlexibilityWh / 1_000_000;

  if (requestedPowerMw > availableFlexibilityMWh) {
    throw new BadRequestException(
      `Requested power (${requestedPowerMw} MW) exceeds available ` +
      `upward flexibility (${availableFlexibilityMWh.toFixed(6)} MWh) ` +
      `for hour ${hour}.`
    );
  }
}
```

**Conversioni unità:**

- ConsumptionData/FlexibilityData: 15min = W, 60min = Wh
- HourlyOffer: MW (per 1 ora = MWh)
- Validazione: `1 MW * 1h = 1 MWh = 1,000,000 Wh`

## Utilities Riutilizzabili (per ETL futuro)

### IDataParser Interface

```typescript
interface IDataParser {
  parse(filePath: string, options: ParserOptions): Promise<ParsedFlexibilityData>;
  validate(data: ParsedFlexibilityData): Promise<ValidationResult>;
  getSupportedExtensions(): string[];
}
```

**Implementazioni:**
- `CsvDataParser` - Parser CSV (attuale)
- *Futuri:* ExcelParser, JsonParser, ApiParser, ecc.

### DataLoaderUtil

```typescript
class DataLoaderUtil {
  // Carica consumo effettivo
  async loadActualConsumption(data: ParsedFlexibilityData): Promise<LoadResult>;

  // Carica profilo di riferimento
  async loadReferenceProfile(data: ParsedFlexibilityData, type: ProfileType): Promise<LoadResult>;

  // Carica set completo (standard, min, max) + calcola flessibilità teorica
  async loadCompleteReferenceProfiles(...): Promise<LoadResult>;

  // Carica batch
  async loadBatch(dataArray: ParsedFlexibilityData[]): Promise<BatchResult>;
}
```

### DataValidatorUtil

```typescript
class DataValidatorUtil {
  static validateNumericValues(values: number[]): boolean;
  static validateValueCount(values: number[], periodInMinutes: number): boolean;
  static validateParsedData(data: ParsedFlexibilityData): string[];
  static detectOutliers(values: number[]): number[];
  static checkDataQuality(values: number[]): QualityReport;
}
```

## API Endpoints

### Consumption Data

```http
POST /api/flexibility/consumption-data
GET /api/flexibility/consumption-data?fspUserId=...&date=...
GET /api/flexibility/consumption-data/actual/:fspUserId/:date
GET /api/flexibility/consumption-data/reference/:fspUserId/:profileType
GET /api/flexibility/consumption-data/:id
```

### Flexibility Data

```http
POST /api/flexibility/flexibility-data/theoretical/:fspUserId/calculate
GET /api/flexibility/flexibility-data/theoretical/:fspUserId
POST /api/flexibility/flexibility-data/actual/:fspUserId/:date/calculate
GET /api/flexibility/flexibility-data/actual/:fspUserId/:date
GET /api/flexibility/flexibility-data/actual/:fspUserId?startDate=...&endDate=...
```

## Workflow Tipico

### 1. Setup Profili di Riferimento FSP

```bash
# Opzione A: Usa seed script con 3 CSV (standard, min, max)
npm run seed:flexibility -- --market=... --fsp=... --file=standard.csv

# Opzione B: Usa API
POST /api/flexibility/consumption-data
{
  "fspUserId": "fsp_001",
  "profileType": "REFERENCE_STANDARD",
  "measurements": [...]
}
```

### 2. Crea UserConsumptionProfile

```typescript
await userProfileService.createOrUpdateProfile("fsp_001", {
  standardProfileId: "...",
  minProfileId: "...",
  maxProfileId: "..."
});
```

### 3. Calcola Flessibilità Teorica

```http
POST /api/flexibility/flexibility-data/theoretical/fsp_001/calculate
```

### 4. Carica Dati Giornalieri Effettivi

```bash
npm run seed:flexibility -- --market=... --fsp=... --file=2025-12-20.csv
```

### 5. Calcola Flessibilità Effettiva

```http
POST /api/flexibility/flexibility-data/actual/fsp_001/2025-12-20/calculate
```

## Fase 2 - Microservizio ETL (Futuro)

Le utilities sono già pronte per essere riutilizzate in un microservizio separato:

```
marketplace-etl/  (nuovo progetto NestJS)
├── src/
│   ├── parsers/
│   │   ├── csv.parser.ts      # Copiato da flexibility/utils
│   │   ├── excel.parser.ts    # Nuovo
│   │   └── api.parser.ts      # Nuovo
│   ├── loaders/
│   │   └── api-client.ts      # Chiama BE REST API
│   └── scheduler/
│       └── cron.service.ts    # Scheduled imports
```

## Fase 3 - Event-Driven (Futuro)

Architettura con message queue per alta scalabilità:

```
Producer → Message Queue (Redis/RabbitMQ) → Consumer → MongoDB
```

## Testing

```bash
# Test unitari
npm test

# Test integrazione (con DB)
npm run test:e2e

# Seed per test manuali
npm run seed:flexibility -- --all
```

## Multi-Tenancy

Tutte le entità sono **automaticamente tenant-filtered** tramite il campo `market`:

- Services estendono `TenantAwareBaseService`
- Market context iniettato da `TenantContextInterceptor`
- Query filtrate automaticamente per market corrente

## Autenticazione

Endpoints protetti con Keycloak:

- `MARKETPLACE_ADMIN`: Full access
- `FSP_ADMIN`: Gestione FSP del proprio market
- `FSP_USER`: Read-only sui propri dati

## Gestione Errori (RFC7807)

Il modulo utilizza lo standard **RFC7807 Problem Details** per tutti gli errori. Ogni errore è rappresentato da un'eccezione personalizzata che estende `BusinessException` e viene automaticamente formattato dal `GlobalExceptionFilter`.

### Error Codes

| Error Code | HTTP Status | Descrizione |
|------------|-------------|-------------|
| `error.flexibility.consumption_data.not_found` | 404 | Dati di consumo non trovati per FSP/data specificati |
| `error.flexibility.flexibility_data.not_found` | 404 | Dati di flessibilità non trovati |
| `error.flexibility.reference_profile.not_found` | 404 | Profilo di riferimento (standard/min/max) non trovato |
| `error.flexibility.reference_profiles.incomplete` | 422 | FSP non ha tutti i 3 profili di riferimento configurati |
| `error.flexibility.user_consumption_profile.not_found` | 404 | Profilo utente non configurato |
| `error.flexibility.profile_type.invalid` | 400 | Tipo di profilo non valido per l'operazione richiesta |
| `error.flexibility.measurement_count.invalid` | 400 | Numero di valori non corretto (attesi 96 per 15min, 24 per 60min) |
| `error.flexibility.measurement.missing` | 400 | Misurazione richiesta mancante nei dati |
| `error.flexibility.flexibility_values.invalid` | 400 | Valori di flessibilità non validi (es. negativi quando non dovrebbero) |
| `error.flexibility.profile_type.not_replaceable` | 400 | Impossibile sostituire profili di tipo ACTUAL |
| `error.flexibility.reference_profile.constraint_violation` | 422 | Violazione vincolo min ≤ standard ≤ max |

### Custom Exceptions

Le eccezioni personalizzate si trovano in `exceptions/flexibility.exception.ts`:

```typescript
// Esempio: profilo di riferimento non trovato
throw new ReferenceProfileNotFoundException(
  'fsp_001',
  ProfileType.REFERENCE_STANDARD
);

// Esempio: conteggio misurazioni non valido
throw new InvalidMeasurementCountException(
  15,        // periodInMinutes
  96,        // expected
  84,        // actual
  'consumption'
);

// Esempio: profili incompleti
throw new ReferenceProfilesIncompleteException(
  'fsp_001',
  ['REFERENCE_MIN', 'REFERENCE_MAX']  // profili mancanti
);
```

### Formato Risposta Errore

Tutti gli errori seguono il formato RFC7807:

```json
{
  "title": "Not Found",
  "status": 404,
  "detail": "Error en la operación solicitada.",
  "errors": [
    {
      "entity": "ConsumptionData",
      "property": "profileType",
      "errorCode": "error.flexibility.reference_profile.not_found",
      "message": "Reference profile 'REFERENCE_STANDARD' not found for FSP user fsp_001",
      "invalidValue": "REFERENCE_STANDARD"
    }
  ],
  "instance": "/api/flexibility/consumption-data/reference/fsp_001/REFERENCE_STANDARD"
}
```

### Gestione Errori Lato Client

Raccomandazioni per gestire gli errori nelle chiamate API:

```typescript
try {
  const response = await fetch('/api/flexibility/flexibility-data/theoretical/fsp_001/calculate', {
    method: 'POST'
  });

  if (!response.ok) {
    const problem = await response.json();

    // Gestione per error code
    switch (problem.errors[0].errorCode) {
      case 'error.flexibility.reference_profiles.incomplete':
        console.error('FSP deve configurare tutti i profili di riferimento');
        // Redirect a pagina configurazione profili
        break;

      case 'error.flexibility.reference_profile.not_found':
        console.error('Profilo mancante:', problem.errors[0].invalidValue);
        break;

      default:
        console.error('Errore generico:', problem.detail);
    }
  }
} catch (error) {
  console.error('Network error', error);
}
```

### Validazione Dati

Le eccezioni di validazione vengono lanciate automaticamente dai DTO tramite `class-validator`. Esempio:

```json
{
  "title": "Validation Error",
  "status": 400,
  "detail": "Hay errores en los datos enviados.",
  "errors": [
    {
      "errorCode": "error.data.invalid",
      "message": "fspUserId should not be empty"
    },
    {
      "errorCode": "error.data.invalid",
      "message": "measurements must be an array"
    }
  ],
  "instance": "/api/flexibility/consumption-data"
}
```
