/**
 * Effect IR: the `Primitive` members whose procedure is swap.
 * Their handlers are in `../kinds/swapKinds.ts` (or elsewhere in `effects/`).
 * Part of the split of `../ir.ts`, which re-exports the public names.
 */
import type { Effect } from "./effect.js";

export type SwapPrimitive =
  /** Midori: may swap approached ice with ice from HQ (unrezzed), then Runner may jack out. */
  | { kind: "may_swap_approached_ice_with_hq" }
  | {
      kind: "swap_approached_ice_with_hq";
      replacementIceId: string;
    }
  /**
   * Project Yagi-Uda: swap 1 HQ card with 1 card in the root of or protecting
   * the attacked server (choose both).
   */
  | { kind: "swap_yagi_hq_with_attacked_root_or_ice" }
  /** Leaf: complete Yagi swap with chosen HQ + attacked-server card. */
  | {
      kind: "swap_yagi_hq_with_attacked_pick";
      hqCardId: string;
      serverCardId: string;
    }
  /**
   * Daruma: swap 1 card in the root of this server with 1 card in another
   * server's root or 1 agenda/asset/upgrade in HQ. Optional onSuccess when
   * a swap actually occurs (offer_jack_out).
   */
  | {
      kind: "swap_this_root_with_other_root_or_hq";
      onSuccess?: Effect;
    }
  /** Leaf: complete Daruma swap. */
  | {
      kind: "swap_pick";
      thisRootCardId: string;
      otherCardId: string;
      onSuccess?: Effect;
    }
  | { kind: "swap_two_ice" }
  /** ezaM: swap this ice with another installed ice. */
  | { kind: "swap_source_ice_with_other" }
  /** Sipa: Runner may swap source ice with another installed ice (or decline). */
  /**
   * May swap a piece of ice with another installed piece of ice. The ice is
   * the source unless `iceId` names it (Sipa: the ice just passed, set by
   * the engine).
   */
  | { kind: "may_swap_ice_with_other_installed"; iceId?: string }
  /**
   * Cordyceps: Runner may swap one ice protecting the attacked server with
   * another installed ice (decline allowed).
   */
  | { kind: "may_swap_protecting_attacked_ice_with_other_installed" }
  /** Internal: after choosing protecting ice, choose other ice to swap with. */
  | {
      kind: "swap_protecting_attacked_ice_pick_other";
      protectingIceId: string;
    }
  /** Leaf: swap two installed ice by id (preserve rez/face). */
  | {
      kind: "swap_protecting_attacked_ice_with";
      protectingIceId: string;
      otherIceId: string;
    }
  /** Leaf: swap two installed ice (preserve rez/face). */
  | { kind: "swap_two_installed_ice"; otherIceId: string; iceId?: string }
  /**
   * Swap source ice with a piece of ice from HQ (same server/position).
   * New ice installs unrezzed ignoring costs. Optional gainCredits if swapped
   * (Tatu-Bola).
   */
  | { kind: "swap_ice_with_hq"; gainCredits?: number }
  | {
      kind: "swap_approached_ice_with_hq_or_archives";
      replacementIceId: string;
    }
  | { kind: "may_swap_with_hq" }
  | { kind: "swap_execute"; hqCardId: string }
  /** Chrome City (cc) */
  | { kind: "swap_stolen_with_corp_scored" }
  | { kind: "swap_turntable_resolve"; corpAgendaId: string }
  | { kind: "swap_hq_archives_per_advancement_on_self" }
  | { kind: "swap_allele_step"; remaining: number }
  | {
      kind: "swap_allele_resolve";
      hqCardId: string;
      archivesCardId: string;
      remaining: number;
    }
  | { kind: "swap_encounter_barrier_adjacent" }
  | { kind: "swap_surfer_resolve"; otherIceId: string }
  | { kind: "swap_mumbad_passed_ice"; iceId: string; otherIceId: string }
  | { kind: "swap_with_grip_subtype"; subtype: string }
  | { kind: "swap_with_grip_subtype_resolve"; cardId: string }
  | { kind: "may_swap_drawn"; cardId: string }
  | { kind: "swap_raman_rai_resolve"; drawnId: string; archivesId: string }
  | { kind: "swap_scored_agendas" }
  | { kind: "swap_resolve"; corpAgendaId: string; runnerAgendaId: string }
  | {
      kind: "swap_nihongai_resolve";
      rdCardId: string;
      hqCardId: string;
    }
  | { kind: "may_swap_passed_ice"; iceId?: string }
  | { kind: "swap_inversificator_resolve"; iceId: string; otherId: string }
  | { kind: "swap_2_other_ice_or_2_non_ice" }
  /**
   * Metamorph: swap 2 installed non-ice cards. `cardIds` is the Corp's
   * pick, set by the engine; card data does not author it.
   */
  | { kind: "swap_2_non_ice"; cardIds?: string[] }
  | { kind: "swap_2_unrezzed_ice" }
  | { kind: "swap_2_unrezzed_ice_resolve"; iceIdA: string; iceIdB: string }
  /**
   * Tenma Line: the Corp chooses 2 pieces of installed ice, then swaps them.
   * `cardIds` is the pair, filled by the choice.
   */
  | { kind: "may_swap_two_installed_ice"; cardIds?: string[] };
