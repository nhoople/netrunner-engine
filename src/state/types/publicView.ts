/** Side-filtered public views of the game for hosts. */

import type { GameState } from "./game.js";
import type { LingeringEffect } from "./lingering.js";
import type { PendingAbilityInstance } from "./pendingAbilities.js";
import type {
  PendingChoice,
  PendingDamage,
  PendingEffectContinuation,
  PendingEndTheRun,
  PendingExclusiveChoices,
  PendingSabotage,
  PendingTags,
  PendingTrashProgram,
  TraceState,
} from "./pendingChoices.js";
import type { RunState } from "./run.js";
import type { Server, ServerId } from "./servers.js";
import type { CardType, Side } from "./shared.js";
import type {
  PriorityWindowFrame,
  ReactionWindowFrame,
  TimingCursor,
} from "./windows.js";

/** Side-filtered public view for future online hosts. */
/** Face of a hosted card in a public seat view (CR 4.6.2 / 4.6.3 / 4.6.5g–h). */
export interface PublicHostedCardView {
  id: string;
  /** Null when facedown and the viewer does not control the card. */
  title: string | null;
  type: CardType | null;
  faceup: boolean;
  side: Side;
}

/** Lingering non-installed play-area card (ops/events/currents/lockdowns). */
export interface PublicPlayAreaCardView {
  id: string;
  title: string | null;
  type: CardType | null;
  faceup: boolean;
  side: Side;
  hostedCards: PublicHostedCardView[];
}

/** Set-aside zone entry (CR 4.8). Location always open; face by status. */
export interface PublicSetAsideCardView {
  id: string;
  title: string | null;
  type: CardType | null;
  faceup: boolean;
  side: Side;
  /**
   * Shared by facedown cards set aside by the same effect (CR 4.8.7).
   * Null/omitted when the card is faceup.
   */
  groupId?: string | null;
}

/** One reveal: the cards shown to all players (CR 1.21.3). */
export interface RevealEvent {
  /** Counts up through the game, so a host can tell new reveals apart. */
  seq: number;
  /** Whose cards were shown. */
  by: Side;
  sourceTitle: string;
  cards: Array<{ defId: string; title: string }>;
}

/** One look: the cards one player saw without showing them (CR 1.21.2). */
export interface LookEvent {
  /** Counts up through the game, so a host can tell new looks apart. */
  seq: number;
  /** The player who looked. */
  by: Side;
  sourceTitle: string;
  cards: Array<{ defId: string; title: string }>;
}

export interface PublicView {
  viewer: Side;
  /** Recent reveals, oldest first (CR 1.21.3). */
  reveals: RevealEvent[];
  /** What this viewer looked at, oldest first. The other player's looks are left out (CR 1.21.2). */
  looks: LookEvent[];
  turnNumber: number;
  activeSide: Side;
  timingKey: string;
  timing: TimingCursor;
  done: boolean;
  winner: Side | "draw" | null;
  winReason: GameState["winReason"];
  self: {
    clicks: number;
    credits: number;
    tags: number;
    coreDamage: number;
    link: number;
    maxHandSize: number;
    hand: string[];
    handCount: number;
    deckCount: number;
    discardPile: string[];
    scoreArea: string[];
    scorePoints: number;
    installed: string[];
    /**
     * Ice named by an installed card. Open to both players (CR 10.2.3b).
     */
    chosenIce: Array<{ cardId: string; iceId: string }>;
    /** Non-installed play-area partition (CR 4.6 / 8.6.x). */
    playArea: PublicPlayAreaCardView[];
    identityId: string;
  };
  opponent: {
    clicks: number;
    credits: number;
    tags: number;
    coreDamage: number;
    link: number;
    maxHandSize: number;
    handCount: number;
    /**
     * Grip cards, when a card says the grip is revealed (CR 10.2.3b).
     * Absent while the grip is hidden.
     */
    revealedHand?: string[];
    deckCount: number;
    discardPileFaceup: string[];
    scoreArea: string[];
    scorePoints: number;
    installed: string[];
    /**
     * Ice named by an installed card. Open to both players (CR 10.2.3b).
     */
    chosenIce: Array<{ cardId: string; iceId: string }>;
    /** Non-installed play-area partition (CR 4.6 / 8.6.x). */
    playArea: PublicPlayAreaCardView[];
    identityId: string;
  };
  /**
   * Shared set-aside zone (CR 4.8). Count and location always open;
   * facedown faces only for the controlling seat.
   */
  setAside: PublicSetAsideCardView[];
  /** Credits in the bad publicity fund (CR 10.6.2). Open to every seat. */
  badPublicityFund: number;
  servers: Array<{
    id: ServerId;
    kind: Server["kind"];
    ice: Array<{
      id: string;
      title: string | null;
      rezzed: boolean;
      strength: number | null;
      /** Open even when the ice face is hidden (CR 1.18.1, CR 10.2.3a). */
      advancementCounters: number | null;
      /** Credit counters on this ice. Open even when the face is hidden (CR 1.9.5a, CR 10.2.3a). */
      hostedCredits: number | null;
      /** Hosted cards under this ice (CR 4.6.5g/h). */
      hostedCards: PublicHostedCardView[];
    }>;
    root: Array<{
      id: string;
      title: string | null;
      rezzed: boolean;
      type: CardType | null;
      advancementCounters: number | null;
      /** Credit counters on this card. Open even when the face is hidden (CR 1.9.5a, CR 10.2.3a). */
      hostedCredits: number | null;
      /** Hosted cards under this root card (CR 4.6.5g/h). */
      hostedCards: PublicHostedCardView[];
    }>;
  }>;
  run: RunState | null;
  trace: TraceState | null;
  pendingDamage: PendingDamage | null;
  pendingTags: PendingTags | null;
  pendingEndTheRun: PendingEndTheRun | null;
  pendingEffectContinuation: PendingEffectContinuation | null;
  pendingTrashProgram: PendingTrashProgram | null;
  pendingSabotage: PendingSabotage | null;
  pendingChoice: PendingChoice | null;
  pendingExclusiveChoices: PendingExclusiveChoices | null;
  pendingStartRunOnMark: { sourceId: string } | null;
  pendingStartRun: {
    sourceId: string;
    serverId: ServerId;
    bypassFirstEncounterForClicks?: number;
    bonusAccess?: number;
    skipBreach?: boolean;
    onSuccessfulRunEffect?: import("../../effects/ir.js").Effect;
    onRunEndEffect?: import("../../effects/ir.js").Effect;
    hiredHelpAgendaTaxPaid?: boolean;
    forbidCorpRezIceDuringRun?: boolean;
    preventAllTagsThisRun?: boolean;
    rfgFirstNonAgendaAccess?: boolean;
    lastingRfgCopiesOnAccess?: boolean;
    /** Always Have a Backup Plan: ignore additional costs to run; bypass this ice. */
    backupPlanIgnoreAdditionalCosts?: boolean;
    backupPlanBypassIceId?: string;
  } | null;
  pendingScoreAgendaId: string | null;
  /** Ice awaiting rez after rezAdditionalCost (Valentão). */
  pendingRezCardId: string | null;
  markServerId: ServerId | null;
  /**
   * Pending conditional ability instances (CR 9.6.2), less the other
   * player's from a card this seat may not see (CR 10.2.2a).
   */
  pendingAbilities: PendingAbilityInstance[];
  /** Open reaction windows (CR 10.3.2 / 9.2.8). */
  reactionStack: ReactionWindowFrame[];
  /** Active lingering effects (CR 9.10.1). */
  lingeringEffects: LingeringEffect[];
  priorityStack: PriorityWindowFrame[];
  log: string[];
}
