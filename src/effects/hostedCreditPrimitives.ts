/**
 * Hosted-credit primitives. Common cases extracted from eval.ts so a take,
 * place, or empty-pool trash is readable without the rest of the switch.
 */
import { log } from "../state/createGame.js";
import { maybeFireHostedCreditsGte } from "../state/hostedCredits.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import type { GameState, RuleCite, Side } from "../state/types.js";
import { CR } from "../timing/labels.js";
import type { EffectCtx } from "./eval.js";
import type { Effect, Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

type DrawCards = (state: GameState, side: Side, amount: number) => number;

function takeHostedCredits(
  ctx: EffectCtx,
  amount: number,
  drawCards: DrawCards,
): PrimResult {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId]!;
  const available = source.hostedCredits ?? 0;
  const taken = Math.min(amount, available);
  source.hostedCredits = available - taken;
  const side = source.side;
  const p = side === "corp" ? state.corp : state.runner;
  p.credits += taken;
  log(
    state,
    `Take ${taken}¢ from ${source.title} (hosted ${source.hostedCredits}) (CR ${CR.gainCredits.number}).`,
  );
  const resolveEmptyPool =
    Boolean(source.trashWhenHostedCreditsEmpty) ||
    (source.hostedCreditsOnInstall ?? 0) > 0 ||
    (source.drawOnHostedEmpty ?? 0) > 0 ||
    (source.clicksOnHostedEmpty ?? 0) > 0 ||
    Boolean(source.mayShuffleIntoRdWhenTrashed);
  if ((source.hostedCredits ?? 0) <= 0 && resolveEmptyPool) {
    const stillInstalled =
      (side === "runner" && state.runner.rig.includes(sourceId)) ||
      (side === "corp" && source.zone.startsWith("server:"));
    if (!stillInstalled) {
      // Already trashed as a cost (Cybersand); do not double-archive.
    } else if (side === "corp" && source.mayShuffleIntoRdWhenTrashed) {
      removeCardFromCurrentZone(state, sourceId);
      state.corp.deck.push(sourceId);
      source.zone = "corp:rd";
      source.faceup = false;
      source.rezzed = false;
      log(
        state,
        `${source.title} — shuffle into R&D instead of trash (hosted empty).`,
      );
    } else {
      removeCardFromCurrentZone(state, sourceId);
      if (side === "runner") {
        state.runner.discard.push(sourceId);
        source.zone = "runner:heap";
      } else {
        state.corp.discard.push(sourceId);
        source.zone = "corp:archives";
      }
      source.faceup = true;
      log(
        state,
        `${source.title} trashed — hosted credits empty (CR ${CR.trashing.number}).`,
      );
    }
    const drawN = source.drawOnHostedEmpty ?? 0;
    if (drawN > 0) {
      const n = drawCards(state, side, drawN);
      log(
        state,
        `${side} draws ${n} from empty ${source.title} (CR ${CR.drawing.number}).`,
      );
    }
    const clicksN = source.clicksOnHostedEmpty ?? 0;
    if (clicksN > 0) {
      const pool = side === "corp" ? state.corp : state.runner;
      pool.clicks += clicksN;
      log(
        state,
        `${side} gains ${clicksN} [click] from empty ${source.title} (CR ${CR.spendClicks.number}).`,
      );
    }
  }
  return { ok: true };
}

export function applyHostedCreditPrimitive(
  ctx: EffectCtx,
  action: Primitive,
  drawCards: DrawCards,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId]!;

  switch (action.kind) {
    case "take_hosted_credits":
      return takeHostedCredits(ctx, action.amount, drawCards);
    case "place_hosted_credits": {
      source.hostedCredits = (source.hostedCredits ?? 0) + action.amount;
      log(
        state,
        `Place ${action.amount}¢ on ${source.title} → ${source.hostedCredits} (CR ${CR.gainCredits.number}).`,
      );
      maybeFireHostedCreditsGte(state, sourceId);
      return { ok: true };
    }
    case "may_take_any_hosted_credits_skip_breach": {
      const available = source.hostedCredits ?? 0;
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline",
          label: "Breach normally",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      for (let n = 1; n <= available; n++) {
        options.push({
          id: `take:${n}`,
          label: `Take ${n}¢ from ${source.title} (skip breach)`,
          effect: {
            op: "do",
            action: { kind: "take_hosted_credits_skip_breach", amount: n },
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(
        state,
        `${source.title} — may take hosted credits instead of breaching.`,
      );
      return { ok: true };
    }
    case "take_hosted_credits_skip_breach": {
      const available = source.hostedCredits ?? 0;
      const taken = Math.min(action.amount, available);
      source.hostedCredits = available - taken;
      state.runner.credits += taken;
      if (state.run) state.run.skipBreach = true;
      log(
        state,
        `Take ${taken}¢ from ${source.title}; skip breach (hosted ${source.hostedCredits}).`,
      );
      if ((source.hostedCredits ?? 0) <= 0) {
        // Reuse empty-hosted trash path via take_hosted_credits amount 0 leftover.
        return takeHostedCredits(ctx, 0, drawCards);
      }
      return { ok: true };
    }
    default:
      return null;
  }
}
