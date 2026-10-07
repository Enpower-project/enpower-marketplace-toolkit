/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared deployment fixtures for the ENPOWER Marketplace contract test suite.
 *
 * `deployedSessionFixture` brings the platform up to a session in the CREATED
 * state, with participants registered, qualified and funded. Every lifecycle test
 * starts from there.
 *
 * `WORKED_EXAMPLE` holds the figures reported in Section 3 of the manuscript. The
 * settlement tests assert them exactly, so the paper and the contract cannot
 * diverge without a test failing.
 */

import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

/* ─── ParticipantRegistry.ParticipantType ─── */
export const ParticipantType = {
  NONE: 0,
  MARKETPLACE_ADMIN: 1,
  FMO_LMO: 2,
  FRP: 3,
  FSP: 4,
} as const;

/* ─── MarketSession.SessionStatus ─── */
export const SessionStatus = {
  CREATED: 0n,
  OFFERS_OPEN: 1n,
  IN_DELIVERY: 2n,
  SETTLEMENT_PENDING: 3n,
  SETTLED: 4n,
  CANCELLED: 5n,
} as const;

/** Mirrors MarketSession.COLLATERAL_BPS (5 %) */
export const COLLATERAL_BPS = 500n;
/** Mirrors MarketSession.PLATFORM_FEE_BPS (2 %) */
export const PLATFORM_FEE_BPS = 200n;
export const BPS = 10_000n;

/**
 * A synthetic single-offer case with a 10 % shortfall.
 *
 * It is the only case in the suite that exercises the *proportional* regime of
 * the collateral rule, where the forfeited fraction equals the shortfall
 * fraction because the shortfall stays at or below 25 %. The session published
 * in the manuscript happens to contain only a total deviation, so this case is
 * retained to keep that branch covered.
 *
 * Quantities are in kWh and prices in FLEX/kWh, which is the unit convention the
 * platform actually uses: see `settlement.service.ts`, where metered Wh are
 * divided by 1,000 before being scaled by 1e18.
 */
export const WORKED_EXAMPLE = {
  hourSlot: 17,
  requestQuantity: ethers.parseEther("0.5"), // 0.50 kWh requested
  price: ethers.parseEther("50"), // 50 FLEX/kWh
  offerQuantity: ethers.parseEther("0.05"), // 0.0500 kWh committed
  deliveredQuantity: ethers.parseEther("0.045"), // 0.0450 kWh delivered, -10 %
  notional: ethers.parseEther("2.5"), // 2.50 FLEX
  collateral: ethers.parseEther("0.125"), // 5 % of notional
  fee: ethers.parseEther("0.05"), // 2 % of notional
  collateralReturned: ethers.parseEther("0.1125"), // 90 % of collateral
  collateralForfeited: ethers.parseEther("0.0125"), // 10 % of collateral
  netPayment: ethers.parseEther("2.25"), // 0.0450 kWh x 50 FLEX/kWh
} as const;

/**
 * The session reported in Section 3 of the manuscript, as executed on the
 * reference deployment.
 *
 * A 15.00 kWh upward request for the 09:00-10:00 slot at 1.00 FLEX/kWh. Five
 * providers commit 2.40 kWh each, so the request closes 80 % subscribed with a
 * 3.00 kWh residual. At settlement four providers deliver in full and one
 * delivers nothing, which puts it past the 25 % threshold and forfeits its whole
 * collateral.
 *
 * `published-example.test.ts` asserts every figure below, so the manuscript and
 * the contracts cannot diverge without a test failing.
 */
export const PUBLISHED_EXAMPLE = {
  hourSlot: 9,
  flexType: 0, // UPWARD
  requestQuantity: ethers.parseEther("15"), // 15.00 kWh requested
  price: ethers.parseEther("1"), // 1.00 FLEX/kWh
  offerQuantity: ethers.parseEther("2.4"), // 2.40 kWh per provider
  providerCount: 5,

  /* per offer, at publication */
  notional: ethers.parseEther("2.4"), // 2.40 FLEX
  collateral: ethers.parseEther("0.12"), // 5 % of notional
  fee: ethers.parseEther("0.048"), // 2 % of notional
  outlay: ethers.parseEther("0.168"), // collateral + fee

  /* aggregates at publication */
  committedTotal: ethers.parseEther("12"), // 5 x 2.40 kWh
  residual: ethers.parseEther("3"), // 15.00 - 12.00 kWh
  collateralTotal: ethers.parseEther("0.6"),
  feeTotal: ethers.parseEther("0.24"),

  /* settlement: offer 1 delivers nothing, offers 2-5 deliver in full */
  deliveredTotal: ethers.parseEther("9.6"),
  paymentTotal: ethers.parseEther("9.6"),
  collateralReturnedTotal: ethers.parseEther("0.48"),
  collateralForfeitedTotal: ethers.parseEther("0.12"),

  /* net position of each party, signed from its own point of view */
  netUnderperformer: ethers.parseEther("-0.168"), // loses collateral and fee
  netPerformer: ethers.parseEther("2.352"), // 2.40 payment - 0.048 fee
  netOperator: ethers.parseEther("0.24"), // retained fees
  netRequester: ethers.parseEther("-9.48"), // 9.60 paid - 0.12 compensation
} as const;

export type Ctx = Awaited<ReturnType<typeof deployedSessionFixture>>;

export async function deployedSessionFixture() {
  const [admin, fmoLmo, frp, fsp, fsp2, outsider] = await ethers.getSigners();

  /* ── platform ── */
  const token = await (await ethers.getContractFactory("FlexibilityToken")).deploy();
  const registry = await (
    await ethers.getContractFactory("ParticipantRegistry")
  ).deploy();
  const treasury = await (
    await ethers.getContractFactory("Treasury")
  ).deploy(await token.getAddress(), admin.address);
  const nft = await (await ethers.getContractFactory("FlexibilityNFT")).deploy();
  const factory = await (
    (await ethers.getContractFactory("MarketFactory")) as any
  ).deploy(await registry.getAddress());

  await treasury.grantRole(await treasury.FRP_ROLE(), frp.address);

  /* ── participants ── */
  const toRegister: Array<[string, number]> = [
    [fmoLmo.address, ParticipantType.FMO_LMO],
    [frp.address, ParticipantType.FRP],
    [fsp.address, ParticipantType.FSP],
    [fsp2.address, ParticipantType.FSP],
  ];
  for (const [address, pType] of toRegister) {
    await registry.registerParticipant(address, pType, "credentials", "IE");
    await registry.qualifyParticipant(address);
  }

  /* ── market ── */
  await factory.createMarket("dingle", "IE", admin.address);
  const marketInfo = await factory.getMarket(1);
  const market = (await ethers.getContractFactory("Market")).attach(
    marketInfo.marketAddress,
  ) as any;
  await market.connect(admin).setParticipantRegistry(await registry.getAddress());

  /* ── session ── */
  const deliveryDay = BigInt(await time.latest()) + 2n * 86_400n;
  await market
    .connect(admin)
    .createSession(
      deliveryDay,
      await treasury.getAddress(),
      fmoLmo.address,
      frp.address,
      [
        {
          hourSlot: WORKED_EXAMPLE.hourSlot,
          quantity: WORKED_EXAMPLE.requestQuantity,
          price: WORKED_EXAMPLE.price,
          flexType: 0,
        },
      ],
    );

  const sessionInfo = await market.getSession(1);
  const sessionAddress: string = sessionInfo.sessionAddress;
  const session = (await ethers.getContractFactory("MarketSession")).attach(
    sessionAddress,
  ) as any;

  /* ── wiring: the session must mint NFTs and move Treasury balances ── */
  await session.connect(admin).setNFTContract(await nft.getAddress());
  await session.connect(admin).setParticipantRegistry(await registry.getAddress());
  await treasury.grantRole(await treasury.SESSION_CONTRACT(), sessionAddress);
  await nft.grantRole(await nft.MINTER_ROLE(), sessionAddress);
  await nft.grantRole(await nft.UPDATER_ROLE(), sessionAddress);

  /* the FSP role is granted per session; it is not inherited from the registry */
  const FSP_ROLE = await session.FSP();
  await session.connect(admin).grantRole(FSP_ROLE, fsp.address);
  await session.connect(admin).grantRole(FSP_ROLE, fsp2.address);

  /* ── funding ── */
  const funding = ethers.parseEther("1000");
  for (const account of [fsp, fsp2, frp]) {
    await token.mint(account.address, funding);
  }

  return {
    admin,
    fmoLmo,
    frp,
    fsp,
    fsp2,
    outsider,
    token,
    registry,
    treasury,
    nft,
    factory,
    market,
    session,
    sessionAddress,
    deliveryDay,
    FSP_ROLE,
  };
}

/**
 * The platform brought up to the published session, with five qualified
 * providers and the 15.00 kWh request of `PUBLISHED_EXAMPLE` open for offers.
 */
export async function publishedSessionFixture() {
  const signers = await ethers.getSigners();
  const [admin, fmoLmo, frp] = signers;
  const providers = signers.slice(3, 3 + PUBLISHED_EXAMPLE.providerCount);

  const token = await (await ethers.getContractFactory("FlexibilityToken")).deploy();
  const registry = await (
    await ethers.getContractFactory("ParticipantRegistry")
  ).deploy();
  const treasury = await (
    await ethers.getContractFactory("Treasury")
  ).deploy(await token.getAddress(), admin.address);
  const nft = await (await ethers.getContractFactory("FlexibilityNFT")).deploy();
  const factory = await (
    (await ethers.getContractFactory("MarketFactory")) as any
  ).deploy(await registry.getAddress());

  await treasury.grantRole(await treasury.FRP_ROLE(), frp.address);

  await registry.registerParticipant(fmoLmo.address, ParticipantType.FMO_LMO, "credentials", "IE");
  await registry.qualifyParticipant(fmoLmo.address);
  await registry.registerParticipant(frp.address, ParticipantType.FRP, "credentials", "IE");
  await registry.qualifyParticipant(frp.address);
  for (const provider of providers) {
    await registry.registerParticipant(provider.address, ParticipantType.FSP, "credentials", "IE");
    await registry.qualifyParticipant(provider.address);
  }

  await factory.createMarket("reference-community", "IE", admin.address);
  const marketInfo = await factory.getMarket(1);
  const market = (await ethers.getContractFactory("Market")).attach(
    marketInfo.marketAddress,
  ) as any;
  await market.connect(admin).setParticipantRegistry(await registry.getAddress());

  const deliveryDay = BigInt(await time.latest()) + 2n * 86_400n;
  await market
    .connect(admin)
    .createSession(deliveryDay, await treasury.getAddress(), fmoLmo.address, frp.address, [
      {
        hourSlot: PUBLISHED_EXAMPLE.hourSlot,
        quantity: PUBLISHED_EXAMPLE.requestQuantity,
        price: PUBLISHED_EXAMPLE.price,
        flexType: PUBLISHED_EXAMPLE.flexType,
      },
    ]);

  const sessionInfo = await market.getSession(1);
  const sessionAddress: string = sessionInfo.sessionAddress;
  const session = (await ethers.getContractFactory("MarketSession")).attach(
    sessionAddress,
  ) as any;

  await session.connect(admin).setNFTContract(await nft.getAddress());
  await session.connect(admin).setParticipantRegistry(await registry.getAddress());
  await treasury.grantRole(await treasury.SESSION_CONTRACT(), sessionAddress);
  await nft.grantRole(await nft.MINTER_ROLE(), sessionAddress);
  await nft.grantRole(await nft.UPDATER_ROLE(), sessionAddress);

  const FSP_ROLE = await session.FSP();
  for (const provider of providers) {
    await session.connect(admin).grantRole(FSP_ROLE, provider.address);
  }

  /* each participant starts from the same round balance, so that the net
     position asserted by the tests is read directly off the token balance */
  const funding = ethers.parseEther("1000");
  for (const account of [...providers, frp]) {
    await token.mint(account.address, funding);
  }

  await session.connect(admin).openOffers();

  return {
    admin,
    fmoLmo,
    frp,
    providers,
    funding,
    token,
    registry,
    treasury,
    nft,
    market,
    session,
    sessionAddress,
    FSP_ROLE,
  };
}

export type PublishedCtx = Awaited<ReturnType<typeof publishedSessionFixture>>;

/** Submit the published example's 2.40 kWh offer from one provider. */
export async function submitPublishedOffer(
  ctx: PublishedCtx,
  provider: any,
): Promise<void> {
  await ctx.token
    .connect(provider)
    .approve(await ctx.treasury.getAddress(), PUBLISHED_EXAMPLE.outlay);
  await ctx.nft.connect(provider).setApprovalForAll(ctx.sessionAddress, true);
  await ctx.session
    .connect(provider)
    .createOffer(PUBLISHED_EXAMPLE.hourSlot, PUBLISHED_EXAMPLE.offerQuantity);
}

/* ─────────────────────── lifecycle helpers ─────────────────────── */

/**
 * Approve collateral and fee, approve the session to move the NFT, then publish
 * the offer. Mirrors the three transactions the backend issues per offer.
 */
export async function submitOffer(
  ctx: Ctx,
  fsp: any,
  quantity: bigint = WORKED_EXAMPLE.offerQuantity,
): Promise<void> {
  const notional = (quantity * WORKED_EXAMPLE.price) / ethers.WeiPerEther;
  const outlay =
    (notional * COLLATERAL_BPS) / BPS + (notional * PLATFORM_FEE_BPS) / BPS;
  await ctx.token.connect(fsp).approve(await ctx.treasury.getAddress(), outlay);
  await ctx.nft.connect(fsp).setApprovalForAll(ctx.sessionAddress, true);
  await ctx.session.connect(fsp).createOffer(WORKED_EXAMPLE.hourSlot, quantity);
}

/** Advance to IN_DELIVERY with one offer from the default FSP. */
export async function reachInDelivery(ctx: Ctx): Promise<void> {
  await ctx.session.connect(ctx.admin).openOffers();
  await submitOffer(ctx, ctx.fsp);
  await ctx.session.connect(ctx.fmoLmo).closeOffers();
}

/** Advance to SETTLEMENT_PENDING with the FRP's payment deposited. */
export async function reachSettlementPending(ctx: Ctx): Promise<string> {
  await reachInDelivery(ctx);
  const measurementHash = ethers.keccak256(ethers.toUtf8Bytes("measurements"));
  await ctx.session.connect(ctx.fmoLmo).submitMeasurementData(measurementHash);
  await ctx.token
    .connect(ctx.frp)
    .approve(await ctx.treasury.getAddress(), WORKED_EXAMPLE.notional);
  await ctx.treasury
    .connect(ctx.frp)
    .depositPaymentForSession(1, WORKED_EXAMPLE.notional);
  return measurementHash;
}

/** Settle offer 1 with the worked example's partial delivery. */
export async function settleWorkedExample(ctx: Ctx): Promise<void> {
  const measurementHash = await reachSettlementPending(ctx);
  await ctx.session
    .connect(ctx.fmoLmo)
    .submitSettlement(
      1,
      WORKED_EXAMPLE.deliveredQuantity,
      WORKED_EXAMPLE.collateralForfeited,
      measurementHash,
    );
  await ctx.session.connect(ctx.fmoLmo).executeSettlement(1);
}
