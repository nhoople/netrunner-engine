/**
 * Effect IR: the `Primitive` members whose procedure is gain.
 * Their handlers are in `../kinds/gainKinds.ts` (or elsewhere in `effects/`).
 * Part of the split of `../ir.ts`, which re-exports the public names.
 */
import type { CreditTally, SideRef } from "./shared.js";

export type GainPrimitive =
  | {
      kind: "gain_credits";
      side: SideRef;
      amount: number;
      /**
       * Count, then gain that total as this one instruction
       * (CR 9.12.2b, 9.12.2c). `amount` is unused when `tally` is set.
       * A total of 0 or less does not happen.
       */
      tally?: CreditTally;
    }
  | {
      kind: "gain_clicks";
      side: SideRef;
      amount: number;
      /**
       * Count, then gain that many clicks as this one instruction
       * (CR 9.12.2b, 9.12.2c). `amount` is unused when `tally` is set.
       * A total of 0 or less does not happen.
       */
      tally?: CreditTally;
    }
  /** Turn-scoped breaker strength boost on source (Living Mural). */
  | { kind: "gain_strength_this_turn"; amount: number; targetCardId?: string }
  | { kind: "gain_lycian_subtype"; subtype: string; remaining: string[] }
  /**
   * Joshua B.: may gain [click]; if so, take 1 tag at Runner turn end.
   */
  | { kind: "may_gain_click_then_tag_at_turn_end" }
  /** Internal leaf for Joshua B. after choosing to gain the click. */
  | { kind: "gain_joshua_click_tag_at_turn_end" }
  | { kind: "gain_credits_from_ice_advancements"; iceId: string }
  | { kind: "gain_one_subtype_until_derez"; subtype: string }
  /**
   * Psych Mike: gain 1¢ per R&D access during the ending successful R&D run
   * (count from run.accessedCardIds while still available).
   */
  | { kind: "gain_credits_equal_to_rd_accesses_this_run" }
  /**
   * Gain 1¢ per distinct card type among faceup cards in Archives; if any
   * are agendas, gain another 2¢ (Armed Asset Protection; base 3¢ is separate).
   */
  | { kind: "gain_credits_per_distinct_faceup_archive_type" }
  | { kind: "gain_credits_equal_to_runner_credits" }
  | { kind: "gain_credits_equal_to_agenda_points_of_trigger" }
  | { kind: "gain_if_unused_mu_gte"; amount: number; threshold: number }
  /** The Universe of Tomorrow (uot) */
  | { kind: "gain_arm_credits_on_first_agenda_access"; amount: number }
  | { kind: "gain_if_rezzed_asset_in_root" }
  | { kind: "gain_reality_threedee_credits" }
  | { kind: "gain_text_of_runner_scored_agenda" }
  | {
      kind: "gain_credits_equal_to_agenda_points_both_score_areas";
      side?: "corp" | "runner";
    }
  | {
      kind: "gain_credits_if_runner_has_installed_subtype";
      side?: "corp" | "runner";
      amount?: number;
      subtype?: string;
    }
  | { kind: "gain_credits_per_corp_credits" }
  | { kind: "gain_from_ice"; iceId: string }
  | { kind: "may_gain_7_or_7_meat_if_tagged" }
  | {
      kind: "corp_gain";
      cardType: "resource" | "hardware" | "program";
      trashed?: string[];
    }
  /** Down the White Nile (dtwn) Kitara #2 */
  | { kind: "gain_credits_equal_to_last_purged_viruses" }
  | { kind: "gain_personalized_portal" }
  | { kind: "corp_gain_iain_if_ahead_on_agenda" }
  | { kind: "gain_credits_twice_secret_spend" };
