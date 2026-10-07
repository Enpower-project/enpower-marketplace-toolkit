/**
 * Gas and concurrency benchmark for the ENPOWER Marketplace contract layer.
 *
 * Runs complete market sessions end to end against the configured network and
 * reports gas consumed per lifecycle operation, separating one-off platform
 * deployment, per-session setup and per-offer trading operations.
 *
 * Gas consumption is invariant across EVM-compatible networks, so these figures
 * transfer to any deployment target; wall-clock timings are reported alongside
 * but are specific to the network and host used.
 *
 * Usage:
 *   npx hardhat run scripts/benchmark.ts
 *   MARKETS=3 SESSIONS=2 FSPS=5 npx hardhat run scripts/benchmark.ts
 *   npx hardhat run scripts/benchmark.ts --network localhost
 */

import { ethers } from "hardhat";
import type { ContractTransactionResponse } from "ethers";

/* ─────────────────────────── configuration ─────────────────────────── */

const MARKETS = Number(process.env.MARKETS ?? 3);
const SESSIONS_PER_MARKET = Number(process.env.SESSIONS ?? 2);
const FSPS = Number(process.env.FSPS ?? 5);

/** Hour slot used for the benchmarked request. */
const HOUR_SLOT = 17;
/** Requested quantity per slot, in MWh expressed as wei. */
const REQUEST_QUANTITY = ethers.parseEther("0.5");
/** Fixed price, FLEX per MWh expressed as wei. */
const REQUEST_PRICE = ethers.parseEther("50");
/** Quantity each FSP offers, in MWh expressed as wei. */
const OFFER_QUANTITY = ethers.parseEther("0.05");
/** Fraction of the committed quantity actually delivered, as a percentage. */
const DELIVERY_RATE_PCT = 90;

const COLLATERAL_BPS = 500n; // 5 %, mirrors MarketSession.COLLATERAL_BPS
const PLATFORM_FEE_BPS = 200n; // 2 %, mirrors MarketSession.PLATFORM_FEE_BPS
const BPS_DENOMINATOR = 10_000n;

/* ─────────────────────────── measurement ─────────────────────────── */

type Phase = "platform" | "market" | "session-setup" | "trading" | "settlement";

interface Sample {
  phase: Phase;
  operation: string;
  gas: bigint;
  ms: number;
}

const samples: Sample[] = [];

/** Send a transaction, wait for it, and record gas and elapsed time. */
async function track(
  phase: Phase,
  operation: string,
  send: () => Promise<ContractTransactionResponse>,
): Promise<void> {
  const started = Date.now();
  const receipt = await (await send()).wait();
  const ms = Date.now() - started;
  if (!receipt) throw new Error(`No receipt for ${operation}`);
  samples.push({ phase, operation, gas: receipt.gasUsed, ms });
}

/** Deploy a contract, recording the deployment gas. */
async function trackDeploy<T>(
  phase: Phase,
  operation: string,
  deploy: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  const contract = (await deploy()) as T & {
    waitForDeployment: () => Promise<unknown>;
    deploymentTransaction: () => ContractTransactionResponse | null;
  };
  await contract.waitForDeployment();
  const receipt = await contract.deploymentTransaction()?.wait();
  const ms = Date.now() - started;
  if (!receipt) throw new Error(`No deployment receipt for ${operation}`);
  samples.push({ phase, operation, gas: receipt.gasUsed, ms });
  return contract as T;
}

/* ─────────────────────────── reporting ─────────────────────────── */

const PHASE_LABEL: Record<Phase, string> = {
  platform: "Platform deployment (once per installation)",
  market: "Market creation (once per energy community)",
  "session-setup": "Session setup (once per session)",
  trading: "Trading (per offer)",
  settlement: "Settlement (per offer, plus per session)",
};

function fmt(n: bigint): string {
  return n.toLocaleString("en-US");
}

function report(elapsedMs: number): void {
  const byOperation = new Map<
    string,
    { phase: Phase; gas: bigint[]; ms: number[] }
  >();

  for (const s of samples) {
    const key = `${s.phase}\u0000${s.operation}`;
    const entry = byOperation.get(key) ?? { phase: s.phase, gas: [], ms: [] };
    entry.gas.push(s.gas);
    entry.ms.push(s.ms);
    byOperation.set(key, entry);
  }

  console.log("\n");
  console.log("## Gas consumption per lifecycle operation");
  console.log("");
  console.log(
    `Workload: ${MARKETS} markets × ${SESSIONS_PER_MARKET} sessions × ${FSPS} FSPs ` +
      `— ${samples.length} transactions in ${(elapsedMs / 1000).toFixed(1)} s`,
  );
  console.log("");

  for (const phase of Object.keys(PHASE_LABEL) as Phase[]) {
    const entries = [...byOperation.entries()].filter(
      ([, v]) => v.phase === phase,
    );
    if (entries.length === 0) continue;

    console.log(`### ${PHASE_LABEL[phase]}`);
    console.log("");
    console.log("| Operation | Calls | Gas (mean) | Gas (min) | Gas (max) |");
    console.log("|---|---:|---:|---:|---:|");

    let phaseTotal = 0n;
    for (const [key, v] of entries) {
      const operation = key.split("\u0000")[1];
      const total = v.gas.reduce((a, b) => a + b, 0n);
      const mean = total / BigInt(v.gas.length);
      const min = v.gas.reduce((a, b) => (b < a ? b : a));
      const max = v.gas.reduce((a, b) => (b > a ? b : a));
      phaseTotal += total;
      console.log(
        `| ${operation} | ${v.gas.length} | ${fmt(mean)} | ${fmt(min)} | ${fmt(max)} |`,
      );
    }
    console.log(`| **Phase total** | | **${fmt(phaseTotal)}** | | |`);
    console.log("");
  }

  const grandTotal = samples.reduce((a, s) => a + s.gas, 0n);
  const sessions = MARKETS * SESSIONS_PER_MARKET;
  const offers = sessions * FSPS;

  console.log("### Aggregate");
  console.log("");
  console.log("| Metric | Value |");
  console.log("|---|---:|");
  console.log(`| Total gas, whole workload | ${fmt(grandTotal)} |`);
  console.log(`| Sessions executed | ${sessions} |`);
  console.log(`| Offers settled | ${offers} |`);
  console.log(
    `| Transactions | ${samples.length} |`,
  );
  console.log(
    `| Wall-clock time | ${(elapsedMs / 1000).toFixed(1)} s |`,
  );
  console.log("");
  console.log(
    "Gas figures are invariant across EVM-compatible networks. Wall-clock timings " +
      "are specific to the network and host on which this run was executed.",
  );
  console.log("");
}

/* ─────────────────────────── benchmark ─────────────────────────── */

async function main(): Promise<void> {
  const startedAt = Date.now();
  const signers = await ethers.getSigners();

  const required = 3 + FSPS;
  if (signers.length < required) {
    throw new Error(
      `Need ${required} accounts (admin, FMO/LMO, FRP and ${FSPS} FSPs) but the ` +
        `network exposes ${signers.length}. Reduce FSPS or configure more accounts.`,
    );
  }

  const [admin, fmoLmo, frp, ...fspPool] = signers;
  const fsps = fspPool.slice(0, FSPS);

  console.log(
    `\nBenchmarking ${MARKETS} markets × ${SESSIONS_PER_MARKET} sessions × ${FSPS} FSPs\n`,
  );

  /* ── 1. platform deployment ───────────────────────────────────── */

  const token = await trackDeploy("platform", "Deploy FlexibilityToken", async () =>
    (await ethers.getContractFactory("FlexibilityToken")).deploy(),
  );
  const tokenAddr = await token.getAddress();

  const registry = await trackDeploy(
    "platform",
    "Deploy ParticipantRegistry",
    async () => (await ethers.getContractFactory("ParticipantRegistry")).deploy(),
  );
  const registryAddr = await registry.getAddress();

  const treasury = await trackDeploy("platform", "Deploy Treasury", async () =>
    (await ethers.getContractFactory("Treasury")).deploy(tokenAddr, admin.address),
  );
  const treasuryAddr = await treasury.getAddress();

  const nft = await trackDeploy("platform", "Deploy FlexibilityNFT", async () =>
    (await ethers.getContractFactory("FlexibilityNFT")).deploy(),
  );
  const nftAddr = await nft.getAddress();

  const factory = await trackDeploy("platform", "Deploy MarketFactory", async () => {
    // MarketFactory takes the registry address in its constructor.
    const cf = (await ethers.getContractFactory("MarketFactory")) as any;
    return cf.deploy(registryAddr);
  });

  /* ── 2. platform role configuration ───────────────────────────── */

  // ParticipantRegistry, FlexibilityToken and FlexibilityNFT grant their own
  // admin and operator roles to the deployer in their constructors, so only the
  // roles that must reach other accounts or contracts are granted explicitly.
  const NFT_MINTER_ROLE = await nft.MINTER_ROLE();
  const NFT_UPDATER_ROLE = await nft.UPDATER_ROLE();
  const SESSION_CONTRACT_ROLE = await treasury.SESSION_CONTRACT();
  const FRP_ROLE = await treasury.FRP_ROLE();

  await track("platform", "Grant FRP_ROLE (treasury)", () =>
    treasury.grantRole(FRP_ROLE, frp.address),
  );

  /* ── 3. participant registration and qualification ────────────── */

  // ParticipantType: NONE=0, MARKETPLACE_ADMIN=1, FMO_LMO=2, FRP=3, FSP=4
  const participants: Array<[string, number, string]> = [
    [fmoLmo.address, 2, "FMO_LMO"],
    [frp.address, 3, "FRP"],
    ...fsps.map((s) => [s.address, 4, "FSP"] as [string, number, string]),
  ];

  for (const [address, pType, label] of participants) {
    await track(
      "platform",
      `Register participant (${label})`,
      () => registry.registerParticipant(address, pType, `cred:${label}`, "IE"),
    );
    await track("platform", `Qualify participant (${label})`, () =>
      registry.qualifyParticipant(address),
    );
  }

  /* ── 4. fund participants ─────────────────────────────────────── */

  const notional = (OFFER_QUANTITY * REQUEST_PRICE) / ethers.WeiPerEther;
  const collateral = (notional * COLLATERAL_BPS) / BPS_DENOMINATOR;
  const fee = (notional * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
  const perOfferOutlay = collateral + fee;
  const sessionsTotal = MARKETS * SESSIONS_PER_MARKET;

  const fspFunding = perOfferOutlay * BigInt(sessionsTotal) * 4n;
  const frpFunding = notional * BigInt(sessionsTotal * FSPS) * 4n;

  // Minting is test scaffolding and is not measured. The token and NFT approvals
  // that production performs per offer are measured in the trading loop below, so
  // that the reported cost matches the real submission path.
  for (const fsp of fsps) {
    await token.connect(admin).mint(fsp.address, fspFunding);
  }
  await token.connect(admin).mint(frp.address, frpFunding);

  console.log(
    `Funded ${FSPS} FSPs with ${ethers.formatEther(fspFunding)} FLEX each, ` +
      `FRP with ${ethers.formatEther(frpFunding)} FLEX\n`,
  );

  /* ── 5. markets, sessions and trading ─────────────────────────── */

  // `attach` returns an untyped BaseContract: this project does not generate
  // TypeChain bindings, so dynamically attached instances are addressed loosely.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const MarketArtifact = await ethers.getContractFactory("Market");
  const SessionArtifact = await ethers.getContractFactory("MarketSession");

  for (let m = 0; m < MARKETS; m++) {
    await track("market", "MarketFactory.createMarket", () =>
      factory.createMarket(`community-${m}`, "IE", admin.address),
    );
    const marketInfo = await factory.getMarket(m + 1);
    const market = MarketArtifact.attach(marketInfo.marketAddress) as any;

    await track("market", "Market.setParticipantRegistry", () =>
      market.connect(admin).setParticipantRegistry(registryAddr),
    );

    for (let s = 0; s < SESSIONS_PER_MARKET; s++) {
      const latest = await ethers.provider.getBlock("latest");
      const deliveryDay = BigInt(latest!.timestamp) + 2n * 86_400n;

      await track("session-setup", "Market.createSession", () =>
        market.connect(admin).createSession(deliveryDay, treasuryAddr, fmoLmo.address, frp.address, [
          {
            hourSlot: HOUR_SLOT,
            quantity: REQUEST_QUANTITY,
            price: REQUEST_PRICE,
            flexType: 0,
          },
        ]),
      );

      const sessionInfo = await market.getSession(s + 1);
      const session = SessionArtifact.attach(sessionInfo.sessionAddress) as any;
      const sessionAddr = sessionInfo.sessionAddress as string;

      /* session wiring */
      await track("session-setup", "MarketSession.setNFTContract", () =>
        session.connect(admin).setNFTContract(nftAddr),
      );
      await track("session-setup", "MarketSession.setParticipantRegistry", () =>
        session.connect(admin).setParticipantRegistry(registryAddr),
      );
      await track("session-setup", "Grant SESSION_CONTRACT (treasury)", () =>
        treasury.connect(admin).grantRole(SESSION_CONTRACT_ROLE, sessionAddr),
      );
      await track("session-setup", "Grant MINTER_ROLE (NFT)", () =>
        nft.connect(admin).grantRole(NFT_MINTER_ROLE, sessionAddr),
      );
      await track("session-setup", "Grant UPDATER_ROLE (NFT)", () =>
        nft.connect(admin).grantRole(NFT_UPDATER_ROLE, sessionAddr),
      );

      const FSP_ROLE = await session.FSP();
      for (const fsp of fsps) {
        await track("session-setup", "Grant FSP role (per FSP, per session)", () =>
          session.connect(admin).grantRole(FSP_ROLE, fsp.address),
        );
      }

      await track("session-setup", "MarketSession.openOffers", () =>
        session.connect(admin).openOffers(),
      );

      /* trading — mirrors the three transactions the backend issues per offer
         (see marketplace-be hourly-offer.service.ts): collateral and fee
         approval, NFT transfer approval for the session, and publication. */
      for (const fsp of fsps) {
        await track("trading", "FlexibilityToken.approve (collateral + fee)", () =>
          token.connect(fsp).approve(treasuryAddr, perOfferOutlay),
        );
        await track("trading", "FlexibilityNFT.setApprovalForAll (session)", () =>
          nft.connect(fsp).setApprovalForAll(sessionAddr, true),
        );
        await track("trading", "MarketSession.createOffer", () =>
          session.connect(fsp).createOffer(HOUR_SLOT, OFFER_QUANTITY),
        );
      }

      await track("trading", "MarketSession.closeOffers", () =>
        session.connect(fmoLmo).closeOffers(),
      );

      /* settlement */
      const measurementHash = ethers.keccak256(
        ethers.toUtf8Bytes(`measurements:m${m}:s${s}`),
      );
      await track("settlement", "MarketSession.submitMeasurementData", () =>
        session.connect(fmoLmo).submitMeasurementData(measurementHash),
      );

      const sessionPayment = notional * BigInt(FSPS);
      await track("settlement", "FlexibilityToken.approve (FRP payment)", () =>
        token.connect(frp).approve(treasuryAddr, sessionPayment),
      );
      await track("settlement", "Treasury.depositPaymentForSession", () =>
        treasury.connect(frp).depositPaymentForSession(s + 1, sessionPayment),
      );

      for (let offerId = 1; offerId <= FSPS; offerId++) {
        const delivered =
          (OFFER_QUANTITY * BigInt(DELIVERY_RATE_PCT)) / 100n;
        const shortfall = OFFER_QUANTITY - delivered;
        const penalty = (collateral * shortfall) / OFFER_QUANTITY;

        await track("settlement", "MarketSession.submitSettlement", () =>
          session
            .connect(fmoLmo)
            .submitSettlement(offerId, delivered, penalty, measurementHash),
        );
        await track("settlement", "MarketSession.executeSettlement", () =>
          session.connect(fmoLmo).executeSettlement(offerId),
        );
      }

      await track("settlement", "MarketSession.finalizeSession", () =>
        session.connect(admin).finalizeSession(),
      );

      process.stdout.write(
        `  market ${m + 1}/${MARKETS}, session ${s + 1}/${SESSIONS_PER_MARKET} settled\n`,
      );
    }
  }

  report(Date.now() - startedAt);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
