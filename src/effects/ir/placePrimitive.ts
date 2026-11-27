/**
 * Effect IR: the `Primitive` members whose procedure is place.
 * Their handlers live in the area folders under `effects/`; the kind registry is `effects/coreKinds.ts`.
 * Part of the Effect IR in `effects/ir/`: import each name from the file that declares it.
 */
import type { Effect } from "./effect.js";

export type PlacePrimitive =
  /**
   * Printed “past N” overadvance (not Dividends): place
   * floor((advancements − past) / per) agenda counters at score begin.
   * `per` defaults to 1 (Project Atlas); Beale / Braintrust use per 2.
   */
  | {
      kind: "place_agenda_counters_past";
      past: number;
      per?: number;
    }
  | { kind: "place_hosted_credits"; amount: number }
  /** Surge: place virus on a program that received virus this turn. */
  | {
      kind: "place_virus_on_program_that_received_virus_this_turn";
      amount: number;
    }
  | { kind: "place_virus_on_program"; cardId: string; amount: number }
  /** Logjam: place base + distinct faceup Archives types advancements on self. */
  | {
      kind: "place_advancements_on_self_per_faceup_archive_types";
      base?: number;
    }
  | {
      kind: "place_advancements";
      amount: number;
      preferNotInstalledThisTurn?: boolean;
      /**
       * Only target advanceable cards in the same server root as the source
       * (Vladisibirsk City Grid). With `anyCard`, any card in that root.
       */
      sameServerRootAsSource?: boolean;
      /**
       * Any card in the targeted place, not only agendas and cards you can
       * advance. Placing a counter is not advancing (CR 1.18.2), so the
       * limit in CR 1.18.3 applies only when the text says "a card you can
       * advance" (La Costa Grid: "a card in the root of this server").
       */
      anyCard?: boolean;
      /**
       * Holo Man: target advanceable cards in the same server root OR ice
       * protecting that server.
       */
      sameServerRootOrIceAsSource?: boolean;
      /**
       * Isaac: only ice protecting the source upgrade's server with 0
       * advancement counters.
       */
      onlyIceProtectingSourceServerWithNoAdvancements?: boolean;
      /**
       * Cayambe Grid: any ice protecting the source upgrade's server.
       */
      onlyIceProtectingSourceServer?: boolean;
      /**
       * Holo Man: add this many extra advancements when Corp has not
       * installed from HQ this turn.
       */
      bonusAmountIfNoCorpInstallFromHqThisTurn?: number;
      /** Exclude the effect source from targets (default false). */
      excludeSelf?: boolean;
      /**
       * Target any installed ice (Tree Line expendable), not only
       * agendas / canAdvance cards.
       */
      anyInstalledIce?: boolean;
      /**
       * Jumon: any card in the root of a remote server (not ice / centrals).
       */
      onlyRemoteRoot?: boolean;
      /**
       * After placing, if the target can be scored, offer Corp a may-score
       * choice (Big Deal). `then` runs after the choice (or immediately when
       * scoring is impossible).
       */
      thenMayScore?: boolean;
      /** Continuation after place (and after thenMayScore choice, if any). */
      then?: Effect;
      /**
       * Kept for card data. The Corp always chooses the target when more
       * than one card qualifies (CR 1.15.2), with no Decline.
       */
      pick?: "choose";
      /** The Corp's pick, set by the engine; card data leaves it out. */
      targetId?: string;
      /** Push target into cannotScoreOrRezCardIds after placing. */
      cannotScoreTargetThisTurn?: boolean;
      /** Only unrezzed installed cards. */
      unrezzedOnly?: boolean;
      /** Dedication Ceremony: only faceup (rezzed / faceup) cards. */
      faceupOnly?: boolean;
    }
  /**
   * Queen's Gambit: place up to `max` advancements on 1 unrezzed card in a
   * remote root; gain `creditsPer`¢ per counter; that card cannot be accessed
   * for the remainder of the turn.
   */
  | {
      kind: "place_up_to";
      max: number;
      creditsPer: number;
    }
  /** Internal: place N advancements, gain credits, forbid access this turn. */
  | {
      kind: "place_on";
      cardId: string;
      amount: number;
      creditsPer: number;
    }
  | { kind: "place_event_credits"; amount: number }
  /** Place advancements on a specific card (Greasing the Palm follow-up). */
  | {
      kind: "place_advancements_on";
      cardId: string;
      amount: number;
      cannotScoreTargetThisTurn?: boolean;
      /**
       * The text says "advance" (Success), not "place": the card counts as
       * advanced (CR 1.18.1), which placing alone is not (CR 1.18.2).
       */
      advance?: boolean;
      then?: Effect;
    }
  | {
      kind: "place_advancements_on_up_to";
      amountEach: number;
      maxCards: number;
    }
  /** Internal follow-up for place_advancements_on_up_to. */
  | {
      kind: "place_advancements_on_up_to_continue";
      cardId: string;
      amountEach: number;
      remainingAfter: number;
      exclude: string[];
    }
  /**
   * Otoroshi: may place up to `maxAdvancements` on 1 remote-root card; if
   * you do, Runner accesses that card unless they pay `credits`.
   */
  | {
      kind: "may_place_up_to_advancements_on_remote_root_then_access_unless_pay";
      maxAdvancements: number;
      credits: number;
    }
  /** Leaf: place N advancements on cardId, then access unless pay. */
  | {
      kind: "place_advancements_then_access_unless_pay";
      cardId: string;
      amount: number;
      credits: number;
    }
  /** Internal: place 1 advancement on chosen installed ice then continue W2W. */
  | {
      kind: "place_adv_on_ice";
      cardId: string;
      remaining: number;
      used: string[];
      mustPick: boolean;
    }
  | {
      kind: "place_agenda_hq_or_rd_bottom";
      cardId: string;
      destination: "hq" | "rd_bottom";
    }
  /**
   * Flood the Market: choose 1 advanceable installed card; place 1 advancement
   * per remote that has a root card and is protected by ice.
   */
  | { kind: "place_advancements_per_iced_rooted_remote" }
  | { kind: "place_advancement_on_advanceable_installed" }
  | { kind: "place_advancement_on_advanceable_ice_protecting_this_server" }
  | { kind: "place_agenda_counter" }
  | { kind: "place_up_to_n_advancements_on_advanceable_installed"; max: number }
  | { kind: "place_advancement_on_another_on_advance"; amount: number }
  | { kind: "place_hq_on_top_rd_continue"; cardId: string }
  | { kind: "place_advancement_cannot_score_until_next_turn" }
  | { kind: "place_advancement_resolve"; cardId: string }
  | { kind: "place_info_sift_card_continue"; cardId: string; pile: "a" | "b" }
  | { kind: "place_advancements_on_forfeit"; agendaPoints?: number }
  | { kind: "place_one_then_choose"; cardId: string }
  | { kind: "place_advancement_on_root_of_this_server" }
  | { kind: "place_advancement_on_card"; cardId: string; amount?: number }
  | { kind: "may_place_advancement_on_self_meat" }
  | { kind: "place_advancement_on_self"; amount?: number }
  | { kind: "place_x_counters" }
  | { kind: "place_x_resolve"; amount: number }
  | { kind: "place_advancements_x_from_tags" }
  | {
      kind: "place_advancements_x_from_tags_resolve";
      cardId: string;
      amount: number;
    };
