/**
 * Drawing cards. Pavilion limits, Class Act's would-draw interrupt,
 * and the on-draw hooks for Political Dealings and Jinja City Grid.
 */
import { log } from "../state/createGame.js";
import type { GameState, Side } from "../state/types.js";
import { CR } from "../timing/labels.js";
import { evalEffect, type EffectCtx, type EvalResult } from "./eval.js";
import { abilityCreditTally } from "./creditTally.js";
import type { Primitive, SideRef } from "./ir.js";
import { applyMumbadDagPrimitive } from "./mumbadDagPrimitives.js";

/** Class Act: interrupt first would-draw each turn before cards move. */
function fireOnWouldDrawOncePerTurn(
  state: GameState,
  side: Side,
  amount: number,
): boolean {
  if (side !== "runner" || amount <= 0) return false;
  for (const id of [...state.runner.rig]) {
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
  const p = side === "corp" ? state.corp : state.runner;
  let drew = 0;
  for (let i = 0; i < amount; i++) {
    const top = p.deck.shift();
    if (!top) break;
    p.hand.push(top);
    const card = state.cards[top];
    card.zone = side === "corp" ? "corp:hq" : "runner:grip";
    card.faceup = side === "runner";
    drew += 1;
    // Find the Truth: whenever you draw a card, reveal that card.
    if (side === "runner") {
      const reveal = state.runner.rig.some(
        (id) => state.cards[id]?.revealDrawnCards,
      );
      if (reveal) {
        log(state, `Find the Truth — reveal drawn card: ${card.title}.`);
      }
    }
    // Political Dealings: whenever Corp draws an agenda, may reveal and install.
    if (side === "corp" && card.type === "agenda") {
      for (const server of Object.values(state.servers)) {
        for (const id of server.root) {
          const asset = state.cards[id];
          if (!asset?.rezzed || !asset.onDrawAgendaMayRevealAndInstall) continue;
          const r = applyMumbadDagPrimitive(
            { state, sourceId: id },
            {
              kind: "may_install_drawn_agenda",
              cardId: top,
            },
          );
          if (r && !r.ok) {
            log(state, `Political Dealings failed: ${r.error}`);
          }
          if (state.pendingChoice) break;
        }
        if (state.pendingChoice) break;
      }
    }
    // Jinja City Grid: whenever Corp draws ice, may reveal and install protecting.
    if (side === "corp" && card.type === "ice" && !state.pendingChoice) {
      for (const [sid, server] of Object.entries(state.servers)) {
        for (const id of server.root) {
          const up = state.cards[id];
          const disc =
            up?.onDrawIceMayRevealAndInstallProtectingThisServerPayingLess;
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
                    kind: "dtwn_jinja_install_drawn_ice" as const,
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
          log(
            state,
            `${up.title} — may reveal/install drawn ice ${card.title}.`,
          );
          break;
        }
        if (state.pendingChoice) break;
      }
    }
  }
  if (side === "runner" && drew > 0) {
    state.turn.uotRunnerCardsDrawnThisTurn =
      (state.turn.uotRunnerCardsDrawnThisTurn ?? 0) + drew;
  }
  return drew;
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
        log(state, `Runner cannot draw (Lockdown).`);
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
    default:
      return null;
  }
}
