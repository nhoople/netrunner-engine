/**
 * Effect IR: the `Primitive` members whose procedure is remove.
 * Their handlers are in `../kinds/removeKinds.ts` (or elsewhere in `effects/`).
 * Part of the split of `../ir.ts`, which re-exports the public names.
 */
import type { Effect } from "./effect.js";
import type { CreditTally } from "./shared.js";

export type RemovePrimitive =
  | { kind: "remove_agenda_counters"; amount: number }
  | { kind: "remove_virus_counters"; amount: number }
  /**
   * Remove up to `amount` advancement counters from the source card.
   * Optional `then` runs only if at least one was removed (Mestnichestvo).
   */
  | { kind: "remove_advancements"; amount: number; then?: Effect }
  | { kind: "remove_all_virus_from_one_installed" }
  | { kind: "remove_all_virus_from"; cardId: string }
  /**
   * API-S Keeper Isobel: may remove 1 advancement from an installed card to
   * gain `credits`.
   */
  | {
      kind: "may_remove_advancement_from_installed_gain_credits";
      credits: number;
    }
  /** Leaf: remove 1 advancement from cardId, gain credits. */
  | {
      kind: "remove_advancement_from_installed_gain_credits";
      cardId: string;
      credits: number;
    }
  /**
   * Personal Workshop: remove 1 power from a hosted card; at 0 install
   * ignoring all costs.
   */
  | { kind: "remove_power_from_hosted_card_install_at_zero_ignore_costs" }
  | {
      kind: "remove_power_from_hosted_card_id_install_at_zero";
      cardId: string;
    }
  | {
      kind: "may_remove_power_counters_then_net_damage";
      base: number;
      perRemoved: number;
      maxRemove: number;
    }
  /** Internal: remove `amount` virus from cardId, then continue Nihilist. */
  | {
      kind: "remove_nihilist_virus_from";
      cardId: string;
      amount: number;
      remaining: number;
    }
  | {
      kind: "remove_tags";
      amount: number;
      /**
       * Count, then remove that many tags as this one instruction
       * (CR 9.12.2b, 9.12.2c). Removal stops at the tags the Runner has.
       * `amount` is unused when `tally` is set. A total of 0 or less does not happen.
       */
      tally?: CreditTally;
    }
  | { kind: "remove_power_counter"; amount: number }
  /** Cold Site Server: remove all hosted power counters from the source. */
  | { kind: "remove_all_power_counters" }
  /**
   * Remove up to `amount` bad publicity (Scapegoat).
   * `tally` counts, then removes that many as this one instruction
   * (CR 9.12.2b, 9.12.2c). Removal stops at the bad publicity the Corp has.
   * `amount` is unused when `tally` is set. A total of 0 or less does not happen.
   */
  | { kind: "remove_bad_publicity"; amount: number; tally?: CreditTally }
  | { kind: "remove_bigger_picture_tags" }
  | { kind: "remove_enforcement_tags" }
  | { kind: "remove_bad_publicity_up_to"; max: number }
  | { kind: "remove_bad_publicity_instead"; amount: number }
  | { kind: "remove_bp_equal_forfeited_ap_gain_credits" }
  | { kind: "remove_up_to"; cardId: string; amount: number }
  | { kind: "remove_co_2_look_rd" };
