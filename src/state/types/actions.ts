/** Actions a seat sends, and what applying one returns. */

import type { GameState } from "./game.js";
import type { RuleCite } from "./restrictions.js";
import type { ServerId } from "./servers.js";

export type InstallDestination =
  | { kind: "new_remote" }
  | { kind: "remote_root"; serverId: ServerId }
  | { kind: "protect"; serverId: ServerId }
  | { kind: "installed" }
  | { kind: "host_ice"; iceId: string }
  | { kind: "host_card"; hostId: string }
  /** Awakening Center: install bioroid ice hosted on this upgrade, free. */
  | { kind: "host_upgrade"; hostId: string };

export type Action =
  | { type: "pass_window" }
  /** CR 1.6.6a — keep the dealt starting hand (opening mulligan window). */
  | { type: "keep_starting_hand" }
  /** CR 1.6.6a — shuffle starting hand into deck and draw a new one (once). */
  | { type: "mulligan" }
  | { type: "basic_gain_credit" }
  | {
      type: "basic_trash_resource";
      cardId: string;
      /** The HQ card trashed for an additional cost, when one applies. */
      costCardIds?: string[];
    }
  | { type: "basic_draw" }
  | {
      type: "basic_install";
      cardId: string;
      destination: InstallDestination;
      /** Patchwork: trash this grip card to discount the install. */
      trashGripForDiscountCardId?: string;
      /**
       * Corp: ask which cards already in the destination to trash first
       * (CR 8.5.6a, 8.5.6b). Without it only the asset or agenda that must
       * go is trashed.
       */
      trashFirst?: boolean;
      /** Corp: the cards in the destination trashed first. */
      trashFirstIds?: string[];
    }
  | { type: "basic_run"; serverId: ServerId }
  | { type: "basic_remove_tag" }
  /** CR 5.2.6h — {click}{click}{click}: Purge virus counters. */
  | { type: "basic_purge_virus" }
  | { type: "play_operation"; cardId: string }
  | {
      type: "play_event";
      cardId: string;
      serverId?: ServerId;
      /** Patchwork: trash this grip card to discount the play. */
      trashGripForDiscountCardId?: string; /** The grip cards trashed for an additional cost to play (Moshing). */
      costCardIds?: string[];
    }
  | { type: "advance"; cardId: string }
  | { type: "score_agenda"; cardId: string }
  | {
      type: "rez_ice";
      cardId: string;
      /** The agenda forfeited or the ice derezzed for an additional rez cost. */
      costCardIds?: string[];
    }
  | {
      type: "break_subroutine";
      breakerId: string;
      subIndex: number;
    }
  | {
      /** Spend [click] to break a subroutine on bioroid ice (card text). */
      type: "break_bioroid_subroutine";
      subIndex: number;
    }
  | {
      /**
       * Bioroid 2.0-class: spend [click] × N to break up to N subroutines
       * on this bioroid in one paid ability (Heimdall/Ichi/Viktor 2.0).
       */
      type: "break_bioroid_subroutines";
      subIndexes: number[];
    }
  | {
      type: "use_paid_ability";
      cardId: string;
      abilityId: string;
      serverId?: ServerId;
      /**
       * The cards the payer trashes or forfeits for this cost. Left out, the
       * engine asks the payer when there is more than one way to pay
       * (CR 1.16.1).
       */
      costCardIds?: string[];
    }
  | { type: "use_identity_ability"; abilityId: string }
  | { type: "continue_run" }
  | { type: "jack_out" }
  | { type: "access_card"; cardId: string }
  | { type: "steal_agenda"; cardId: string }
  | { type: "trash_accessed"; cardId: string }
  | {
      /** Salsette Slums: pay trash cost to RFG accessed card (once per turn). */
      type: "access_rfg_paying_trash_cost";
      cardId: string;
      slumsId: string;
    }
  | { type: "finish_access" }
  | { type: "finish_breach" }
  | {
      /** Carnivore: trash N from grip to trash the accessed card. */
      type: "access_trash_from_grip";
    }
  | {
      /** Imp: spend 1 virus counter to trash the accessed card. */
      type: "access_trash_with_virus";
      cardId: string;
    }
  | {
      type: "access_trash_free";
      cardId: string;
    }
  | { type: "accept_expose" }
  | { type: "accept_installed_trash" }
  | { type: "trigger_pending_trash_interrupt"; cardId: string }
  | {
      /**
       * Lampades: spend 1 power + pay printed rez/play cost from stealth
       * to trash the accessed card.
       */
      type: "access_trash_paying_printed_cost_from_stealth";
      cardId: string;
      lampadesId: string;
    }
  | {
      /** Gourmand: trash self to trash accessed non-agenda, then draw 1. */
      type: "access_trash_self_non_agenda_draw";
      cardId: string;
      gourmandId: string;
    }
  | {
      /** Cupellation: pay credits to host the accessed non-agenda faceup. */
      type: "access_host_non_agenda_faceup";
      cardId: string;
    }
  | {
      /** Film Critic: host accessed agenda on this resource. */
      type: "access_host_agenda_on_film_critic";
      cardId: string;
      hostId: string;
    }
  | { type: "boost_trace"; credits: number }
  | { type: "spend_link"; amount: number }
  | { type: "resolve_trace" }
  | { type: "psi_runner_bid"; amount: number }
  | { type: "psi_corp_bid"; amount: number }
  | { type: "prevent_damage"; amount: number }
  /** Prevent pending damage by losing all remaining clicks (Mr. Hendrik). */
  | { type: "prevent_damage_lose_all_clicks" }
  | { type: "accept_damage" }
  | { type: "accept_tags" }
  | { type: "accept_end_the_run" }
  | { type: "choose_trash_program"; cardId: string }
  | {
      /** Resolve pending sabotage: trash these HQ cards; remainder from R&D top. */
      type: "resolve_sabotage";
      hqCardIds: string[];
    }
  | { type: "choose_option"; optionId: string }
  | {
      type: "rez_asset";
      cardId: string;
      /** The agenda forfeited for an additional rez cost. */
      costCardIds?: string[];
    }
  /**
   * The discard step (CR 5.5.4). `cardIds` names the cards to discard when
   * the hand is over its maximum; without it the engine asks the player
   * to choose them (CR 5.5.4c).
   */
  | { type: "discard_to_hand_size"; cardIds?: string[] };

/** Host intent — same as Action for the pure library API. */
export type Intent = Action;

export type ApplyResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string; cites: RuleCite[] };
