/**
 * Current operations/events (CR 3.5.1d): linger in play-area until replaced or
 * agenda stolen/scored per card flags.
 */
import { log } from "./createGame.js";
import { moveRunnerCardToHeap } from "./trashHooks.js";
import type { CardInstance, GameState } from "./types.js";
import { CR } from "../timing/labels.js";

export function isCurrentCard(card: CardInstance | undefined): boolean {
  return Boolean(card?.lingerAsCurrent || card?.subtypes?.includes("current"));
}

function inPlayArea(card: CardInstance | undefined): boolean {
  return (
    card?.zone === "corp:play-area" || card?.zone === "runner:play-area"
  );
}

export function activeCorpCurrentIds(state: GameState): string[] {
  const out: string[] = [];
  for (const card of Object.values(state.cards)) {
    if (card.zone === "corp:play-area" && isCurrentCard(card)) {
      out.push(card.id);
    }
  }
  return out;
}

export function activeRunnerCurrentIds(state: GameState): string[] {
  const out: string[] = [];
  for (const card of Object.values(state.cards)) {
    if (card.zone === "runner:play-area" && isCurrentCard(card)) {
      out.push(card.id);
    }
  }
  return out;
}

export function allIceStrengthBonusFromCurrents(state: GameState): number {
  let bonus = 0;
  for (const id of activeCorpCurrentIds(state)) {
    bonus += state.cards[id]?.allIceStrengthBonus ?? 0;
  }
  return bonus;
}

export function sumRunnerFirstRunAdditionalCost(state: GameState): number {
  let n = 0;
  for (const id of activeCorpCurrentIds(state)) {
    n += state.cards[id]?.runnerFirstRunEachTurnAdditionalCost ?? 0;
  }
  return n;
}

export function runnerIdentityAbilitiesBlanked(state: GameState): boolean {
  for (const id of activeCorpCurrentIds(state)) {
    if (state.cards[id]?.blankRunnerIdentityPrintedAbilities) return true;
  }
  return false;
}

export function corpMaxIceInstallsPerTurnFromCurrents(state: GameState): number | null {
  let min: number | null = null;
  for (const id of activeCorpCurrentIds(state)) {
    const cap = state.cards[id]?.corpMaxIceInstallsPerTurn;
    if (cap == null) continue;
    min = min == null ? cap : Math.min(min, cap);
  }
  return min;
}

function trashCurrent(state: GameState, id: string, reason: string): void {
  const card = state.cards[id];
  if (!card || !inPlayArea(card)) return;
  if (card.side === "corp") {
    card.zone = "corp:archives";
    card.faceup = true;
    if (!state.corp.discard.includes(id)) state.corp.discard.push(id);
  } else {
    moveRunnerCardToHeap(state, id);
  }
  log(state, `${card.title} trashed (${reason}; current ends).`);
}

/** Trash active currents on a side before playing a new current. */
export function trashActiveCurrentsBeforePlay(
  state: GameState,
  side: "corp" | "runner",
): void {
  const ids =
    side === "corp" ? activeCorpCurrentIds(state) : activeRunnerCurrentIds(state);
  for (const id of ids) {
    trashCurrent(state, id, "another current played");
  }
}

export function trashCorpCurrentsOnAgendaStolen(state: GameState): void {
  for (const id of activeCorpCurrentIds(state)) {
    if (state.cards[id]?.currentTrashOnAgendaStolen) {
      trashCurrent(state, id, "agenda stolen");
    }
  }
  for (const id of activeRunnerCurrentIds(state)) {
    if (state.cards[id]?.currentTrashOnAgendaStolen) {
      trashCurrent(state, id, "agenda stolen");
    }
  }
}

export function trashCurrentsOnAgendaScored(state: GameState): void {
  for (const id of [...activeCorpCurrentIds(state), ...activeRunnerCurrentIds(state)]) {
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
  trashActiveCurrentsBeforePlay(state, side);
  card.zone = side === "corp" ? "corp:play-area" : "runner:play-area";
  card.faceup = true;
  log(
    state,
    `${card.title} remains in play as a current (CR ${CR.playNotTrashedUntil.number}).`,
  );
}
