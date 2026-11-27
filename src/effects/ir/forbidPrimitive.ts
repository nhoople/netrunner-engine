/**
 * Effect IR: the `Primitive` members whose procedure is forbid.
 * Their handlers are in `../kinds/forbidKinds.ts` (or elsewhere in `effects/`).
 * Part of the split of `../ir.ts`, which re-exports the public names.
 */
export type ForbidPrimitive =
  | { kind: "forbid_scoring_agendas_this_turn" }
  /** Efficiency Committee: cannot advance any card for the remainder of this turn. */
  | { kind: "forbid_advance_this_turn" }
  | { kind: "forbid_steal_trash_this_run" }
  /**
   * The Future Perfect: the Runner cannot steal the agenda being accessed
   * during this access (CR 1.2.1).
   */
  | { kind: "forbid_steal_accessed_agenda" }
  /** Source ice: Runner cannot break with card abilities this encounter (Anvil). */
  | { kind: "forbid_runner_break_on_source" }
  /**
   * Hafrún: choose an installed Runner card; its abilities cannot break
   * subroutines for the remainder of the run.
   */
  | { kind: "forbid_installed_runner_break_for_run" }
  /** Leaf: forbid break abilities on a specific Runner card for this run. */
  | { kind: "forbid_runner_card_break_for_run"; cardId: string }
  /** Banner: subroutines cannot end the run for the remainder of this encounter. */
  | { kind: "forbid_end_the_run_this_encounter" }
  | { kind: "forbid_steal_trash_title_this_run"; title: string }
  /**
   * Runner cannot use paid abilities printed on bioroid ice for the
   * remainder of the turn (Hákarl 1.0 after may-derez).
   */
  | { kind: "forbid_bioroid_ice_paid_abilities_this_turn" }
  | { kind: "forbid_runner_spend_credits_for_run" }
  | { kind: "forbid_installs_until_run_end" }
  | { kind: "forbid_rez"; cardId: string }
  | { kind: "forbid_access_and_breach_this_run" }
  | { kind: "forbid_install_remainder_of_turn" }
  /** Inazuma: cannot jack out this run until after the next ice encounter begins. */
  | { kind: "forbid_jack_out_until_next_encounter" }
  /** Uroboros: Runner cannot initiate another run this turn. */
  | { kind: "forbid_runner_runs_this_turn" };
