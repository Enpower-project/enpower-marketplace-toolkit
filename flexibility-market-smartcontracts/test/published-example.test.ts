/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The session reported in Section 3 of the manuscript, asserted end to end.
 *
 * Every figure printed in the manuscript's tables appears here as an
 * expectation, so the published example cannot drift from the contracts without
 * this file failing. Where a figure is an aggregate, it is both asserted and
 * reconciled against its parts.
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import {
  PUBLISHED_EXAMPLE as EX,
  PublishedCtx,
  publishedSessionFixture,
  submitPublishedOffer,
  SessionStatus,
} from "./helpers/fixtures";

/** Offer 1 delivers nothing; offers 2 to 5 deliver the committed volume. */
const deliveredFor = (offerId: number): bigint =>
  offerId === 1 ? 0n : EX.offerQuantity;

/** Past the 25 % threshold the whole collateral is forfeited, otherwise none. */
const forfeitedFor = (offerId: number): bigint =>
  offerId === 1 ? EX.collateral : 0n;

async function allOffersSubmitted(ctx: PublishedCtx): Promise<void> {
  for (const provider of ctx.providers) {
    await submitPublishedOffer(ctx, provider);
  }
}

async function settled(ctx: PublishedCtx): Promise<void> {
  await allOffersSubmitted(ctx);
  await ctx.session.connect(ctx.fmoLmo).closeOffers();

  const measurementHash = ethers.keccak256(ethers.toUtf8Bytes("metered readings"));
  await ctx.session.connect(ctx.fmoLmo).submitMeasurementData(measurementHash);

  await ctx.token
    .connect(ctx.frp)
    .approve(await ctx.treasury.getAddress(), EX.paymentTotal);
  await ctx.treasury.connect(ctx.frp).depositPaymentForSession(1, EX.paymentTotal);

  for (let offerId = 1; offerId <= EX.providerCount; offerId++) {
    await ctx.session
      .connect(ctx.fmoLmo)
      .submitSettlement(
        offerId,
        deliveredFor(offerId),
        forfeitedFor(offerId),
        measurementHash,
      );
    await ctx.session.connect(ctx.fmoLmo).executeSettlement(offerId);
  }
}

describe("Published example (manuscript Section 3)", () => {
  describe("the request", () => {
    it("opens for 15.00 kWh of upward flexibility at 1.00 FLEX/kWh", async () => {
      const ctx = await loadFixture(publishedSessionFixture);
      const request = await ctx.session.flexibilityRequests(EX.hourSlot);

      expect(request.quantity).to.equal(EX.requestQuantity);
      expect(request.price).to.equal(EX.price);
      expect(request.flexType).to.equal(EX.flexType);
      expect(await ctx.session.status()).to.equal(SessionStatus.OFFERS_OPEN);
    });
  });

  describe("matching", () => {
    it("accepts five offers of 2.40 kWh in full", async () => {
      const ctx = await loadFixture(publishedSessionFixture);
      await allOffersSubmitted(ctx);

      expect(await ctx.session.offerCount()).to.equal(EX.providerCount);
      for (let offerId = 1; offerId <= EX.providerCount; offerId++) {
        const offer = await ctx.session.offers(offerId);
        expect(offer.quantity).to.equal(EX.offerQuantity);
        expect(offer.price).to.equal(EX.price);
      }
    });

    it("closes 80 % subscribed, leaving a 3.00 kWh residual", async () => {
      const ctx = await loadFixture(publishedSessionFixture);
      await allOffersSubmitted(ctx);

      const request = await ctx.session.flexibilityRequests(EX.hourSlot);
      expect(request.quantityFilled).to.equal(EX.committedTotal);
      expect(request.quantity - request.quantityFilled).to.equal(EX.residual);
      /* 12.00 of 15.00 kWh */
      expect((request.quantityFilled * 100n) / request.quantity).to.equal(80n);
    });

    it("leaves the request incomplete, so no offer is partially filled", async () => {
      const ctx = await loadFixture(publishedSessionFixture);
      await allOffersSubmitted(ctx);

      const request = await ctx.session.flexibilityRequests(EX.hourSlot);
      expect(request.completed).to.equal(false);
      for (let offerId = 1; offerId <= EX.providerCount; offerId++) {
        expect((await ctx.session.offers(offerId)).quantity).to.equal(EX.offerQuantity);
      }
    });
  });

  describe("commitment", () => {
    it("locks 0.120 FLEX of collateral and 0.048 FLEX of fee per offer", async () => {
      const ctx = await loadFixture(publishedSessionFixture);
      await allOffersSubmitted(ctx);

      for (let offerId = 1; offerId <= EX.providerCount; offerId++) {
        const offer = await ctx.session.offers(offerId);
        expect(offer.collateralAmount).to.equal(EX.collateral);
        expect(offer.feeAmount).to.equal(EX.fee);
      }
    });

    it("takes 0.168 FLEX from each provider, 0.840 FLEX in total", async () => {
      const ctx = await loadFixture(publishedSessionFixture);
      await allOffersSubmitted(ctx);

      for (const provider of ctx.providers) {
        expect(await ctx.token.balanceOf(provider.address)).to.equal(
          ctx.funding - EX.outlay,
        );
      }
      expect(EX.collateralTotal + EX.feeTotal).to.equal(
        EX.outlay * BigInt(EX.providerCount),
      );
    });

    it("mints a certificate to each provider when the offer is published", async () => {
      const ctx = await loadFixture(publishedSessionFixture);
      await allOffersSubmitted(ctx);

      for (let i = 0; i < EX.providerCount; i++) {
        const offer = await ctx.session.offers(i + 1);
        expect(await ctx.nft.balanceOf(ctx.providers[i].address, offer.nftTokenId)).to.equal(1n);
      }
    });
  });

  describe("settlement", () => {
    it("pays nothing for the commitment that delivered nothing", async () => {
      const ctx = await loadFixture(publishedSessionFixture);
      await settled(ctx);

      const settlement = await ctx.session.settlements(1);
      expect(settlement.deliveredQuantity).to.equal(0n);
      expect(settlement.payment).to.equal(0n);
      expect(settlement.penalty).to.equal(EX.collateral);
    });

    it("pays 2.400 FLEX for each commitment delivered in full", async () => {
      const ctx = await loadFixture(publishedSessionFixture);
      await settled(ctx);

      for (let offerId = 2; offerId <= EX.providerCount; offerId++) {
        const settlement = await ctx.session.settlements(offerId);
        expect(settlement.deliveredQuantity).to.equal(EX.offerQuantity);
        expect(settlement.payment).to.equal(EX.notional);
        expect(settlement.penalty).to.equal(0n);
      }
    });

    it("forfeits the whole collateral past the 25 % threshold", async () => {
      const ctx = await loadFixture(publishedSessionFixture);
      await settled(ctx);

      /* the underperformer ends 0.168 FLEX down: collateral and fee, both lost */
      expect(await ctx.token.balanceOf(ctx.providers[0].address)).to.equal(
        ctx.funding + EX.netUnderperformer,
      );
    });

    it("returns the collateral and pays 2.352 FLEX net to each performer", async () => {
      const ctx = await loadFixture(publishedSessionFixture);
      await settled(ctx);

      for (const provider of ctx.providers.slice(1)) {
        expect(await ctx.token.balanceOf(provider.address)).to.equal(
          ctx.funding + EX.netPerformer,
        );
      }
    });

    it("compensates the requesting party out of the forfeited collateral", async () => {
      const ctx = await loadFixture(publishedSessionFixture);
      await settled(ctx);

      /* 9.60 FLEX paid out, 0.12 FLEX received back as compensation */
      expect(await ctx.token.balanceOf(ctx.frp.address)).to.equal(
        ctx.funding + EX.netRequester,
      );
    });

    it("pays the retained fees to the market operator", async () => {
      const ctx = await loadFixture(publishedSessionFixture);
      await settled(ctx);

      expect(await ctx.token.balanceOf(ctx.fmoLmo.address)).to.equal(EX.netOperator);
      expect(await ctx.session.totalPlatformFees()).to.equal(EX.feeTotal);
    });

    it("delivers 9.60 kWh of the 15.00 kWh requested", async () => {
      const ctx = await loadFixture(publishedSessionFixture);
      await settled(ctx);

      let delivered = 0n;
      let paid = 0n;
      for (let offerId = 1; offerId <= EX.providerCount; offerId++) {
        const settlement = await ctx.session.settlements(offerId);
        delivered += settlement.deliveredQuantity;
        paid += settlement.payment;
      }
      expect(delivered).to.equal(EX.deliveredTotal);
      expect(paid).to.equal(EX.paymentTotal);
    });
  });

  describe("conservation of value", () => {
    it("balances what the requester pays against what the others receive", async () => {
      const ctx = await loadFixture(publishedSessionFixture);
      await settled(ctx);

      const requesterOutlay = ctx.funding - (await ctx.token.balanceOf(ctx.frp.address));
      let providerGain = 0n;
      for (const provider of ctx.providers) {
        providerGain += (await ctx.token.balanceOf(provider.address)) - ctx.funding;
      }
      const operatorGain = await ctx.token.balanceOf(ctx.fmoLmo.address);

      expect(requesterOutlay).to.equal(providerGain + operatorGain);
      /* the manuscript reports 9.48 = 9.24 + 0.24 */
      expect(requesterOutlay).to.equal(-EX.netRequester);
      expect(operatorGain).to.equal(EX.netOperator);
    });

    it("accounts for every unit of collateral as returned or forfeited", async () => {
      const ctx = await loadFixture(publishedSessionFixture);
      await settled(ctx);

      expect(EX.collateralReturnedTotal + EX.collateralForfeitedTotal).to.equal(
        EX.collateralTotal,
      );
      /* the forfeited collateral is what the requesting party receives back */
      expect(EX.collateralForfeitedTotal).to.equal(
        (await ctx.token.balanceOf(ctx.frp.address)) - (ctx.funding - EX.paymentTotal),
      );
    });
  });

  describe("certificates", () => {
    it("transfers every certificate to the requesting party, including the unperformed one", async () => {
      const ctx = await loadFixture(publishedSessionFixture);
      await settled(ctx);

      for (let offerId = 1; offerId <= EX.providerCount; offerId++) {
        const offer = await ctx.session.offers(offerId);
        expect(await ctx.nft.balanceOf(ctx.frp.address, offer.nftTokenId)).to.equal(1n);
        expect(offer.nftTransferredToBuyer).to.equal(true);
      }
    });

    it("records zero delivery on the certificate of the commitment that failed", async () => {
      const ctx = await loadFixture(publishedSessionFixture);
      await settled(ctx);

      const offer = await ctx.session.offers(1);
      const certificate = await ctx.nft.getNFTMetadata(offer.nftTokenId);

      expect(certificate.offeredQuantity).to.equal(EX.offerQuantity);
      expect(certificate.deliveredQuantity).to.equal(0n);
      expect(certificate.price).to.equal(EX.price);
    });

    it("makes the certificates non-transferable once settled", async () => {
      const ctx = await loadFixture(publishedSessionFixture);
      await settled(ctx);

      const offer = await ctx.session.offers(1);
      await expect(
        ctx.nft
          .connect(ctx.frp)
          .safeTransferFrom(ctx.frp.address, ctx.providers[0].address, offer.nftTokenId, 1, "0x"),
      ).to.be.reverted;
    });
  });
});
