/**
 * Cyber Exodus (ce) Effect IR / card-field primitives for v1.90.0.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  fx,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.145.0");
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
