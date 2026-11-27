/**
 * Trashing (CR 1.19). The one procedure that moves a card to its owner's
 * discard pile because it was trashed.
 *
 * `trashCard(state, id, { by, cause })` handles both sides:
 *
 * - A Runner card goes to the heap faceup (CR 4.4.7a). An installed program,
 *   piece of hardware or resource first opens the Runner's trash-interrupt
 *   window (CR 9.9.4c, Sacrificial Construct), unless the trash is a cost
 *   (CR 1.16.1a: optional interrupts cannot cancel paying a cost). Skorpios
 *   may remove it from the game instead.
 * - A Corp card goes to Archives, faceup only if the Runner could see it when
 *   it was trashed (CR 4.4.6b). "Cannot be trashed" abilities and Marilyn
 *   Campaign / Director Haas replacements run first.
 * - Every trash ends the card's own host relationship (CR 1.13.12), ends the
 *   pending instances whose source left play (CR 9.6.10), and fires the
 *   trash triggers ("when trashed", first trash each turn, "whenever the
 *   Runner trashes").
 * - Cards hosted on the trashed card are not moved here. They keep their
 *   link, and the checkpoint trashes them at CR 10.3.1g (CR 1.13.13).
 * - `cause: "checkpoint"` is a trash no player carries out (CR 10.3.1d–g):
 *   no prevention (CR 1.13.13: it cannot be prevented), no "a player
 *   trashes" condition, but the card's own "when trashed" ability is noted
 *   for the next checkpoint (CR 9.6.13c, 10.3.1a).
 *
 * `by` is the player who carries out the trash: the controller of the
 * ability, unless its text names the other player (CR 1.14.5). Conditions
 * that care who trashed a card read it, not whose turn it is (CR 1.14.5a).
 *
 * A discard is not a trash (CR 1.19.3): `discardCard` moves a card to the
 * discard pile with no trash triggers and no prevention.
 */
import { log } from "../setupAndEnd/createGame.js";
import { CR } from "../../timing/labels.js";
import type { CardInstance, GameState, RuleCite } from "../types.js";
import { removeCardFromCurrentZone } from "../turnAndActions/scoring.js";
import { endEffectsOnPreviousObject } from "../turnAndActions/turn.js";
import { cancelPendingIfSourceInactive } from "../triggers/pendingAbilities.js";
import { maybeOpenTrashPrevent } from "./trashPrevent.js";
import { onInstalledProgramTrashed } from "../cardFlags/staticFlags.js";
import {
  fireOnUninstall,
  noteRunnerCardTrashedToHeap,
  noteRunnerInstalledCardTrashing,
  offerSkorpiosRfgInsteadOfHeap,
  recomputeRunnerLink,
} from "./trashHooks.js";
import {
  corpTrashRefused,
  maybeFireThreatOnTrash,
  noteCorpCardTrashedToArchives,
} from "../../effects/corpTrash.js";
import { noteStoredConditional } from "../triggers/storedConditionalHooks.js";
import { noteInlineConditional } from "../triggers/inlineConditionalHooks.js";
import { abilitiesSuppressed } from "../continuous/abilities.js";
import { noteStoredConditionals } from "../triggers/storedConditionalHooks.js";
import { checkpointAfterInstruction } from "../../legality/checkpoints.js";
import { shuffleInPlace } from "../rng.js";
import { recomputeRunnerMaxHandSize } from "../continuous/handSize.js";
import { unhostCard } from "./host.js";
import { runnerSeesAccessedCard } from "../visibility/seatVisibility.js";

export type TrashBy = "corp" | "runner";

/** Why the card is trashed. Only `checkpoint` changes the procedure. */
export type TrashCause =
  "ability" | "cost" | "access" | "damage" | "rule" | "checkpoint";

export interface TrashOptions {
  /**
   * The player who carries out the trash (CR 1.14.5). `null` or omitted: no
   * player is recorded, so no "the Runner trashes" condition is met.
   */
  by?: TrashBy | null;
  cause?: TrashCause;
  /**
   * A Corp card's face in Archives when the procedure sets it, not the
   * Runner's view: the install-time trash keeps the installed face (CR 8.5.7),
   * and sabotage trashes facedown (CR 10.12.2a). Omitted: CR 4.4.6b.
   */
  faceup?: boolean;
  /**
   * One card of a set trashed simultaneously, whose caller marks the
   * "whenever the Runner trashes" triggers for the whole set: one instance
   * per card for Hostile Infrastructure, one for Warroid Tracker
   * (CR 9.12.2a, 9.1.8g). The card's own trash triggers still fire here.
   */
  simultaneousSet?: boolean;
  /**
   * `false` when the text says the trash "cannot be prevented": no trash
   * interrupt window opens.
   */
  preventable?: boolean;
  /** For `cause: "checkpoint"`: the checkpoint step, for the log. */
  cite?: RuleCite;
  /** For `cause: "checkpoint"`: appended to the log line (" for uniqueness"). */
  why?: string;
}

/**
 * The controller of the ability whose source is `sourceId`, who carries out
 * its trashes unless its text names the other player (CR 1.14.5).
 */
export function controllerOf(
  state: GameState,
  sourceId: string,
): TrashBy | null {
  return state.cards[sourceId]?.side ?? null;
}

/** Trash `cardId` (CR 1.19.1). See the module comment. */
export function trashCard(
  state: GameState,
  cardId: string,
  options: TrashOptions = {},
): void {
  const card = state.cards[cardId];
  if (!card) return;
  if (options.cause === "checkpoint") {
    trashByCheckpoint(
      state,
      card,
      options.cite ?? CR.checkpointHostedOnUninstalled,
      options.why ?? "",
    );
    return;
  }
  if (card.side === "runner") {
    trashRunnerCard(
      state,
      card,
      options.cause === "cost" || options.preventable === false,
      options.by ?? null,
    );
  } else {
    trashCorpCard(
      state,
      card,
      options.by ?? null,
      options.faceup,
      options.simultaneousSet ?? false,
    );
  }
}

/**
 * Discard `cardId` (CR 1.19.3, 4.4.1): it goes to its owner's discard pile,
 * with no trash prevention and no trash triggers. A Corp card is faceup in
 * Archives only if the Runner could see it (CR 4.4.6b).
 */
export function discardCard(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  const faceup =
    card.side === "runner" ? true : visibleToRunnerBeforeMove(state, card);
  unhostCard(state, cardId);
  removeCardFromCurrentZone(state, cardId);
  endEffectsOnPreviousObject(state, cardId);
  placeInDiscardPile(state, card, faceup);
}

/**
 * Put a card that has already left its zone into its owner's discard pile,
 * with the face the caller decided (CR 4.4.6b, 4.4.7b).
 * Used by every placement in this module (trash, discard, checkpoint).
 */
function placeInDiscardPile(
  state: GameState,
  card: CardInstance,
  faceup: boolean,
): void {
  const pile =
    card.side === "runner" ? state.runner.discardPile : state.corp.discardPile;
  if (!pile.includes(card.id)) pile.push(card.id);
  card.zone = card.side === "runner" ? "runner:heap" : "corp:archives";
  card.faceup = faceup;
  card.rezzed = false;
}

/**
 * The Runner sees a card they are accessing or accessed this breach, a
 * rezzed card, and a faceup card outside HQ and R&D. A card in HQ or R&D is
 * hidden even if it was revealed earlier (CR 1.21.3, 4.4.6b, 7.1.2, 7.3.1a).
 */
function visibleToRunnerBeforeMove(
  state: GameState,
  card: CardInstance,
): boolean {
  if (runnerSeesAccessedCard(state, card.id)) return true;
  // A card still revealed by the resolving ability, or one the Runner is
  // looking at, is visible to them (CR 1.21.6, 1.21.2).
  if (card.revealing || card.lookedBy === "runner") return true;
  if (card.zone === "corp:hq" || card.zone === "corp:rd") return false;
  return Boolean(card.rezzed) || Boolean(card.faceup);
}

function trashRunnerCard(
  state: GameState,
  card: CardInstance,
  noInterrupt: boolean,
  by: TrashBy | null,
): void {
  const cardId = card.id;
  const fromZone = card.zone;
  const wasInstalled =
    fromZone === "runner:installed" || state.runner.installed.includes(cardId);
  if (!noInterrupt && maybeOpenTrashPrevent(state, cardId, by)) return;
  if (wasInstalled) noteRunnerInstalledCardTrashing(state, card, by);
  unhostCard(state, cardId);
  removeCardFromCurrentZone(state, cardId);
  endEffectsOnPreviousObject(state, cardId);
  // CR 9.6.10: still-pending instances for this source die when it leaves
  // play (including turn-begin leftovers on the bag; CR 9.6.5d). Scoped to
  // cardId so other cards' pendings (and later on-trash triggers for this
  // card) are untouched.
  cancelPendingIfSourceInactive(state, (inst) => inst.sourceId !== cardId);
  if (wasInstalled && card.type === "program") {
    trashCardsThatTrashWhenAProgramIs(state);
  }
  // Nanuq-class: uninstall → RFG instead of heap.
  if (wasInstalled && card.rfgOnUninstall) {
    removeFromGame(state, card);
    log(
      state,
      `${card.title} removed from the game on uninstall (CR ${CR.trashing.number}).`,
    );
    fireOnUninstall(state, card);
    return;
  }
  if (wasInstalled && card.onUninstall) fireOnUninstall(state, card);
  if (offerSkorpiosRfgInsteadOfHeap(state, card, fromZone, wasInstalled)) {
    return;
  }
  arriveInHeap(state, card, fromZone, wasInstalled, by);
}

function arriveInHeap(
  state: GameState,
  card: CardInstance,
  fromZone: string,
  wasInstalled: boolean,
  by: TrashBy | null = null,
): void {
  placeInDiscardPile(state, card, true);
  noteRunnerCardTrashedToHeap(state, card, fromZone, wasInstalled, by);
}

function removeFromGame(state: GameState, card: CardInstance): void {
  card.zone = "removed-from-game";
  card.faceup = true;
  if (!state.removedFromGame.includes(card.id)) {
    state.removedFromGame.push(card.id);
  }
}

/** Skorpios chose the destination of a trashed Runner card (CR 9.1.8b). */
export function resolveSkorpiosTrash(state: GameState, optionId: string): void {
  const pending = state.turn.pendingSkorpiosTrash;
  if (!pending) return;
  state.turn.pendingSkorpiosTrash = undefined;
  const card = state.cards[pending.cardId];
  if (!card) return;
  if (optionId.startsWith("skorpios-rfg:")) {
    state.turn.skorpiosRfgUsedThisTurn = true;
    removeFromGame(state, card);
    const idCard = state.cards[state.corp.identityId];
    log(
      state,
      `${idCard?.title ?? "Skorpios"} removes ${card.title} from the game instead of adding it to the heap.`,
    );
    log(
      state,
      `${card.title} is not active (CR ${CR.abilityActiveInZone.number}).`,
    );
    return;
  }
  arriveInHeap(state, card, pending.fromZone, pending.wasInstalled);
}

/**
 * Cards that trash themselves when an installed program is trashed
 * (`trashSelfWhenInstalledProgramTrashed`). Their own ability trashes them,
 * so the Runner does (CR 1.14.5).
 */
function trashCardsThatTrashWhenAProgramIs(state: GameState): void {
  const before = new Set(state.runner.installed);
  onInstalledProgramTrashed(state, (id) => {
    if (!before.has(id)) return;
    trashCard(state, id, { by: "runner" });
  });
}

function trashCorpCard(
  state: GameState,
  card: CardInstance,
  trashedBy: TrashBy | null,
  faceupOverride: boolean | undefined,
  simultaneousSet: boolean,
): void {
  const cardId = card.id;
  const wasRezzed = Boolean(card.rezzed);
  const printedRez = card.rezCost ?? null;
  const zoneBefore = card.zone;
  const faceup = faceupOverride ?? visibleToRunnerBeforeMove(state, card);
  const refused = corpTrashRefused(state, cardId, trashedBy);
  if (refused) {
    log(state, refused);
    return;
  }
  maybeFireThreatOnTrash(state, cardId, trashedBy);
  const origin = {
    trashedBy,
    zoneBefore,
    wasRezzed,
    printedRez,
    simultaneousSet,
  };
  // Marilyn Campaign: when would be trashed, may shuffle into R&D instead.
  if (card.mayShuffleIntoRdWhenTrashed && card.rezzed) {
    unhostCard(state, cardId);
    removeCardFromCurrentZone(state, cardId);
    endEffectsOnPreviousObject(state, cardId);
    // CR 9.6.10: still-pending instances for this source die when it leaves play.
    cancelPendingIfSourceInactive(state, (inst) => inst.sourceId !== cardId);
    state.corp.deck.push(cardId);
    card.zone = "corp:rd";
    card.faceup = false;
    card.rezzed = false;
    card.hostedCredits = undefined;
    shuffleInPlace(state, state.corp.deck);
    log(state, `${card.title} — shuffle into R&D instead of trash.`);
    // "It is still considered trashed": the trash triggers fire.
    noteCorpCardTrashedToArchives(state, cardId, {
      ...origin,
      inArchives: false,
    });
    return;
  }
  // Director Haas: while trashed and being accessed by the Runner, add to
  // the Runner's score area as an agenda instead of moving to Archives.
  if (card.onTrashWhileAccessed && state.run?.accessingCardId === cardId) {
    noteStoredConditionals(
      state,
      [
        {
          abilityKey: "on-trash-while-accessed",
          sourceId: cardId,
          controller: "corp",
          mandatory: true,
          effectKey: "onTrashWhileAccessed",
          logLine: `${card.title} becomes pending — trashed while accessed.`,
        },
      ],
      { independentOfSource: true },
    );
    if ((state.turn.storedConditionalPending ?? []).length > 0) {
      checkpointAfterInstruction(state, "corp.trash.whileAccessed");
    }
    // Still a trash, so the trash triggers fire (CR 1.19.1).
    noteCorpCardTrashedToArchives(state, cardId, {
      ...origin,
      inArchives: false,
    });
    return;
  }
  unhostCard(state, cardId);
  removeCardFromCurrentZone(state, cardId);
  endEffectsOnPreviousObject(state, cardId);
  // CR 9.6.10: still-pending instances for this source die when it leaves
  // play. Scoped to cardId so later on-trash triggers for this card remain.
  cancelPendingIfSourceInactive(state, (inst) => inst.sourceId !== cardId);
  placeInDiscardPile(state, card, faceup);
  noteCorpCardTrashedToArchives(state, cardId, origin);
}

/**
 * A checkpoint trashes a card (CR 10.3.1d, 10.3.1e, 10.3.1f, 10.3.1g). No
 * player trashes it, so abilities about a player trashing a card are not
 * met, and it cannot be prevented (CR 1.13.13). The card's own "when this
 * card is trashed" ability is noted here and marked pending at 10.3.1a of
 * the next checkpoint (CR 10.3.1a, 9.6.13c).
 */
function trashByCheckpoint(
  state: GameState,
  card: CardInstance,
  cite: RuleCite,
  why: string,
): void {
  const id = card.id;
  // CR 4.4.6b: a Corp card the Runner could see goes to Archives faceup.
  // A Runner card is faceup in the heap (CR 4.4.7b, 8.1.4c).
  const faceup =
    card.side === "runner" ||
    Boolean(card.rezzed) ||
    Boolean(card.faceup) ||
    runnerSeesAccessedCard(state, id);
  const wasInstalled = state.runner.installed.includes(id);
  const wasInstalledCorp =
    card.side === "corp" && /^server:[^:]+:(root|ice)$/.test(card.zone);
  unhostCard(state, id);
  removeCardFromCurrentZone(state, id);
  endEffectsOnPreviousObject(state, id);
  // CR 9.6.10: pending instances from this source end when it leaves play.
  cancelPendingIfSourceInactive(state, (inst) => inst.sourceId !== id);
  placeInDiscardPile(state, card, faceup);
  state.activeOrder = (state.activeOrder ?? []).filter((x) => x !== id);
  state.log.push(`${card.title} trashed${why} (CR ${cite.number}).`);
  if (wasInstalled) {
    recomputeRunnerLink(state);
    recomputeRunnerMaxHandSize(state);
  }
  // The checkpoint trashes it, not a player (CR 10.3.1), so a Corp "when the Runner
  // trashes this" trigger is not met (CR 1.14.5a); a Runner card's "when
  // this is trashed" is.
  if (card.onTrash && card.side === "runner") {
    noteStoredConditional(state, {
      cardId: id,
      abilityKey: "on-trash",
      effectKey: "onTrash",
      controller: card.side,
      mandatory: true,
      logLine: `${card.title} becomes pending — trashed.`,
      independentOfSource: true,
    });
    state.turn.checkpointTrashNoted = true;
  }
  noteOtherCardsTrashTriggers(
    state,
    card,
    wasInstalled && card.type === "program",
    wasInstalledCorp,
  );
}

/**
 * A card a checkpoint trashes still meets other cards' trash triggers that
 * do not name who trashes it: Q-Coherence Chip ("When an installed program
 * is trashed, trash this hardware") and Gravedigger ("Whenever an installed
 * Corp card is trashed, place 1 virus counter"). They become pending at the
 * next checkpoint (CR 10.3.1a) and resolve in its reaction window.
 */
function noteOtherCardsTrashTriggers(
  state: GameState,
  trashed: CardInstance,
  installedProgram: boolean,
  installedCorp: boolean,
): void {
  if (!installedProgram && !installedCorp) return;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card) continue;
    if (installedProgram && card.trashSelfWhenInstalledProgramTrashed) {
      noteInlineConditional(state, {
        cardId: id,
        abilityKey: "on-installed-program-trashed",
        controller: "runner",
        mandatory: true,
        effect: { op: "do", action: { kind: "trash_self" } },
        logLine: `${card.title} becomes pending — ${trashed.title} was trashed.`,
      });
      state.turn.checkpointTrashNoted = true;
    }
    if (installedCorp && card.placeVirusCounterWhenInstalledCorpCardTrashed) {
      noteInlineConditional(state, {
        cardId: id,
        abilityKey: `on-installed-corp-card-trashed:${trashed.id}`,
        controller: "runner",
        mandatory: true,
        effect: { op: "do", action: { kind: "add_virus_counter", amount: 1 } },
        logLine: `${card.title} becomes pending — an installed Corp card was trashed.`,
      });
      state.turn.checkpointTrashNoted = true;
    }
  }
}
