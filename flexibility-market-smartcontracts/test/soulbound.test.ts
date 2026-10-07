/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * FlexibilityNFT lifecycle and soulbound enforcement.
 *
 * The certificate is minted to the FSP when the offer is published and
 * auto-accepted (MarketSession.createOffer). It remains transferable while the
 * commitment is outstanding. Executing the settlement transfers it from the FSP to
 * the FRP and finalises it, after which it is soulbound and can no longer move.
 *
 * Note that all three steps — metadata update, transfer and finalisation — happen
 * inside executeSettlement, not in finalizeSession.
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import {
  WORKED_EXAMPLE,
  deployedSessionFixture,
  reachSettlementPending,
  settleWorkedExample,
  submitOffer,
} from "./helpers/fixtures";

const SOULBOUND_REVERT = "Token is soulbound and cannot be transferred";

/** Resolve the NFT minted for offer 1. */
async function tokenIdOfFirstOffer(ctx: any): Promise<bigint> {
  const offer = await ctx.session.getOffer(1);
  return offer.nftTokenId;
}

describe("FlexibilityNFT — certificate lifecycle and soulbound enforcement", () => {
  describe("minting", () => {
    it("mints the certificate to the FSP when the offer is published", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await ctx.session.connect(ctx.admin).openOffers();
      await submitOffer(ctx, ctx.fsp);

      const tokenId = await tokenIdOfFirstOffer(ctx);
      expect(await ctx.nft.balanceOf(ctx.fsp.address, tokenId)).to.equal(1n);
      expect(await ctx.nft.getFsp(tokenId)).to.equal(ctx.fsp.address);
    });

    it("records the committed quantity and price on the certificate", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await ctx.session.connect(ctx.admin).openOffers();
      await submitOffer(ctx, ctx.fsp);

      const tokenId = await tokenIdOfFirstOffer(ctx);
      expect(await ctx.nft.getOfferedQuantity(tokenId)).to.equal(
        WORKED_EXAMPLE.offerQuantity,
      );
      expect(await ctx.nft.getPrice(tokenId)).to.equal(WORKED_EXAMPLE.price);
      expect(await ctx.nft.getCollateralAmount(tokenId)).to.equal(
        WORKED_EXAMPLE.collateral,
      );
    });

    it("leaves the certificate transferable while the commitment is outstanding", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await ctx.session.connect(ctx.admin).openOffers();
      await submitOffer(ctx, ctx.fsp);

      const tokenId = await tokenIdOfFirstOffer(ctx);
      expect(await ctx.nft.getIsSoulbound(tokenId)).to.equal(false);

      await ctx.nft
        .connect(ctx.fsp)
        .safeTransferFrom(ctx.fsp.address, ctx.outsider.address, tokenId, 1, "0x");

      expect(await ctx.nft.balanceOf(ctx.outsider.address, tokenId)).to.equal(1n);
      expect(await ctx.nft.balanceOf(ctx.fsp.address, tokenId)).to.equal(0n);
    });

    it("is still transferable once the offer window has closed but before settlement", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await reachSettlementPending(ctx);

      const tokenId = await tokenIdOfFirstOffer(ctx);
      expect(await ctx.nft.getIsSoulbound(tokenId)).to.equal(false);

      await ctx.nft
        .connect(ctx.fsp)
        .safeTransferFrom(ctx.fsp.address, ctx.outsider.address, tokenId, 1, "0x");

      expect(await ctx.nft.balanceOf(ctx.outsider.address, tokenId)).to.equal(1n);
    });
  });

  describe("settlement", () => {
    it("transfers the certificate from the FSP to the FRP", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await settleWorkedExample(ctx);

      const tokenId = await tokenIdOfFirstOffer(ctx);
      expect(await ctx.nft.balanceOf(ctx.frp.address, tokenId)).to.equal(1n);
      expect(await ctx.nft.balanceOf(ctx.fsp.address, tokenId)).to.equal(0n);
      expect(await ctx.nft.getFinalBuyer(tokenId)).to.equal(ctx.frp.address);
    });

    it("records delivered quantity and actual payment on the certificate", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await settleWorkedExample(ctx);

      const tokenId = await tokenIdOfFirstOffer(ctx);
      expect(await ctx.nft.getDeliveredQuantity(tokenId)).to.equal(
        WORKED_EXAMPLE.deliveredQuantity,
      );
      expect(await ctx.nft.getActualPayment(tokenId)).to.equal(
        WORKED_EXAMPLE.netPayment,
      );
    });

    it("anchors the meter readings digest on the certificate", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await settleWorkedExample(ctx);

      const tokenId = await tokenIdOfFirstOffer(ctx);
      const settlement = await ctx.session.getSettlement(1);
      expect(await ctx.nft.getMeterReadingsHash(tokenId)).to.equal(
        settlement.meterReadingsHash,
      );
    });
  });

  describe("soulbound enforcement", () => {
    it("marks the certificate soulbound once the settlement executes", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await settleWorkedExample(ctx);

      const tokenId = await tokenIdOfFirstOffer(ctx);
      expect(await ctx.nft.getIsSoulbound(tokenId)).to.equal(true);
    });

    it("rejects any transfer of a settled certificate", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await settleWorkedExample(ctx);

      const tokenId = await tokenIdOfFirstOffer(ctx);
      await expect(
        ctx.nft
          .connect(ctx.frp)
          .safeTransferFrom(ctx.frp.address, ctx.outsider.address, tokenId, 1, "0x"),
      ).to.be.revertedWith(SOULBOUND_REVERT);
    });

    it("rejects a transfer back to the original provider", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await settleWorkedExample(ctx);

      const tokenId = await tokenIdOfFirstOffer(ctx);
      await expect(
        ctx.nft
          .connect(ctx.frp)
          .safeTransferFrom(ctx.frp.address, ctx.fsp.address, tokenId, 1, "0x"),
      ).to.be.revertedWith(SOULBOUND_REVERT);
    });

    it("rejects further settlement metadata updates once soulbound", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await settleWorkedExample(ctx);

      const tokenId = await tokenIdOfFirstOffer(ctx);
      // updateAfterSettlement guards on !isSoulbound, so a replay is refused even
      // by an account holding UPDATER_ROLE.
      await expect(
        ctx.nft
          .connect(ctx.admin)
          .updateAfterSettlement(
            tokenId,
            WORKED_EXAMPLE.deliveredQuantity,
            1,
            ethers.ZeroHash,
            ctx.frp.address,
            WORKED_EXAMPLE.netPayment,
          ),
      ).to.be.revertedWith("Token is soulbound");
    });

    it("keeps the certificate soulbound after the session is finalised", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await settleWorkedExample(ctx);
      await ctx.session.connect(ctx.admin).finalizeSession();

      const tokenId = await tokenIdOfFirstOffer(ctx);
      expect(await ctx.nft.getIsSoulbound(tokenId)).to.equal(true);
      await expect(
        ctx.nft
          .connect(ctx.frp)
          .safeTransferFrom(ctx.frp.address, ctx.outsider.address, tokenId, 1, "0x"),
      ).to.be.revertedWith(SOULBOUND_REVERT);
    });
  });
});
