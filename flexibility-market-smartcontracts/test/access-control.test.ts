/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Role-based access restrictions.
 *
 * Every privileged operation is asserted negatively against an account that does
 * not hold the required role. The roles are deliberately asymmetric — opening the
 * offer window and finalising a session are reserved to the session
 * administrator, closing the window to the market operator, and settlement to the
 * oracle — so each is tested against the holders of the other roles, not only
 * against an unrelated outsider.
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import {
  ParticipantType,
  WORKED_EXAMPLE,
  deployedSessionFixture,
  reachInDelivery,
  reachSettlementPending,
  submitOffer,
} from "./helpers/fixtures";

const UNAUTHORISED = "AccessControlUnauthorizedAccount";

describe("Access control", () => {
  describe("MarketSession — session administration", () => {
    it("only the session administrator may open the offer window", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      for (const caller of [ctx.fmoLmo, ctx.fsp, ctx.frp, ctx.outsider]) {
        await expect(
          ctx.session.connect(caller).openOffers(),
        ).to.be.revertedWithCustomError(ctx.session, UNAUTHORISED);
      }
      await ctx.session.connect(ctx.admin).openOffers();
    });

    it("only the session administrator may set the NFT contract", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await expect(
        ctx.session.connect(ctx.fmoLmo).setNFTContract(await ctx.nft.getAddress()),
      ).to.be.revertedWithCustomError(ctx.session, UNAUTHORISED);
    });

    it("only the session administrator may set the participant registry", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await expect(
        ctx.session
          .connect(ctx.outsider)
          .setParticipantRegistry(await ctx.registry.getAddress()),
      ).to.be.revertedWithCustomError(ctx.session, UNAUTHORISED);
    });

    it("only the session administrator may finalise the session", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await reachSettlementPending(ctx);
      for (const caller of [ctx.fmoLmo, ctx.frp, ctx.outsider]) {
        await expect(
          ctx.session.connect(caller).finalizeSession(),
        ).to.be.revertedWithCustomError(ctx.session, UNAUTHORISED);
      }
    });
  });

  describe("MarketSession — market operator", () => {
    it("only the market operator may close the offer window", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await ctx.session.connect(ctx.admin).openOffers();
      await submitOffer(ctx, ctx.fsp);

      for (const caller of [ctx.admin, ctx.fsp, ctx.frp, ctx.outsider]) {
        await expect(
          ctx.session.connect(caller).closeOffers(),
        ).to.be.revertedWithCustomError(ctx.session, UNAUTHORISED);
      }
      await ctx.session.connect(ctx.fmoLmo).closeOffers();
    });

    it("only the market operator may cancel an open session", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await ctx.session.connect(ctx.admin).openOffers();

      for (const caller of [ctx.admin, ctx.fsp, ctx.outsider]) {
        await expect(
          ctx.session.connect(caller).cancelIfOffersStillOpenTwoHoursBefore(),
        ).to.be.revertedWithCustomError(ctx.session, UNAUTHORISED);
      }
    });
  });

  describe("MarketSession — flexibility service providers", () => {
    it("rejects an offer from an account without the session FSP role", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await ctx.session.connect(ctx.admin).openOffers();

      for (const caller of [ctx.admin, ctx.fmoLmo, ctx.frp, ctx.outsider]) {
        await expect(
          ctx.session
            .connect(caller)
            .createOffer(WORKED_EXAMPLE.hourSlot, WORKED_EXAMPLE.offerQuantity),
        ).to.be.revertedWithCustomError(ctx.session, UNAUTHORISED);
      }
    });

    it("rejects an offer from an account holding the role but not qualified in the registry", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await ctx.session.connect(ctx.admin).openOffers();

      // Grant the session role without registering the account as a qualified FSP.
      await ctx.session.connect(ctx.admin).grantRole(ctx.FSP_ROLE, ctx.outsider.address);

      await expect(
        ctx.session
          .connect(ctx.outsider)
          .createOffer(WORKED_EXAMPLE.hourSlot, WORKED_EXAMPLE.offerQuantity),
      ).to.be.revertedWith("Caller is not a qualified FSP");
    });

    it("the session FSP role is not inherited from the registry", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await ctx.session.connect(ctx.admin).openOffers();

      // fsp2 is registered and qualified in the fixture, and was also granted the
      // session role there; revoking it must be enough to block submission.
      await ctx.session.connect(ctx.admin).revokeRole(ctx.FSP_ROLE, ctx.fsp2.address);

      expect(await ctx.registry.isQualified(ctx.fsp2.address)).to.equal(true);
      await expect(
        ctx.session
          .connect(ctx.fsp2)
          .createOffer(WORKED_EXAMPLE.hourSlot, WORKED_EXAMPLE.offerQuantity),
      ).to.be.revertedWithCustomError(ctx.session, UNAUTHORISED);
    });
  });

  describe("MarketSession — settlement oracle", () => {
    it("only the oracle may submit measurement data", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await reachInDelivery(ctx);
      const digest = ethers.keccak256(ethers.toUtf8Bytes("m"));

      for (const caller of [ctx.admin, ctx.fsp, ctx.frp, ctx.outsider]) {
        await expect(
          ctx.session.connect(caller).submitMeasurementData(digest),
        ).to.be.revertedWithCustomError(ctx.session, UNAUTHORISED);
      }
    });

    it("only the oracle may submit a settlement", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      const digest = await reachSettlementPending(ctx);

      for (const caller of [ctx.admin, ctx.fsp, ctx.frp, ctx.outsider]) {
        await expect(
          ctx.session
            .connect(caller)
            .submitSettlement(1, WORKED_EXAMPLE.deliveredQuantity, 0n, digest),
        ).to.be.revertedWithCustomError(ctx.session, UNAUTHORISED);
      }
    });

    it("only the oracle may execute a settlement", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      const digest = await reachSettlementPending(ctx);
      await ctx.session
        .connect(ctx.fmoLmo)
        .submitSettlement(1, WORKED_EXAMPLE.deliveredQuantity, 0n, digest);

      for (const caller of [ctx.admin, ctx.fsp, ctx.frp, ctx.outsider]) {
        await expect(
          ctx.session.connect(caller).executeSettlement(1),
        ).to.be.revertedWithCustomError(ctx.session, UNAUTHORISED);
      }
    });
  });

  describe("MarketFactory", () => {
    it("rejects market creation by an account that is neither admin nor qualified operator", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await expect(
        ctx.factory.connect(ctx.outsider).createMarket("rogue", "IE", ctx.outsider.address),
      ).to.be.revertedWith(
        "MarketFactory: caller must be MARKETPLACE_ADMIN or qualified FMO_LMO",
      );
    });

    it("allows a qualified market operator to create a market", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await expect(
        ctx.factory.connect(ctx.fmoLmo).createMarket("second", "IE", ctx.fmoLmo.address),
      ).not.to.be.reverted;
    });
  });

  describe("Market", () => {
    it("only the market owner may create a session", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await expect(
        ctx.market
          .connect(ctx.outsider)
          .createSession(
            ctx.deliveryDay,
            await ctx.treasury.getAddress(),
            ctx.fmoLmo.address,
            ctx.frp.address,
            [],
          ),
      ).to.be.revertedWithCustomError(ctx.market, "OwnableUnauthorizedAccount");
    });

    it("rejects a session whose operator is not a qualified FMO/LMO", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await expect(
        ctx.market
          .connect(ctx.admin)
          .createSession(
            ctx.deliveryDay,
            await ctx.treasury.getAddress(),
            ctx.outsider.address,
            ctx.frp.address,
            [
              {
                hourSlot: WORKED_EXAMPLE.hourSlot,
                quantity: WORKED_EXAMPLE.requestQuantity,
                price: WORKED_EXAMPLE.price,
                flexType: 0,
              },
            ],
          ),
      ).to.be.revertedWith("FMO/LMO not qualified");
    });
  });

  describe("ParticipantRegistry", () => {
    it("only a registrar may register a participant", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await expect(
        ctx.registry
          .connect(ctx.outsider)
          .registerParticipant(ctx.outsider.address, ParticipantType.FSP, "x", "IE"),
      ).to.be.revertedWithCustomError(ctx.registry, UNAUTHORISED);
    });

    it("only a registrar may qualify a participant", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await expect(
        ctx.registry.connect(ctx.outsider).qualifyParticipant(ctx.fsp.address),
      ).to.be.revertedWithCustomError(ctx.registry, UNAUTHORISED);
    });
  });

  describe("Treasury", () => {
    it("rejects a session-contract operation from an account without the role", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await expect(
        ctx.treasury
          .connect(ctx.outsider)
          .depositCollateralAndFeeForOffer(
            1,
            1,
            ctx.fsp.address,
            WORKED_EXAMPLE.collateral,
            WORKED_EXAMPLE.fee,
          ),
      ).to.be.revertedWithCustomError(ctx.treasury, UNAUTHORISED);
    });

    it("rejects a session payment deposit from an account without the FRP role", async () => {
      const ctx = await loadFixture(deployedSessionFixture);
      await expect(
        ctx.treasury
          .connect(ctx.outsider)
          .depositPaymentForSession(1, WORKED_EXAMPLE.notional),
      ).to.be.revertedWithCustomError(ctx.treasury, UNAUTHORISED);
    });
  });
});
