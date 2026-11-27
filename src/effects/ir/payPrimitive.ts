/**
 * Effect IR: the `Primitive` members whose procedure is pay.
 * Their handlers live in the area folders under `effects/`; the kind registry is `effects/coreKinds.ts`.
 * Part of the Effect IR in `effects/ir/`: import each name from the file that declares it.
 */
import type { SideRef } from "./shared.js";

export type PayPrimitive =
  /** Darwin: may pay credits to place virus counters on self. */
  | {
      kind: "may_pay_credits_add_virus_counter";
      credits: number;
      amount: number;
    }
  | { kind: "pay_credits_add_virus_counter"; credits: number; amount: number }
  /**
   * Corp may pay `amount` credits to do `damage` core damage
   * (Mr. Hendrik). Opens interactive pendingDamage with
   * preventByLoseAllClicks when the Runner has clicks remaining.
   */
  | {
      kind: "may_pay_credits_for_core_damage";
      amount: number;
      damage: number;
    }
  /**
   * Cerebral Overwriter: like may_pay_credits_for_core_damage but damage
   * equals the source's advancement counters. If damage is 0 or Corp cannot
   * afford `amount`, only Decline is offered.
   */
  | {
      kind: "may_pay_credits_for_core_damage_per_advancement";
      amount: number;
    }
  /**
   * Project Junebug: pay `amount`¢ to do (`per` × advancement counters) net
   * damage. If damage is 0 or Corp cannot afford `amount`, only Decline.
   */
  | {
      kind: "may_pay_credits_for_net_damage_per_advancement";
      amount: number;
      per: number;
    }
  /**
   * Aggressive Secretary: pay `amount`¢ to trash 1 installed program per
   * advancement counter on the source. If advancements are 0 or Corp cannot
   * afford `amount`, only Decline.
   */
  | {
      kind: "may_pay_credits_for_trash_programs_per_advancement";
      amount: number;
    }
  /**
   * Neurostasis: pay `amount`¢ to shuffle 1 installed Runner card into the
   * stack per advancement counter on the source.
   */
  | {
      kind: "may_pay_credits_for_shuffle_installed_runner_per_advancement";
      amount: number;
    }
  | { kind: "pay_credits_reencounter_passed_ice"; credits: number }
  /**
   * Algernon: may pay `credits` to gain [click]; if so, trash source at
   * Runner turn end unless a successful run was made this turn.
   */
  | {
      kind: "may_pay_credits_gain_click_trash_at_turn_end_if_no_successful_run";
      credits: number;
    }
  /** Internal leaf for Algernon after choosing to pay. */
  | { kind: "pay_gain_click"; credits: number }
  /**
   * Edge of World: may pay `amount`¢ to deal core damage equal to ice
   * protecting this server.
   */
  | {
      kind: "may_pay_credits_for_core_damage_per_ice_protecting_this_server";
      amount: number;
    }
  /** Internal: Focus Group may pay X to place X advancements. */
  | { kind: "may_pay_place"; amount: number }
  | { kind: "pay_credits_or_etr"; side: SideRef; amount: number }
  | { kind: "pay_rez_additional_cost" }
  | { kind: "pay_shattered_remains"; hardwareCount: number }
  | { kind: "pay_place_advancement" }
  | {
      kind: "pay_credits_or_trash_installed";
      side?: "corp" | "runner";
      amount?: number;
    }
  | { kind: "pay_up_to_place_advancements"; max?: number }
  | {
      kind: "pay_place_advancements_resolve";
      amount: number;
      cardId: string;
    }
  | { kind: "pay_or_trash_top_stack" }
  | { kind: "corp_pay_credits_to_prevent"; amount: number }
  | { kind: "pay_419"; credits?: number }
  | { kind: "pay_or_net"; amount?: number }
  /**
   * Shiro: Corp may pay credits; if they do not, Runner breaches `server`
   * (optionally excluding root) mid-encounter (CR 7.3 / 7.3.8).
   */
  | {
      kind: "may_corp_pay_credits_else_breach";
      credits?: number;
      server: "hq" | "rd" | "archives";
      cannotAccessRoot?: boolean;
    }
  | { kind: "may_pay_reveal_top" }
  | { kind: "pay_tori_hanzo_instead_net" }
  | { kind: "corp_pay_credits"; amount: number }
  | { kind: "runner_pay_credits"; amount: number };
