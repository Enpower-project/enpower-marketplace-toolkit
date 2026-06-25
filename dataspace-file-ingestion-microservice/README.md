# Dataspace-File-Ingestion-Microservice

##### Table of Contents
[1. Overview](#1-overview)<br>
[2. Technology Stack](#2-technology-stack)<br>
[3. API / Interface](#3-api--interface)<br>
&nbsp;&nbsp;&nbsp;[3.1 Scheduler Tasks](#31-scheduler-tasks-automated-pipeline-triggers)<br>
[4. Integration with Other Components](#4-integration-with-other-components)<br>
[5. Environment Variables](#5-environment-variables)<br>
[6. Development Setup](#6-development-setup)<br>
[7. Related Components](#7-related-components)<br>

---

# 1. Overview

<p align="justify">
The Dataspace File Ingestion Microservice (DFIM) manages the lifecycle of energy data files downloaded from the Energy Data Space and processed for import into the marketplace. It tracks every file through a three-stage pipeline — NEW → TRANSLATED → SYNCHRONIZED — recording a complete status history per entry, and exposes a REST API consumed by the external Scheduler service (DSTechScheduler) that automates the pipeline on cron schedules.
</p>

<p align="justify">
The three stages map directly to three Groovy Scheduler tasks: the ingestion task identifies new offerings by deduplication against existing DFIM entries, downloads the raw files via the DFIM's internal consume-data proxy and registers them with status NEW; the translation task converts each file format to a specific CSV format and generates three flexibility profile variants (STD, MIN, MAX) using Python, with pilot-aware script selection (Irish, Greek, Portuguese); the synchronization task reads TRANSLATED entries via the DFIM REST API, invokes the pilot-appropriate marketplace backend seeding script to import the data, and transitions entries to SYNCHRONIZED. Any failure at any stage sets the entry status to ERROR.
</p>

<br>

---

# 2. Technology Stack

| Component | Technology | Version |
|---|---|---|
| Framework | Spring Boot | 4.0.5 |
| Language | Java | 17 |
| ORM / Migrations | Spring Data JPA + Flyway | (managed by Spring Boot) |
| Database | PostgreSQL | 15 |
| Build | Maven | 3.9 |
| Scheduler tasks | Groovy | (DSTechScheduler runtime) |

**Docker:** two-stage build (`maven:3.9-eclipse-temurin-17` → `eclipse-temurin:17-jre`). Exposes port **8080**, mapped to **8082** in Docker Compose.

<br>

---

# 3. API / Interface

<p align="justify">
Full reference available at <code>http://SERVER_IP:8082/swagger-ui.html</code>. The API has no authentication — access is restricted at the network level. Base path: <strong>/api/file-ingestion-entries</strong>.
</p>

| Method | Endpoint | Description |
|---|---|---|
| POST | `/ingest` | Registers a new file from the dataspace with status NEW |
| GET | `/all` | Returns all entries; used by the ingestion task for deduplication |
| PATCH/POST | `/{entryId}/status` | Updates entry status and records a history event |
| POST | `/{entryId}/translated-file` | Uploads a translated CSV file (multipart) |
| POST | `/{entryId}/synchronize` | Marks entry as SYNCHRONIZED |
| POST | `/{entryId}/error` | Sets entry status to ERROR |
| GET | `/{entryId}/download/original` | Downloads the original XLSX file |
| GET | `/{entryId}/download/translated` | Downloads the translated CSV file |
| GET | `/{entryId}/status-history` | Returns the complete status history for an entry |
| GET | `/search/findByFilters` | Paginated search by filename, status, and date range |

<br>

---

## 3.1 Scheduler Tasks (Automated Pipeline Triggers)

<p align="justify">
The pipeline is driven by three Groovy tasks stored in the DSTechScheduler database and executed by its Quartz engine. Runtime parameters (URLs, credentials, directory paths, database connection) are supplied via the Quartz job data map, allowing reconfiguration without redeployment. Full task source files are in <code>Scheduler/DSTechScheduler/SampleTasks/</code>.
</p>

## 3.1.1 Ingestion Task — SyncDataspaceEntries

<p align="justify">
Retrieves the list of available data offerings via the DFIM's internal consume-data proxy endpoints (which handle Energy Data Space authentication internally), compares them against existing DFIM entries by source file ID to identify new ones, downloads the binary content of each new offering via the same proxy, and ingests it via <code>POST /api/file-ingestion-entries/ingest</code>. Successfully ingested entries receive status NEW. If the dataspace reports a file as not yet available (<code>retrieved=false</code>), an ERROR entry is created via <code>POST /api/file-ingestion-entries/error-entry</code> and the task continues with the next offering.
</p>

```groovy
import it.dstech.scheduler.ApplicationContextUtil
import it.dstech.scheduler.entity.logs.*
import it.dstech.scheduler.repository.*
import it.dstech.scheduler.service.TaskLogService
import org.springframework.web.client.*
import org.springframework.http.*
import groovy.json.JsonOutput
import groovy.json.JsonSlurper

def appCtx = ApplicationContextUtil.getContext()
def logService = (TaskLogService) appCtx.getAutowireCapableBeanFactory().getBean(TaskLogService.class)
def logRepo = (TaskLogRepository) appCtx.getAutowireCapableBeanFactory().getBean(TaskLogRepository.class)
def callRepo = (TaskCallRepository) appCtx.getAutowireCapableBeanFactory().getBean(TaskCallRepository.class)

if (jobDataMap == null) throw new Exception("missing task configuration")

def tl = logService.initTaskLog(jobDataMap)
def finalStatus = LogStatus.SUCCESS

try {
    def loginEndpoint    = jobDataMap.get("loginEndpoint")    ?: "https://DATASPACE_LOGIN_ENDPOINT"
    def username         = jobDataMap.get("username")
    def password         = jobDataMap.get("password")
    def dataspaceBaseUrl = jobDataMap.get("dataspaceBaseUrl") ?: "https://DATASPACE_BASE_URL"
    def msBaseUrl        = jobDataMap.get("microserviceBaseUrl") ?: "http://MICROSERVICE_HOST:8080"

    if (!username?.trim()) throw new Exception("Missing required parameter: username")
    if (!password?.trim()) throw new Exception("Missing required parameter: password")

    def restTemplate = new RestTemplate()
    def parser = new JsonSlurper()

    // STEP 1 - JWT Login (kept for compatibility; downloads now go through microservice proxy)
    println "STEP 1: JWT Login - ${loginEndpoint}"
    def loginJsonBody = JsonOutput.toJson([username: username, password: password])
    def loginHeaders = new HttpHeaders()
    loginHeaders.setContentType(MediaType.APPLICATION_JSON)

    def loginTc = new TaskCall()
    loginTc.setLog(tl)
    loginTc.setParameters(loginJsonBody)
    loginTc.setStatus(CallStatus.SUCCESS)

    def loginResult = restTemplate.exchange(loginEndpoint, HttpMethod.POST, new HttpEntity<String>(loginJsonBody, loginHeaders), String.class)
    loginTc.setResponseCode(loginResult.getStatusCodeValue())
    println "Login status: ${loginResult.getStatusCodeValue()}"

    def loginResp = parser.parseText(loginResult.getBody() as String)
    def token = loginResp.accessToken
    if (!token) throw new Exception("accessToken not found in login response")
    loginTc.setResponse("token retrieved")
    callRepo.save(loginTc)
    println "Token retrieved successfully"

    // STEP 2 - Get dataspace entries via ingestion-microservice proxy (handles auth internally)
    def listUrl = "${msBaseUrl}/api/consume-data/list"
    println "STEP 2: Get dataspace entries via microservice - ${listUrl}"

    def listTc = new TaskCall()
    listTc.setLog(tl)
    listTc.setParameters("GET ${listUrl}")
    listTc.setStatus(CallStatus.SUCCESS)

    def listResult = restTemplate.exchange(listUrl, HttpMethod.GET, new HttpEntity<>(new HttpHeaders()), String.class)
    listTc.setResponseCode(listResult.getStatusCodeValue())
    callRepo.save(listTc)

    def dataspaceEntries = parser.parseText(listResult.getBody() as String)

    // STEP 3 - Get microservice entries
    def msAllUrl = "${msBaseUrl}/api/file-ingestion-entries/all"
    println "STEP 3: Get microservice entries - ${msAllUrl}"
    def msTc = new TaskCall()
    msTc.setLog(tl)
    msTc.setParameters("GET ${msAllUrl}")
    msTc.setStatus(CallStatus.SUCCESS)

    def msResult = restTemplate.exchange(msAllUrl, HttpMethod.GET, new HttpEntity<>(new HttpHeaders()), String.class)
    msTc.setResponseCode(msResult.getStatusCodeValue())
    callRepo.save(msTc)

    def msEntries = parser.parseText(msResult.getBody() as String)
    def existingIds = msEntries.collect { it.sourceFileId } as Set

    // STEP 4 - Compare and identify new entries
    def newEntries = dataspaceEntries.findAll { !existingIds.contains(it.id) }
    println "Dataspace entries: ${dataspaceEntries.size()} | Microservice entries: ${msEntries.size()} | New entries to ingest: ${newEntries.size()}"

    if (newEntries.isEmpty()) {
        println "Nothing to sync. Task complete."
        tl.setStatus(LogStatus.SUCCESS)
        logRepo.save(tl)
        return tl
    }

    // STEP 5 - Download and ingest each new entry
    newEntries.each { entry ->
        def entryId = entry.id
        println "Processing entry: ${entryId} - ${entry.offering_title}"

        try {
            // Download file via microservice proxy (handles auth internally)
            def downloadUrl = "${msBaseUrl}/api/consume-data/by-id?id=${entryId}"
            def downloadResult = restTemplate.exchange(downloadUrl, HttpMethod.GET, new HttpEntity<>(new HttpHeaders()), String.class)
            def downloadJson = parser.parseText(downloadResult.getBody() as String)

            if (!downloadJson.retrieved) {
                println "WARNING: File not retrieved for entry ${entryId}, skipping"
                def errMsg = "File download failed: dataspace returned retrieved=false for entry ${entryId}"
                createErrorEntry(entry, errMsg, msBaseUrl, restTemplate)
                finalStatus = LogStatus.ERROR
                return
            }

            // Ingest into microservice
            def ingestUrl = "${msBaseUrl}/api/file-ingestion-entries/ingest"
            def ingestBody = JsonOutput.toJson([
                id            : entry.id,
                offering_title: entry.offering_title ?: '',
                file_name     : entry.file_name ?: '',
                created_on    : entry.created_on ?: '',
                provider_id   : entry.provider_id ?: '',
                source_file_id: entry.id,
                filedata      : downloadJson.filedata
            ])
            def ingestHeaders = new HttpHeaders()
            ingestHeaders.setContentType(MediaType.APPLICATION_JSON)

            def ingestTc = new TaskCall()
            ingestTc.setLog(tl)
            ingestTc.setParameters("POST ${ingestUrl} entry=${entryId}")
            ingestTc.setStatus(CallStatus.SUCCESS)

            try {
                def ingestResult = restTemplate.exchange(ingestUrl, HttpMethod.POST, new HttpEntity<String>(ingestBody, ingestHeaders), String.class)
                ingestTc.setResponseCode(ingestResult.getStatusCodeValue())
                ingestTc.setResponse(ingestResult.getBody())
                callRepo.save(ingestTc)
                println "SUCCESS: Ingested entry ${entryId} - status ${ingestResult.getStatusCodeValue()}"
            } catch (HttpClientErrorException ingestEx) {
                if (ingestEx.getStatusCode().value() == 400) {
                    println "SKIP: Entry ${entryId} already exists in microservice (400)"
                    ingestTc.setResponseCode(400)
                    callRepo.save(ingestTc)
                } else {
                    println "ERROR: Ingest failed for entry ${entryId} - ${ingestEx.getStatusCode()}: ${ingestEx.getResponseBodyAsString()}"
                    ingestTc.setResponseCode(ingestEx.getStatusCode().value())
                    ingestTc.setStatus(CallStatus.ERROR)
                    callRepo.save(ingestTc)
                    finalStatus = LogStatus.ERROR
                    def errMsg = "Microservice ingest failed with HTTP ${ingestEx.getStatusCode().value()}: ${ingestEx.getResponseBodyAsString()?.take(150)}"
                    createErrorEntry(entry, errMsg, msBaseUrl, restTemplate)
                }
            }

        } catch (Exception entryEx) {
            println "ERROR: Failed to process entry ${entryId}: ${entryEx.getMessage()}"
            finalStatus = LogStatus.ERROR
            def errMsg = "Unexpected error while processing entry ${entryId}: ${entryEx.getMessage()?.take(200)}"
            createErrorEntry(entry, errMsg, msBaseUrl, restTemplate)
        }
    }

    tl.setStatus(finalStatus)

} catch (HttpClientErrorException e) {
    finalStatus = LogStatus.ERROR
    tl.setErrorCode(e.getStatusCode().value())
    tl.setErrorMessage("HTTP ${e.getStatusCode()}: ${e.getResponseBodyAsString()}".take(255))
    tl.setStatus(LogStatus.ERROR)
    println "HTTP error: ${e.getStatusCode()}: ${e.getResponseBodyAsString()}"
} catch (HttpServerErrorException e) {
    finalStatus = LogStatus.ERROR
    tl.setErrorCode(e.getStatusCode().value())
    tl.setErrorMessage("HTTP ${e.getStatusCode()}: ${e.getResponseBodyAsString()}".take(255))
    tl.setStatus(LogStatus.ERROR)
    println "Server error: ${e.getStatusCode()}: ${e.getResponseBodyAsString()}"
} catch (Exception e) {
    finalStatus = LogStatus.ERROR
    tl.setErrorCode(500)
    tl.setErrorMessage(e.getMessage()?.take(255))
    tl.setStatus(LogStatus.ERROR)
    println "Error: ${e.getMessage()}"
}

logRepo.save(tl)
println "Task completed with status: ${finalStatus}"
return tl

def createErrorEntry(entry, String errorMessage, String msBaseUrl, RestTemplate restTemplate) {
    try {
        def body = JsonOutput.toJson([
            source_file_id: entry.id,
            offering_name : entry.offering_title ?: '',
            file_name     : entry.file_name ?: '',
            provider_id   : (entry.provider_company_id ?: entry.provider_id ?: '') as String,
            error_message : errorMessage
        ])
        def headers = new HttpHeaders()
        headers.setContentType(MediaType.APPLICATION_JSON)
        restTemplate.exchange(
            "${msBaseUrl}/api/file-ingestion-entries/error-entry",
            HttpMethod.POST,
            new HttpEntity<String>(body, headers),
            String.class
        )
        println "Inserted ERROR entry for source_file_id=${entry.id}"
    } catch (Exception e) {
        println "WARN: Could not create error entry for ${entry.id}: ${e.getMessage()}"
    }
}
```

## 3.1.2 Translation Task — XlsxTranslationJob

<p align="justify">
Scans the NEW directory for files organised in per-offering subdirectories, converts each file to a base CSV using Python and the pandas library (auto-detecting the format by byte signature: XLSX, legacy XLS, or plain CSV), then invokes a pilot-aware Python script to generate three flexibility profile variants (STD, MIN, MAX). The pilot is determined from the offering name: <code>DST_NTUA_final</code> → Greek script, <code>PT Pilot Consumption Data</code> → Portuguese script, default → Irish script. On success the entry status is updated to TRANSLATED via REST; on failure, to ERROR.
</p>

```groovy
import it.dstech.scheduler.ApplicationContextUtil
import it.dstech.scheduler.entity.logs.*
import it.dstech.scheduler.repository.*
import it.dstech.scheduler.service.TaskLogService
import org.springframework.web.client.*
import org.springframework.http.*
import groovy.json.JsonOutput
import groovy.json.JsonSlurper

def appCtx = ApplicationContextUtil.getContext()
def logService = (TaskLogService) appCtx.getAutowireCapableBeanFactory().getBean(TaskLogService.class)
def logRepo = (TaskLogRepository) appCtx.getAutowireCapableBeanFactory().getBean(TaskLogRepository.class)
def callRepo = (TaskCallRepository) appCtx.getAutowireCapableBeanFactory().getBean(TaskCallRepository.class)

if (jobDataMap == null) throw new Exception("missing task configuration")

def tl = logService.initTaskLog(jobDataMap)
def finalStatus = LogStatus.SUCCESS

try {
    def inputDir             = jobDataMap.get("inputDir")             ?: "/data/dfim/files/NEW"
    def outputDir            = jobDataMap.get("outputDir")            ?: "/data/dfim/files/TRANSLATED"
    def buildProfilesScript  = jobDataMap.get("buildProfilesScript")  ?: "/data/dfim/scripts/build_profiles.py"
    def buildProfilesGreekScript      = jobDataMap.get("buildProfilesGreekScript")      ?: "/data/dfim/scripts/build_profiles_greek.py"
    def buildProfilesPortugueseScript = jobDataMap.get("buildProfilesPortugueseScript") ?: "/data/dfim/scripts/build_profiles_portuguese.py"
    def pythonCmd            = jobDataMap.get("pythonCmd")            ?: "python3"
    def msBaseUrl            = jobDataMap.get("microserviceBaseUrl")  ?: "http://MICROSERVICE_HOST:8082"

    def restTemplate = new RestTemplate()

    new File(outputDir).mkdirs()

    // Fetch all entries to build entryId → offeringName map for pilot detection
    def offeringNameMap = [:]
    try {
        def allResp = restTemplate.exchange(
            "${msBaseUrl}/api/file-ingestion-entries/all",
            HttpMethod.GET, new HttpEntity<>(new HttpHeaders()), String.class)
        new JsonSlurper().parseText(allResp.getBody() as String)
            .each { e -> offeringNameMap[e.entryId as String] = (e.offeringName ?: '') as String }
        println "Loaded offering names for ${offeringNameMap.size()} entries"
    } catch (Exception ex) {
        println "WARN: Could not fetch entry metadata: ${ex.message}"
    }

    def offeringDirs = new File(inputDir).listFiles { f -> f.isDirectory() }

    if (!offeringDirs) {
        println "No offering folders found in ${inputDir}"
        tl.setStatus(LogStatus.SUCCESS)
        logRepo.save(tl)
        return tl
    }

    // Accept any file in the folder except generated profiles (_STD/_MIN/_MAX.csv)
    def allXlsx = offeringDirs.collectMany { dir ->
        (dir.listFiles { f ->
            f.isFile() &&
            !f.name.toLowerCase().endsWith('_std.csv') &&
            !f.name.toLowerCase().endsWith('_min.csv') &&
            !f.name.toLowerCase().endsWith('_max.csv')
        } ?: []).collect { f -> [file: f, entryId: dir.name] }
    }

    if (!allXlsx) {
        println "No data files found inside offering folders in ${inputDir}"
        tl.setStatus(LogStatus.SUCCESS)
        logRepo.save(tl)
        return tl
    }

    println "Found ${allXlsx.size()} xlsx file(s) to process"

    allXlsx.each { item ->
        def xlsxFile = item.file as File
        def entryId  = item.entryId as String

        def tc = new TaskCall()
        tc.setLog(tl)
        tc.setParameters("entryId=${entryId} file=${xlsxFile.name}")
        tc.setStatus(CallStatus.SUCCESS)

        try {
            println "Processing: ${xlsxFile.name} (entryId=${entryId})"

            def baseName    = xlsxFile.name.replaceAll(/\.[^.]+$/, '')
            def xlsxPath    = xlsxFile.absolutePath.replace('\\', '/')
            def entryOutDir = "${outputDir}/${entryId}"
            new File(entryOutDir).mkdirs()
            def actualCsv   = "${entryOutDir}/${baseName}.csv"

            // Step 1: file → CSV (auto-detect by byte signature: PK=xlsx, d0cf=xls, else already CSV)
            println "Step 1: file → CSV"
            runCommand([pythonCmd, "-c",
                "import shutil,pandas as pd; sig=open('${xlsxPath}','rb').read(4); pd.read_excel('${xlsxPath}',engine='openpyxl').to_csv('${actualCsv}',index=False) if sig[:2]==b'PK' else (pd.read_excel('${xlsxPath}',engine='xlrd').to_csv('${actualCsv}',index=False) if sig.hex()[:8]=='d0cf11e0' else shutil.copy('${xlsxPath}','${actualCsv}'))"])

            // Step 2: CSV → STD/MIN/MAX profiles (pilot-aware)
            def offeringName = offeringNameMap[entryId] ?: ''
            def isGreek      = (offeringName == 'DST_NTUA_final')
            def isPortuguese = (offeringName == 'PT Pilot Consumption Data')
            def profileScript = isGreek ? buildProfilesGreekScript : (isPortuguese ? buildProfilesPortugueseScript : buildProfilesScript)
            def pilotName     = isGreek ? 'greek' : (isPortuguese ? 'portuguese' : 'irish')
            println "Step 2: building STD/MIN/MAX profiles (pilot: ${pilotName})"
            runCommand([pythonCmd, profileScript, actualCsv])

            // Step 3: update microservice — mark entry as TRANSLATED
            patchStatus(entryId, 'TRANSLATED', 'XLSX file translated to CSV successfully',
                'scheduler', 'XlsxTranslationJob', actualCsv, msBaseUrl, restTemplate)

            tc.setResponseCode(200)
            tc.setResponse("TRANSLATED")
            callRepo.save(tc)
            println "Done: ${xlsxFile.name}"

        } catch (Exception e) {
            println "ERROR processing ${xlsxFile.name}: ${e.message}"
            finalStatus = LogStatus.ERROR
            tc.setStatus(CallStatus.ERROR)
            tc.setResponseCode(500)
            tc.setResponse(e.getMessage()?.take(255))
            callRepo.save(tc)
            def errMsg = "XLSX translation failed: ${e.getMessage()?.take(200)}"
            patchStatus(entryId, 'ERROR', errMsg, 'scheduler', 'XlsxTranslationJob', null, msBaseUrl, restTemplate)
        }
    }

    tl.setStatus(finalStatus)

} catch (Exception e) {
    finalStatus = LogStatus.ERROR
    tl.setErrorCode(500)
    tl.setErrorMessage(e.getMessage()?.take(255))
    tl.setStatus(LogStatus.ERROR)
    println "Fatal error: ${e.getMessage()}"
}

logRepo.save(tl)
println "Task completed with status: ${finalStatus}"
return tl

def runCommand(List cmd) {
    def pb = new ProcessBuilder(cmd.collect { it.toString() })
        .redirectErrorStream(true)
    pb.environment().put("PYTHONIOENCODING", "utf-8")
    pb.environment().put("PYTHONUTF8", "1")
    def proc = pb.start()
    def output = proc.inputStream.text
    def exitCode = proc.waitFor()
    if (output?.trim()) println output.trim()
    if (exitCode != 0) throw new RuntimeException("Command failed (exit ${exitCode}):\n${output}")
}

def patchStatus(String entryId, String newStatus, String message, String changedBy, String source,
                String translatedFilePath, String msBaseUrl, RestTemplate restTemplate) {
    try {
        def body = [newStatus: newStatus, message: message, changedBy: changedBy, source: source]
        if (translatedFilePath) body.translatedFilePath = translatedFilePath
        def headers = new HttpHeaders()
        headers.setContentType(MediaType.APPLICATION_JSON)
        restTemplate.exchange(
            "${msBaseUrl}/api/file-ingestion-entries/${entryId}/status",
            HttpMethod.POST,
            new HttpEntity<String>(JsonOutput.toJson(body), headers),
            String.class
        )
        println "Updated status to ${newStatus} for entry ${entryId}"
    } catch (Exception e) {
        println "WARN: Could not update status for entry ${entryId}: ${e.getMessage()}"
    }
}
```

## 3.1.3 Synchronization Task — MarketplaceIngestionTask

<p align="justify">
Queries the DFIM for entries with status TRANSLATED and their associated FSP/market identifiers via the <code>/translated-for-marketplace</code> REST endpoint (which joins internally with the <code>fsp_dataspace_mapping</code> table). For each entry, selects the pilot-appropriate TypeScript seeding script (<code>seed-flexibility-data-v2.ts</code>, <code>seed-greek-flexibility-data.ts</code>, or <code>seed-portuguese-flexibility-data.ts</code>) and invokes it via <code>npx ts-node</code> to import the base CSV into MongoDB. On success, the entry is marked SYNCHRONIZED via REST and its directory is moved from TRANSLATED to SYNCHRONIZED; on failure, to ERROR.
</p>

```groovy
import it.dstech.scheduler.ApplicationContextUtil
import it.dstech.scheduler.entity.logs.*
import it.dstech.scheduler.repository.*
import it.dstech.scheduler.service.TaskLogService
import org.springframework.web.client.*
import org.springframework.http.*
import groovy.json.JsonOutput
import groovy.json.JsonSlurper

def appCtx = ApplicationContextUtil.getContext()
def logService = (TaskLogService) appCtx.getAutowireCapableBeanFactory().getBean(TaskLogService.class)
def logRepo = (TaskLogRepository) appCtx.getAutowireCapableBeanFactory().getBean(TaskLogRepository.class)
def callRepo = (TaskCallRepository) appCtx.getAutowireCapableBeanFactory().getBean(TaskCallRepository.class)

if (jobDataMap == null) throw new Exception("missing task configuration")

def tl = logService.initTaskLog(jobDataMap)
def finalStatus = LogStatus.SUCCESS

try {
    def translatedDir   = jobDataMap.get("translatedDir")   ?: "/data/dfim/files/TRANSLATED"
    def synchronizedDir = jobDataMap.get("synchronizedDir") ?: "/data/dfim/files/SYNCHRONIZED"
    def marketplaceDir  = jobDataMap.get("marketplaceDir")  ?: "/app/marketplace-be"
    def msBaseUrl       = jobDataMap.get("microserviceBaseUrl") ?: "http://MICROSERVICE_HOST:8082"
    def mongoUri        = jobDataMap.get("mongoUri")  // null = uses the .env from marketplaceDir
    def npxCmd          = System.getProperty('os.name').toLowerCase().contains('win') ? 'npx.cmd' : 'npx'

    def restTemplate = new RestTemplate()
    def parser = new JsonSlurper()

    // Fetch TRANSLATED entries with FSP mapping via microservice
    def entriesResult = restTemplate.exchange(
        "${msBaseUrl}/api/file-ingestion-entries/translated-for-marketplace",
        HttpMethod.GET,
        new HttpEntity<>(new HttpHeaders()),
        String.class
    )
    def entries = parser.parseText(entriesResult.getBody() as String)

    if (!entries) {
        println "No TRANSLATED entries found"
        tl.setStatus(LogStatus.SUCCESS)
        logRepo.save(tl)
        return tl
    }

    println "Found ${entries.size()} TRANSLATED entry/entries to ingest"

    entries.each { entry ->
        def entryId  = entry.entry_id as String
        def baseName = (entry.original_filename as String).replace('.xlsx', '')
        def fspId    = entry.marketplace_fsp_id as String
        def marketId = entry.marketplace_market_id as String
        def fileDir  = "${translatedDir}/${entryId}"

        def tc = new TaskCall()
        tc.setLog(tl)
        tc.setParameters("entryId=${entryId} market=${marketId} fsp=${fspId}")
        tc.setStatus(CallStatus.SUCCESS)

        try {
            if (!csvFilesExist(fileDir, baseName)) {
                println "WARN: Missing CSV files in ${fileDir} for ${baseName}, skipping"
                tc.setResponseCode(404)
                tc.setResponse("Missing CSV files")
                callRepo.save(tc)
                return
            }

            println "Ingesting ${baseName} (${entryId}) → market=${marketId}, fsp=${fspId}"

            def offeringName = (entry.offering_name ?: '') as String
            def isGreek      = (offeringName == 'DST_NTUA_final')
            def isPortuguese = (offeringName == 'PT Pilot Consumption Data')
            def script = isGreek
                ? 'src/scripts/seed-greek-flexibility-data.ts'
                : (isPortuguese ? 'src/scripts/seed-portuguese-flexibility-data.ts' : 'src/scripts/seed-flexibility-data-v2.ts')
            def pilotName = isGreek ? 'Greek' : (isPortuguese ? 'Portuguese' : 'Irish')
            println "Using ${pilotName} seed script for entry ${entryId}"

            runSeedCommand(npxCmd, script, marketId, fspId, "${fileDir}/${baseName}.csv", null, marketplaceDir, mongoUri)

            // Mark as SYNCHRONIZED via microservice
            def syncBody = JsonOutput.toJson([
                message  : 'Data ingested into marketplace successfully',
                changedBy: 'scheduler',
                source   : 'MarketplaceIngestionTask'
            ])
            def syncHeaders = new HttpHeaders()
            syncHeaders.setContentType(MediaType.APPLICATION_JSON)
            restTemplate.exchange(
                "${msBaseUrl}/api/file-ingestion-entries/${entryId}/synchronize",
                HttpMethod.POST,
                new HttpEntity<String>(syncBody, syncHeaders),
                String.class
            )

            def srcDir  = new File("${translatedDir}/${entryId}")
            def destDir = new File("${synchronizedDir}/${entryId}")
            new File(synchronizedDir).mkdirs()
            srcDir.renameTo(destDir)
            println "Moved folder: TRANSLATED/${entryId} → SYNCHRONIZED/${entryId}"

            tc.setResponseCode(200)
            tc.setResponse("SYNCHRONIZED")
            callRepo.save(tc)
            println "Done: ${baseName}"

        } catch (Exception e) {
            println "ERROR ingesting ${baseName}: ${e.message}"
            finalStatus = LogStatus.ERROR
            tc.setStatus(CallStatus.ERROR)
            tc.setResponseCode(500)
            tc.setResponse(e.getMessage()?.take(255))
            callRepo.save(tc)
            def errMsg = "Marketplace ingestion failed: ${e.getMessage()?.take(200)}"
            def errBody = JsonOutput.toJson([
                message  : errMsg,
                changedBy: 'scheduler',
                source   : 'MarketplaceIngestionTask'
            ])
            def errHeaders = new HttpHeaders()
            errHeaders.setContentType(MediaType.APPLICATION_JSON)
            try {
                restTemplate.exchange(
                    "${msBaseUrl}/api/file-ingestion-entries/${entryId}/error",
                    HttpMethod.POST,
                    new HttpEntity<String>(errBody, errHeaders),
                    String.class
                )
            } catch (Exception restEx) {
                println "WARN: Could not update error status for entry ${entryId}: ${restEx.getMessage()}"
            }
        }
    }

    tl.setStatus(finalStatus)

} catch (Exception e) {
    finalStatus = LogStatus.ERROR
    tl.setErrorCode(500)
    tl.setErrorMessage(e.getMessage()?.take(255))
    tl.setStatus(LogStatus.ERROR)
    println "Fatal error: ${e.getMessage()}"
}

logRepo.save(tl)
println "Task completed with status: ${finalStatus}"
return tl

def runSeedCommand(String npxCmd, String script, String marketId, String fspId, String filePath, String reference, String workDir, String mongoUri) {
    def cmd = [npxCmd, 'ts-node', '-r', 'tsconfig-paths/register', script,
               "--market=${marketId}", "--fsp=${fspId}", "--file=${filePath}"]
    if (reference) cmd << "--reference=${reference}"
    println "Running: ${cmd.join(' ')}"
    runCommand(cmd, workDir, mongoUri)
}

def runCommand(List cmd, String workDir, String mongoUri) {
    def pb = new ProcessBuilder(cmd.collect { it.toString() })
        .redirectErrorStream(true)
    if (workDir) pb.directory(new File(workDir))
    if (mongoUri) pb.environment().put("MONGO_URI", mongoUri)
    def proc = pb.start()
    def output = proc.inputStream.text
    def exitCode = proc.waitFor()
    if (output?.trim()) println output.trim()
    if (exitCode != 0) throw new RuntimeException("Command failed (exit ${exitCode}):\n${output}")
}

def boolean csvFilesExist(String fileDir, String baseName) {
    new File("${fileDir}/${baseName}.csv").exists()
}
```

<br>

---

# 4. Integration with Other Components

<p align=justify><strong>DSTechScheduler</strong> runs the three Groovy tasks on cron schedules and shares the same PostgreSQL instance as the DFIM. Task parameters (API URLs, credentials, paths) are stored in the Scheduler database, not in the DFIM. </p>

<p align=justify><strong>Energy Data Space middleware</strong> (operated by European Dynamics) is called by the ingestion task via REST with JWT authentication. The middleware URL and credentials are Scheduler job parameters, allowing per-pilot reconfiguration. </p>

<p align=justify><strong>Marketplace backend</strong> is called by the synchronization task via <code>npx ts-node</code> directly — not via REST — passing the CSV file path and the FSP/market IDs resolved from the <code>fsp_dataspace_mapping</code> table. </p>

<p align=justify><strong>Ingestion Dashboard</strong> consumes the DFIM REST API to display entry status, trigger manual state changes, and browse status history. </p>

<br>

---

# 5. Environment Variables

<p align="justify">
The DFIM has no <code>application.yml</code> — all configuration is injected via Docker Compose environment variables. Scheduler task parameters are stored in the Scheduler database.
</p>

| Variable | Description | Example |
|---|---|---|
| `SPRING_DATASOURCE_URL` | JDBC URL for PostgreSQL | `jdbc:postgresql://postgres:5432/dataspace_ingestion` |
| `SPRING_DATASOURCE_USERNAME` | PostgreSQL username | `postgres` |
| `SPRING_DATASOURCE_PASSWORD` | PostgreSQL password | `postgres` |

<br>

---

# 6. Development Setup

```bash
cd dataspace-file-ingestion-microservice

# With Docker Compose
docker compose up -d postgres ingestion-microservice

# Swagger UI: http://SERVER_IP:8082/swagger-ui.html
```

<br>

---

# 7. Related Components

| Component | Path | Description |
|---|---|---|
| Ingestion Dashboard | [`../injection-dashboard/`](../injection-dashboard/) | Angular UI for monitoring and manually managing DFIM pipeline entries |
| Marketplace Backend | [`../marketplace-be/`](../marketplace-be/) | Receives flexibility data via the synchronization task's seed script |
| Scheduler (external) | — | Executes the three Groovy pipeline tasks on cron schedules; stores task configuration and logs. Not included in this repository — the task source code is documented in section 3.1 above. |
