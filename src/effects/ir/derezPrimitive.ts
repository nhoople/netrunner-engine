/**
 * Effect IR: the `Primitive` members whose procedure is derez.
 * Their handlers live in the area folders under `effects/`; the kind registry is `effects/coreKinds.ts`.
 * Part of the Effect IR in `effects/ir/`: import each name from the file that declares it.
 */
import type { Effect } from "./effect.js";

export type DerezPrimitive =
  /** Derez the ice currently being encountered (Baklan). */
  | { kind: "derez_encounter_ice" }
  | { kind: "derez_ice_protecting_attacked"; cardId: string }
  | { kind: "may_derez_protecting_attacked_ice" }
  /**
   * Kompromat: give Corp 1 bad publicity unless they derez 1 rezzed ice
   * protecting the attacked server.
   */
  | { kind: "derez_unless_protecting_attacked" }
  | {
      kind: "derez_up_to_ice_protecting_server";
      serverId: string;
      maxIce: number;
    }
  | {
      kind: "derez_one_protecting_server";
      cardId: string;
      serverId: string;
      remaining: number;
    }
  | {
      kind: "derez_brasilia_other_ice_for_strength";
      otherIceId: string;
      rezzedIceId: string;
      bonus: number;
      brasiliaId: string;
    }
  /**
   * Divert Power: derez any number of rezzed installed cards, then may rez
   * a card lowering rez cost by `creditsPerDerezzed` × count derezzed.
   */
  | {
      kind: "derez_any_number_then_may_rez_discount_per";
      creditsPerDerezzed: number;
    }
  /** Internal: continue Divert Power after each derez (track count). */
  | {
      kind: "derez_any_number_continue";
      creditsPerDerezzed: number;
      derezzed: number;
      justDerezzedId?: string;
    }
  | { kind: "derez_ice"; pick: "first" | "choose" }
  /** Derez a specific rezzed installed card (ice / asset / upgrade). */
  | { kind: "derez_card"; cardId: string }
  /** Derez the effect source if it is currently rezzed (Warm Reception). */
  | { kind: "derez_source" }
  /**
   * May derez another rezzed installed card (Hákarl-class). Opens a Corp
   * choice when ≥1 eligible target exists; decline is always offered.
   * When a target is chosen, derez it then evaluate optional `then`
   * ("if you do"). No-op (no choice) when no eligible targets.
   */
  | {
      kind: "may_derez_installed";
      /** Exclude the effect source from targets (default true). */
      excludeSelf?: boolean;
      /** Only ice cards (Stegodon). */
      onlyIce?: boolean;
      /** Exclude ice protecting the attacked server (Stegodon). */
      excludeProtectingAttackedServer?: boolean;
      then?: Effect;
    }
  | { kind: "corp_derez_a_card" }
  | { kind: "derez_per_advancement_on_self" }
  | { kind: "derez_n_from_list"; cardIds: string[]; remaining: number }
  | { kind: "may_derez_rezzed"; cardId: string }
  | { kind: "derez_resolve"; cardId: string }
  /** Daedalus Complex (dc) Red Sand */
  | { kind: "derez_up_to_ice"; max?: number }
  | { kind: "derez_up_to_ice_continue"; remaining: number; cardIds: string[] }
  /** Terminal Directive Cards (td) Red Sand deluxe */
  | { kind: "derez_ice_rez_cost_lte_x" }
  | { kind: "derez_remote_ice" }
  | { kind: "derez_rezzed_this_turn" }
  /** Free Mars (fm) Red Sand #5 */
  | { kind: "derez_all_ice_rezzed_this_run" }
  | { kind: "derez_encountered_ice" };
