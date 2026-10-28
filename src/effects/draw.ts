/**
 * Drawing cards. Pavilion limits, Class Act's would-draw interrupt,
 * and the on-draw hooks for Political Dealings and Jinja City Grid.
 */
import { occurCheckpoint } from "../legality/checkpoints.js";
import { syncCorpHandSizeSubroutines } from "../state/handSizeSubroutines.js";
import { log } from "../state/createGame.js";
import { commitCheckpointSnapshot } from "../state/checkpointSnapshot.js";
import type { GameState, Side } from "../state/types.js";
import { CR } from "../timing/labels.js";
import { type EffectCtx, type EvalResult } from "./eval.js";
import { abilityCreditTally } from "./creditTally.js";
import { fireCorpDrewCards } from "../state/storedTriggers.js";
import { runnerWinsOnEmptyRnd } from "../state/emptyRnd.js";
import {
  geneticsPavilionDrawLimit,
  onCorpDrew,
  onRunnerDrew,
} from "../state/staticFlags.js";
import type { Primitive, SideRef } from "./ir.js";
import {
  fireOnWouldDrawOncePerTurn as markOnWouldDrawOncePerTurn,
} from "../state/miscConditionalHooks.js";

/** Class Act: interrupt first would-draw each turn before cards move. */
function fireOnWouldDrawOncePerTurn(
  state: GameState,
  side: Side,
  amount: number,
): boolean {
  if (side !== "runner" || amount <= 0) return false;
  for (const id of [...state.runner.installed]) {
    const card = state.cards[id];
    if (!card?.onWouldDrawOncePerTurn) continue;
    if (state.turn.onWouldDrawOncePerTurnFiredIds.includes(id)) continue;
    state.turn.onWouldDrawOncePerTurnFiredIds.push(id);
    state.turn.pendingWouldDrawAmount = amount;
    log(state, `${card.title} — interrupt would-draw of ${amount}.`);
    markOnWouldDrawOncePerTurn(state, id);
    // Class Act opens pendingChoice; draw is deferred to bottom leaf.
    return true;
  }
  return false;
}

/**
 * Draw up to `amount` cards as one instruction (CR 8.4.5).
 * Set them all aside, run one checkpoint (8.4.5b / 9.11.1c), then the reaction
 * window for abilities that draw met (CR 10.3.2). Cards still set aside enter
 * hand after that window (8.4.5c). A Corp draw that cannot set aside every
 * required card ends the game (CR 1.7.2c). An empty Runner deck returns none.
 */
export function commitDraw(
  state: GameState,
  side: Side,
  amount: number,
): string[] {
  if (amount <= 0) return [];
  const p = side === "corp" ? state.corp : state.runner;
  // Baseline so 10.3.1a zone-diff can see the set-aside (CR 8.4.5a / 8.4.5b).
  if (!state.previousCheckpointSnapshot) {
    commitCheckpointSnapshot(state, null);
  }
  const setAside: string[] = [];
  const asideZone = side === "corp" ? "corp:set-aside" : "runner:set-aside";
  for (let i = 0; i < amount; i++) {
    const top = p.deck.shift();
    if (!top) break;
    const card = state.cards[top];
    if (card) {
      card.zone = asideZone;
      card.setAsideGroupId = "draw";
    }
    if (!p.setAside) p.setAside = [];
    if (!p.setAside.includes(top)) p.setAside.push(top);
    setAside.push(top);
  }
  const short = side === "corp" && setAside.length < amount;
  if (setAside.length === 0) {
    if (short) runnerWinsOnEmptyRnd(state);
    return [];
  }
  const n = setAside.length;
  log(
    state,
    n === 1
      ? `Set aside 1 (CR ${CR.drawSetAside.number}).`
      : `Set aside ${n} (CR ${CR.drawSetAside.number}).`,
  );
  // On-draw conditionals mark from the set-aside zone diff at 10.3.1a (CR 8.4.5a).
  occurCheckpoint(
    state,
    "draw",
    "Draw checkpoint",
    [CR.drawCheckpoint, CR.drawPause],
    "draw",
  );
  // On-draw conditionals (Find the Truth, Political Dealings, Jinja, Raman)
  // mark pending at 10.3.1a and resolve in the checkpoint reaction window.
  if (side === "runner") {
    state.turn.uotRunnerCardsDrawnThisTurn =
      (state.turn.uotRunnerCardsDrawnThisTurn ?? 0) + n;
  }
  if (state.pendingChoice) {
    state.pendingDrawSetAside = { side, cardIds: [...setAside] };
    if (short) runnerWinsOnEmptyRnd(state);
    return setAside;
  }
  addSetAsideToHand(state, side, setAside);
  if (short) runnerWinsOnEmptyRnd(state);
  return setAside;
}

/** Drop a drawn card from hand or from the still-open draw set-aside. */
export function removeDrawnCard(state: GameState, cardId: string): boolean {
  if (state.corp.hand.includes(cardId)) {
    state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
    return true;
  }
  const pending = state.pendingDrawSetAside;
  if (pending?.cardIds.includes(cardId)) {
    pending.cardIds = pending.cardIds.filter((id) => id !== cardId);
    return true;
  }
  return false;
}

/** 8.4.5c once the draw checkpoint's reaction window has closed. */
export function finishPendingDraw(state: GameState): void {
  const pending = state.pendingDrawSetAside;
  if (!pending) return;
  if (state.turn.dbsBottomOneDrawn) {
    if (state.pendingChoice) return;
    if (pending.cardIds.length > 0) {
      state.turn.dbsBottomOneDrawn = false;
      openDbsBottomChoice(state, pending.cardIds);
      return;
    }
    state.turn.dbsBottomOneDrawn = false;
  }
  state.pendingDrawSetAside = null;
  addSetAsideToHand(state, pending.side, pending.cardIds);
}

function leaveDrawSetAside(state: GameState, cardId: string): void {
  if (state.corp.setAside) {
    state.corp.setAside = state.corp.setAside.filter((id) => id !== cardId);
  }
  if (state.runner.setAside) {
    state.runner.setAside = state.runner.setAside.filter((id) => id !== cardId);
  }
  const card = state.cards[cardId];
  if (card?.setAsideGroupId === "draw") card.setAsideGroupId = undefined;
}

/** Corp draw is set aside facedown until one card is chosen for the bottom of R&D. */
export function holdCorpDrawForDbs(state: GameState, drawn: string[]): void {
  if (drawn.length === 0) return;
  for (const id of drawn) {
    state.corp.hand = state.corp.hand.filter((x) => x !== id);
    const card = state.cards[id];
    if (!card) continue;
    card.faceup = false;
    card.zone = "corp:set-aside";
    card.setAsideGroupId = "draw";
    if (!state.corp.setAside) state.corp.setAside = [];
    if (!state.corp.setAside.includes(id)) state.corp.setAside.push(id);
  }
  state.pendingDrawSetAside = { side: "corp", cardIds: [...drawn] };
  openDbsBottomChoice(state, drawn);
}

function openDbsBottomChoice(state: GameState, cardIds: string[]): void {
  const dbs = Object.values(state.cards).find(
    (card) => card.rezzed && card.interruptFirstDrawBottomOne,
  );
  state.pendingChoice = {
    sourceId: dbs?.id ?? cardIds[0]!,
    chooser: "corp",
    options: cardIds.map((cardId) => ({
      id: `dbs-bottom:${cardId}`,
      label: `Add ${state.cards[cardId]?.title ?? "a card"} to the bottom of R&D`,
      effect: {
        op: "do" as const,
        action: { kind: "bottom_drawn_card" as const, cardId },
      },
    })),
  };
  log(
    state,
    `Daily Business Show — choose a drawn card to add to the bottom of R&D.`,
  );
}

function addSetAsideToHand(state: GameState, side: Side, cardIds: string[]): void {
  const p = side === "corp" ? state.corp : state.runner;
  const added: string[] = [];
  for (const cardId of cardIds) {
    const card = state.cards[cardId];
    if (!card || p.hand.includes(cardId)) continue;
    if (card.zone.startsWith("server:") || card.zone === "removed-from-game") continue;
    leaveDrawSetAside(state, cardId);
    p.hand.push(cardId);
    card.zone = side === "corp" ? "corp:hq" : "runner:grip";
    card.faceup = side === "runner";
    added.push(cardId);
  }
  if (added.length === 0) return;
  log(
    state,
    added.length === 1
      ? `Add set-aside card to hand (CR ${CR.drawAddToHand.number}).`
      : `Add ${added.length} set-aside cards to hand (CR ${CR.drawAddToHand.number}).`,
  );
  // Bug-class: fire once per card as it enters HQ (printed "whenever the Corp draws").
  if (side === "corp") fireCorpDrewCards(state, added);
  if (side === "corp" && state.run?.encounter?.iceId) {
    syncCorpHandSizeSubroutines(state, state.run.encounter.iceId);
  }
}

export function drawCards(state: GameState, side: Side, amount: number): number {
  if (side === "runner" && state.turn.ccRunnerCannotDraw) {
    return 0;
  }
  // Genetics Pavilion: Runner cannot draw more than N cards during their turn.
  if (side === "runner" && amount > 0 && state.activeSide === "runner") {
    const limit = geneticsPavilionDrawLimit(state);
    if (limit !== undefined) {
      const already = state.turn.uotRunnerCardsDrawnThisTurn ?? 0;
      const room = Math.max(0, limit - already);
      if (room <= 0) {
        log(
          state,
          `Genetics Pavilion — Runner cannot draw more this turn (limit ${limit}).`,
        );
        return 0;
      }
      amount = Math.min(amount, room);
    }
  }
  if (side === "runner" && amount > 0) {
    if (fireOnWouldDrawOncePerTurn(state, side, amount)) {
      // Draw deferred to Class Act bottom leaf (or pendingChoice).
      return 0;
    }
  }
  const drawn = commitDraw(state, side, amount);
  return drawn.length;
}

type ResolveSide = (ctx: EffectCtx, ref: SideRef) => Side;

export function applyDrawPrimitive(
  ctx: EffectCtx,
  action: Primitive,
  resolveSide: ResolveSide,
): EvalResult | null {
  const { state } = ctx;
  switch (action.kind) {
    case "draw": {
      const side = resolveSide(ctx, action.side);
      let amount = action.amount;
      if (action.tally) {
        const tallied = abilityCreditTally(state, ctx.sourceId, action.tally);
        // A summed value of 0 or less does not happen (CR 9.12.2b).
        if (tallied.amount <= 0) return { ok: true };
        amount = tallied.amount;
      }
      if (side === "runner" && state.turn.ccRunnerCannotDraw) {
        log(
          state,
          `The draw is not an expected effect — the Runner cannot draw cards (CR ${CR.expectedEffects.number}).`,
        );
        return { ok: true };
      }
      const n = drawCards(state, side, amount);
      // Bug fires from addSetAsideToHand (per drawn card id), not here.
      if (side === "corp") {
        onCorpDrew(state, n);
      }
      if (side === "runner" && n > 0) onRunnerDrew(state);
      log(
        state,
        `${side} draws ${n} (requested ${amount}) (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }
    case "draw_up_to": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      const want = Math.max(0, action.amount);
      // "Up to N" is not a requirement to draw N (CR 1.7.2c).
      const n = drawCards(state, side, Math.min(want, p.deck.length));
      log(
        state,
        `${side} draws up to ${want} (drew ${n}; hand ${p.hand.length}) (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }
    case "bottom_drawn_card": {
      const cardId = action.cardId;
      const pending = state.pendingDrawSetAside;
      const card = state.cards[cardId];
      if (!pending?.cardIds.includes(cardId) || !card) return null;
      const revealed = Boolean(card.faceup);
      pending.cardIds = pending.cardIds.filter((id) => id !== cardId);
      state.corp.deck = state.corp.deck.filter((id) => id !== cardId);
      state.corp.discardPile = state.corp.discardPile.filter((id) => id !== cardId);
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      state.corp.deck.push(cardId);
      card.zone = "corp:rd";
      card.faceup = false;
      leaveDrawSetAside(state, cardId);
      log(
        state,
        revealed
          ? `Daily Business Show — add ${card.title} to the bottom of R&D.`
          : `Daily Business Show — add a card to the bottom of R&D.`,
      );
      const rest = [...pending.cardIds];
      state.pendingDrawSetAside = null;
      state.turn.dbsBottomOneDrawn = false;
      addSetAsideToHand(state, pending.side, rest);
      return { ok: true };
    }
    default:
      return null;
  }
}
