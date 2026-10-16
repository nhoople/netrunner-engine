/**
 * Drawing cards. Pavilion limits, Class Act's would-draw interrupt,
 * and the on-draw hooks for Political Dealings and Jinja City Grid.
 */
import { occurCheckpoint } from "../legality/checkpoints.js";
import { syncCorpHandSizeSubroutines } from "../state/handSizeSubroutines.js";
import { log } from "../state/createGame.js";
import type { GameState, Side } from "../state/types.js";
import { CR } from "../timing/labels.js";
import { evalEffect, type EffectCtx, type EvalResult } from "./eval.js";
import { abilityCreditTally } from "./creditTally.js";
import type { Primitive, SideRef } from "./ir.js";
import { applyMumbadDagPrimitive } from "./mumbadDagPrimitives.js";
import { offerRamanRaiSwapWhileSetAside } from "./mumbadSiPrimitives.js";

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
    const r = evalEffect(
      { state, sourceId: id },
      card.onWouldDrawOncePerTurn,
    );
    if (!r.ok) {
      log(state, `onWouldDrawOncePerTurn failed on ${card.title}: ${r.error}`);
      state.turn.pendingWouldDrawAmount = null;
      return false;
    }
    // Class Act opens pendingChoice; draw is deferred to bottom leaf.
    return true;
  }
  return false;
}

/**
 * Draw up to `amount` cards as one instruction (CR 8.4.5).
 * Set them all aside, run one checkpoint (8.4.5b / 9.11.1c), then the reaction
 * window for abilities that draw met (CR 10.3.2). Cards still set aside enter
 * hand after that window (8.4.5c). An empty deck returns none.
 */
export function commitDraw(
  state: GameState,
  side: Side,
  amount: number,
): string[] {
  if (amount <= 0) return [];
  const p = side === "corp" ? state.corp : state.runner;
  const setAside: string[] = [];
  for (let i = 0; i < amount; i++) {
    const top = p.deck.shift();
    if (!top) break;
    setAside.push(top);
  }
  if (setAside.length === 0) return [];
  const n = setAside.length;
  log(
    state,
    n === 1
      ? `Set aside 1 (CR ${CR.drawSetAside.number}).`
      : `Set aside ${n} (CR ${CR.drawSetAside.number}).`,
  );
  occurCheckpoint(
    state,
    "draw",
    "Draw checkpoint",
    [CR.drawCheckpoint, CR.drawPause],
    "draw",
  );
  openDrawReactionWindow(state, side, setAside);
  if (side === "runner") {
    state.turn.uotRunnerCardsDrawnThisTurn =
      (state.turn.uotRunnerCardsDrawnThisTurn ?? 0) + n;
  }
  if (state.pendingChoice) {
    state.pendingDrawSetAside = { side, cardIds: [...setAside] };
    return setAside;
  }
  addSetAsideToHand(state, side, setAside);
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
  if (side === "corp" && state.run?.encounter?.iceId) {
    syncCorpHandSizeSubroutines(state, state.run.encounter.iceId);
  }
}

/**
 * Abilities that already key off a draw meet their condition while the cards
 * are set aside (CR 8.4.5a / 10.3.1a). The reaction window resolves them
 * before those cards enter hand (CR 10.3.2 / 8.4.5c).
 */
function openDrawReactionWindow(state: GameState, side: Side, setAside: string[]): void {
  const reveal =
    side === "runner" &&
    state.runner.installed.some((id) => state.cards[id]?.revealDrawnCards);
  const dealings = side === "corp" && corpHasRezzedFlag(state, "onDrawAgendaMayRevealAndInstall");
  const jinja = side === "corp" && corpHasJinja(state);
  const triggered =
    (reveal && setAside.length > 0) ||
    (dealings && setAside.some((id) => state.cards[id]?.type === "agenda")) ||
    (jinja && setAside.some((id) => state.cards[id]?.type === "ice"));
  if (triggered) {
    log(state, `Reaction window (CR ${CR.checkpointReaction.number}).`);
    for (const top of setAside) {
      const card = state.cards[top];
      if (!card) continue;
      if (reveal) {
        log(state, `Find the Truth — reveal drawn card: ${card.title}.`);
      }
      if (side === "corp" && card.type === "agenda") {
        for (const server of Object.values(state.servers)) {
          for (const id of server.root) {
            const asset = state.cards[id];
            if (!asset?.rezzed || !asset.onDrawAgendaMayRevealAndInstall) continue;
            const r = applyMumbadDagPrimitive(
              { state, sourceId: id },
              { kind: "may_install_drawn_agenda", cardId: top },
            );
            if (r && !r.ok) {
              log(state, `Political Dealings failed: ${r.error}`);
            }
            if (state.pendingChoice) break;
          }
          if (state.pendingChoice) break;
        }
      }
      if (side === "corp" && card.type === "ice" && !state.pendingChoice) {
        for (const [sid, server] of Object.entries(state.servers)) {
          for (const id of server.root) {
            const up = state.cards[id];
            const disc = up?.onDrawIceMayRevealAndInstallProtectingThisServerPayingLess;
            if (!up?.rezzed || typeof disc !== "number") continue;
            state.pendingChoice = {
              sourceId: id,
              chooser: "corp",
              options: [
                {
                  id: "accept",
                  label: `Reveal and install ${card.title} protecting ${sid} (−${disc}¢)`,
                  effect: {
                    op: "do" as const,
                    action: {
                      kind: "install_jinja_drawn_ice" as const,
                      cardId: top,
                      serverId: sid,
                      discount: disc,
                    },
                  },
                },
                {
                  id: "decline",
                  label: "Decline",
                  effect: {
                    op: "do" as const,
                    action: {
                      kind: "gain_credits" as const,
                      side: "corp" as const,
                      amount: 0,
                    },
                  },
                },
              ],
            };
            log(state, `${up.title} — may reveal/install drawn ice ${card.title}.`);
            break;
          }
          if (state.pendingChoice) break;
        }
      }
      if (state.pendingChoice) break;
    }
  }
  if (!state.pendingChoice && side === "corp") {
    offerRamanRaiSwapWhileSetAside(state, setAside);
  }
}

function corpHasRezzedFlag(
  state: GameState,
  flag: "onDrawAgendaMayRevealAndInstall",
): boolean {
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      const card = state.cards[id];
      if (card?.rezzed && card[flag]) return true;
    }
  }
  return false;
}

function corpHasJinja(state: GameState): boolean {
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      const card = state.cards[id];
      if (
        card?.rezzed &&
        typeof card.onDrawIceMayRevealAndInstallProtectingThisServerPayingLess === "number"
      ) {
        return true;
      }
    }
  }
  return false;
}

export function drawCards(state: GameState, side: Side, amount: number): number {
  if (side === "runner" && state.turn.ccRunnerCannotDraw) {
    return 0;
  }
  // Genetics Pavilion: Runner cannot draw more than N cards during their turn.
  if (side === "runner" && amount > 0 && state.activeSide === "runner") {
    let limit: number | undefined;
    for (const server of Object.values(state.servers)) {
      for (const id of server.root) {
        const c = state.cards[id];
        if (
          c?.rezzed &&
          typeof c.runnerCannotDrawMoreThanPerTurn === "number"
        ) {
          limit =
            limit === undefined
              ? c.runnerCannotDrawMoreThanPerTurn
              : Math.min(limit, c.runnerCannotDrawMoreThanPerTurn);
        }
      }
    }
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
      const n = drawCards(state, side, want);
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
      if (!pending?.cardIds.includes(cardId) || !card) {
        log(state, `Daily Business Show — that card is no longer drawn.`);
        return { ok: true };
      }
      const revealed = Boolean(card.faceup);
      pending.cardIds = pending.cardIds.filter((id) => id !== cardId);
      state.corp.deck = state.corp.deck.filter((id) => id !== cardId);
      state.corp.discardPile = state.corp.discardPile.filter((id) => id !== cardId);
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      state.corp.deck.push(cardId);
      card.zone = "corp:rd";
      card.faceup = false;
      log(
        state,
        revealed
          ? `Daily Business Show — add ${card.title} to the bottom of R&D.`
          : `Daily Business Show — add a card to the bottom of R&D.`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}
