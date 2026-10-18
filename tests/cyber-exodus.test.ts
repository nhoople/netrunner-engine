/**
 * cyber-exodus play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  fx,
  validateEffectTree,
  getCardDef,
} from "../src/index.js";

describe("cyber-exodus", () => {
  describe("ce-primitives", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("CE may_gain_click_then_tag_at_turn_end", () => {
    it("validates Joshua B. primitive", () => {
      expect(
        validateEffectTree(
          fx.do({ kind: "may_gain_click_then_tag_at_turn_end" }),
        ),
      ).toBeNull();
    });
  });

  describe("CE personal workshop host/remove", () => {
    it("validates host and remove primitives", () => {
      expect(
        validateEffectTree(
          fx.do({
            kind: "host_grip_program_or_hardware_with_power_equal_install_cost",
          }),
        ),
      ).toBeNull();
      expect(
        validateEffectTree(
          fx.do({
            kind: "remove_power_from_hosted_card_install_at_zero_ignore_costs",
          }),
        ),
      ).toBeNull();
    });
  });

  describe("CE edge/sunset/commercialization/chimera", () => {
    it("validates ambush / rearrange / choose ice / subtype primitives", () => {
      expect(
        validateEffectTree(
          fx.do({
            kind: "may_pay_credits_for_core_damage_per_ice_protecting_this_server",
            amount: 3,
          }),
        ),
      ).toBeNull();
      expect(
        validateEffectTree(fx.do({ kind: "choose_server_rearrange_ice" })),
      ).toBeNull();
      expect(
        validateEffectTree(
          fx.do({ kind: "choose_ice_gain_credits_per_advancement" }),
        ),
      ).toBeNull();
      expect(
        validateEffectTree(fx.do({ kind: "choose_one_subtype_until_derez" })),
      ).toBeNull();
    });
  });
  });

  describe("ce-v190-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Cyber Exodus v1.90.0 set-complete", () => {

    it("maps CE-specific fields and primitives", () => {
      expect(getCardDef("public-sympathy").handSizeBonus).toBe(2);
      expect(getCardDef("nerve-agent").chooseBonusAccessLessThanVirusOnHqBreach).toBe(
        true,
      );
      expect(
        getCardDef("snitch").mayExposeApproachedUnrezzedIceOncePerRunThenMayJackOut,
      ).toBe(true);
      expect(getCardDef("personal-workshop").personalWorkshop).toBe(true);
      expect(getCardDef("edge-of-world").onAccessRequiresInstalled).toBe(true);
      expect(getCardDef("woodcutter").canAdvance).toBe(true);
      expect(getCardDef("woodcutter").canAdvanceOnlyWhenRezzed).toBe(true);
      expect(getCardDef("woodcutter").gainsSubroutinesPerAdvancement).toBeTruthy();
      expect(getCardDef("chimera").derezAtAnyTurnEnd).toBe(true);
      expect(getCardDef("joshua-b").onTurnBegin).toMatchObject({
        op: "do",
        action: { kind: "may_gain_click_then_tag_at_turn_end" },
      });
      expect(getCardDef("sunset").onPlay).toMatchObject({
        op: "do",
        action: { kind: "choose_server_rearrange_ice" },
      });
      expect(getCardDef("commercialization").onPlay).toMatchObject({
        op: "do",
        action: { kind: "choose_ice_gain_credits_per_advancement" },
      });
      expect(getCardDef("chimera").onRez).toMatchObject({
        op: "do",
        action: { kind: "choose_one_subtype_until_derez" },
      });
      expect(getCardDef("edge-of-world").onAccess).toMatchObject({
        op: "do",
        action: {
          kind: "may_pay_credits_for_core_damage_per_ice_protecting_this_server",
          amount: 3,
        },
      });
      const viper = getCardDef("viper");
      expect(viper.subroutines).toHaveLength(2);
      expect(JSON.stringify(viper.subroutines)).toContain("lose_clicks");
      expect(JSON.stringify(viper.subroutines)).toContain("end_the_run");
      const priv = getCardDef("private-contracts");
      expect(priv.onRez).toMatchObject({
        op: "do",
        action: { kind: "place_hosted_credits", amount: 14 },
      });
      expect(JSON.stringify(priv.paidAbilities)).toContain("take_hosted_credits");
    });
  });
  });
});
