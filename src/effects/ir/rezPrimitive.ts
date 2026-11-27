/**
 * Effect IR: the `Primitive` members whose procedure is rez.
 * Their handlers are in `../kinds/rezKinds.ts` (or elsewhere in `effects/`).
 * Part of the split of `../ir.ts`, which re-exports the public names.
 */
export type RezPrimitive =
  | { kind: "rez_ice_by_id"; iceId: string }
  /** Oversight AI: rez chosen ice ignore costs; host this card on it. */
  | { kind: "rez_and_host" }
  /** Bioroid Efficiency Research: rez chosen unrezzed bioroid ice; host this card. */
  | { kind: "rez_bioroid_and_host" }
  /**
   * Unleash: rez 1 installed unrezzed ice ignoring costs, then may resolve
   * 1 subroutine on that ice.
   */
  | { kind: "rez_may_resolve_sub" }
  /** Leaf: rez specific ice ignore costs, then may resolve one of its subs. */
  | { kind: "rez_ice_then_may_resolve_sub"; cardId: string }
  | { kind: "rez_installed_paying"; cardId: string }
  /**
   * The Corp installs this card from HQ or Archives by an ability. Without
   * `serverId` the Corp is asked for the destination (CR 8.5.16b). With
   * `trashFirst` the Corp is asked which cards already there to trash
   * first (CR 8.5.6a, 8.5.6b); `cardIds` are those cards. `rez` rezzes the
   * card afterwards, ignoring all costs (CR 8.5.15).
   */
  /** Rez this installed Corp card, ignoring costs (CR 8.5.15). */
  | { kind: "rez_installed_card_ignoring_costs"; cardId: string }
  /**
   * Awakening Center: whenever the Runner passes all ice protecting this
   * server, the Corp may rez 1 hosted piece of bioroid ice paying 7 less,
   * forcing the Runner to encounter it; trashed at run end.
   */
  | { kind: "rez_hosted"; cardId: string }
  | { kind: "rez_ice_ignoring_costs" }
  /** Eliza's Toybox: rez any installed card, ignoring all costs. */
  | { kind: "rez_card_ignoring_costs" }
  /**
   * Formicary-class: rez source ice (optional discount), move to innermost
   * protecting the attacked server, then encounter — blocked when
   * `run.forbidNewTimingStructures` (CR 6.8.2c).
   */
  | { kind: "rez_move_innermost"; rezDiscount?: number }
  | { kind: "may_rez_event_derezzed_ice_ignore_costs" }
  | { kind: "rez_ice_ignore_costs"; cardId: string }
  | { kind: "rez_up_to_ice_protecting_attacked_ignore_costs"; maxIce: number }
  | {
      kind: "rez_one_protecting_attacked_ignore_costs";
      cardId: string;
      remaining: number;
    }
  /** Internal: after done derezzing, may rez one card with discount. */
  | {
      kind: "may_rez_card_with_discount";
      discount: number;
    }
  /** Leaf: rez installed card paying rez cost minus discount. */
  | {
      kind: "rez_card_with_discount";
      cardId: string;
      discount: number;
    }
  /**
   * Reduced Service rez helper: pay `amount` credits, place that many power.
   */
  | { kind: "rez_spend_credits_for_power_counters"; amount: number }
  | { kind: "rez_for_expose_interrupt"; cardId: string }
  | { kind: "corp_rez"; iceId: string }
  | { kind: "rez_ice_per_tag" }
  | { kind: "rez_pick"; cardId: string }
  | { kind: "may_corp_rez_ignoring_cost" }
  | { kind: "corp_rez_ignoring_cost"; cardId: string }
  | { kind: "rez_emp_device_limit_ice_this_run" }
  | { kind: "may_rez_surat_discount"; discount?: number }
  | { kind: "rez_surat_discount_resolve"; cardId: string; discount?: number }
  | { kind: "rez_sensor_net_bioroid_ignoring_costs_derez_turn_end" }
  | { kind: "rez_sensor_net_bioroid_resolve"; cardId: string }
  | { kind: "rez_up_to_3_ice_discount" }
  | {
      kind: "rez_continue";
      remaining: number;
      discount: number;
      cardIds: string[];
    }
  | {
      kind: "rez_one";
      cardId: string;
      discount: number;
      remaining: number;
      cardIds: string[];
    }
  /** Mycoweb: may rez 1 installed unrezzed ice paying `discount`¢ less. */
  | { kind: "may_rez_installed_ice_discount"; discount: number }
  | {
      kind: "rez_ice_with_discount";
      cardId: string;
      discount: number;
    };
