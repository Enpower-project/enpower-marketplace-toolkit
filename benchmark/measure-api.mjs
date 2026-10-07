#!/usr/bin/env node
/**
 * API latency for the ENPOWER Marketplace Toolkit.
 *
 * Authenticates against Keycloak with the resource owner password grant, which
 * the `backend` client has enabled, then times each endpoint over repeated
 * calls and reports the median, the 95th percentile and the mean.
 *
 * Latencies are a property of the host and the network, not of the software, so
 * the report states the host it was measured on. Gas figures come from
 * `flexibility-market-smartcontracts/scripts/benchmark.ts` instead; the two are
 * not comparable and are reported separately.
 *
 * Usage:
 *   cp benchmark/.env.example benchmark/.env   # fill in one account
 *   node benchmark/measure-api.mjs
 *   REPEATS=50 node benchmark/measure-api.mjs
 */

import { readFileSync } from "node:fs";
import { hrtime } from "node:process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/* ── configuration ─────────────────────────────────────────────────────── */

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(join(here, ".env"), "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* no .env file: fall back to the defaults below */
  }
  return env;
}

const env = loadEnv();
const cfg = {
  backend: env.BACKEND_URL ?? "http://localhost:3000",
  keycloak: env.KEYCLOAK_URL ?? "http://localhost:8088",
  realm: env.KEYCLOAK_REALM ?? "enpower-marketplace",
  clientId: env.KEYCLOAK_CLIENT_ID ?? "backend",
  clientSecret: env.KEYCLOAK_CLIENT_SECRET ?? "",
  username: env.API_USERNAME ?? "",
  password: env.API_PASSWORD ?? "",
  repeats: Number(env.REPEATS ?? 30),
  warmup: Number(env.WARMUP ?? 3),
};

/* ── endpoints ─────────────────────────────────────────────────────────────
 * Verified against the controllers in marketplace-be/src/modules. `auth` marks
 * the ones that need a bearer token; without credentials they are skipped
 * rather than reported as failures.
 * ───────────────────────────────────────────────────────────────────────── */

const ENDPOINTS = [
  { name: "GET /auth/health", path: "/auth/health", auth: false },
  { name: "GET /", path: "/", auth: false },
  { name: "GET /languages", path: "/languages", auth: false },
  { name: "GET /sessions", path: "/sessions", auth: true },
  { name: "GET /sessions/published/list", path: "/sessions/published/list", auth: true },
  { name: "GET /sessions/active/list", path: "/sessions/active/list", auth: true },
  { name: "GET /sessions/my-sessions", path: "/sessions/my-sessions", auth: true },
  { name: "GET /users/me", path: "/users/me", auth: true },
  { name: "GET /users/list", path: "/users/list", auth: true },
];

/* ── measurement ───────────────────────────────────────────────────────── */

const ms = (start) => Number(hrtime.bigint() - start) / 1e6;

function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

async function getToken() {
  if (!cfg.username || !cfg.password) return null;

  const body = new URLSearchParams({
    grant_type: "password",
    client_id: cfg.clientId,
    username: cfg.username,
    password: cfg.password,
  });
  if (cfg.clientSecret) body.set("client_secret", cfg.clientSecret);

  const url = `${cfg.keycloak}/realms/${cfg.realm}/protocol/openid-connect/token`;
  const start = hrtime.bigint();
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const elapsed = ms(start);

  if (!response.ok) {
    console.error(`  token request failed: ${response.status} ${await response.text()}`);
    return null;
  }
  const json = await response.json();
  return { token: json.access_token, elapsed };
}

async function timeEndpoint(endpoint, token) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const url = `${cfg.backend}${endpoint.path}`;
  const samples = [];
  let status = 0;

  for (let i = 0; i < cfg.warmup + cfg.repeats; i++) {
    const start = hrtime.bigint();
    try {
      const response = await fetch(url, { headers });
      await response.arrayBuffer(); // include body transfer in the measurement
      status = response.status;
    } catch (error) {
      return { ...endpoint, error: error.message };
    }
    if (i >= cfg.warmup) samples.push(ms(start));
  }

  samples.sort((a, b) => a - b);
  return {
    ...endpoint,
    status,
    n: samples.length,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
  };
}

/* ── report ────────────────────────────────────────────────────────────── */

async function main() {
  console.error(`Backend:  ${cfg.backend}`);
  console.error(`Keycloak: ${cfg.keycloak} (realm ${cfg.realm})`);
  console.error(`Repeats:  ${cfg.repeats} per endpoint, after ${cfg.warmup} warm-up calls\n`);

  const auth = await getToken();
  if (!auth) {
    console.error(
      "No token: authenticated endpoints will be skipped.\n" +
        "Fill in API_USERNAME and API_PASSWORD in benchmark/.env to include them.\n",
    );
  }

  const results = [];
  for (const endpoint of ENDPOINTS) {
    if (endpoint.auth && !auth) {
      results.push({ ...endpoint, skipped: true });
      continue;
    }
    process.stderr.write(`  ${endpoint.name} ... `);
    const result = await timeEndpoint(endpoint, auth?.token);
    console.error(result.error ? `error: ${result.error}` : `${result.p50.toFixed(1)} ms`);
    results.push(result);
  }

  console.log("\n### API latency\n");
  console.log("| Endpoint | Status | n | Median | p95 | Mean |");
  console.log("|---|---:|---:|---:|---:|---:|");

  if (auth) {
    console.log(
      `| Keycloak token (password grant) | 200 | 1 | ${auth.elapsed.toFixed(1)} ms | — | — |`,
    );
  }
  for (const r of results) {
    if (r.skipped) {
      console.log(`| ${r.name} | skipped, no credentials | — | — | — | — |`);
    } else if (r.error) {
      console.log(`| ${r.name} | unreachable | — | — | — | — |`);
    } else {
      console.log(
        `| ${r.name} | ${r.status} | ${r.n} | ${r.p50.toFixed(1)} ms | ` +
          `${r.p95.toFixed(1)} ms | ${r.mean.toFixed(1)} ms |`,
      );
    }
  }

  const measured = results.filter((r) => !r.skipped && !r.error);
  if (measured.length) {
    const medians = measured.map((r) => r.p50).sort((a, b) => a - b);
    console.log(
      `\nAcross ${measured.length} endpoints the median response time ranges from ` +
        `${medians[0].toFixed(1)} ms to ${medians[medians.length - 1].toFixed(1)} ms.`,
    );
  }
  console.log(
    "\nLatencies are specific to the host and network on which this run was executed, " +
      "and are reported separately from the gas measurements, which are not.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
