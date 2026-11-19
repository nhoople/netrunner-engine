/**
 * Current operations/events (CR 3.5.1d): linger in play-area until replaced or
 * agenda stolen/scored per card flags.
 */
import { abilitiesSuppressed } from "./abilities.js";
import { log } from "./createGame.js";
import { moveRunnerCardToHeap } from "./trashHooks.js";
import type { CardInstance, GameState } from "./types.js";
import { CR } from "../timing/labels.js";
import {
  enterLingeringPlayArea,
  leaveLingeringPlayAreaBag,
  lingeringPlayAreaIds,
} from "./zones.js";

export function isCurrentCard(card: CardInstance | undefined): boolean {
  return Boolean(card?.lingerAsCurrent || card?.subtypes?.includes("current"));
}

function inLingeringPlayArea(card: CardInstance | undefined): boolean {
  return card?.zone === "corp:play-area" || card?.zone === "runner:play-area";
}

export function activeCorpCurrentIds(state: GameState): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of lingeringPlayAreaIds(state, "corp")) {
    if (!isCurrentCard(state.cards[id])) continue;
    out.push(id);
    seen.add(id);
  }
  for (const card of Object.values(state.cards)) {
    if (seen.has(card.id)) continue;
    if (card.zone === "corp:play-area" && isCurrentCard(card))
      out.push(card.id);
  }
  return out;
}

export function activeRunnerCurrentIds(state: GameState): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of lingeringPlayAreaIds(state, "runner")) {
    if (!isCurrentCard(state.cards[id])) continue;
    out.push(id);
    seen.add(id);
  }
  for (const card of Object.values(state.cards)) {
    if (seen.has(card.id)) continue;
    if (card.zone === "runner:play-area" && isCurrentCard(card))
      out.push(card.id);
  }
  return out;
}

export function allIceStrengthBonusFromCurrents(state: GameState): number {
  let bonus = 0;
  for (const id of activeCorpCurrentIds(state)) {
    if (abilitiesSuppressed(state, id)) continue;
    bonus += state.cards[id]?.allIceStrengthBonus ?? 0;
  }
  return bonus;
}

/**
 * Targeted Marketing (CR 3.5.1d current): "Gain 10 credits whenever the
 * Runner plays or installs a copy of that card." Called when the Runner
 * plays an event or installs a card; each active Targeted Marketing whose
 * named card matches gains the Corp 10 credits.
 */
export function noteTargetedMarketing(
  state: GameState,
  cardId: string,
  how: "plays" | "installs",
): void {
  const played = state.cards[cardId];
  if (!played?.defId) return;
  for (const id of activeCorpCurrentIds(state)) {
    const current = state.cards[id];
    if (!current?.targetedMarketing) continue;
    if (!current.namedCardDefId || current.namedCardDefId !== played.defId) {
      continue;
    }
    state.corp.credits += 10;
    log(
      state,
      `Targeted Marketing — Runner ${how} ${played.title}; Corp gains 10¢ → ${state.corp.credits}¢.`,
    );
  }
}

/** Enhanced Login Protocol spends a click to initiate the run (CR 6.3.4). */
export function enhancedLoginProtocolClick(state: GameState): boolean {
  if (state.turn.runnerMadeRunThisTurn) return false;
  return activeCorpCurrentIds(state).some(
    (id) => state.cards[id]?.title === "Enhanced Login Protocol",
  );
}

export function sumRunnerFirstRunAdditionalCost(state: GameState): number {
  let n = 0;
  for (const id of activeCorpCurrentIds(state)) {
    const card = state.cards[id];
    if (card?.title === "Enhanced Login Protocol") continue;
    n += card?.runnerFirstRunEachTurnAdditionalCost ?? 0;
  }
  return n;
}

/** Active currents on both sides (a current is in either play area). */
function allActiveCurrentIds(state: GameState): string[] {
  return [...activeCorpCurrentIds(state), ...activeRunnerCurrentIds(state)];
}

/**
 * Cerebral Static: "The Runner's identity loses its printed abilities."
 * Returns the active currents with that ability. A card that loses an
 * ability ignores it completely (CR 9.1.9, 9.1.9a). The blanking stops when
 * the current is trashed (CR 3.5.1b).
 */
export function currentsBlankingRunnerIdentity(state: GameState): string[] {
  return allActiveCurrentIds(state).filter(
    (id) => state.cards[id]?.blankRunnerIdentityPrintedAbilities,
  );
}

/**
 * Employee Strike: "The Corp's identity loses its printed abilities."
 * Returns the active currents with that ability (CR 9.1.9, 9.1.9a). The
 * blanking stops when the current is trashed (CR 3.7.1b).
 */
export function currentsBlankingCorpIdentity(state: GameState): string[] {
  return allActiveCurrentIds(state).filter(
    (id) => state.cards[id]?.blankCorpIdentityPrintedAbilities,
  );
}

export function runnerCannotPlayCurrentEvents(state: GameState): boolean {
  for (const card of Object.values(state.cards)) {
    if (abilitiesSuppressed(state, card.id)) continue;
    if (
      card.zone?.startsWith("server:") &&
      card.rezzed &&
      card.runnerCannotPlayCurrentEvents &&
      !abilitiesSuppressed(state, card.id)
    ) {
      return true;
    }
  }
  for (const server of Object.values(state.servers)) {
    for (const upId of server.root) {
      if (abilitiesSuppressed(state, upId)) continue;
      const up = state.cards[upId];
      if (up?.rezzed && up.runnerCannotPlayCurrentEvents) return true;
    }
  }
  return false;
}

/**
 * Unscheduled Maintenance: "The Corp cannot install more than 1 piece of ice
 * each turn." Returns the lowest cap among active currents, or null when no
 * current limits ice installs. A "cannot" wins over any ability that would
 * allow it (CR 1.2.2).
 */
export function corpMaxIceInstallsPerTurnFromCurrents(
  state: GameState,
): number | null {
  let min: number | null = null;
  for (const id of allActiveCurrentIds(state)) {
    if (abilitiesSuppressed(state, id)) continue;
    const cap = state.cards[id]?.corpMaxIceInstallsPerTurn;
    if (cap == null) continue;
    min = min == null ? cap : Math.min(min, cap);
  }
  return min;
}

/**
 * Itinerant Protesters: "The Corp gets −1 maximum hand size for each bad
 * publicity they have." Returns the change to the Corp's maximum hand size
 * from active currents (CR 5.5.3b: abilities can modify it directly).
 */
export function corpHandSizeFromCurrents(state: GameState): number {
  const bp = state.corp.badPublicity ?? 0;
  if (bp === 0) return 0;
  let delta = 0;
  for (const id of allActiveCurrentIds(state)) {
    if (abilitiesSuppressed(state, id)) continue;
    delta += (state.cards[id]?.corpHandSizeBonusPerBadPublicity ?? 0) * bp;
  }
  return delta;
}

/** Corp ice installed so far this turn, for Unscheduled Maintenance. */
export function corpIceInstalledThisTurn(state: GameState): number {
  return (state.turn.installedThisTurn ?? []).filter((id) => {
    const card = state.cards[id];
    return card?.side === "corp" && card.type === "ice";
  }).length;
}

function trashCurrent(state: GameState, id: string, reason: string): void {
  const card = state.cards[id];
  if (!card || !inLingeringPlayArea(card)) return;
  if (card.side === "corp") {
    leaveLingeringPlayAreaBag(state, id);
    card.zone = "corp:archives";
    card.faceup = true;
    if (!state.corp.discardPile.includes(id)) state.corp.discardPile.push(id);
  } else {
    moveRunnerCardToHeap(state, id);
  }
  log(state, `${card.title} trashed (${reason}; current ends).`);
}

/**
 * Trash every active current before a new current is played. A current
 * stays in play until another current operation or event is played
 * (CR 3.5.1b, CR 3.7.1b), whichever side plays it.
 */
function trashActiveCurrentsBeforePlay(
  state: GameState,
  playedId: string,
): void {
  for (const id of allActiveCurrentIds(state)) {
    // The played card is already in the play area while it resolves
    // (CR 8.6.7a); it is the new current, not "another" one to trash.
    if (id === playedId) continue;
    trashCurrent(state, id, "another current played");
  }
}

/**
 * Targeted Marketing-class: stealing an agenda ends the ability that kept
 * the current in play. The next checkpoint trashes it (CR 10.3.1b.ex2).
 */
export function trashCorpCurrentsOnAgendaStolen(state: GameState): void {
  const ids = [
    ...activeCorpCurrentIds(state),
    ...activeRunnerCurrentIds(state),
  ].filter((id) => state.cards[id]?.currentTrashOnAgendaStolen);
  if (ids.length === 0) return;
  state.turn.durationPassedCardIds = [
    ...new Set([...(state.turn.durationPassedCardIds ?? []), ...ids]),
  ];
}

/** Trash currents whose duration has passed (CR 10.3.1b). */
export function trashDurationPassedCurrents(state: GameState): number {
  const ids = state.turn.durationPassedCardIds ?? [];
  state.turn.durationPassedCardIds = undefined;
  let removed = 0;
  for (const id of ids) {
    const card = state.cards[id];
    if (!card || !inLingeringPlayArea(card)) continue;
    trashCurrent(state, id, "duration passed");
    removed += 1;
  }
  return removed;
}

export function trashCurrentsOnAgendaScored(state: GameState): void {
  for (const id of [
    ...activeCorpCurrentIds(state),
    ...activeRunnerCurrentIds(state),
  ]) {
    if (state.cards[id]?.currentTrashOnAgendaScored) {
      trashCurrent(state, id, "agenda scored");
    }
  }
}

export function placeCurrentAfterPlay(
  state: GameState,
  cardId: string,
  side: "corp" | "runner",
): void {
  const card = state.cards[cardId];
  if (!card) return;
  trashActiveCurrentsBeforePlay(state, cardId);
  enterLingeringPlayArea(state, cardId, side);
  log(
    state,
    `${card.title} remains in play as a current (CR ${CR.playNotTrashedUntil.number}).`,
  );
}
