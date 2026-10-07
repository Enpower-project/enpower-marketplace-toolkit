/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Collateral, platform fee and settlement accounting.
 *
 * The figures asserted here are the ones reported in Section 3 of the
 * manuscript, so the paper and the contract cannot diverge without a test
 * failing:
 *
 *   committed 0.0500 MWh at 50 FLEX/MWh  ->  notional   2.5000 FLEX
 *   collateral 5 %                       ->             0.1250 FLEX
 *   platform fee 2 %                     ->             0.0500 FLEX
 *   delivered 0.0450 MWh (10 % shortfall) ->  payment    2.2500 FLEX
 *                                            returned   0.1125 FLEX
 *                                            forfeited  0.0125 FLEX
 *
 * Note on responsibility: the contract does not compute the penalty. It is
 * supplied by the oracle in submitSettlement and the contract applies it. These
 * tests therefore assert that a supplied penalty is applied correctly, and that
 * the payment the contract derives from the delivered quantity is right.
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import {
  BPS,
  COLLATERAL_BPS,
  PLATFORM_FEE_BPS,
  WORKED_EXAMPLE,
  deployedSessionFixture,
  reachSettlementPending,
  settleWorkedExample,
  submitOffer,
} from "./helpers/fixtures";

describe("MarketSession — collateral, fee and settlement", () => {
  describe("contract constants match the manuscript", () => {
    it("locks collateral at 5 % (500 bps)", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      expect(await ctx.session.COLLATERAL_BPS()).to.equal(COLLATERAL_BPS);
    });

    it("charges a platform fee of 2 % (200 bps)", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      expect(await ctx.session.PLATFORM_FEE_BPS()).to.equal(PLATFORM_FEE_BPS);
    });
  });

  describe("offer submission", () => {
    it("locks exactly 5 % of the notional as collateral", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await ctx.session.connect(ctx.admin).openOffers();
      await submitOffer(ctx, ctx.fsp);

      expect(await ctx.treasury.collateralLocked(ctx.fsp.address)).to.equal(
        WORKED_EXAMPLE.collateral,
      );
    });

    it("locks exactly 2 % of the notional as platform fee", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await ctx.session.connect(ctx.admin).openOffers();
      await submitOffer(ctx, ctx.fsp);

      expect(await ctx.treasury.feeLocked(ctx.fsp.address)).to.equal(
        WORKED_EXAMPLE.fee,
      );
    });

    it("transfers collateral and fee out of the FSP's wallet at submission", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      const before = await ctx.token.balanceOf(ctx.fsp.address);

      await ctx.session.connect(ctx.admin).openOffers();
      await submitOffer(ctx, ctx.fsp);

      const spent = before - (await ctx.token.balanceOf(ctx.fsp.address));
      expect(spent).to.equal(WORKED_EXAMPLE.collateral + WORKED_EXAMPLE.fee);
    });

    it("records the accepted quantity against the flexibility request", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await ctx.session.connect(ctx.admin).openOffers();
      await submitOffer(ctx, ctx.fsp);

      const request = await ctx.session.getFlexibilityRequest(
        WORKED_EXAMPLE.hourSlot,
      );
      expect(request.quantityFilled).to.equal(WORKED_EXAMPLE.offerQuantity);
    });

    it("scales collateral and fee with the offered quantity", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await ctx.session.connect(ctx.admin).openOffers();

      const quantity = ethers.parseEther("0.1"); // double the worked example
      await submitOffer(ctx, ctx.fsp, quantity);

      const notional = (quantity * WORKED_EXAMPLE.price) / ethers.WeiPerEther;
      expect(await ctx.treasury.collateralLocked(ctx.fsp.address)).to.equal(
        (notional * COLLATERAL_BPS) / BPS,
      );
      expect(await ctx.treasury.feeLocked(ctx.fsp.address)).to.equal(
        (notional * PLATFORM_FEE_BPS) / BPS,
      );
    });
  });

  describe("the settlement reported in Section 3 of the manuscript", () => {
    it("derives a payment of 2.25 FLEX from 0.0450 MWh delivered", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await settleWorkedExample(ctx);

      const settlement = await ctx.session.getSettlement(1);
      expect(settlement.deliveredQuantity).to.equal(
        WORKED_EXAMPLE.deliveredQuantity,
      );
      expect(settlement.payment).to.equal(WORKED_EXAMPLE.netPayment);
    });

    it("applies the 0.0125 FLEX penalty supplied by the oracle", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await settleWorkedExample(ctx);

      const settlement = await ctx.session.getSettlement(1);
      expect(settlement.penalty).to.equal(WORKED_EXAMPLE.collateralForfeited);
    });

    it("records the 0.05 FLEX platform fee against the settlement", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await settleWorkedExample(ctx);

      const settlement = await ctx.session.getSettlement(1);
      expect(settlement.platformFee).to.equal(WORKED_EXAMPLE.fee);
      expect(await ctx.session.getTotalPlatformFees()).to.equal(
        WORKED_EXAMPLE.fee,
      );
    });

    it("releases the whole collateral lock once the settlement executes", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await settleWorkedExample(ctx);

      expect(await ctx.treasury.collateralLocked(ctx.fsp.address)).to.equal(0n);
      expect(await ctx.treasury.feeLocked(ctx.fsp.address)).to.equal(0n);
    });

    it("anchors the meter readings digest against the settlement", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await settleWorkedExample(ctx);

      const expected = ethers.keccak256(ethers.toUtf8Bytes("measurements"));
      const settlement = await ctx.session.getSettlement(1);
      expect(settlement.meterReadingsHash).to.equal(expected);
      expect(settlement.validated).to.equal(true);
      expect(settlement.executed).to.equal(true);
    });
  });

  describe("full delivery", () => {
    it("pays the entire notional when the committed quantity is delivered", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      const measurementHash = await reachSettlementPending(ctx);

      await ctx.session
        .connect(ctx.fmoLmo)
        .submitSettlement(1, WORKED_EXAMPLE.offerQuantity, 0n, measurementHash);
      await ctx.session.connect(ctx.fmoLmo).executeSettlement(1);

      const settlement = await ctx.session.getSettlement(1);
      expect(settlement.payment).to.equal(WORKED_EXAMPLE.notional);
      expect(settlement.penalty).to.equal(0n);
    });

    it("returns the full collateral when no penalty is applied", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      const measurementHash = await reachSettlementPending(ctx);

      const beforeFsp = await ctx.token.balanceOf(ctx.fsp.address);
      await ctx.session
        .connect(ctx.fmoLmo)
        .submitSettlement(1, WORKED_EXAMPLE.offerQuantity, 0n, measurementHash);
      await ctx.session.connect(ctx.fmoLmo).executeSettlement(1);

      // The FSP receives the payment plus the collateral it had locked.
      const gained = (await ctx.token.balanceOf(ctx.fsp.address)) - beforeFsp;
      expect(gained).to.equal(
        WORKED_EXAMPLE.notional + WORKED_EXAMPLE.collateral,
      );
    });
  });

  describe("value conservation", () => {
    it("neither creates nor destroys tokens across a full settlement", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      const supplyBefore = await ctx.token.totalSupply();

      await settleWorkedExample(ctx);
      await ctx.session.connect(ctx.admin).finalizeSession();

      expect(await ctx.token.totalSupply()).to.equal(supplyBefore);
    });

    it("conserves value across every party involved", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      const treasuryAddress = await ctx.treasury.getAddress();
      const parties = [
        ctx.fsp.address,
        ctx.frp.address,
        ctx.fmoLmo.address,
        ctx.admin.address,
        treasuryAddress,
      ];

      const before = await Promise.all(
        parties.map((p) => ctx.token.balanceOf(p)),
      );

      await settleWorkedExample(ctx);
      await ctx.session.connect(ctx.admin).finalizeSession();

      const after = await Promise.all(
        parties.map((p) => ctx.token.balanceOf(p)),
      );

      const netChange = after.reduce(
        (acc, balance, i) => acc + (balance - before[i]),
        0n,
      );
      expect(netChange).to.equal(0n);
    });
  });

  describe("settlement guards", () => {
    it("rejects a settlement for an offer that does not exist", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      const measurementHash = await reachSettlementPending(ctx);

      await expect(
        ctx.session
          .connect(ctx.fmoLmo)
          .submitSettlement(99, WORKED_EXAMPLE.deliveredQuantity, 0n, measurementHash),
      ).to.be.revertedWith("Invalid offer ID");
    });

    it("rejects a second settlement submission for the same offer", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      const measurementHash = await reachSettlementPending(ctx);

      await ctx.session
        .connect(ctx.fmoLmo)
        .submitSettlement(
          1,
          WORKED_EXAMPLE.deliveredQuantity,
          WORKED_EXAMPLE.collateralForfeited,
          measurementHash,
        );

      // The offer has moved to VALIDATED, so it is no longer ACCEPTED.
      await expect(
        ctx.session
          .connect(ctx.fmoLmo)
          .submitSettlement(
            1,
            WORKED_EXAMPLE.deliveredQuantity,
            WORKED_EXAMPLE.collateralForfeited,
            measurementHash,
          ),
      ).to.be.revertedWith("Invalid offer status");
    });
  });
});
