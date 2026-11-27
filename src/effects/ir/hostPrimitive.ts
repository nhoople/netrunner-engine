/**
 * Effect IR: the `Primitive` members whose procedure is host.
 * Their handlers live in the area folders under `effects/`; the kind registry is `effects/coreKinds.ts`.
 * Part of the Effect IR in `effects/ir/`: import each name from the file that declares it.
 */
import type { Effect } from "./effect.js";

export type HostPrimitive =
  | { kind: "host_on_ice"; iceId: string }
  /**
   * Personal Workshop: host program/hardware from grip; place power
   * counters equal to its install cost.
   */
  | { kind: "host_grip_program_or_hardware_with_power_equal_install_cost" }
  | {
      kind: "host_grip_pw_card_with_power_equal_install_cost";
      cardId: string;
    }
  /**
   * Eavesdrop: choose installed ice; host source as a condition counter
   * (no rez).
   */
  | {
      kind: "host_on_ice_as_condition";
      /** Only rezzed ice (Patch, Sub Boost). */
      rezzedOnly?: boolean;
    }
  /** Leaf: host source on chosen ice as condition. */
  | {
      /**
       * The source converts itself into a condition counter and hosts itself
       * on `hostId` (CR 10.1.4, 1.13.1). Engine-built after the card's
       * choice of host (Wetwork Refit, Rover Algorithm, On the Lam).
       */
      kind: "host_self_as_condition";
      hostId: string;
    }
  | { kind: "host_installed_trojan_on_attacked_ice" }
  | { kind: "host_program_on_ice"; programId: string; iceId: string }
  /**
   * Luana: may move `amount` player BP onto source as hosted; if so, `then`.
   */
  | { kind: "may_host_bad_publicity_then"; amount: number; then: Effect }
  /** Leaf: host amount player BP on source. */
  | { kind: "host_bad_publicity"; amount: number }
  /** Read-Write Share: may host 1 grip card facedown then draw 1. */
  | { kind: "may_host_one_from_grip_facedown_then_draw" }
  | { kind: "host_grip_card_facedown_then_draw"; cardId: string }
  /**
   * Madani: the Runner chooses any number of programs in the grip to host
   * faceup, not installed. `cardIds` is the engine's follow-up after the
   * pick; card data leaves it out.
   */
  | { kind: "host_all_programs_from_grip"; cardIds?: string[] }
  /** Paule's Café: may host 1 program or hardware from grip faceup. */
  | { kind: "may_host_one_program_or_hardware_from_grip_faceup" }
  | { kind: "host_grip_program_or_hardware_faceup"; cardId: string }
  | { kind: "host_hardware_on_icebreaker"; icebreakerId: string }
  | { kind: "host_non_virus_program_ignore_cost" }
  | { kind: "host_program"; cardId: string }
  /** The Underway (uw) */
  | { kind: "host_top_n_of_stack_facedown"; amount: number }
  | { kind: "host_up_to_3_from_grip_facedown" }
  /** Democracy and Dogma (dag) */
  | { kind: "host_on_scored_agenda" }
  | { kind: "host_on_rezzed_bioroid_ice_as_condition" }
  | { kind: "host_on_installed_resource_as_condition" }
  | {
      kind: "host_continue";
      cardIds: string[];
      returnRest?: string[];
    }
  | { kind: "host_one"; cardId: string }
  | { kind: "host_on_connection" }
  | { kind: "host_resolve"; cardId: string }
  | { kind: "host_on_agenda" }
  | { kind: "host_on_rezzed_ice_as_condition" }
  | { kind: "host_top_of_stack_on_source" }
  | { kind: "host_random_hq" }
  /** Leaf: host a specific stack card faceup on source (not installed). */
  | { kind: "host_stack_card_on_source"; cardId: string }
  /** Host a grip card with matching title faceup on source (not installed). */
  | { kind: "host_copy_from_grip"; title: string }
  | { kind: "host_ice_program_on_self"; cardId?: string }
  /**
   * DJ Fenris on-install: host a g-mod identity from the outside-game pile
   * that does not match the Runner identity's faction (CR 1.5.4 / 1.5.4a).
   * Mandatory — no decline. Fails closed when no legal candidate.
   */
  | {
      kind: "host_gmod_identity_from_outside_game";
      requireFactionMismatchWithRunnerIdentity?: boolean;
    }
  /** Leaf: host a specific outside-game g-mod identity on Fenris. */
  | {
      kind: "host_gmod_identity";
      cardId: string;
      requireFactionMismatchWithRunnerIdentity?: boolean;
    };
