/**
 * Effect IR: the `Primitive` members whose procedure is resolve.
 * Their handlers live in the area folders under `effects/`; the kind registry is `effects/coreKinds.ts`.
 * Part of the Effect IR in `effects/ir/`: import each name from the file that declares it.
 */
import type { Effect } from "./effect.js";

export type ResolvePrimitive =
  /**
   * Follow-up the engine builds while a reaction window asks which pending
   * ability its controller triggers next (CR 9.2.8d). Not for card data.
   */
  | { kind: "resolve_pending_ability"; pendingId: string }
  /**
   * Burner: reveal N random HQ cards; Runner moves `move` of them to
   * top and/or bottom of R&D (interactive).
   */
  | { kind: "resolve_burner"; reveal: number; move: number }
  /**
   * Wizard's Chest: choose type → set aside until `untilCount` of that type →
   * may install 1 ignoring costs → shuffle rest.
   */
  | {
      kind: "resolve_wizard_chest";
      untilCount: number;
      ignoreAllCosts: boolean;
    }
  /**
   * Moon Pool aftermath after trashSelf cost: RFG self; trash up to N from HQ;
   * reveal up to M facedown Archives cards and shuffle them into R&D; for each
   * agenda revealed, place 1 advancement on an advanceable installed card.
   */
  | {
      kind: "resolve_moon_pool";
      trashHqMax: number;
      revealArchivesMax: number;
      /** Set by the engine as the Corp's picks come in; not authored. */
      step?: "trash" | "reveal" | "advance";
      cardIds?: string[];
      agendasLeft?: number;
    }
  /**
   * Simulation Reset: trash up to `trashHqMax` from HQ; shuffle that many
   * from Archives into R&D; draw that many; remove source from the game.
   */
  | {
      kind: "resolve_simulation_reset";
      trashHqMax: number;
      /** Set by the engine as the Corp's picks come in; not authored. */
      step?: "trash" | "shuffle";
      cardIds?: string[];
      trashed?: number;
    }
  /**
   * Deep Dive: set aside top `setAside` of R&D faceup; access up to
   * `initialAccess` (then may spend clicks for more — auto spends available
   * clicks up to set-aside size); shuffle remainder into R&D.
   */
  | {
      kind: "resolve_deep_dive";
      setAside?: number;
      initialAccess?: number;
    }
  | { kind: "resolve_meeting_of_minds"; subtype: string }
  /** Gachapon: set aside top 6; may install program/virtual −2; shuffle 3; RFG rest. */
  | { kind: "resolve_gachapon" }
  /** Leaf: gain rez cost and derez one ice, then the rest. */
  | { kind: "resolve_realloc"; iceIds: readonly string[] }
  | { kind: "resolve_mutate_operation" }
  | { kind: "resolve_will_o_wisp" }
  /** Follow-up: trash chosen breaker used this run (Will-o'-the-Wisp). */
  | { kind: "resolve_will_o_wisp_breaker"; cardId: string }
  | { kind: "resolve_wendigo_ban_program"; programId: string }
  | { kind: "resolve_supplier_host"; cardId: string }
  | {
      /**
       * "If your trace strength is N or greater, …": checked when the trace
       * is determined, successful or not (CR 10.8.5). Built by the engine.
       */
      kind: "resolve_if_trace_strength_at_least";
      min: number;
      then: Effect;
    }
  | { kind: "resolve_subroutine_on_rezzed_ice_protecting_this_server" }
  | { kind: "resolve_early_premiere"; cardId: string }
  | { kind: "resolve_back_channels"; cardId: string }
  | {
      kind: "resolve_worlds_plaza";
      cardId: string;
      discount: number;
    }
  | { kind: "resolve_when_scored_on_scored_agenda" }
  | { kind: "resolve_product_recall"; cardId: string }
  | { kind: "resolve_political_graffiti_host"; agendaId: string }
  | { kind: "resolve_sensie_add_hq_to_bottom_rd"; cardId: string }
  | { kind: "resolve_puppet_master_place"; cardId: string }
  | { kind: "resolve_two" }
  | { kind: "resolve_the_shadow_net_play"; cardId: string }
  | { kind: "resolve_trash"; amount: number }
  | { kind: "resolve_reeducation"; cardIds: string[] }
  | {
      kind: "resolve_biased_reporting";
      cardType: "resource" | "hardware" | "program";
    }
  | { kind: "resolve_transparency_initiative_host"; agendaId: string }
  | { kind: "resolve_assimilator_faceup"; cardId: string }
  | { kind: "resolve_wake_up_call"; cardId: string }
  | { kind: "resolve_jua_bounce"; cardId: string }
  | { kind: "resolve_threat_assessment"; cardId: string }
  | { kind: "resolve_marathon" }
  | { kind: "resolve_knobkierie_place_virus"; cardId: string }
  | { kind: "resolve_tempus" }
  | { kind: "resolve_contaminate"; cardId: string }
  | { kind: "resolve_gebrselassie_host"; cardId: string }
  | { kind: "resolve_intake_bounce"; cardId: string }
  | { kind: "resolve_diversion_of_funds"; loseAmount: number }
  | {
      kind: "resolve_trade_in";
      /** Filled by the stack search pick. */
      cardIds?: string[];
    }
  | { kind: "resolve_account_siphon"; loseAmount: number }
  /**
   * Choose which breach replacement applies first (CR 9.9.11a).
   * `security_testing` skips the other replacement.
   * `account_siphon` applies Account Siphon and skips Security Testing.
   * `showing_off_first` keeps the breach expected, then Security Testing replaces it.
   * `security_testing_first` applies Security Testing, then Showing Off does not.
   */
  | {
      kind: "resolve_breach_replacement";
      mode:
        | "security_testing"
        | "account_siphon"
        | "showing_off_first"
        | "security_testing_first";
    }
  | { kind: "resolve_vamp"; spendAmount: number }
  | { kind: "resolve_bioroid_subroutine" }
  /**
   * Follow-up of may_resolve_subroutine_on_rezzed_ice: resolve subroutine
   * `subIndex` of `iceId` as that ice's own (its source is that ice).
   */
  | { kind: "resolve_ice_subroutine"; iceId: string; subIndex: number }
  /**
   * Mycoweb: resolve 1 subroutine on another rezzed ice matching `subtype`.
   */
  | {
      kind: "may_resolve_subroutine_on_rezzed_ice";
      subtype: string;
      excludeSelf?: boolean;
    }
  /**
   * Spark of Inspiration: set aside top of stack faceup until a program
   * (or deck empty); may install that program paying `discount`¢ less;
   * shuffle remaining set-aside into stack.
   */
  | { kind: "resolve_spark_of_inspiration"; discount?: number }
  /**
   * Fully Operational: choose gain 2¢ or draw 2; repeat for each iced rooted
   * remote (plus the initial resolve).
   */
  | { kind: "resolve_fully_operational" };
