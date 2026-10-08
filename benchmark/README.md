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

## 2. Deployment time

This script **instruments the procedure in README section 4.2**. That procedure has two automated phases separated by a
manual configuration step in the identity provider — redirect URIs are
registered and two client secrets are copied into the backend environment — so
deployment cannot honestly be reduced to a single number.

```bash
./benchmark/measure-deploy.sh prepare --reset
./benchmark/measure-deploy.sh phase1
#   ... do the manual steps it prints ...
./benchmark/measure-deploy.sh phase2
```

Three figures are reported, and they mean different things:

| Figure | Recurs |
|---|---|
| Image preparation | Once per code change |
| Phase 1, identity provider | Every start |
| Phase 2, remaining services | Every start |

The manual step between the phases is operator time, not machine time, and is
excluded from all three. `phase2` refuses to start if that step was skipped,
rather than letting the backend come up and reject every request.

`--reset` removes containers **and volumes** before preparing, for a true cold
start. It deletes all platform data and waits five seconds first. Without it the
figures describe a restart over existing volumes, which is faster and must not be
reported as a cold deployment.

## 3. Resource footprint

```bash
./benchmark/measure-resources.sh                        # idle
LABEL=under-load ./benchmark/measure-resources.sh       # while a workload runs
```

Samples `docker stats` and reports mean and peak CPU and memory per container,
plus the total across the stack. Run it twice, idle and under load, and report
both: the idle figure is what the stack costs to keep available, the loaded
figure is what it costs to use.

For the loaded figure, the workload must cover the whole sampling window, or
idle samples dilute the mean. Keep the on-chain workload running against the
deployed node for as long as the measurement lasts:

```bash
# terminal A
LABEL=under-load DURATION=180 ./benchmark/measure-resources.sh

# terminal B, started immediately after
cd flexibility-market-smartcontracts
end=$((SECONDS + 180))
while [ $SECONDS -lt $end ]; do
  MARKETS=3 SESSIONS=2 FSPS=5 npm run benchmark -- --network localhost
done
```

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
