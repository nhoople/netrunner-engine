/**
 * Effect IR: the conditions an `if` tests, and the ops the validator accepts.
 * Part of the split of `../ir.ts`, which re-exports the public names.
 */
import type { SideRef } from "./shared.js";

export type Cond =
  | { op: "true" }
  | { op: "false" }
  | { op: "during_run" }
  | { op: "source_is_breaker" }
  | { op: "source_is_ice" }
  | { op: "source_rezzed" }
  | { op: "grip_nonempty" }
  | { op: "has_installed_program" }
  | { op: "runner_tagged" }
  /** True when the Runner has at least `amount` tags (Doomscroll). */
  | { op: "tags_gte"; amount: number }
  | { op: "first_mandate_this_turn" }
  | { op: "clicks_remaining"; side: SideRef }
  | { op: "clicks_gte"; side: SideRef; amount: number }
  | { op: "credits_lte"; side: SideRef; amount: number }
  | { op: "credits_gte"; side: SideRef; amount: number }
  | { op: "credits_gt_other_side"; side: SideRef }
  /** True when side's credits equal the other side's (Supercorridor). */
  | { op: "credits_eq_other_side"; side: SideRef }
  /** True when Runner has gained ≥ N clicks during the current run (Pichação). */
  | { op: "clicks_gained_this_run_gte"; amount: number }
  /**
   * True when no decoder broke a printed subroutine this encounter
   * (Virtual Service Agent).
   */
  | { op: "did_not_break_printed_sub_with_decoder_this_encounter" }
  | { op: "protecting_remote" }
  /** True when source ice protects HQ, R&D, or Archives (Grubber). */
  | { op: "protecting_central" }
  /** Negate a nested condition (Vertigo). */
  | { op: "not"; cond: Cond }
  /** True when at least one piece of ice was rezzed this turn (Underdome). */
  | { op: "ice_rezzed_this_turn" }
  /** True when the effect source was scored by the Corp this turn (Witch Hunt). */
  | { op: "self_scored_this_turn" }
  | { op: "hq_nonempty" }
  | { op: "has_installed_resource" }
  | { op: "grip_count_odd" }
  | { op: "grip_count_gte"; amount: number }
  /** Piranhas: HQ size > grip size. */
  | { op: "hq_count_gt_grip" }
  /** Lat: Runner grip size equals Corp HQ size. */
  | { op: "grip_count_eq_hq" }
  /** Chisel: current encounter ice effective strength ≤ amount. */
  | { op: "encounter_ice_strength_lte"; amount: number }
  /**
   * Daily Quest: Runner made no successful run on the server hosting the
   * source card during their last turn. False when the source has no host
   * server — the printed ability refers to that server.
   */
  | { op: "no_successful_run_on_host_server_last_turn" }
  | { op: "successful_run_this_turn" }
  /**
   * Current run was declared unsuccessful (`run.successful === false`).
   * Blocked success (Crisium/Flagship) leaves `successful === null` and must
   * not match — CR 6.8.4a.
   */
  | { op: "run_unsuccessful" }
  /** Current run ended successfully (`run.successful === true`). */
  | { op: "run_successful" }
  | { op: "attacking_central" }
  | { op: "attacking_rd" }
  | { op: "attacking_hq" }
  | { op: "attacking_archives" }
  | { op: "attacking_remote" }
  | { op: "advancements_gte"; amount: number }
  | { op: "agenda_counters_gte"; amount: number }
  | { op: "hq_count_lte"; amount: number }
  | { op: "power_counters_gte"; amount: number }
  /** Hosted credits on the effect source ≥ amount (Mystic Maemi / Paladin Poemu). */
  | { op: "hosted_credits_gte"; amount: number }
  | { op: "virus_counters_gte"; amount: number }
  | { op: "has_mark" }
  | { op: "attacking_mark" }
  /**
   * Source ice protects the currently attacked server (run in progress).
   * Hákarl / Wave / Anemone-class "during a run against this server".
   */
  | { op: "source_protects_attacked_server" }
  /**
   * Source is installed in a server root or ice slot (Mr. Hendrik
   * "while it is installed").
   */
  | { op: "source_installed" }
  /**
   * Megaprix Qualifier: at least 2 cards in either score area share the
   * source's title (source is already scored when onScore fires).
   */
  | { op: "another_copy_of_source_title_in_either_score_area" }
  /**
   * Threat N: active when any player has at least `level` agenda points
   * (CR §1.17.1a). Used by Liberation-cycle Threat abilities.
   */
  | { op: "threat"; level: number }
  | { op: "source_has_subtype"; subtype: string }
  /**
   * Source card's host server has no rezzed ice protecting it
   * (Federal Fundraising).
   */
  | { op: "host_server_unprotected_by_ice" }
  /**
   * Attacked server is protected by at least one piece of ice
   * (Argus Crackdown).
   */
  | { op: "attacked_server_protected_by_ice" }
  /**
   * Current run attacks the server stored on source.chosenServerId
   * (Hyoubu Precog Manifold).
   */
  | { op: "attacking_chosen_server" }
  /**
   * Agenda scored/stolen from the root of the server hosting the source card
   * (Tucana).
   */
  | { op: "last_agenda_scored_or_stolen_from_source_server_root" }
  /**
   * Successful runs on HQ, R&D, and Archives this turn
   * (Jeitinho / Wizard's Chest / Deep Dive-class).
   */
  | { op: "successful_all_centrals_this_turn" }
  /** Corp played at least one operation this turn (Nebula-class). */
  | { op: "corp_played_operation_this_turn" }
  /** Corp identity is currently on its flip side (Nebula). */
  | { op: "identity_flipped" }
  /** Corp identity is on its front side (Nebula). */
  | { op: "identity_unflipped" }
  /** Runner accessed at least one card this turn (Hoshiko). */
  | { op: "accessed_a_card_this_turn" }
  /** Runner did not access any cards this turn (Hoshiko flip side). */
  | { op: "not_accessed_a_card_this_turn" }
  /**
   * Most recently scored agenda this turn was installed this turn
   * (Word on the Street).
   */
  | { op: "last_scored_agenda_installed_this_turn" }
  /** Current operation was played from a zone other than HQ (Petty Cash). */
  | { op: "played_from_non_hq" }
  /** All nested conditions must hold. */
  | { op: "and"; conds: Cond[] }
  /** At least one nested condition holds. */
  | { op: "or"; conds: Cond[] }
  /** Runner identity has the given subtype (DreamNet digital). */
  | { op: "identity_has_subtype"; subtype: string }
  /** Runner has at least `amount` link (DreamNet). */
  | { op: "link_gte"; amount: number }
  /** Runner MU limit equals used MU (Dewi). */
  | { op: "runner_mu_full" }
  /** Runner has at least `amount` unused MU (Dewi flip side). */
  | { op: "runner_unused_mu_gte"; amount: number }
  /** A subroutine resolved during the current run (Ryō Phoenix). */
  | { op: "subroutine_resolved_this_run" }
  /**
   * The Runner has lost [click] to break a subroutine during the current run
   * (Zed 1.0).
   */
  | { op: "lost_click_to_break_this_run" }
  /** Source card was installed this turn (The Class Act). */
  | { op: "self_installed_this_turn" };

export const KNOWN_COND_OPS = new Set([
  "true",
  "false",
  "during_run",
  "source_is_breaker",
  "source_is_ice",
  "source_rezzed",
  "grip_nonempty",
  "has_installed_program",
  "runner_tagged",
  "tags_gte",
  "first_mandate_this_turn",
  "clicks_remaining",
  "clicks_gte",
  "credits_lte",
  "credits_gte",
  "credits_gt_other_side",
  "credits_eq_other_side",
  "clicks_gained_this_run_gte",
  "did_not_break_printed_sub_with_decoder_this_encounter",
  "protecting_remote",
  "protecting_central",
  "not",
  "ice_rezzed_this_turn",
  "self_scored_this_turn",
  "hq_nonempty",
  "has_installed_resource",
  "grip_count_odd",
  "grip_count_gte",
  "hq_count_gt_grip",
  "grip_count_eq_hq",
  "encounter_ice_strength_lte",
  "no_successful_run_on_host_server_last_turn",
  "successful_run_this_turn",
  "run_unsuccessful",
  "run_successful",
  "attacking_central",
  "attacking_rd",
  "attacking_hq",
  "attacking_archives",
  "attacking_remote",
  "advancements_gte",
  "agenda_counters_gte",
  "hq_count_lte",
  "power_counters_gte",
  "hosted_credits_gte",
  "virus_counters_gte",
  "has_mark",
  "attacking_mark",
  "source_protects_attacked_server",
  "source_installed",
  "another_copy_of_source_title_in_either_score_area",
  "threat",
  "source_has_subtype",
  "host_server_unprotected_by_ice",
  "attacked_server_protected_by_ice",
  "attacking_chosen_server",
  "last_agenda_scored_or_stolen_from_source_server_root",
  "successful_all_centrals_this_turn",
  "corp_played_operation_this_turn",
  "identity_flipped",
  "identity_unflipped",
  "accessed_a_card_this_turn",
  "not_accessed_a_card_this_turn",
  "last_scored_agenda_installed_this_turn",
  "played_from_non_hq",
  "and",
  "or",
  "identity_has_subtype",
  "link_gte",
  "runner_mu_full",
  "runner_unused_mu_gte",
  "subroutine_resolved_this_run",
  "lost_click_to_break_this_run",
  "self_installed_this_turn",
]);
