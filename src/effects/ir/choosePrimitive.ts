/**
 * Effect IR: the `Primitive` members whose procedure is choose.
 * Their handlers live in the area folders under `effects/`; the kind registry is `effects/coreKinds.ts`.
 * Part of the Effect IR in `effects/ir/`: import each name from the file that declares it.
 */
import type { ChoiceOption, Effect } from "./effect.js";
import type { Primitive } from "./primitive.js";

export type ChoosePrimitive =
  /**
   * The Runner forfeits 1 agenda they choose; `then` resolves only if they
   * do ("if you do", Frame Job). With none to forfeit, nothing happens.
   */
  | { kind: "choose_forfeit_runner_scored_agenda"; then?: Effect }
  /** Kraken: Runner chooses server; Corp trashes 1 ice protecting it. */
  | { kind: "choose_server_corp_trash_ice_protecting" }
  /**
   * Follow-up the engine builds while a player picks cards one at a time
   * from a zone they can look at (CR 1.15.2). `picked` holds the cards
   * chosen so far. When `count` cards are picked, or the player stops an
   * `upTo` pick, all picked cards move at once for `purpose`, then `then`
   * resolves. Card data does not author this kind.
   */
  | {
      kind: "choose_cards";
      chooser: "corp" | "runner";
      candidates: string[];
      count: number;
      upTo?: boolean;
      picked: string[];
      purpose:
        | "discard_to_hand_size"
        | "trash_hq"
        | "reveal_trash_hq"
        | "archives_to_hq"
        | "shuffle_archives_to_rd"
        | "shuffle_hq_to_rd"
        | "trash_grip"
        | "shuffle_grip_to_stack"
        | "resume";
      /**
       * For `resume`: the instruction that takes the picked cards as its
       * `cardIds`, and the words that finish "Choose a card to ...".
       */
      resume?: Primitive;
      label?: string;
      /** The other player sees the cards on offer (they are revealed or open). */
      open?: boolean;
      /**
       * A search of a hidden deck with criteria (CR 8.7.2e): the searcher is
       * asked for up to `count` cards even when nothing matches, may find
       * nothing, and the other player does not see what is on offer, so
       * whether a match exists stays hidden (CR 10.2.2b). Implies `upTo`.
       */
      search?: boolean;
      /**
       * Titles of the picks: `distinct`, each a different title ("up to X
       * different sysops (by title)", Recruiting Trip); `same`, every pick
       * the first pick's title ("copies of a card", Localized Product Line).
       */
      titles?: "distinct" | "same";
      then?: Effect;
    }
  /**
   * Choose a rezzed bioroid ice; set cannotBreakWithRunnerCardAbilities on it
   * (Trieste Model Bioroids).
   */
  | { kind: "choose_rezzed_bioroid_forbid_runner_break" }
  /**
   * Peeping Tom: Corp chooses a card type, reveal grip, then for the
   * remainder of the run this ice gains N × end the run unless the Runner takes 1 tag
   * (N = revealed cards of chosen type). Empty printed subs.
   */
  | { kind: "choose_type_reveal_gain_etr_unless_tag_for_run" }
  /**
   * Hangeki: Corp chooses 1 installed card; Runner may access it (out-of-run
   * access-a-card fidelity) or decline. onAccess / onDecline branch.
   */
  | {
      kind: "choose_installed_runner_may_access";
      onAccess: Effect;
      onDecline: Effect;
    }
  /**
   * Helpful AI: choose an installed icebreaker; it gains `amount` strength
   * this turn.
   */
  | { kind: "choose_icebreaker_gain_strength_this_turn"; amount: number }
  /**
   * Cortez Chip: choose installed ice; that ice costs `amount` more to rez
   * until end of turn.
   */
  | { kind: "choose_ice_additional_rez_cost_this_turn"; amount: number }
  | { kind: "choose_lycian_subtypes" }
  /**
   * Choose 1 card the chooser can already see, then resolve `then` with
   * `"$chosen"` replaced by that card's id (CR 1.15.2, 1.15.4).
   * A hidden zone is not a choice — looking is CR 1.21.2.
   * No valid card: `then` does not act on a target (CR 1.15.3).
   */
  | {
      kind: "choose_card";
      chooser: "corp" | "runner";
      zone:
        | "hq"
        | "grip"
        | "installed"
        | "heap"
        | "archives"
        | "corp_score"
        | "runner_score"
        /** Installed Corp cards in the root of a remote server (CR 1.15.2c). */
        | "remote_root";
      cardType?: string;
      /** Only rezzed cards (Unregistered S&W '35). */
      rezzedOnly?: boolean;
      /**
       * Only cards with at least one of these subtypes. A card the chooser
       * cannot see never matches, so the filter reveals nothing (CR 1.21.2).
       */
      includeSubtypes?: string[];
      /** Offer a decline. The decline does not resolve `then`. */
      optional?: boolean;
      then: Effect;
    }
  /** Sunset: choose a server and rearrange its ice. */
  | { kind: "choose_server_rearrange_ice" }
  /** Commercialization: choose ice; gain ¢ equal to its advancements. */
  | { kind: "choose_ice_gain_credits_per_advancement" }
  /**
   * Chimera: choose exactly one of sentry / code gate / barrier until
   * derezzed (tracked via lycianGainedSubtypes).
   */
  | { kind: "choose_one_subtype_until_derez" }
  /** Internal: Corp chooses the single remote for Fast Break installs. */
  | { kind: "choose_remote"; remaining: number }
  /**
   * Choose exactly N distinct options (Bahia Bands). Uses
   * `pendingExclusiveChoices` like exclusive_choices_per_passed_ice.
   */
  | { kind: "choose_exactly_n"; n: number; options: ChoiceOption[] }
  /**
   * Engram Flush onEncounter: Corp chooses a Runner card type for the
   * remainder of the encounter.
   */
  | { kind: "choose_card_type_for_encounter" }
  /**
   * Konjin: Corp may choose another rezzed ice; Runner encounters it, then
   * resumes this ice's encounter if still rezzed.
   */
  | { kind: "may_choose_other_rezzed_ice_encounter_then_resume_source" }
  /**
   * Climactic Showdown: Runner chooses an iced server; Corp may trash 1 ice
   * protecting it; if they do not, first HQ/R&D breach this turn +2 access.
   */
  | { kind: "may_corp_choose_climactic_server_trash_ice_else_bonus_access" }
  | { kind: "choose_install_cost_set_aside_access_shuffle" }
  /** Paintbrush: the Runner chooses a rezzed piece of ice. */
  | { kind: "choose_ice_gain_subtype" }
  | { kind: "choose_jinteki_biotech_face"; faceId: string }
  | { kind: "choose_subtype_for_encounter" }
  | { kind: "choose_patron_server" }
  | { kind: "choose_turning_wheel_central_bonus_access" }
  | { kind: "choose_breaker_run"; strengthBonus?: number }
  | {
      kind: "choose_severnius_grip_cards";
      remaining: number;
      trashed: number;
      cardIds: string[];
    }
  | { kind: "choose_syn_attack_discard"; remaining: number; cardId?: string }
  | { kind: "choose_remote_card_cannot_rez_this_turn" }
  | { kind: "choose_hq"; cardId: string; restIds: string[] }
  | { kind: "choose_rezzed_ice_gain_subs_subtypes_for_run" }
  | { kind: "choose_x_and_load_power" }
  | { kind: "choose_n_grip_to_stack_top"; count?: number }
  | {
      kind: "choose_n_grip_to_stack_top_continue";
      selected: string[];
      remaining: number;
    }
  | { kind: "choose_type" }
  | { kind: "choose_jua_two_bounce_one" }
  | { kind: "choose_malia_resource" }
  | { kind: "choose_card_type_reveal_stack_top" }
  | { kind: "choose_exploratory_romp_card"; amount: number }
  /**
   * Touch-ups: Corp chooses a card type; Runner shuffles up to 2 grip cards
   * of that type into the stack.
   */
  | { kind: "choose_type_shuffle_grip"; maxCards: number }
  /**
   * Gantulga: may name a server (stored on source.namedServerId) for the
   * remainder of the game until renamed.
   */
  | { kind: "may_choose_server" }
  /**
   * Hyoubu Precog Manifold: mandatory Corp choose a server → chosenServerId.
   */
  | { kind: "choose_server" }
  /** Cyber-Cypher: Runner chooses a server on install → chosenServerId. */
  | { kind: "choose_server_runner" }
  | {
      kind: "choose_next_design_server";
      cardId: string;
      remaining: number;
      usedServerIds: string[];
      thenDrawToHq: number;
    }
  /**
   * Pelangi: choose barrier / code gate / sentry; grant to encountered ice
   * for the remainder of this encounter.
   */
  | { kind: "choose_grant_encounter_ice_subtype" };
