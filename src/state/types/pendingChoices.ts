/** Open decisions the game waits on: traces, psi games, costs to pick, damage, tags and card choices. */

import type { Effect } from "../../effects/ir/effect.js";
import type { Action } from "./actions.js";
import type { DamageType, Side } from "./shared.js";
import type { ExpectedEffects } from "./windows.js";

export interface TraceState {
  id: string;
  sourceId: string;
  baseStrength: number;
  corpSpent: number;
  /**
   * Credits the Runner spent to raise link strength this attempt
   * (CR 10.8.3). Name kept for API stability.
   */
  runnerLinkSpent: number;
  onSuccess: Effect;
  onFailure?: Effect;
  /** Net Quarantine: this trace treats Runner base link as 0. */
  netQuarantineLinkZero?: boolean;
  /** Surveillance Sweep: the Runner spends for this trace before the Corp. */
  runnerSpendsFirst?: boolean;
  runnerSpendLocked?: boolean;
}

/** Cards a cost has its payer pick, and the action waiting on them. */
export interface PendingCost {
  action: Action;
  payer: Side;
  candidates: string[];
  count: number;
  picked: string[];
  /** What the cards are for, as "trash from HQ as a cost". */
  what: string;
  /** The other player may not see the candidates. */
  hidden: boolean;
  sourceId: string;
  /** The payer may stop at any number of picks. */
  anyNumber?: boolean;
  /** The action field the picks go in. Defaults to costCardIds. */
  into?: "costCardIds" | "trashFirstIds";
}

/** Interactive psi game (Adrian Seis; v0 sequential bids). */
export interface PsiState {
  id: string;
  sourceId: string;
  maxBid: number;
  runnerBid: number | null;
  corpBid: number | null;
  ifBidsDiffer: Effect;
  ifBidsMatch: Effect;
  /**
   * The Corp's "bid" is a guess, not a spend (Rigged Results: guess the
   * amount; Push Your Luck: guess even/odd, encoded 0=even, 1=odd).
   * A correct guess resolves ifBidsMatch; the Corp spends nothing.
   */
  corpGuess?: "amount" | "parity";
}

/** Opened for a `tag_interrupt` (Decoy-class avoid/prevent tags). */
export interface PendingTags {
  remaining: number;
  sourceId: string;
  /** Installed Runner cards when this interrupt window opened (CR 9.9.4d). */
  activeAtOpen?: string[];
  /** Live expected effects for this imminent tag instruction (CR 9.9.2). */
  expectedEffects?: ExpectedEffects;
}

/**
 * Opened for an `end_the_run_interrupt` (Lucky Charm-class). Corp card
 * ability attempted to end the run; interrupt may prevent it.
 */
export interface PendingEndTheRun {
  sourceId: string;
  /** True when the ETR came from a Corp card ability (subs count). */
  fromCorpCardAbility: boolean;
  /** Live expected effects for this imminent ETR instruction (CR 9.9.2). */
  expectedEffects?: ExpectedEffects;
}

/**
 * Opened for a `break_interrupt` (Tyr's Hand-class). A subroutine on
 * bioroid ice protecting a server would be broken; the Corp may rez an
 * eligible unrezzed upgrade and/or use a `break_interrupt` paid ability
 * (typically `[trash]`) to prevent it. `prevented` is set by the
 * `prevent_pending_subroutine_break` Effect IR leaf; the dispatcher then
 * finalizes (does not mark the subroutine broken) instead of completing it.
 */
export interface PendingSubroutineBreak {
  iceId: string;
  subIndex: number;
  prevented?: boolean;
  /** Live expected effects for this imminent break (CR 9.9.2). */
  expectedEffects?: ExpectedEffects;
}

/**
 * Remaining effects from a `seq` that paused on pendingDamage / pendingTags /
 * pendingChoice (Snare tag→damage chain; CR 9.1.2a).
 */
export interface PendingEffectContinuation {
  sourceId: string;
  /** Who pays and controls the effects, when not the source's side (a paid ability). */
  payerSide?: Side;
  effects: import("../../effects/ir/effect.js").Effect[];
  /** Runs after `effects`, including when this segment pauses again. */
  followedBy?: PendingEffectContinuation;
  /**
   * The reaction window open when this remainder was deferred: the rest of
   * a pending instance resolving in that window. It finishes before the
   * window's other instances, which finish before any outer instruction
   * (CR 9.2.8d, 9.11.3, 10.3.2).
   */
  windowId?: string;
}

export interface PendingDamage {
  type: DamageType;
  remaining: number;
  sourceId: string;
  /**
   * Runner may prevent by losing all remaining clicks (Mr. Hendrik).
   * When set, free `prevent_damage` is not offered — only
   * `prevent_damage_lose_all_clicks` (if clicks > 0) and `accept_damage`.
   */
  preventByLoseAllClicks?: boolean;
  /**
   * Opened for a `damage_interrupt` (AirbladeX-class). Free
   * `prevent_damage` is not offered — only interrupt paid abilities and
   * `accept_damage` (CR 9.9.3a / 9.9.5).
   */
  interruptPawOnly?: boolean;
  /**
   * Sources that already resolved a once-per-instance damage interrupt
   * (Prāna Condenser; CR 9.12.2b) for this pendingDamage open.
   */
  interruptUsedSourceIds?: string[];
  /**
   * Live expected effects for this imminent damage instruction (CR 9.9.2).
   * Updated as prevents resolve; interrupt relevance keys off this bag.
   */
  expectedEffects?: ExpectedEffects;
}

/** Corp chooses which program to trash (e.g. Rototurret). */
export interface PendingTrashProgram {
  sourceId: string;
  candidates: string[];
  /** Who chooses the card to trash (CR 1.14.5). */
  chooser?: "corp" | "runner";
  /** `false` when the text says the trash "cannot be prevented". */
  preventable?: false;
}

/** Corp resolves sabotage N by choosing HQ cards; remainder from R&D top (CR §10.12). */
export interface PendingSabotage {
  sourceId: string;
  amount: number;
  /** HQ cards the Corp has picked so far (CR 10.12.2). Corp-only. */
  picked?: string[];
}

/** Host chooses among effect IR options (Ballista, Funhouse, etc.). */
export interface PendingChoice {
  sourceId: string;
  chooser: Side;
  options: Array<{ id: string; label: string; effect: Effect }>;
  /** Corp names how many times a mandatory loop resolves (CR 10.1.6a). */
  loopCount?: boolean;
  /** What the chooser is deciding, when the options alone do not say. */
  prompt?: string;
  /**
   * The options name cards the other player may not see (HQ, the grip,
   * facedown cards in Archives). A public view for the other player lists
   * the options without their ids or labels.
   */
  hiddenFromOpponent?: boolean;
  /**
   * The other player may not learn how many options there are: a search of
   * a hidden deck offers one option per match, so their view shows a single
   * hidden option (CR 8.7.2e, 10.2.2b).
   */
  optionCountHidden?: boolean;
  /**
   * The other player is looking at the cards the options name, so their
   * view keeps the option ids and labels (Chronos Protocol looks at the
   * grip; CR 1.21.2).
   */
  shownToOpponent?: boolean;
  /**
   * The chooser is looking at or searching cards the other player may not
   * see. An option whose label names one of them is hidden from the other
   * player, and a choice opened while this one resolves is too
   * (CR 1.21.2, CR 8.7.1).
   */
  look?: boolean;
}

/**
 * Continuation for exclusive multi-choice scaled by ice passed this run
 * (Into the Depths). `pendingChoice` holds the current pick; after each
 * resolution (including nested charge/search choices), remaining unused
 * options are re-offered until `remaining` is 0.
 */
export interface PendingExclusiveChoices {
  sourceId: string;
  chooser: Side;
  options: Array<{ id: string; label: string; effect: Effect }>;
  remaining: number;
  usedIds: string[];
}
