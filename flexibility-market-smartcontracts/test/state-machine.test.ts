/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Session lifecycle: valid transitions, forbidden transitions and cancellation.
 *
 * The contract defines five sequential states — CREATED, OFFERS_OPEN,
 * IN_DELIVERY, SETTLEMENT_PENDING, SETTLED — plus a terminal CANCELLED state
 * reachable while offers are open. Closing the offer window advances the session
 * directly to IN_DELIVERY; there is no separate closed state on-chain.
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import {
  SessionStatus,
  WORKED_EXAMPLE,
  deployedSessionFixture,
  reachInDelivery,
  reachSettlementPending,
  settleWorkedExample,
  submitOffer,
} from "./helpers/fixtures";

const INVALID_STATUS = "Invalid session status";

describe("MarketSession — state machine", () => {
  describe("valid progression", () => {
    it("starts in CREATED", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      expect(await ctx.session.status()).to.equal(SessionStatus.CREATED);
    });

    it("openOffers advances CREATED to OFFERS_OPEN", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await ctx.session.connect(ctx.admin).openOffers();
      expect(await ctx.session.status()).to.equal(SessionStatus.OFFERS_OPEN);
    });

    it("closeOffers advances OFFERS_OPEN directly to IN_DELIVERY", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await ctx.session.connect(ctx.admin).openOffers();
      await submitOffer(ctx, ctx.fsp);
      await ctx.session.connect(ctx.fmoLmo).closeOffers();
      expect(await ctx.session.status()).to.equal(SessionStatus.IN_DELIVERY);
    });

    it("submitMeasurementData advances IN_DELIVERY to SETTLEMENT_PENDING", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await reachInDelivery(ctx);
      await ctx.session
        .connect(ctx.fmoLmo)
        .submitMeasurementData(ethers.keccak256(ethers.toUtf8Bytes("m")));
      expect(await ctx.session.status()).to.equal(SessionStatus.SETTLEMENT_PENDING);
    });

    it("finalizeSession advances SETTLEMENT_PENDING to SETTLED once every offer is settled", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await settleWorkedExample(ctx);
      await ctx.session.connect(ctx.admin).finalizeSession();
      expect(await ctx.session.status()).to.equal(SessionStatus.SETTLED);
    });

    it("anchors the submitted measurement digest on-chain", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await reachInDelivery(ctx);
      const digest = ethers.keccak256(ethers.toUtf8Bytes("pilot measurements"));
      await ctx.session.connect(ctx.fmoLmo).submitMeasurementData(digest);
      expect(await ctx.session.measurementDataHash()).to.equal(digest);
    });
  });

  describe("forbidden transitions", () => {
    it("rejects opening the offer window twice", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await ctx.session.connect(ctx.admin).openOffers();
      await expect(
        ctx.session.connect(ctx.admin).openOffers(),
      ).to.be.revertedWith(INVALID_STATUS);
    });

    it("rejects an offer while the session is still CREATED", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await expect(
        ctx.session
          .connect(ctx.fsp)
          .createOffer(WORKED_EXAMPLE.hourSlot, WORKED_EXAMPLE.offerQuantity),
      ).to.be.revertedWith(INVALID_STATUS);
    });

    it("rejects closing the offer window before it was opened", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await expect(
        ctx.session.connect(ctx.fmoLmo).closeOffers(),
      ).to.be.revertedWith(INVALID_STATUS);
    });

    it("rejects an offer once the window is closed", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await reachInDelivery(ctx);
      await expect(
        ctx.session
          .connect(ctx.fsp2)
          .createOffer(WORKED_EXAMPLE.hourSlot, WORKED_EXAMPLE.offerQuantity),
      ).to.be.revertedWith(INVALID_STATUS);
    });

    it("rejects measurement data while offers are still open", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await ctx.session.connect(ctx.admin).openOffers();
      await expect(
        ctx.session
          .connect(ctx.fmoLmo)
          .submitMeasurementData(ethers.keccak256(ethers.toUtf8Bytes("m"))),
      ).to.be.revertedWith(INVALID_STATUS);
    });

    it("rejects settlement before measurement data has been anchored", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await reachInDelivery(ctx);
      await expect(
        ctx.session
          .connect(ctx.fmoLmo)
          .submitSettlement(
            1,
            WORKED_EXAMPLE.deliveredQuantity,
            WORKED_EXAMPLE.collateralForfeited,
            ethers.ZeroHash,
          ),
      ).to.be.revertedWith(INVALID_STATUS);
    });

    it("rejects executing a settlement that was never validated", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await reachSettlementPending(ctx);
      await expect(
        ctx.session.connect(ctx.fmoLmo).executeSettlement(1),
      ).to.be.revertedWith("Settlement not validated");
    });

    it("rejects executing the same settlement twice", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await settleWorkedExample(ctx);
      await expect(
        ctx.session.connect(ctx.fmoLmo).executeSettlement(1),
      ).to.be.revertedWith("Already executed");
    });

    it("rejects finalisation while an offer remains unsettled", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await reachSettlementPending(ctx);
      await expect(
        ctx.session.connect(ctx.admin).finalizeSession(),
      ).to.be.revertedWith("Not all offers settled");
    });

    it("rejects any transition once the session is SETTLED", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await settleWorkedExample(ctx);
      await ctx.session.connect(ctx.admin).finalizeSession();
      await expect(
        ctx.session.connect(ctx.admin).openOffers(),
      ).to.be.revertedWith(INVALID_STATUS);
      await expect(
        ctx.session.connect(ctx.admin).finalizeSession(),
      ).to.be.revertedWith(INVALID_STATUS);
    });
  });

  describe("cancellation", () => {
    it("lets the market operator cancel while offers are open", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await ctx.session.connect(ctx.admin).openOffers();
      await ctx.session.connect(ctx.fmoLmo).cancelIfOffersStillOpenTwoHoursBefore();
      expect(await ctx.session.status()).to.equal(SessionStatus.CANCELLED);
    });

    it("refunds locked collateral when a session is cancelled", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await ctx.session.connect(ctx.admin).openOffers();
      await submitOffer(ctx, ctx.fsp);

      const lockedBefore = await ctx.treasury.collateralLocked(ctx.fsp.address);
      expect(lockedBefore).to.equal(WORKED_EXAMPLE.collateral);

      await ctx.session.connect(ctx.fmoLmo).cancelIfOffersStillOpenTwoHoursBefore();

      expect(await ctx.treasury.collateralLocked(ctx.fsp.address)).to.equal(0n);
    });

    it("cannot cancel once the offer window has closed", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await reachInDelivery(ctx);
      await expect(
        ctx.session.connect(ctx.fmoLmo).cancelIfOffersStillOpenTwoHoursBefore(),
      ).to.be.revertedWith(INVALID_STATUS);
    });
  });

  /**
   * The contract carries four guards that would enforce the D-2 to D+1 schedule
   * on-chain, and they are deliberately disabled so that a complete lifecycle can
   * be exercised in one run instead of over three days. See the contract header
   * and README Section 6.2.
   *
   * These tests pin that decision: they assert the relaxed behaviour explicitly,
   * so that restoring any guard for a production deployment makes the
   * corresponding test fail rather than passing silently.
   */
  describe("temporal guards disabled for reproducibility", () => {
    it("completes a whole lifecycle without advancing the clock", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      // deliveryDay is two days ahead. With the guards active, closeOffers would
      // require D-1 and submitMeasurementData would require D+1, so this sequence
      // could not run in a single session.
      await settleWorkedExample(ctx);
      await ctx.session.connect(ctx.admin).finalizeSession();
      expect(await ctx.session.status()).to.equal(SessionStatus.SETTLED);
    });

    it("closes the offer window before D-1", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await ctx.session.connect(ctx.admin).openOffers();
      await submitOffer(ctx, ctx.fsp);
      // Guard: block.timestamp >= deliveryDay - 1 days
      await ctx.session.connect(ctx.fmoLmo).closeOffers();
      expect(await ctx.session.status()).to.equal(SessionStatus.IN_DELIVERY);
    });

    it("accepts measurement data before D+1", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await reachInDelivery(ctx);
      // Guard: block.timestamp >= deliveryDay + 1 days
      await ctx.session
        .connect(ctx.fmoLmo)
        .submitMeasurementData(ethers.keccak256(ethers.toUtf8Bytes("early")));
      expect(await ctx.session.status()).to.equal(SessionStatus.SETTLEMENT_PENDING);
    });

    it("allows cancellation outside the two-hour window before delivery", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await ctx.session.connect(ctx.admin).openOffers();
      // Guard: block.timestamp >= deliveryDay - 2 hours
      await ctx.session.connect(ctx.fmoLmo).cancelIfOffersStillOpenTwoHoursBefore();
      expect(await ctx.session.status()).to.equal(SessionStatus.CANCELLED);
    });
  });
});
