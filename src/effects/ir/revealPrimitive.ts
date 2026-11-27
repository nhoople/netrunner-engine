/**
 * Effect IR: the `Primitive` members whose procedure is reveal.
 * Their handlers are in `../kinds/revealKinds.ts` (or elsewhere in `effects/`).
 * Part of the split of `../ir.ts`, which re-exports the public names.
 */
import type { Effect } from "./effect.js";

export type RevealPrimitive =
  | { kind: "reveal_install_or_trash"; discount: number }
  /** Leaf: peek top of R&D for chosen Corp card type (Balanced Coverage). */
  | {
      kind: "may_reveal_peek_rd_top_for_chosen_type_gain";
      cardType: "agenda" | "asset" | "ice" | "operation" | "upgrade" | "event";
      credits: number;
    }
  /** Corp may reveal one agenda from HQ (Chrysopoeian Skimming). */
  | { kind: "may_corp_reveal_agenda_from_hq"; then?: Effect; else?: Effect }
  /** Leaf: reveal a card currently in HQ (faceup). */
  | { kind: "reveal_corp_hand_card"; cardId: string }
  /** Executive Wiretaps: reveal all cards in HQ (CR 1.21.3). */
  | { kind: "reveal_hq" }
  /**
   * Reveal an installed card to verify the install (CR 8.5.13c), or, with
   * `forRez`, because it was not rezzed by "install and rez" (CR 8.5.13d).
   */
  | { kind: "reveal_installed_to_verify"; cardId: string; forRez?: boolean }
  /**
   * Reveal top of Runner stack: place printed play/install cost as hosted
   * credits on source, add card to grip (Concerto).
   */
  | { kind: "reveal_top_stack_to_grip_place_hosted_credits" }
  /**
   * Drudge Work: choose an agenda in HQ or Archives; reveal it, gain credits
   * equal to its agenda points, shuffle it into R&D.
   */
  | { kind: "reveal_agenda_hq_or_archives_gain_ap_shuffle" }
  /**
   * Meeting of Minds: reveal any number of grip cards with the subtype and
   * gain 1 credit for each. `cardIds` is the Runner's pick, set by the
   * engine; card data does not author it.
   */
  | { kind: "reveal_gain"; subtype: string; cardIds?: string[] }
  | {
      kind: "may_reveal_shuffle_agendas_into_rd";
      max: number;
      /** Attitude Adjustment: gain this many credits per revealed agenda. */
      creditsEach?: number;
    }
  | {
      kind: "reveal_shuffle_agenda_into_rd";
      cardId: string;
      remainingAfter: number;
      exclude: string[];
      creditsEach?: number;
    }
  /**
   * Building Blocks: reveal a card of subtype from HQ; install and rez ignoring
   * all costs.
   */
  | {
      kind: "reveal_hq_subtype_install_and_rez_ignore_costs";
      subtype: string;
    }
  /**
   * Engram Flush subroutine: reveal grip; Corp may trash 1 revealed card of
   * the encounter's chosen card type.
   */
  | { kind: "reveal_grip_may_trash_chosen_encounter_type" }
  /**
   * Focus Group: choose a card type, reveal grip, choose X ≤ count of that
   * type, may pay X¢ to place X advancements on 1 installed card.
   */
  | { kind: "reveal_may_advance" }
  /** The Corp reveals and trashes `amount` cards from HQ, chosen at random. */
  | { kind: "reveal_trash_random_from_hq"; amount: number }
  /**
   * Prognostic Q-Loop paid: reveal top of stack; if program or hardware,
   * may install it (paying costs).
   */
  | { kind: "reveal_top_stack_may_install_program_or_hardware" }
  /**
   * Stargate: reveal top `n` of R&D; Runner trashes 1; rest return in order.
   */
  | { kind: "reveal_top_n_rd_trash_one"; n: number }
  /** Internal: trash one revealed R&D card, return the rest in order. */
  | { kind: "reveal_top_n_rd_trash_picked"; cardId: string }
  /** Insight: reveal the top `n` cards of R&D (public), leave them in place. */
  | { kind: "reveal_top_n_rd"; n: number }
  | { kind: "reveal_hyoubu_grip_random_or_stack_top" }
  | { kind: "reveal_hyoubu_grip_random" }
  | { kind: "reveal_hyoubu_stack_top" }
  | { kind: "reveal_hq_forbid_steal_trash_copies_this_run" }
  | {
      kind: "reveal_hq_gain_credits";
      maxCards: number;
      creditsEach: number;
      /** The cards the Corp chose to reveal (CR 1.15.2). */
      cardIds?: string[];
    }
  | { kind: "reveal_runner_stack_top_to_grip"; cardId: string }
  | { kind: "reveal_top_rd_corp_may_draw" }
  | { kind: "reveal_grip" }
  | { kind: "reveal_grip_may_trash_one" }
  | {
      kind: "reveal_grail_gain_subroutines";
      maxReveal?: number;
      /** The grail ice the Corp chose to reveal (CR 1.15.2). */
      cardIds?: string[];
    }
  | { kind: "reveal_random_hq_card" }
  | { kind: "reveal_lakshmi_agenda_resolve"; cardId: string }
  | { kind: "reveal_grip_trash_cost_lte_excess" }
  /** Fear the Masses (ftm) */
  /**
   * Fear the Masses: reveal any number of copies from the grip, then the
   * Corp trashes 1 plus that many from the top of R&D. `cardIds` is the
   * Runner's pick, set by the engine; card data does not author it.
   */
  | { kind: "reveal_copies_trash_rd"; cardIds?: string[] }
  | { kind: "may_reveal_force_draw" }
  | { kind: "reveal_then_may_force_draw" }
  | { kind: "reveal_host_programs" }
  | { kind: "reveal_levy_advanced_research_lab" }
  | { kind: "reveal_top_3" }
  | { kind: "may_reveal_aeneas_gain_one"; cardId: string }
  | { kind: "reveal_aeneas_gain_resolve"; cardId: string }
  | { kind: "reveal_top_rd_to_hq_then_hq_to_rd_top" }
  | { kind: "reveal_white_hat" }
  | { kind: "reveal_top_four" }
  | { kind: "reveal_top_may_bottom" }
  | { kind: "reveal_top_paid" }
  | { kind: "reveal_oracle_top_match"; cardType: string }
  | { kind: "may_reveal_score_from_hq" }
  /** Reveal the top card of R&D (leave it on top; Public Health Portal). */
  | { kind: "reveal_top_of_rd" }
  /**
   * Loot Box: reveal top `n` of stack; Corp chooses one → add to grip and
   * Corp gains that card's play/install cost; shuffle remaining into stack.
   */
  | { kind: "reveal_top_n"; n: number };
