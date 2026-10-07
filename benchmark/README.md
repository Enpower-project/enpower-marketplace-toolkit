# Benchmarks

Four measurements, each producing a Markdown table. Together they characterise
the reference deployment: what it costs on-chain, how long it takes to stand up,
how much it consumes while running, and how quickly it answers.

Run them on a clean host. The gas figures are reproducible anywhere; the timing
and resource figures are properties of the host and must be reported with it.

## 1. On-chain cost

Reproducible on any machine, no deployment required.

```bash
cd flexibility-market-smartcontracts
npm ci
MARKETS=3 SESSIONS=2 FSPS=5 npm run benchmark
```

Reports gas per operation and per phase across concurrent markets, sessions and
providers. Gas is invariant across EVM-compatible networks, so these figures do
not depend on the host. The wall-clock column of that script is **not**
reportable: the in-process Hardhat network has no block time.

## 2. Cold deployment time

```bash
./benchmark/measure-deploy.sh --reset
```

Times each service from `docker compose up` to the moment it can answer a
request, which is the figure that matters to someone reproducing the deployment.
Images are pulled before timing starts, so the result excludes download time.

`--reset` removes containers **and volumes** first, for a true cold start. It
deletes all platform data and prompts for five seconds before doing so. Without
it the script times a restart over existing volumes, which is faster and should
not be reported as a cold deployment.

## 3. Resource footprint

```bash
./benchmark/measure-resources.sh                        # idle
LABEL=under-load ./benchmark/measure-resources.sh       # while a workload runs
```

Samples `docker stats` and reports mean and peak CPU and memory per container,
plus the total across the stack. Run it twice, idle and under load, and report
both: the idle figure is what the stack costs to keep available, the loaded
figure is what it costs to use.

## 4. API latency

```bash
cp benchmark/.env.example benchmark/.env   # then fill in one account
node benchmark/measure-api.mjs
```

Authenticates through Keycloak with the password grant and times each endpoint
over repeated calls, reporting median, 95th percentile and mean. Without
credentials the authenticated endpoints are skipped and the public ones are
still measured.

## Reporting

Keep the two kinds of number apart. Gas is a property of the contracts and
transfers between deployments. Latency, memory and deployment time are
properties of the host, and a table that mixes them without saying which is
which invites exactly the objection it is meant to answer. State the host:
kernel, CPU count, RAM, Docker version.
